import pkg from "pg"
const { Pool } = pkg

class DatabaseManager {
  constructor() {
    this.pool = null
    this.isConnected = false
  }

  async initialize() {
    try {
      // Only initialize if DATABASE_URL is provided (optional)
      if (!process.env.DATABASE_URL) {
        console.log("DATABASE_URL not provided - skipping PostgreSQL initialization")
        return
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })

      // Test connection
      const client = await this.pool.connect()
      await client.query("SELECT NOW()")
      client.release()

      this.isConnected = true
      console.log("PostgreSQL connected successfully")

      // Create tables if they don't exist
      await this.createTables()
    } catch (error) {
      console.error("PostgreSQL connection failed:", error.message)
      this.isConnected = false
      // Don't throw error - app can work without PostgreSQL
    }
  }

  async createTables() {
    if (!this.pool) return

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id UUID PRIMARY KEY,
          title VARCHAR(255) DEFAULT 'New Chat',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          message_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `)

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY,
          session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          sources JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `)

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS news_articles (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT UNIQUE NOT NULL,
          content TEXT,
          description TEXT,
          source VARCHAR(100),
          author VARCHAR(255),
          pub_date TIMESTAMP WITH TIME ZONE,
          categories TEXT[],
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          chunk_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `)

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source);
        CREATE INDEX IF NOT EXISTS idx_news_articles_pub_date ON news_articles(pub_date);
      `)

      console.log("Database tables created/verified successfully")
    } catch (error) {
      console.error("Failed to create tables:", error.message)
    }
  }

  async query(text, params) {
    if (!this.pool) {
      throw new Error("Database not initialized")
    }

    try {
      const start = Date.now()
      const res = await this.pool.query(text, params)
      const duration = Date.now() - start

      if (duration > 1000) {
        console.warn(`Slow query detected (${duration}ms):`, text)
      }

      return res
    } catch (error) {
      console.error("Database query error:", error.message)
      throw error
    }
  }

  async getClient() {
    if (!this.pool) {
      throw new Error("Database not initialized")
    }
    return this.pool.connect()
  }

  async close() {
    if (this.pool) {
      await this.pool.end()
      this.isConnected = false
      console.log("PostgreSQL connection closed")
    }
  }

  // Session management methods
  async saveSession(session) {
    if (!this.pool) return null

    try {
      const query = `
        INSERT INTO chat_sessions (id, title, created_at, updated_at, message_count, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          updated_at = EXCLUDED.updated_at,
          message_count = EXCLUDED.message_count,
          metadata = EXCLUDED.metadata
        RETURNING *;
      `

      const values = [
        session.id,
        session.title,
        session.createdAt,
        session.updatedAt,
        session.messageCount,
        JSON.stringify(session.metadata),
      ]

      const result = await this.query(query, values)
      return result.rows[0]
    } catch (error) {
      console.error("Failed to save session:", error.message)
      return null
    }
  }

  async saveMessage(message) {
    if (!this.pool) return null

    try {
      const query = `
        INSERT INTO chat_messages (id, session_id, role, content, sources, created_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `

      const values = [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        JSON.stringify(message.sources || []),
        message.timestamp,
        JSON.stringify(message.metadata || {}),
      ]

      const result = await this.query(query, values)
      return result.rows[0]
    } catch (error) {
      console.error("Failed to save message:", error.message)
      return null
    }
  }

  async saveArticle(article) {
    if (!this.pool) return null

    try {
      const query = `
        INSERT INTO news_articles (id, title, url, content, description, source, author, pub_date, categories, chunk_count, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (url) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          description = EXCLUDED.description,
          source = EXCLUDED.source,
          author = EXCLUDED.author,
          pub_date = EXCLUDED.pub_date,
          categories = EXCLUDED.categories,
          chunk_count = EXCLUDED.chunk_count,
          metadata = EXCLUDED.metadata,
          processed_at = NOW()
        RETURNING *;
      `

      const values = [
        article.id,
        article.title,
        article.link,
        article.content,
        article.description,
        article.source,
        article.author,
        article.pubDate,
        article.categories,
        article.chunks || 0,
        JSON.stringify(article.metadata || {}),
      ]

      const result = await this.query(query, values)
      return result.rows[0]
    } catch (error) {
      console.error("Failed to save article:", error.message)
      return null
    }
  }

  async getStats() {
    if (!this.pool) return null

    try {
      const sessionCount = await this.query("SELECT COUNT(*) FROM chat_sessions")
      const messageCount = await this.query("SELECT COUNT(*) FROM chat_messages")
      const articleCount = await this.query("SELECT COUNT(*) FROM news_articles")

      return {
        sessions: Number.parseInt(sessionCount.rows[0].count),
        messages: Number.parseInt(messageCount.rows[0].count),
        articles: Number.parseInt(articleCount.rows[0].count),
        connected: this.isConnected,
      }
    } catch (error) {
      console.error("Failed to get database stats:", error.message)
      return null
    }
  }
}

const database = new DatabaseManager()

export const initializeDatabase = () => database.initialize()
export const getDatabase = () => database
export const query = (text, params) => database.query(text, params)
export const getClient = () => database.getClient()

export default database
