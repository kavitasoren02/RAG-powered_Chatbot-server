import { GoogleGenerativeAI } from "@google/generative-ai"

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBNw1in9bktKqhIx_v1K4sXkbD_hWahqQU'
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey)
    this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" })

    this.systemPrompt = `You are a helpful news assistant that answers questions based on recent news articles. 

Guidelines:
- Use the provided context from news articles to answer questions accurately
- If the context doesn't contain relevant information, say so clearly
- Always cite your sources when possible
- Provide balanced, factual information
- If asked about breaking news, mention that your information is based on available articles
- Keep responses concise but informative
- If multiple sources have different perspectives, present them fairly

Context will be provided in the format:
Source: [News Source] ([Article Title])
[Article Content]

Answer the user's question based on this context.`
  }

  async generateResponse(query, context) {
    try {
      const prompt = `${this.systemPrompt}

Context from recent news articles:
${context}

User Question: ${query}

Please provide a helpful answer based on the context above:`

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      const text = response.text()

      if (!text || text.trim().length === 0) {
        throw new Error("Empty response from Gemini")
      }

      return text.trim()
    } catch (error) {
      console.error("Gemini generation error:", error)

      if (error.message.includes("SAFETY")) {
        return "I apologize, but I cannot provide a response to that query due to safety guidelines. Please try rephrasing your question."
      }

      if (error.message.includes("QUOTA_EXCEEDED")) {
        return "I'm currently experiencing high demand. Please try again in a few moments."
      }

      throw new Error(`Failed to generate response: ${error.message}`)
    }
  }

  async generateStreamResponse(query, context, onChunk) {
    try {
      const prompt = `${this.systemPrompt}

Context from recent news articles:
${context}

User Question: ${query}

Please provide a helpful answer based on the context above:`

      const result = await this.model.generateContentStream(prompt)

      let fullResponse = ""
      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        fullResponse += chunkText

        if (onChunk) {
          onChunk(chunkText)
        }
      }

      return fullResponse
    } catch (error) {
      console.error("Gemini streaming error:", error)
      throw new Error(`Failed to generate streaming response: ${error.message}`)
    }
  }

  async generateTitle(conversation) {
    try {
      const prompt = `Based on this conversation, generate a short, descriptive title (max 6 words):

${conversation}

Title:`

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      const title = response.text().trim()

      return title.replace(/^Title:\s*/, "").replace(/['"]/g, "")
    } catch (error) {
      console.error("Title generation error:", error)
      return "Chat Session"
    }
  }
}

const geminiService = new GeminiService()

export const generateResponse = (query, context) => geminiService.generateResponse(query, context)
export const generateStreamResponse = (query, context, onChunk) =>
  geminiService.generateStreamResponse(query, context, onChunk)
export const generateTitle = (conversation) => geminiService.generateTitle(conversation)

export default geminiService
