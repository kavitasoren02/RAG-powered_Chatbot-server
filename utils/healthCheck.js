import { getDatabase } from "../config/database.js"
import { getRedisClient } from "../config/redis.js"
import { getVectorStoreInfo } from "../services/vectorStore.js"

export async function performHealthCheck() {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {},
  }

  // Check PostgreSQL
  try {
    const db = getDatabase()
    const stats = await db.getStats()
    health.services.postgresql = {
      status: stats ? "healthy" : "unavailable",
      connected: stats?.connected || false,
      stats,
    }
  } catch (error) {
    health.services.postgresql = {
      status: "error",
      error: error.message,
    }
  }

  // Check Redis
  try {
    const redis = getRedisClient()
    const stats = await redis.getStats()
    health.services.redis = {
      status: stats.connected ? "healthy" : "error",
      connected: stats.connected,
      stats,
    }
  } catch (error) {
    health.services.redis = {
      status: "error",
      error: error.message,
    }
  }

  // Check Vector Store
  try {
    const vectorInfo = await getVectorStoreInfo()
    health.services.vectorStore = {
      status: vectorInfo ? "healthy" : "error",
      info: vectorInfo,
    }
  } catch (error) {
    health.services.vectorStore = {
      status: "error",
      error: error.message,
    }
  }

  // Check AI Services
  health.services.gemini = {
    status: process.env.GEMINI_API_KEY ? "configured" : "not_configured",
  }

  health.services.jina = {
    status: process.env.JINA_API_KEY ? "configured" : "not_configured",
  }

  // Overall health status
  const hasErrors = Object.values(health.services).some((service) => service.status === "error")
  const hasCriticalMissing = !health.services.redis.connected || !health.services.gemini.status === "configured"

  if (hasErrors || hasCriticalMissing) {
    health.status = "degraded"
  }

  return health
}

export async function createHealthCheckRoute() {
  return async (req, res) => {
    try {
      const health = await performHealthCheck()
      const statusCode = health.status === "healthy" ? 200 : 503

      res.status(statusCode).json(health)
    } catch (error) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message,
      })
    }
  }
}
