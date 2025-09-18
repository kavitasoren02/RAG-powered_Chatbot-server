// Simple API key authentication middleware (optional)
export const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers["x-api-key"]
  const validApiKey = process.env.API_KEY

  if (validApiKey && apiKey !== validApiKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid API key",
    })
  }

  next()
}

// Rate limiting middleware
const rateLimitMap = new Map()

export const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress
    const now = Date.now()
    const windowStart = now - windowMs

    // Clean old entries
    for (const [ip, requests] of rateLimitMap.entries()) {
      rateLimitMap.set(
        ip,
        requests.filter((time) => time > windowStart),
      )
      if (rateLimitMap.get(ip).length === 0) {
        rateLimitMap.delete(ip)
      }
    }

    // Check current client
    const clientRequests = rateLimitMap.get(clientIP) || []
    const recentRequests = clientRequests.filter((time) => time > windowStart)

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: "Too many requests",
        retryAfter: Math.ceil(windowMs / 1000),
      })
    }

    // Add current request
    recentRequests.push(now)
    rateLimitMap.set(clientIP, recentRequests)

    next()
  }
}

// Session validation middleware
export const validateSession = async (req, res, next) => {
  const sessionId = req.body.sessionId || req.params.sessionId

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: "Session ID is required",
    })
  }

  // Basic UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(sessionId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid session ID format",
    })
  }

  req.sessionId = sessionId
  next()
}

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error("API Error:", err)

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details: err.message,
    })
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    })
  }

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  })
}
