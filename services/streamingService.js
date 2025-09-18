import { GoogleGenerativeAI } from "@google/generative-ai"
import { io } from "../server.js"

class StreamingService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" })
  }

  async streamResponse(sessionId, query, context, socketId) {
    try {
      const prompt = this.buildPrompt(query, context)

      // Start streaming response
      const result = await this.model.generateContentStream(prompt)

      let fullResponse = ""

      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        fullResponse += chunkText

        // Emit chunk to specific session
        io.to(sessionId).emit("message-chunk", {
          sessionId,
          chunk: chunkText,
          isComplete: false,
        })

        // Small delay to make streaming visible
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      // Emit completion
      io.to(sessionId).emit("message-chunk", {
        sessionId,
        chunk: "",
        isComplete: true,
        fullResponse,
      })

      return fullResponse
    } catch (error) {
      console.error("Streaming error:", error.message)

      // Emit error to session
      io.to(sessionId).emit("message-error", {
        sessionId,
        error: "Failed to generate response",
      })

      throw error
    }
  }

  buildPrompt(query, context) {
    const contextText = context
      .map((item) => `Source: ${item.source}\nTitle: ${item.articleTitle}\nContent: ${item.text}\n---`)
      .join("\n")

    return `Based on the following recent news articles, please answer the user's question. 
    Provide accurate information and cite your sources when possible.

    Context:
    ${contextText}

    Question: ${query}

    Answer:`
  }

  async emitTypingIndicator(sessionId, isTyping) {
    io.to(sessionId).emit("typing-indicator", {
      sessionId,
      isTyping,
    })
  }
}

export default new StreamingService()
