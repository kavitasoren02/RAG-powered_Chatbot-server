import express from "express"
import { createHealthCheckRoute } from "../utils/healthCheck.js"

const router = express.Router()

// Health check endpoint
router.get("/", await createHealthCheckRoute())

// Detailed system status
router.get("/status", async (req, res) => {
  try {
    const { getDatabase } = await import("../config/database.js")
    const { getRedisClient } = await import("../config/redis.js")
    const { getVectorStoreInfo } = await import("../services/vectorStore.js")

    const db = getDatabase()
    const redis = getRedisClient()

    const [dbStats, redisStats, vectorStats] = await Promise.allSettled([
      db.getStats(),
      redis.getStats(),
      getVectorStoreInfo(),
    ])

    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbStats.status === "fulfilled" ? dbStats.value : { error: dbStats.reason?.message },
      redis: redisStats.status === "fulfilled" ? redisStats.value : { error: redisStats.reason?.message },
      vectorStore: vectorStats.status === "fulfilled" ? vectorStats.value : { error: vectorStats.reason?.message },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        nodeEnv: process.env.NODE_ENV,
      },
    })
  } catch (error) {
    res.status(500).json({
      error: "Failed to get system status",
      message: error.message,
    })
  }
})

export default router
