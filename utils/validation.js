// Input validation utilities
export const validateMessage = (message) => {
  if (!message || typeof message !== "string") {
    throw new Error("Message must be a non-empty string")
  }

  if (message.trim().length === 0) {
    throw new Error("Message cannot be empty")
  }

  if (message.length > 2000) {
    throw new Error("Message too long (max 2000 characters)")
  }

  return message.trim()
}

export const validateSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("Session ID must be a string")
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(sessionId)) {
    throw new Error("Invalid session ID format")
  }

  return sessionId
}

export const sanitizeInput = (input) => {
  if (typeof input !== "string") return input

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .trim()
}

export const validatePagination = (limit, offset) => {
  const parsedLimit = Number.parseInt(limit) || 50
  const parsedOffset = Number.parseInt(offset) || 0

  return {
    limit: Math.min(Math.max(parsedLimit, 1), 100), // Between 1 and 100
    offset: Math.max(parsedOffset, 0), // Non-negative
  }
}
