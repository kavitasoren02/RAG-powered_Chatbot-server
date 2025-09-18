import axios from "axios"
import * as cheerio from "cheerio"
import xml2js from "xml2js"
import { generateEmbedding } from "./embeddings.js"
import { storeInVectorDB } from "./vectorStore.js"
import { v4 as uuidv4 } from "uuid"

class NewsIngestionService {
  constructor() {
    this.rssSources = [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://www.theguardian.com/world/rss",
      "https://feeds.npr.org/1001/rss.xml"
    ]
    this.processedArticles = new Set()
    this.xmlParser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
    })
  }

  async ingestAllSources() {
    console.log("Starting news ingestion from all sources...")
    const allArticles = []

    for (const rssUrl of this.rssSources) {
      try {
        const articles = await this.ingestFromRSS(rssUrl)
        allArticles.push(...articles)
        console.log(`Ingested ${articles.length} articles from ${rssUrl}`)
      } catch (error) {
        console.error(`Failed to ingest from ${rssUrl}:`, error.message)
      }
    }

    console.log(`Total articles ingested: ${allArticles.length}`)
    return allArticles
  }

  async ingestFromRSS(rssUrl) {
    try {
      const response = await axios.get(rssUrl, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        },
      })

      const result = await this.xmlParser.parseStringPromise(response.data)
      const feed = result.rss?.channel || result.feed

      if (!feed) {
        throw new Error("Invalid RSS feed format")
      }

      const items = Array.isArray(feed.item) ? feed.item : [feed.item].filter(Boolean)
      const articles = []

      // Process up to 10 articles per source to avoid rate limits
      const itemsToProcess = items.slice(0, 10)

      for (const item of itemsToProcess) {
        try {
          // Skip if already processed
          const link = item.link || item.guid
          if (this.processedArticles.has(link)) {
            continue
          }

          const article = await this.processArticle(item, rssUrl)
          if (article) {
            articles.push(article)
            this.processedArticles.add(link)
          }
        } catch (error) {
          console.error(`Failed to process article ${item.link}:`, error.message)
        }
      }

      return articles
    } catch (error) {
      console.error(`Failed to parse RSS feed ${rssUrl}:`, error.message)
      return []
    }
  }

  async processArticle(item, source) {
    try {
      const article = {
        id: uuidv4(),
        title: item.title || "",
        link: item.link || item.guid || "",
        description: item.description || item.summary || "",
        pubDate: item.pubDate || item.published || new Date().toISOString(),
        source: this.extractSourceName(source),
        author: item.author || item.creator || item["dc:creator"] || "",
        categories: Array.isArray(item.category) ? item.category : [item.category].filter(Boolean),
      }

      // Try to fetch full article content
      const fullContent = await this.fetchFullContent(article.link)
      article.content = fullContent || article.description

      // Clean and chunk the content
      const cleanContent = this.cleanText(article.content)
      const chunks = this.chunkText(cleanContent, article)

      // Generate embeddings for each chunk
      const embeddedChunks = []
      for (const chunk of chunks) {
        try {
          const embedding = await generateEmbedding(chunk.text)
          embeddedChunks.push({
            ...chunk,
            embedding,
          })
        } catch (error) {
          console.error(`Failed to generate embedding for chunk:`, error.message)
        }
      }

      // Store in vector database
      if (embeddedChunks.length > 0) {
        await storeInVectorDB(embeddedChunks)
      }

      return {
        ...article,
        chunks: embeddedChunks.length,
        processed: true,
      }
    } catch (error) {
      console.log({
        error
      })
      console.error(`Failed to process article:`, error.message)
      return null
    }
  }

  async fetchFullContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        },
      })

      const $ = cheerio.load(response.data)

      // Remove unwanted elements
      $("script, style, nav, header, footer, aside, .advertisement, .ads").remove()

      // Try common article selectors
      const selectors = [
        "article",
        ".article-content",
        ".story-body",
        ".entry-content",
        ".post-content",
        ".content",
        "main",
      ]

      let content = ""
      for (const selector of selectors) {
        const element = $(selector)
        if (element.length > 0) {
          content = element.text().trim()
          if (content.length > 200) {
            break
          }
        }
      }

      // Fallback to body if no specific content found
      if (!content || content.length < 200) {
        content = $("body").text().trim()
      }

      return content.length > 100 ? content : null
    } catch (error) {
      console.error(`Failed to fetch full content from ${url}:`, error.message)
      return null
    }
  }

  cleanText(text) {
    if (!text) return ""

    return text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s.,!?;:()\-"']/g, "") // Remove special characters
      .trim()
  }

  chunkText(text, article, maxChunkSize = 500, overlap = 50) {
    if (!text || text.length < 100) return []

    const chunks = []
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    let currentChunk = ""
    let chunkIndex = 0

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim() + "."

      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
        // Create chunk
        chunks.push({
          id: `${article.id}_chunk_${chunkIndex}`,
          text: currentChunk.trim(),
          articleId: article.id,
          articleTitle: article.title,
          articleUrl: article.link,
          source: article.source,
          pubDate: article.pubDate,
          chunkIndex,
          metadata: {
            title: article.title,
            source: article.source,
            url: article.link,
            pubDate: article.pubDate,
            author: article.author,
            categories: article.categories,
          },
        })

        // Start new chunk with overlap
        const overlapSentences = sentences.slice(Math.max(0, i - 2), i)
        currentChunk = overlapSentences.join(". ") + (overlapSentences.length > 0 ? ". " : "")
        chunkIndex++
      }

      currentChunk += sentence + " "
    }

    // Add final chunk if it has content
    if (currentChunk.trim().length > 50) {
      chunks.push({
        id: `${article.id}_chunk_${chunkIndex}`,
        text: currentChunk.trim(),
        articleId: article.id,
        articleTitle: article.title,
        articleUrl: article.link,
        source: article.source,
        pubDate: article.pubDate,
        chunkIndex,
        metadata: {
          title: article.title,
          source: article.source,
          url: article.link,
          pubDate: article.pubDate,
          author: article.author,
          categories: article.categories,
        },
      })
    }

    return chunks
  }

  extractSourceName(rssUrl) {
    const urlMap = {
      "reuters.com": "Reuters",
      "cnn.com": "CNN",
      "bbci.co.uk": "BBC",
      "theguardian.com": "The Guardian",
      "npr.org": "NPR",
    }

    for (const [domain, name] of Object.entries(urlMap)) {
      if (rssUrl.includes(domain)) {
        return name
      }
    }

    try {
      const url = new URL(rssUrl)
      return url.hostname.replace("www.", "")
    } catch {
      return "Unknown Source"
    }
  }

  async getIngestionStats() {
    return {
      processedArticles: this.processedArticles.size,
      sources: this.rssSources.length,
      lastIngestion: new Date().toISOString(),
    }
  }
}

export default new NewsIngestionService()
