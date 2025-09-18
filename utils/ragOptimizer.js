import { getDatabase } from "../config/database.js"

class RAGOptimizer {
  constructor() {
    this.performanceThresholds = {
      processingTime: 5000, // 5 seconds
      contextUtilization: 0.7, // 70% of context window
      relevanceScore: 0.6, // Minimum relevance score
    }
  }

  async analyzePerformance(days = 7) {
    try {
      const db = getDatabase()
      if (!db.isConnected) return null

      const analysis = await db.query(`
        SELECT 
          AVG((metadata->>'processingTime')::numeric) as avg_processing_time,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'processingTime')::numeric) as p95_processing_time,
          AVG((metadata->>'chunksFound')::numeric) as avg_chunks_found,
          AVG((metadata->>'chunksUsed')::numeric) as avg_chunks_used,
          AVG((metadata->>'contextLength')::numeric) as avg_context_length,
          COUNT(*) as total_queries
        FROM chat_interactions 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND metadata IS NOT NULL
      `)

      const result = analysis.rows[0]

      return {
        performance: {
          avgProcessingTime: Number.parseFloat(result.avg_processing_time) || 0,
          p95ProcessingTime: Number.parseFloat(result.p95_processing_time) || 0,
          avgChunksFound: Number.parseFloat(result.avg_chunks_found) || 0,
          avgChunksUsed: Number.parseFloat(result.avg_chunks_used) || 0,
          avgContextLength: Number.parseFloat(result.avg_context_length) || 0,
          totalQueries: Number.parseInt(result.total_queries) || 0,
        },
        recommendations: this.generateRecommendations(result),
        period: `${days} days`,
      }
    } catch (error) {
      console.error("Performance analysis error:", error)
      return null
    }
  }

  generateRecommendations(metrics) {
    const recommendations = []

    // Processing time recommendations
    if (metrics.avg_processing_time > this.performanceThresholds.processingTime) {
      recommendations.push({
        type: "performance",
        priority: "high",
        message: "Average processing time is high. Consider optimizing vector search or reducing context size.",
        metric: "processing_time",
        current: metrics.avg_processing_time,
        threshold: this.performanceThresholds.processingTime,
      })
    }

    // Context utilization recommendations
    const contextUtilization = metrics.avg_context_length / 4000 // Assuming 4000 char context window
    if (contextUtilization < this.performanceThresholds.contextUtilization) {
      recommendations.push({
        type: "optimization",
        priority: "medium",
        message: "Context window is underutilized. Consider including more relevant chunks.",
        metric: "context_utilization",
        current: contextUtilization,
        threshold: this.performanceThresholds.contextUtilization,
      })
    }

    // Chunk usage recommendations
    const chunkUsageRatio = metrics.avg_chunks_used / metrics.avg_chunks_found
    if (chunkUsageRatio < 0.5) {
      recommendations.push({
        type: "relevance",
        priority: "medium",
        message: "Low chunk usage ratio suggests relevance threshold might be too strict.",
        metric: "chunk_usage_ratio",
        current: chunkUsageRatio,
        threshold: 0.5,
      })
    }

    return recommendations
  }

  async optimizeVectorSearch() {
    // This would implement automatic optimization based on performance metrics
    // For now, return optimization suggestions
    return {
      suggestions: [
        "Consider adjusting similarity threshold based on query performance",
        "Implement query expansion for better context retrieval",
        "Add query classification to route different types of questions",
        "Implement caching for frequently asked questions",
      ],
    }
  }

  async getSlowQueries(limit = 10) {
    try {
      const db = getDatabase()
      if (!db.isConnected) return []

      const slowQueries = await db.query(
        `
        SELECT 
          query,
          (metadata->>'processingTime')::numeric as processing_time,
          (metadata->>'chunksFound')::numeric as chunks_found,
          (metadata->>'chunksUsed')::numeric as chunks_used,
          created_at
        FROM chat_interactions 
        WHERE metadata IS NOT NULL
          AND (metadata->>'processingTime')::numeric > $1
        ORDER BY (metadata->>'processingTime')::numeric DESC
        LIMIT $2
      `,
        [this.performanceThresholds.processingTime, limit],
      )

      return slowQueries.rows
    } catch (error) {
      console.error("Slow queries analysis error:", error)
      return []
    }
  }
}

const ragOptimizer = new RAGOptimizer()

export const analyzeRAGPerformance = (days) => ragOptimizer.analyzePerformance(days)
export const getSlowQueries = (limit) => ragOptimizer.getSlowQueries(limit)
export const optimizeVectorSearch = () => ragOptimizer.optimizeVectorSearch()

export default ragOptimizer
