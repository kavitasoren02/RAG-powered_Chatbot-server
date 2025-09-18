import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

class VectorStoreService {
  constructor() {
    this.baseUrl = process.env.QDRANT_URL || "http://localhost:6333"
    this.apiKey = process.env.QDRANT_API_KEY
    this.collectionName = "news_articles"
    this.vectorSize = 768 // Jina embeddings dimension

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: this.apiKey ? { "api-key": this.apiKey } : {},
      timeout: 30000,
    })
  }

  async initialize() {
    try {
      // Check if collection exists
      const response = await this.client.get("/collections")
      const collections = response.data.result.collections
      const collectionExists = collections.some((col) => col.name === this.collectionName)

      if (!collectionExists) {
        await this.createCollection()
      }

      console.log(`Vector store initialized with collection: ${this.collectionName}`)
    } catch (error) {
      console.error("Failed to initialize vector store:", error.message)
      throw error
    }
  }

  async createCollection() {
    try {
      await this.client.put(`/collections/${this.collectionName}`, {
        vectors: {
          size: this.vectorSize,
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      })

      // Create indexes for better search performance
      await this.client.put(`/collections/${this.collectionName}/index`, {
        field_name: "source",
        field_schema: "keyword",
      })

      await this.client.put(`/collections/${this.collectionName}/index`, {
        field_name: "pubDate",
        field_schema: "datetime",
      })

      console.log(`Created collection: ${this.collectionName}`)
    } catch (error) {
      console.error("Failed to create collection:", error.message)
      throw error
    }
  }

  async storeChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error("Chunks must be a non-empty array")
    }

    try {
      const points = chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.embedding,
        payload: {
          text: chunk.text,
          articleId: chunk.articleId,
          articleTitle: chunk.articleTitle,
          articleUrl: chunk.articleUrl,
          source: chunk.source,
          pubDate: chunk.pubDate,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
        },
      }))

      await this.client.put(`/collections/${this.collectionName}`, {
        points,
        wait: true,
      })

      console.log(`Stored ${chunks.length} chunks in vector database`)
      return true
    } catch (error) {
      console.error("Failed to store chunks:", error.message)
      throw error
    }
  }

  async searchSimilar(queryEmbedding, limit = 5, filters = {}) {
    try {
      const searchParams = {
        vector: queryEmbedding,
        limit,
        with_payload: true,
        with_vector: false,
      }

      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        searchParams.filter = this.buildFilter(filters)
      }

      const response = await this.client.post(`/collections/${this.collectionName}/points/search`, searchParams)
      const searchResult = response.data.result

      return searchResult.map((result) => ({
        id: result.id,
        score: result.score,
        text: result.payload.text,
        articleTitle: result.payload.articleTitle,
        articleUrl: result.payload.articleUrl,
        source: result.payload.source,
        pubDate: result.payload.pubDate,
        metadata: result.payload.metadata,
      }))
    } catch (error) {
      console.error("Failed to search similar chunks:", error.message)
      throw error
    }
  }

  buildFilter(filters) {
    const conditions = []

    if (filters.source) {
      conditions.push({
        key: "source",
        match: { value: filters.source },
      })
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateRange = {}
      if (filters.dateFrom) dateRange.gte = filters.dateFrom
      if (filters.dateTo) dateRange.lte = filters.dateTo

      conditions.push({
        key: "pubDate",
        range: dateRange,
      })
    }

    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]

    return {
      must: conditions,
    }
  }

  async getCollectionInfo() {
    try {
      const response = await this.client.get(`/collections/${this.collectionName}`)
      const info = response.data.result

      return {
        pointsCount: info.points_count,
        vectorsCount: info.vectors_count,
        status: info.status,
        config: info.config,
      }
    } catch (error) {
      console.error("Failed to get collection info:", error.message)
      return null
    }
  }

  async deleteCollection() {
    try {
      await this.client.delete(`/collections/${this.collectionName}`)
      console.log(`Deleted collection: ${this.collectionName}`)
    } catch (error) {
      console.error("Failed to delete collection:", error.message)
      throw error
    }
  }
}

const vectorStore = new VectorStoreService()

// Export functions for easier use
export const storeInVectorDB = (chunks) => vectorStore.storeChunks(chunks)
export const searchInVectorDB = (queryEmbedding, limit, filters) =>
  vectorStore.searchSimilar(queryEmbedding, limit, filters)
export const searchVectors = (queryEmbedding, limit, filters) =>
  vectorStore.searchSimilar(queryEmbedding, limit, filters)
export const initializeVectorStore = () => vectorStore.initialize()
export const getVectorStoreInfo = () => vectorStore.getCollectionInfo()

export default vectorStore
