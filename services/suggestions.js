import { searchVectors } from "./vectorStore.js"
import { getRedisClient } from "../config/redis.js"

/**
 * Generate query suggestions based on user input and popular queries
 */
export async function getQuerySuggestions(query) {
    try {
        const suggestions = []

        // Get cached popular queries
        const popularQueries = await getPopularQueries()

        // Filter popular queries that match the input
        const matchingPopular = popularQueries.filter((q) => q.toLowerCase().includes(query.toLowerCase())).slice(0, 3)

        suggestions.push(
            ...matchingPopular.map((q) => ({
                text: q,
                type: "popular",
                score: 0.9,
            })),
        )

        // Get semantic suggestions from vector store
        try {
            const semanticResults = await searchVectors(query, 3)
            const semanticSuggestions = semanticResults.map((result) => ({
                text: generateSuggestionFromContent(result.payload.title, query),
                type: "semantic",
                score: result.score,
            }))

            suggestions.push(...semanticSuggestions)
        } catch (error) {
            console.error("Error getting semantic suggestions:", error)
        }

        // Add contextual suggestions based on query type
        const contextualSuggestions = generateContextualSuggestions(query)
        suggestions.push(...contextualSuggestions)

        // Remove duplicates and sort by score
        const uniqueSuggestions = removeDuplicates(suggestions)
        return uniqueSuggestions
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((s) => s.text)
    } catch (error) {
        console.error("Error generating suggestions:", error)
        return []
    }
}

/**
 * Get popular queries from cache
 */
async function getPopularQueries() {
    try {
        const redis = getRedisClient()
        const cached = await redis.get("popular_queries")
        if (cached) {
            return JSON.parse(cached)
        }

        // Default popular queries if none cached
        const defaultQueries = [
            "What's happening in technology today?",
            "Latest news about artificial intelligence",
            "Current political developments",
            "Stock market updates",
            "Climate change news",
            "Sports headlines today",
            "Entertainment industry news",
            "Health and medical breakthroughs",
        ]

        // Cache for 1 hour
        await redis.setex("popular_queries", 3600, JSON.stringify(defaultQueries))
        return defaultQueries
    } catch (error) {
        console.error("Error getting popular queries:", error)
        return []
    }
}

/**
 * Generate suggestion text from article content
 */
function generateSuggestionFromContent(title, query) {
    // Extract key terms from title and create a suggestion
    const words = title.split(" ").filter((word) => word.length > 3)
    const keyWords = words.slice(0, 3).join(" ")

    if (query.toLowerCase().includes("what")) {
        return `What about ${keyWords}?`
    } else if (query.toLowerCase().includes("how")) {
        return `How does ${keyWords} work?`
    } else if (query.toLowerCase().includes("when")) {
        return `When did ${keyWords} happen?`
    } else {
        return `Tell me about ${keyWords}`
    }
}

/**
 * Generate contextual suggestions based on query patterns
 */
function generateContextualSuggestions(query) {
    const suggestions = []
    const lowerQuery = query.toLowerCase()

    if (lowerQuery.includes("news") || lowerQuery.includes("latest")) {
        suggestions.push({
            text: "What are today's top headlines?",
            type: "contextual",
            score: 0.7,
        })
    }

    if (lowerQuery.includes("stock") || lowerQuery.includes("market")) {
        suggestions.push({
            text: "How are the markets performing today?",
            type: "contextual",
            score: 0.7,
        })
    }

    if (lowerQuery.includes("weather") || lowerQuery.includes("climate")) {
        suggestions.push({
            text: "What's the weather forecast?",
            type: "contextual",
            score: 0.7,
        })
    }

    return suggestions
}

/**
 * Remove duplicate suggestions
 */
function removeDuplicates(suggestions) {
    const seen = new Set()
    return suggestions.filter((suggestion) => {
        const key = suggestion.text.toLowerCase()
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

/**
 * Track query for popularity analytics
 */
export async function trackQuery(query) {
    try {
        const redis = getRedisClient()
        const key = "query_analytics"
        const today = new Date().toISOString().split("T")[0]

        // Increment query count
        await redis.hincrby(`${key}:${today}`, query, 1)

        // Set expiry for 30 days
        await redis.expire(`${key}:${today}`, 30 * 24 * 60 * 60)
    } catch (error) {
        console.error("Error tracking query:", error)
    }
}
