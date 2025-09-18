import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Environment configuration with defaults and validation
const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number.parseInt(process.env.PORT) || 3000,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",

  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // AI Services
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  JINA_API_KEY: process.env.JINA_API_KEY,

  // Vector Database
  QDRANT_URL: process.env.QDRANT_URL || "http://localhost:6333",
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,

  // Security
  API_KEY: process.env.API_KEY,
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
  
  // News Sources
  RSS_FEEDS: process.env.RSS_FEEDS
    ? process.env.RSS_FEEDS.split(",")
    : [
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://www.theguardian.com/world/rss",
        "https://feeds.npr.org/1001/rss.xml",
      ],

  // Cache Configuration
  SESSION_TTL: Number.parseInt(process.env.SESSION_TTL) || 24 * 60 * 60, // 24 hours
  CACHE_TTL: Number.parseInt(process.env.CACHE_TTL) || 60 * 60, // 1 hour

  // Rate Limiting
  RATE_LIMIT_WINDOW: Number.parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: Number.parseInt(process.env.RATE_LIMIT_MAX) || 100,

  // Ingestion Configuration
  INGESTION_INTERVAL: process.env.INGESTION_INTERVAL || "0 */2 * * *", // Every 2 hours
  MAX_ARTICLES_PER_SOURCE: Number.parseInt(process.env.MAX_ARTICLES_PER_SOURCE) || 10,
  MAX_CHUNK_SIZE: Number.parseInt(process.env.MAX_CHUNK_SIZE) || 500,
  CHUNK_OVERLAP: Number.parseInt(process.env.CHUNK_OVERLAP) || 50,

  // Vector Search
  VECTOR_SEARCH_LIMIT: Number.parseInt(process.env.VECTOR_SEARCH_LIMIT) || 5,
  SIMILARITY_THRESHOLD: Number.parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
}

// Validation
const requiredEnvVars = ["GEMINI_API_KEY", "JINA_API_KEY"]

const missingVars = requiredEnvVars.filter((varName) => !config[varName])

if (missingVars.length > 0) {
  console.error("Missing required environment variables:", missingVars.join(", "))
  console.error("Please check your .env file")
  process.exit(1)
}

// Warnings for optional but recommended variables
const recommendedVars = ["DATABASE_URL", "QDRANT_API_KEY", "API_KEY"]
const missingRecommended = recommendedVars.filter((varName) => !config[varName])

if (missingRecommended.length > 0) {
  console.warn("Missing recommended environment variables:", missingRecommended.join(", "))
}

// Log configuration in development
if (config.NODE_ENV === "development") {
  console.log("Environment Configuration:")
  console.log(`- Node Environment: ${config.NODE_ENV}`)
  console.log(`- Server Port: ${config.PORT}`)
  console.log(`- Frontend URL: ${config.FRONTEND_URL}`)
  console.log(`- Database: ${config.DATABASE_URL ? "Configured" : "Not configured"}`)
  console.log(`- Redis: ${config.REDIS_URL}`)
  console.log(`- Qdrant: ${config.QDRANT_URL}`)
  console.log(`- RSS Sources: ${config.RSS_FEEDS.length} configured`)
}

export default config
