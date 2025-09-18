import { getRedisClient } from "../config/redis.js"

class SessionManager {
  constructor() {
    this.redis = null
    this.sessionTTL = 24 * 60 * 60 // 24 hours in seconds
    this.maxMessagesPerSession = 100
  }

  async initialize() {
    this.redis = await getRedisClient()
  }

  async createSession(sessionId) {
    if (!this.redis) await this.initialize()

    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      title: "New Chat",
      metadata: {},
    }

    const sessionKey = `session:${sessionId}`
    await this.redis.setex(sessionKey, this.sessionTTL, JSON.stringify(session))

    console.log(`Created session: ${sessionId}`)
    return session
  }

  async getSession(sessionId) {
    if (!this.redis) await this.initialize()

    const sessionKey = `session:${sessionId}`
    const sessionData = await this.redis.get(sessionKey)

    if (!sessionData) {
      return null
    }

    return JSON.parse(sessionData)
  }

  async updateSession(sessionId, updates) {
    if (!this.redis) await this.initialize()

    const session = await this.getSession(sessionId)
    if (!session) {
      throw new Error("Session not found")
    }

    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const sessionKey = `session:${sessionId}`
    await this.redis.setex(sessionKey, this.sessionTTL, JSON.stringify(updatedSession))

    return updatedSession
  }

  async addMessageToSession(sessionId, message) {
    if (!this.redis) await this.initialize()

    // Add message to session history
    const historyKey = `session:${sessionId}:history`
    await this.redis.lpush(historyKey, JSON.stringify(message))
    await this.redis.expire(historyKey, this.sessionTTL)

    // Trim history if too long
    await this.redis.ltrim(historyKey, 0, this.maxMessagesPerSession - 1)

    // Update session metadata
    const session = await this.getSession(sessionId)
    if (session) {
      await this.updateSession(sessionId, {
        messageCount: session.messageCount + 1,
      })
    }

    return message
  }

  async getSessionHistory(sessionId, limit = 50, offset = 0) {
    if (!this.redis) await this.initialize()

    const historyKey = `session:${sessionId}:history`
    const messages = await this.redis.lrange(historyKey, offset, offset + limit - 1)

    return messages.map((msg) => JSON.parse(msg)).reverse() // Reverse to get chronological order
  }

  async clearSession(sessionId) {
    if (!this.redis) await this.initialize()

    const sessionKey = `session:${sessionId}`
    const historyKey = `session:${sessionId}:history`

    await Promise.all([this.redis.del(sessionKey), this.redis.del(historyKey)])

    console.log(`Cleared session: ${sessionId}`)
    return true
  }

  async getAllSessions() {
    if (!this.redis) await this.initialize()

    const keys = await this.redis.keys("session:*")
    const sessionKeys = keys.filter((key) => !key.includes(":history"))

    const sessions = []
    for (const key of sessionKeys) {
      const sessionData = await this.redis.get(key)
      if (sessionData) {
        sessions.push(JSON.parse(sessionData))
      }
    }

    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  }

  async getSessionStats() {
    if (!this.redis) await this.initialize()

    const keys = await this.redis.keys("session:*")
    const sessionKeys = keys.filter((key) => !key.includes(":history"))

    return {
      totalSessions: sessionKeys.length,
      activeSessions: sessionKeys.length, // All sessions in Redis are considered active
    }
  }

  async cleanupExpiredSessions() {
    // Redis handles TTL automatically, but we can implement additional cleanup if needed
    console.log("Session cleanup completed (handled by Redis TTL)")
  }
}

const sessionManager = new SessionManager()

// Export functions for easier use
export const createSession = (sessionId) => sessionManager.createSession(sessionId)
export const getSession = (sessionId) => sessionManager.getSession(sessionId)
export const updateSession = (sessionId, updates) => sessionManager.updateSession(sessionId, updates)
export const addMessageToSession = (sessionId, message) => sessionManager.addMessageToSession(sessionId, message)
export const getSessionHistory = (sessionId, limit, offset) =>
  sessionManager.getSessionHistory(sessionId, limit, offset)
export const clearSession = (sessionId) => sessionManager.clearSession(sessionId)
export const getAllSessions = () => sessionManager.getAllSessions()
export const getSessionStats = () => sessionManager.getSessionStats()

export default sessionManager
