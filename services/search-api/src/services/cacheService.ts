import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('cache-service')

export class CacheService {
  private cache: Map<string, any> = new Map()

  constructor() {
    logger.info('CacheService initialized (in-memory mode)')
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.cache.get(key)
    if (value) {
      logger.debug({ key }, 'Cache hit')
      return value
    }
    logger.debug({ key }, 'Cache miss')
    return null
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.cache.set(key, value)
    logger.debug({ key, ttl }, 'Cache set')
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)
    logger.debug({ key }, 'Cache deleted')
  }

  async flush(): Promise<void> {
    this.cache.clear()
    logger.info('Cache flushed')
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting cache service')
    this.cache.clear()
  }
}

export async function initializeCache(): Promise<CacheService> {
  logger.info('Initializing cache service (in-memory mode)')
  return new CacheService()
}