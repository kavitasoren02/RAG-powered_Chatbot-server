import cron from "node-cron"
import newsIngestionService from "../services/newsIngestion.js"

class NewsIngestionJob {
  constructor() {
    this.isRunning = false
    this.lastRun = null
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalArticlesProcessed: 0,
    }
  }

  start() {
    // Run every 2 hours
    cron.schedule("0 */2 * * *", async () => {
      await this.runIngestion()
    })

    // Run immediately on startup
    setTimeout(() => {
      this.runIngestion()
    }, 5000)

    console.log("News ingestion job scheduled to run every 2 hours")
  }

  async runIngestion() {
    if (this.isRunning) {
      console.log("News ingestion already running, skipping...")
      return
    }

    this.isRunning = true
    this.stats.totalRuns++

    try {
      console.log("Starting scheduled news ingestion...")
      const articles = await newsIngestionService.ingestAllSources()

      this.stats.successfulRuns++
      this.stats.totalArticlesProcessed += articles.length
      this.lastRun = new Date().toISOString()

      console.log(`News ingestion completed successfully. Processed ${articles.length} articles.`)
    } catch (error) {
      this.stats.failedRuns++
      console.error("News ingestion failed:", error.message)
    } finally {
      this.isRunning = false
    }
  }

  async runManual() {
    console.log("Running manual news ingestion...")
    return this.runIngestion()
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    }
  }
}

export default new NewsIngestionJob()
