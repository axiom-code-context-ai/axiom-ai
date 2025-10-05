import Fastify from 'fastify'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'

export async function createServer() {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
  })

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return { 
      status: 'healthy', 
      service: 'Axiom AI Search API',
      timestamp: new Date().toISOString() 
    }
  })

  // Simple search endpoint for stored context
  server.post('/search', async (request, reply) => {
    try {
      const { query, repository } = request.body as any
      logger.info({ query, repository }, 'Search request')
      
      // Mock search - in real implementation this would:
      // 1. Search stored context in database
      // 2. Return relevant code patterns and samples
      // 3. Used by MCP server to supply context to LLM
      
      const mockResults = {
        query,
        repository,
        results: [
          {
            id: '1',
            type: 'function',
            name: 'handleUserAuth',
            code: 'function handleUserAuth(user) {\n  // Authentication logic\n  return validateUser(user);\n}',
            file: 'src/auth.js',
            line: 15,
            relevance: 0.95
          },
          {
            id: '2',
            type: 'class',
            name: 'UserService',
            code: 'class UserService {\n  constructor() {\n    this.users = [];\n  }\n}',
            file: 'src/services/user.js',
            line: 5,
            relevance: 0.87
          }
        ],
        totalCount: 2,
        searchTime: Date.now(),
        timestamp: new Date().toISOString()
      }

      return mockResults
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
      description: 'Simple search API for stored code context',
      endpoints: {
        health: '/health',
        search: '/search'
      },
      timestamp: new Date().toISOString(),
    }
  })

  return server
}