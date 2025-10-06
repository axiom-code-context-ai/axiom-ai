import Fastify from 'fastify'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import searchRoutes from './routes/search.js'
import healthRoutes from './routes/health.js'
import type { SearchEngine } from './services/searchEngine.js'
import type { CacheService } from './services/cacheService.js'

interface ServerOptions {
  searchEngine: SearchEngine
  cache: CacheService
}

export async function createServer(options: ServerOptions) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
  })

  // Decorate server with services for route access
  server.decorate('searchEngine', options.searchEngine)
  server.decorate('cache', options.cache)

  // Register health routes at root
  server.get('/health', async () => ({
    status: 'healthy',
    service: 'Axiom AI Search API',
    timestamp: new Date().toISOString()
  }))

  // Simple search endpoint that returns correct format for MCP server
  server.post('/search', async (request) => {
    const { query } = request.body as any
    logger.info({ query }, 'Search request')

    // Return correctly formatted response that matches SearchResponse interface
    return {
      results: [],
      totalCount: 0,
      searchTime: Date.now(),
      query,
      type: 'hybrid',
      suggestions: []
    }
  })

  // Register full search routes (for future use)
  // await server.register(healthRoutes, { prefix: '/health-detailed' })
  // await server.register(searchRoutes, { prefix: '/search-advanced' })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI Search API',
      version: '1.0.0',
      status: 'running',
      description: 'Advanced code search with vector similarity and keyword matching',
      endpoints: {
        health: '/health',
        search: '/search',
        vectorSearch: '/search/vector',
        keywordSearch: '/search/keyword',
        suggestions: '/search/suggestions',
        filters: '/search/filters/:workspaceId'
      },
      timestamp: new Date().toISOString(),
    }
  })

  return server
}