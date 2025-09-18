import express from "express"
import newsIngestionService from "../services/newsIngestion.js"
import newsIngestionJob from "../jobs/newsIngestionJob.js"
import { getVectorStoreInfo } from "../services/vectorStore.js"

const router = express.Router()

// Manual ingestion trigger
router.post("/trigger", async (req, res) => {
  try {
    const articles = await newsIngestionService.ingestAllSources()
    res.json({
      success: true,
      message: `Successfully ingested ${articles.length} articles`,
      articles: articles.length,
    })
  } catch (error) {
    console.error("Manual ingestion failed:", error)
    res.status(500).json({
      success: false,
      message: "Ingestion failed",
      error: error.message,
    })
  }
})

// Get ingestion statistics
router.get("/stats", async (req, res) => {
  try {
    const ingestionStats = await newsIngestionService.getIngestionStats()
    const jobStats = newsIngestionJob.getStats()
    const vectorStoreInfo = await getVectorStoreInfo()

    res.json({
      success: true,
      ingestion: ingestionStats,
      job: jobStats,
      vectorStore: vectorStoreInfo,
    })
  } catch (error) {
    console.error("Failed to get stats:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get statistics",
      error: error.message,
    })
  }
})

// Get processed articles count
router.get("/count", async (req, res) => {
  try {
    const vectorStoreInfo = await getVectorStoreInfo()
    res.json({
      success: true,
      articlesCount: vectorStoreInfo?.pointsCount || 0,
      vectorsCount: vectorStoreInfo?.vectorsCount || 0,
    })
  } catch (error) {
    console.error("Failed to get count:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get article count",
      error: error.message,
    })
  }
})

export default router
