-- Initialize PostgreSQL database for RAG Chatbot
-- Run this script to set up the database schema

-- Create database (run as superuser)
-- CREATE DATABASE rag_chatbot;

-- Connect to the database and create tables
\c rag_chatbot;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) DEFAULT 'New Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- News Articles Table
CREATE TABLE IF NOT EXISTS news_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source);
CREATE INDEX IF NOT EXISTS idx_news_articles_pub_date ON news_articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_processed_at ON news_articles(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_url ON news_articles(url);

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_chat_sessions_metadata ON chat_sessions USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata ON chat_messages USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sources ON chat_messages USING GIN (sources);
CREATE INDEX IF NOT EXISTS idx_news_articles_metadata ON news_articles USING GIN (metadata);

-- Create full-text search indexes
CREATE INDEX IF NOT EXISTS idx_news_articles_title_fts ON news_articles USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_news_articles_content_fts ON news_articles USING GIN (to_tsvector('english', content));

-- Create a view for session statistics
CREATE OR REPLACE VIEW session_stats AS
SELECT 
    s.id,
    s.title,
    s.created_at,
    s.updated_at,
    s.message_count,
    COUNT(m.id) as actual_message_count,
    MAX(m.created_at) as last_message_at
FROM chat_sessions s
LEFT JOIN chat_messages m ON s.id = m.session_id
GROUP BY s.id, s.title, s.created_at, s.updated_at, s.message_count;

-- Create a function to update session timestamp
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_sessions 
    SET updated_at = NOW(), 
        message_count = message_count + 1
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update session when message is added
DROP TRIGGER IF EXISTS trigger_update_session_timestamp ON chat_messages;
CREATE TRIGGER trigger_update_session_timestamp
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_timestamp();

-- Create a function to clean up old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM chat_sessions 
    WHERE updated_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- Insert sample data (optional)
-- INSERT INTO chat_sessions (title) VALUES ('Sample Chat Session');

COMMENT ON TABLE chat_sessions IS 'Stores chat session metadata';
COMMENT ON TABLE chat_messages IS 'Stores individual chat messages';
COMMENT ON TABLE news_articles IS 'Stores processed news articles for RAG';

COMMENT ON COLUMN chat_messages.role IS 'Either "user" or "assistant"';
COMMENT ON COLUMN chat_messages.sources IS 'JSON array of source articles used for response';
COMMENT ON COLUMN news_articles.categories IS 'Array of article categories/tags';
COMMENT ON COLUMN news_articles.chunk_count IS 'Number of text chunks created from this article';

-- Show table information
\dt
\di

-- Show sample queries
-- SELECT COUNT(*) as total_sessions FROM chat_sessions;
-- SELECT COUNT(*) as total_messages FROM chat_messages;
-- SELECT COUNT(*) as total_articles FROM news_articles;
