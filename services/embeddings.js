import axios from "axios"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

class EmbeddingService {
  constructor() {
    this.jinaApiKey = process.env.JINA_API_KEY
    this.jinaBaseUrl = "https://api.jina.ai/v1/embeddings"
    this.model = "jina-embeddings-v4"
    this.maxRetries = 3
    this.retryDelay = 1000
  }

  async generateEmbedding(text) {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty")
    }

    if (!this.jinaApiKey) {
      throw new Error("JINA_API_KEY not configured")
    }

    // Truncate text if too long (Jina has token limits)
    const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          this.jinaBaseUrl,
          {
            model: this.model,
            input: [truncatedText],
            // encoding_format: "float",
          },
          {
            headers: {
              Authorization: `Bearer ${this.jinaApiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          },
        )

        if (response.data && response.data.data && response.data.data[0]) {
          return response.data.data[0].embedding
        } else {
          throw new Error("Invalid response format from Jina API")
        }
      } catch (error) {
        console.error(`Embedding attempt ${attempt} failed:`, error.message)
        console.log({
          error
        })
        if (attempt === this.maxRetries) {
          throw new Error(`Failed to generate embedding after ${this.maxRetries} attempts: ${error.message}`)
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay * attempt))
      }
    }
  }

  async generateBatchEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error("Texts must be a non-empty array")
    }

    // Process in batches to avoid API limits
    const batchSize = 10
    const embeddings = []

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const batchEmbeddings = await Promise.all(batch.map((text) => this.generateEmbedding(text)))
      embeddings.push(...batchEmbeddings)

      // Add delay between batches to respect rate limits
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    return embeddings
  }

  getEmbeddingDimensions() {
    // Jina embeddings v2 base model has 768 dimensions
    return 768
  }
}

export default new EmbeddingService()
export { EmbeddingService }

export const generateEmbedding = async (text) => {
  const embeddingService = new EmbeddingService()
  return embeddingService.generateEmbedding(text)
}

export const generateQueryEmbedding = async (query) => {
  const embeddingService = new EmbeddingService()
  const enhancedQuery = `Question about recent news: ${query}`
  return embeddingService.generateEmbedding(enhancedQuery)
}
