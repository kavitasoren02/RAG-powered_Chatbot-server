import { generateQueryEmbedding } from "./embeddings.js"
import { searchInVectorDB } from "./vectorStore.js"
import { generateResponse } from "./gemini.js"
import { getDatabase } from "../config/database.js"

class RAGService {
  constructor() {
    this.contextWindow = 4000 // Max context length for Gemini
    this.maxSources = 5
    this.similarityThreshold = 0.7
  }

  async processQuery(query, sessionId, options = {}) {
    try {
      const startTime = Date.now()

      // Step 1: Generate query embedding
      console.log(`[RAG] Processing query: "${query.substring(0, 100)}..."`)
      const queryEmbedding = await generateQueryEmbedding(query)

      // Step 2: Search for relevant context
      const searchResults = await searchInVectorDB(
        queryEmbedding,
        options.maxSources || this.maxSources,
        options.filters,
      )

      console.log(`[RAG] Found ${searchResults.length} relevant chunks`)

      // Step 3: Filter by similarity threshold
      const relevantChunks = searchResults.filter(
        (chunk) => chunk.score >= (options.similarityThreshold || this.similarityThreshold),
      )

      if (relevantChunks.length === 0) {
        return {
          response:
            "I couldn't find any relevant information in the recent news articles to answer your question. Could you try rephrasing your question or asking about a different topic?",
          sources: [],
          metadata: {
            processingTime: Date.now() - startTime,
            chunksFound: searchResults.length,
            chunksUsed: 0,
            contextLength: 0,
          },
        }
      }

      // Step 4: Prepare context with smart truncation
      const context = this.prepareContext(relevantChunks, query)

      // Step 5: Generate response with Gemini
      const response = await generateResponse(query, context.text)

      // Step 6: Prepare sources for frontend
      const sources = this.prepareSources(relevantChunks)

      const processingTime = Date.now() - startTime
      console.log(`[RAG] Query processed in ${processingTime}ms`)

      // Step 7: Log interaction (optional)
      await this.logInteraction(sessionId, query, response, sources, {
        processingTime,
        chunksFound: searchResults.length,
        chunksUsed: relevantChunks.length,
        contextLength: context.text.length,
      })

      return {
        response,
        sources,
        metadata: {
          processingTime,
          chunksFound: searchResults.length,
          chunksUsed: relevantChunks.length,
          contextLength: context.text.length,
        },
      }
    } catch (error) {
      console.error("[RAG] Processing error:", error)
      throw new Error(`RAG processing failed: ${error.message}`)
    }
  }

  prepareContext(chunks, query) {
    // Sort chunks by relevance score
    const sortedChunks = chunks.sort((a, b) => b.score - a.score)

    let contextText = ""
    const usedChunks = []
    let currentLength = 0

    // Add query context
    const queryContext = `User Question: ${query}\n\nRelevant News Information:\n\n`
    currentLength += queryContext.length

    for (const chunk of sortedChunks) {
      const chunkText = `Source: ${chunk.source} - ${chunk.articleTitle}\nPublished: ${new Date(chunk.pubDate).toLocaleDateString()}\nContent: ${chunk.text}\n\n`

      // Check if adding this chunk would exceed context window
      if (currentLength + chunkText.length > this.contextWindow) {
        break
      }

      contextText += chunkText
      currentLength += chunkText.length
      usedChunks.push(chunk)
    }

    return {
      text: queryContext + contextText,
      chunks: usedChunks,
      length: currentLength,
    }
  }

  prepareSources(chunks) {
    // Deduplicate sources by article URL
    const uniqueSources = new Map()

    for (const chunk of chunks) {
      if (!uniqueSources.has(chunk.articleUrl)) {
        uniqueSources.set(chunk.articleUrl, {
          title: chunk.articleTitle,
          url: chunk.articleUrl,
          source: chunk.source,
          pubDate: chunk.pubDate,
          relevanceScore: chunk.score,
        })
      }
    }

    return Array.from(uniqueSources.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.maxSources)
  }

  async logInteraction(sessionId, query, response, sources, metadata) {
    try {
      const db = getDatabase()
      if (!db.isConnected) return

      await db.query(
        `
        INSERT INTO chat_interactions (
          session_id, 
          query, 
          response, 
          sources, 
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [sessionId, query, response, JSON.stringify(sources), JSON.stringify(metadata)],
      )
    } catch (error) {
      console.error("Failed to log interaction:", error.message)
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  async getQuerySuggestions(partialQuery) {
    try {
      // Generate embedding for partial query
      const queryEmbedding = await generateQueryEmbedding(partialQuery)

      // Search for similar content
      const results = await searchInVectorDB(queryEmbedding, 3)

      // Extract topics/keywords from results
      const suggestions = results.map((chunk) => {
        const title = chunk.articleTitle
        // Simple extraction of key phrases
        const words = title
          .split(" ")
          .filter(
            (word) =>
              word.length > 3 &&
              ![
                "the",
                "and",
                "for",
                "are",
                "but",
                "not",
                "you",
                "all",
                "can",
                "had",
                "her",
                "was",
                "one",
                "our",
                "out",
                "day",
                "get",
                "has",
                "him",
                "his",
                "how",
                "its",
                "may",
                "new",
                "now",
                "old",
                "see",
                "two",
                "who",
                "boy",
                "did",
                "man",
                "men",
                "put",
                "say",
                "she",
                "too",
                "use",
              ].includes(word.toLowerCase()),
          )
        return words.slice(0, 3).join(" ")
      })

      return [...new Set(suggestions)].slice(0, 5)
    } catch (error) {
      console.error("Failed to get query suggestions:", error)
      return []
    }
  }

  async getTopicTrends() {
    try {
      const db = getDatabase()
      if (!db.isConnected) return []

      // Get most common topics from recent articles
      const result = await db.query(`
        SELECT 
          unnest(categories) as topic,
          COUNT(*) as frequency,
          MAX(pub_date) as latest_date
        FROM news_articles 
        WHERE pub_date > NOW() - INTERVAL '7 days'
        GROUP BY topic
        ORDER BY frequency DESC, latest_date DESC
        LIMIT 10
      `)

      return result.rows.map((row) => ({
        topic: row.topic,
        frequency: Number.parseInt(row.frequency),
        latestDate: row.latest_date,
      }))
    } catch (error) {
      console.error("Failed to get topic trends:", error)
      return []
    }
  }

  async searchArticles(query, filters = {}) {
    try {
      const queryEmbedding = await generateQueryEmbedding(query)
      const results = await searchInVectorDB(queryEmbedding, 20, filters)

      // Group by article and aggregate scores
      const articleMap = new Map()

      for (const chunk of results) {
        if (!articleMap.has(chunk.articleUrl)) {
          articleMap.set(chunk.articleUrl, {
            title: chunk.articleTitle,
            url: chunk.articleUrl,
            source: chunk.source,
            pubDate: chunk.pubDate,
            metadata: chunk.metadata,
            relevanceScore: chunk.score,
            chunkCount: 1,
          })
        } else {
          const article = articleMap.get(chunk.articleUrl)
          article.relevanceScore = Math.max(article.relevanceScore, chunk.score)
          article.chunkCount++
        }
      }

      return Array.from(articleMap.values())
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 10)
    } catch (error) {
      console.error("Failed to search articles:", error)
      return []
    }
  }
}

const ragService = new RAGService()

export const processRAGQuery = (query, sessionId, options) => ragService.processQuery(query, sessionId, options)

export const getQuerySuggestions = (partialQuery) => ragService.getQuerySuggestions(partialQuery)

export const getTopicTrends = () => ragService.getTopicTrends()

export const searchArticles = (query, filters) => ragService.searchArticles(query, filters)

export default ragService
