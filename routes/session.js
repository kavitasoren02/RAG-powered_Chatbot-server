import express from "express"
import { v4 as uuidv4 } from "uuid"
import { createSession, getSession, clearSession, getAllSessions } from "../services/sessionManager.js"

const router = express.Router()

// Create a new chat session
router.post("/create", async (req, res) => {
  try {
    const sessionId = uuidv4()
    const session = await createSession(sessionId)

    res.json({
      success: true,
      sessionId,
      session,
      message: "New session created successfully",
    })
  } catch (error) {
    console.error("Create session error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to create session",
    })
  }
})

// Get session information
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = await getSession(sessionId)

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      })
    }

    res.json({
      success: true,
      session,
    })
  } catch (error) {
    console.error("Get session error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to retrieve session",
    })
  }
})

// Clear session history
router.delete("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    await clearSession(sessionId)

    res.json({
      success: true,
      message: "Session cleared successfully",
    })
  } catch (error) {
    console.error("Clear session error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to clear session",
    })
  }
})

// Get all sessions (for admin/debugging)
router.get("/", async (req, res) => {
  try {
    const sessions = await getAllSessions()

    res.json({
      success: true,
      sessions,
      count: sessions.length,
    })
  } catch (error) {
    console.error("Get all sessions error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to retrieve sessions",
    })
  }
})

// Update session metadata
router.patch("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const { title, metadata } = req.body

    const session = await getSession(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      })
    }

    // Update session with new metadata
    const updatedSession = {
      ...session,
      title: title || session.title,
      metadata: { ...session.metadata, ...metadata },
      updatedAt: new Date().toISOString(),
    }

    // Save updated session (implementation depends on storage)
    // For now, we'll just return the updated session
    res.json({
      success: true,
      session: updatedSession,
      message: "Session updated successfully",
    })
  } catch (error) {
    console.error("Update session error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to update session",
    })
  }
})

export default router
