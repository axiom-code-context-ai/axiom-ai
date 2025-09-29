import Redis from 'ioredis'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('cache-service')

export class CacheService {
  private redis: Redis

  constructor() {
    this.redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    })

    this.redis.on('connect', () => {
      logger.info('Connected to Redis cache')
    })

    this.redis.on('error', (error) => {
      logger.error('Redis cache error:', error)
    })
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key)
      if (!value) return null

      return JSON.parse(value) as T
    } catch (error) {
      logger.error({ key, error }, 'Failed to get from cache')
      return null
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value)
      
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized)
      } else {
        await this.redis.set(key, serialized)
      }
    } catch (error) {
      logger.error({ key, error }, 'Failed to set cache')
      throw error
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (error) {
      logger.error({ key, error }, 'Failed to delete from cache')
      throw error
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key)
      return result === 1
    } catch (error) {
      logger.error({ key, error }, 'Failed to check cache existence')
      return false
    }
  }

  /**
   * Clear all cache entries matching pattern
   */
  async clear(pattern: string = '*'): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern)
      if (keys.length === 0) return 0

      await this.redis.del(...keys)
      return keys.length
    } catch (error) {
      logger.error({ pattern, error }, 'Failed to clear cache')
      throw error
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const info = await this.redis.info('memory')
      const keyspace = await this.redis.info('keyspace')
      
      return {
        memory: info,
        keyspace,
        connected: this.redis.status === 'ready',
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats')
      throw error
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit()
      logger.info('Disconnected from Redis cache')
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error)
    }
  }
}

/**
 * Initialize cache service
 */
export async function initializeCache(): Promise<CacheService> {
  const cache = new CacheService()
  
  // Test connection
  try {
    await cache.redis.ping()
    logger.info('Cache service initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize cache service:', error)
    throw error
  }

  return cache
}
