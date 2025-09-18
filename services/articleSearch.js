import { searchVectors } from "./vectorStore.js"
import { getRedisClient } from "../config/redis.js"

/**
 * Search articles with various filters and options
 */
export async function searchArticles(query, filters = {}) {
    try {
        const { source, dateFrom, dateTo, category, limit = 20, offset = 0, sortBy = "relevance" } = filters

        // Generate cache key
        const cacheKey = generateCacheKey(query, filters)

        const redis = getRedisClient()
        // Check cache first
        const cached = await redis.get(cacheKey)
        if (cached) {
            return JSON.parse(cached)
        }

        // Perform vector search
        const vectorResults = await searchVectors(query, limit + offset)

        // Apply filters
        let filteredResults = applyFilters(vectorResults, filters)

        // Sort results
        filteredResults = sortResults(filteredResults, sortBy)

        // Apply pagination
        const paginatedResults = filteredResults.slice(offset, offset + limit)

        // Format results
        const articles = paginatedResults.map((result) => formatArticle(result))

        // Cache results for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(articles))

        return articles
    } catch (error) {
        console.error("Error searching articles:", error)
        return []
    }
}

/**
 * Apply various filters to search results
 */
function applyFilters(results, filters) {
    let filtered = [...results]

    // Filter by source
    if (filters.source) {
        filtered = filtered.filter((result) => result.payload.source?.toLowerCase().includes(filters.source.toLowerCase()))
    }

    // Filter by date range
    if (filters.dateFrom || filters.dateTo) {
        filtered = filtered.filter((result) => {
            const articleDate = new Date(result.payload.publishedAt || result.payload.createdAt)

            if (filters.dateFrom) {
                const fromDate = new Date(filters.dateFrom)
                if (articleDate < fromDate) return false
            }

            if (filters.dateTo) {
                const toDate = new Date(filters.dateTo)
                if (articleDate > toDate) return false
            }

            return true
        })
    }

    // Filter by category
    if (filters.category) {
        filtered = filtered.filter((result) => result.payload.category?.toLowerCase() === filters.category.toLowerCase())
    }

    return filtered
}

/**
 * Sort search results by different criteria
 */
function sortResults(results, sortBy) {
    switch (sortBy) {
        case "date":
            return results.sort((a, b) => {
                const dateA = new Date(a.payload.publishedAt || a.payload.createdAt)
                const dateB = new Date(b.payload.publishedAt || b.payload.createdAt)
                return dateB - dateA // Newest first
            })

        case "relevance":
        default:
            return results.sort((a, b) => b.score - a.score)
    }
}

/**
 * Format article for API response
 */
function formatArticle(result) {
    const payload = result.payload

    return {
        id: payload.id,
        title: payload.title,
        content: payload.content,
        summary: payload.summary || generateSummary(payload.content),
        source: payload.source,
        author: payload.author,
        publishedAt: payload.publishedAt,
        url: payload.url,
        category: payload.category,
        tags: payload.tags || [],
        relevanceScore: result.score,
        imageUrl: payload.imageUrl,
        readTime: estimateReadTime(payload.content),
    }
}

/**
 * Generate article summary if not available
 */
function generateSummary(content, maxLength = 200) {
    if (!content) return ""

    // Simple extractive summary - take first few sentences
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    let summary = ""

    for (const sentence of sentences) {
        if (summary.length + sentence.length > maxLength) break
        summary += sentence.trim() + ". "
    }

    return summary.trim()
}

/**
 * Estimate reading time for article
 */
function estimateReadTime(content) {
    if (!content) return 0

    const wordsPerMinute = 200
    const wordCount = content.split(/\s+/).length
    return Math.ceil(wordCount / wordsPerMinute)
}

/**
 * Generate cache key for search results
 */
function generateCacheKey(query, filters) {
    const filterString = Object.entries(filters)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join("|")

    return `search:${Buffer.from(query).toString("base64")}:${Buffer.from(filterString).toString("base64")}`
}

/**
 * Search articles by category
 */
export async function searchByCategory(category, limit = 10) {
    try {
        return await searchArticles("", { category, limit, sortBy: "date" })
    } catch (error) {
        console.error("Error searching by category:", error)
        return []
    }
}

/**
 * Get related articles based on an article ID
 */
export async function getRelatedArticles(articleId, limit = 5) {
    try {
        // This would typically find the article and search for similar content
        // For now, return empty array as placeholder
        return []
    } catch (error) {
        console.error("Error getting related articles:", error)
        return []
    }
}

/**
 * Search articles by multiple keywords
 */
export async function searchByKeywords(keywords, filters = {}) {
    try {
        const query = keywords.join(" ")
        return await searchArticles(query, filters)
    } catch (error) {
        console.error("Error searching by keywords:", error)
        return []
    }
}
