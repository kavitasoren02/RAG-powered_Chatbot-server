import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { createServer } from "http"
import { Server } from "socket.io"
import chatRoutes from "./routes/chat.js"
import sessionRoutes from "./routes/session.js"
import ingestionRoutes from "./routes/ingestion.js"
import analyticsRoutes from "./routes/analytics.js"
import healthRoutes from "./routes/health.js"
import { initializeDatabase } from "./config/database.js"
import { initializeRedis } from "./config/redis.js"
import { initializeVectorStore } from "./services/vectorStore.js"
import newsIngestionJob from "./jobs/newsIngestionJob.js"

dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
})

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use("/api/chat", chatRoutes)
app.use("/api/session", sessionRoutes)
app.use("/api/ingestion", ingestionRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/health", healthRoutes)

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId)
    console.log(`User ${socket.id} joined session ${sessionId}`)

    // Send connection confirmation
    socket.emit("session-joined", { sessionId, socketId: socket.id })
  })

  socket.on("user-typing", (data) => {
    socket.to(data.sessionId).emit("user-typing-indicator", {
      sessionId: data.sessionId,
      typing: data.typing,
      userId: socket.id,
    })
  })

  socket.on("message-read", (data) => {
    socket.to(data.sessionId).emit("message-read-receipt", {
      messageId: data.messageId,
      readBy: socket.id,
      timestamp: new Date().toISOString(),
    })
  })

  socket.on("session-activity", (data) => {
    socket.to(data.sessionId).emit("user-activity", {
      sessionId: data.sessionId,
      activity: data.activity,
      userId: socket.id,
      timestamp: new Date().toISOString(),
    })
  })

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
  })
})

// Initialize databases
async function startServer() {
  try {
    await initializeDatabase()
    await initializeRedis()
    await initializeVectorStore()
    newsIngestionJob.start()

    const PORT = process.env.PORT || 3000
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

startServer()

export { io }
