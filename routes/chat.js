import express from "express"
import { v4 as uuidv4 } from "uuid"
import { getSessionHistory, addMessageToSession } from "../services/sessionManager.js"
import { io } from "../server.js"
import { processRAGQuery } from "../services/ragService.js"
import { getQuerySuggestions } from "../services/suggestions.js"
import { getTopicTrends } from "../services/trends.js"
import { searchArticles } from "../services/articleSearch.js"

const router = express.Router()

// Send a chat message
router.post("/message", async (req, res) => {
  try {
    const { message, sessionId, streaming = false } = req.body

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        error: "Message and sessionId are required",
      })
    }

    // Generate unique message ID
    const messageId = uuidv4()
    const timestamp = new Date().toISOString()

    // Add user message to session
    const userMessage = {
      id: messageId,
      role: "user",
      content: message,
      timestamp,
    }

    await addMessageToSession(sessionId, userMessage)

    // Emit user message to session room
    io.to(sessionId).emit("user-message", userMessage)

    // Start processing response
    res.json({
      success: true,
      messageId,
      message: "Processing your question...",
    })

    // Process RAG pipeline with streaming support
    if (streaming) {
      processStreamingRAGResponse(message, sessionId, messageId)
    } else {
      processRAGResponse(message, sessionId, messageId)
    }
  } catch (error) {
    console.error("Chat message error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to process message",
    })
  }
})

async function processRAGResponse(query, sessionId, userMessageId) {
  try {
    // Emit typing indicator
    io.to(sessionId).emit("bot-typing", { typing: true })

    // Process query through RAG pipeline
    const ragResult = await processRAGQuery(query, sessionId)

    // Create bot message with RAG response
    const botMessage = {
      id: uuidv4(),
      role: "assistant",
      content: ragResult.response,
      timestamp: new Date().toISOString(),
      sources: ragResult.sources,
      metadata: ragResult.metadata,
    }

    // Add to session and emit
    await addMessageToSession(sessionId, botMessage)

    io.to(sessionId).emit("bot-typing", { typing: false })
    io.to(sessionId).emit("bot-message", botMessage)
  } catch (error) {
    console.error("RAG processing error:", error)

    const errorMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "I apologize, but I encountered an error while processing your question. Please try again.",
      timestamp: new Date().toISOString(),
      error: true,
    }

    await addMessageToSession(sessionId, errorMessage)

    io.to(sessionId).emit("bot-typing", { typing: false })
    io.to(sessionId).emit("bot-message", errorMessage)
  }
}

async function processStreamingRAGResponse(query, sessionId, userMessageId) {
  try {
    // Emit typing indicator
    io.to(sessionId).emit("bot-typing", { typing: true })

    // Get context from RAG pipeline
    const ragResult = await processRAGQuery(query, sessionId, { streaming: true })

    // Start streaming response
    const streamingService = await import("../services/streamingService.js")
    const response = await streamingService.default.streamResponse(sessionId, query, ragResult.sources)

    // Create final bot message
    const botMessage = {
      id: uuidv4(),
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
      sources: ragResult.sources,
      metadata: ragResult.metadata,
    }

    // Add to session
    await addMessageToSession(sessionId, botMessage)

    io.to(sessionId).emit("bot-typing", { typing: false })
  } catch (error) {
    console.error("Streaming RAG processing error:", error)

    const errorMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "I apologize, but I encountered an error while processing your question. Please try again.",
      timestamp: new Date().toISOString(),
      error: true,
    }

    await addMessageToSession(sessionId, errorMessage)

    io.to(sessionId).emit("bot-typing", { typing: false })
    io.to(sessionId).emit("bot-message", errorMessage)
  }
}

// Get chat history for a session
router.get("/history/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const { limit = 50, offset = 0 } = req.query

    const history = await getSessionHistory(sessionId, Number.parseInt(limit), Number.parseInt(offset))

    res.json({
      success: true,
      sessionId,
      messages: history,
      count: history.length,
    })
  } catch (error) {
    console.error("Get history error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to retrieve chat history",
    })
  }
})

// Stream chat response (for future streaming implementation)
router.post("/stream", async (req, res) => {
  try {
    const { message, sessionId } = req.body

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        error: "Message and sessionId are required",
      })
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    })

    // Process and stream response
    await streamRAGResponse(message, sessionId, res)
  } catch (error) {
    console.error("Stream error:", error)
    res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`)
    res.end()
  }
})

async function streamRAGResponse(query, sessionId, res) {
  try {
    // Send processing status
    res.write(`data: ${JSON.stringify({ status: "processing", message: "Searching for relevant information..." })}\n\n`)

    // Process through RAG pipeline
    const ragResult = await processRAGQuery(query, sessionId)

    res.write(`data: ${JSON.stringify({ status: "generating", message: "Generating response..." })}\n\n`)

    // Send final response
    res.write(
      `data: ${JSON.stringify({
        status: "complete",
        response: ragResult.response,
        sources: ragResult.sources,
        metadata: ragResult.metadata,
      })}\n\n`,
    )

    res.write("data: [DONE]\n\n")
    res.end()
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    res.end()
  }
}

router.get("/suggestions", async (req, res) => {
  try {
    const { q } = req.query

    if (!q || q.length < 3) {
      return res.json({
        success: true,
        suggestions: [],
      })
    }

    const suggestions = await getQuerySuggestions(q)

    res.json({
      success: true,
      suggestions,
    })
  } catch (error) {
    console.error("Get suggestions error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get suggestions",
    })
  }
})

router.get("/trends", async (req, res) => {
  try {
    const trends = await getTopicTrends()

    res.json({
      success: true,
      trends,
    })
  } catch (error) {
    console.error("Get trends error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get trends",
    })
  }
})

router.get("/search", async (req, res) => {
  try {
    const { q, source, dateFrom, dateTo } = req.query

    if (!q) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'q' is required",
      })
    }

    const filters = {}
    if (source) filters.source = source
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo

    const articles = await searchArticles(q, filters)

    res.json({
      success: true,
      articles,
      count: articles.length,
    })
  } catch (error) {
    console.error("Search articles error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to search articles",
    })
  }
})

export default router
