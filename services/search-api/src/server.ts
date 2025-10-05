import Fastify from 'fastify'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import { SearchEngine } from './services/searchEngine.js'
import { CacheService } from './services/cacheService.js'

export interface ServerOptions {
  searchEngine: SearchEngine
  cache: CacheService
}

export async function createServer(options: ServerOptions) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
  })

  // Add services to server context
  server.decorate('searchEngine', options.searchEngine)
  server.decorate('cache', options.cache)

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return { status: 'healthy', timestamp: new Date().toISOString() }
  })

  // Search endpoint
  server.post('/api/search', async (request, reply) => {
    try {
      const searchQuery = request.body as any
      const results = await options.searchEngine.search(searchQuery)
      return results
    } catch (error) {
      logger.error(error, 'Search error')
      return reply.status(500).send({ error: 'Search failed' })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI Search API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    }
  })

  return server
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    searchEngine: SearchEngine
    cache: CacheService
  }
}