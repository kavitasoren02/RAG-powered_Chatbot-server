import express from "express"
import { getDatabase } from "../config/database.js"

const router = express.Router()

// Get RAG performance analytics
router.get("/rag", async (req, res) => {
  try {
    const { days = 7 } = req.query
    const db = getDatabase()

    if (!db.isConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      })
    }

    const analytics = await db.query(`
      SELECT * FROM rag_analytics 
      WHERE date >= NOW() - INTERVAL '${Number.parseInt(days)} days'
      ORDER BY date DESC
    `)

    const summary = await db.query(`
      SELECT 
        COUNT(*) as total_interactions,
        AVG((metadata->>'processingTime')::numeric) as avg_processing_time,
        COUNT(DISTINCT session_id) as unique_sessions,
        AVG(array_length(string_to_array(query, ' '), 1)) as avg_query_length
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '${Number.parseInt(days)} days'
    `)

    res.json({
      success: true,
      analytics: analytics.rows,
      summary: summary.rows[0],
      period: `${days} days`,
    })
  } catch (error) {
    console.error("Analytics error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get analytics",
    })
  }
})

// Get popular queries
router.get("/queries", async (req, res) => {
  try {
    const { limit = 10 } = req.query
    const db = getDatabase()

    if (!db.isConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      })
    }

    const queries = await db.query(
      `
      SELECT 
        query,
        COUNT(*) as frequency,
        AVG((metadata->>'processingTime')::numeric) as avg_processing_time,
        MAX(created_at) as last_asked
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY query
      ORDER BY frequency DESC, last_asked DESC
      LIMIT $1
    `,
      [Number.parseInt(limit)],
    )

    res.json({
      success: true,
      queries: queries.rows,
    })
  } catch (error) {
    console.error("Popular queries error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get popular queries",
    })
  }
})

// Get source usage statistics
router.get("/sources", async (req, res) => {
  try {
    const db = getDatabase()

    if (!db.isConnected) {
      return res.status(503).json({
        success: false,
        error: "Database not available",
      })
    }

    const sources = await db.query(`
      SELECT 
        source,
        COUNT(*) as article_count,
        MAX(pub_date) as latest_article,
        AVG(chunk_count) as avg_chunks_per_article
      FROM news_articles 
      GROUP BY source
      ORDER BY article_count DESC
    `)

    res.json({
      success: true,
      sources: sources.rows,
    })
  } catch (error) {
    console.error("Source analytics error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get source analytics",
    })
  }
})

export default router
