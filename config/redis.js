import { createClient } from "redis"

class RedisManager {
  constructor() {
    this.client = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  async initialize() {
    try {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"

      this.client = createClient({
        url: redisUrl,
        retry_strategy: (options) => {
          if (options.error && options.error.code === "ECONNREFUSED") {
            console.error("Redis connection refused")
            return new Error("Redis connection refused")
          }

          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error("Redis retry time exhausted")
            return new Error("Retry time exhausted")
          }

          if (options.attempt > this.maxReconnectAttempts) {
            console.error("Max Redis reconnection attempts reached")
            return new Error("Max reconnection attempts reached")
          }

          // Exponential backoff
          return Math.min(options.attempt * 100, 3000)
        },
      })

      // Event listeners
      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err.message)
        this.isConnected = false
      })

      this.client.on("connect", () => {
        console.log("Redis connecting...")
      })

      this.client.on("ready", () => {
        console.log("Redis connected successfully")
        this.isConnected = true
        this.reconnectAttempts = 0
      })

      this.client.on("end", () => {
        console.log("Redis connection ended")
        this.isConnected = false
      })

      this.client.on("reconnecting", () => {
        this.reconnectAttempts++
        console.log(`Redis reconnecting... (attempt ${this.reconnectAttempts})`)
      })

      // Connect to Redis
      await this.client.connect()

      // Test connection
      await this.client.ping()
      console.log("Redis ping successful")

      return this.client
    } catch (error) {
      console.error("Redis initialization failed:", error.message)
      this.isConnected = false
      throw error
    }
  }

  async get(key) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.get(key)
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error.message)
      throw error
    }
  }

  async set(key, value, options = {}) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      if (options.ttl) {
        return await this.client.setEx(key, options.ttl, value)
      }
      return await this.client.set(key, value)
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error.message)
      throw error
    }
  }

  async setex(key, seconds, value) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.setEx(key, seconds, value)
    } catch (error) {
      console.error(`Redis SETEX error for key ${key}:`, error.message)
      throw error
    }
  }

  async del(key) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.del(key)
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error.message)
      throw error
    }
  }

  async exists(key) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.exists(key)
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error.message)
      throw error
    }
  }

  async keys(pattern) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.keys(pattern)
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error.message)
      throw error
    }
  }

  async lpush(key, ...values) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.lPush(key, values)
    } catch (error) {
      console.error(`Redis LPUSH error for key ${key}:`, error.message)
      throw error
    }
  }

  async lrange(key, start, stop) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.lRange(key, start, stop)
    } catch (error) {
      console.error(`Redis LRANGE error for key ${key}:`, error.message)
      throw error
    }
  }

  async ltrim(key, start, stop) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.lTrim(key, start, stop)
    } catch (error) {
      console.error(`Redis LTRIM error for key ${key}:`, error.message)
      throw error
    }
  }

  async expire(key, seconds) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.expire(key, seconds)
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error.message)
      throw error
    }
  }

  async ttl(key) {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.ttl(key)
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error.message)
      throw error
    }
  }

  async flushall() {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.flushAll()
    } catch (error) {
      console.error("Redis FLUSHALL error:", error.message)
      throw error
    }
  }

  async info() {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis not connected")
    }

    try {
      return await this.client.info()
    } catch (error) {
      console.error("Redis INFO error:", error.message)
      throw error
    }
  }

  async getStats() {
    if (!this.client || !this.isConnected) {
      return {
        connected: false,
        error: "Redis not connected",
      }
    }

    try {
      const info = await this.client.info("memory")
      const keyspace = await this.client.info("keyspace")

      return {
        connected: this.isConnected,
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
      }
    } catch (error) {
      console.error("Failed to get Redis stats:", error.message)
      return {
        connected: this.isConnected,
        error: error.message,
      }
    }
  }

  parseRedisInfo(info) {
    const lines = info.split("\r\n")
    const result = {}

    for (const line of lines) {
      if (line.includes(":")) {
        const [key, value] = line.split(":")
        result[key] = value
      }
    }

    return result
  }

  async close() {
    if (this.client) {
      await this.client.quit()
      this.isConnected = false
      console.log("Redis connection closed")
    }
  }
}

const redisManager = new RedisManager()

export const initializeRedis = () => redisManager.initialize()
export const getRedisClient = () => redisManager
export const closeRedis = () => redisManager.close()

export default redisManager
