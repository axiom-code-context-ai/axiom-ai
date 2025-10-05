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
      service: 'Axiom AI MCP Server',
      timestamp: new Date().toISOString() 
    }
  })

  // Simple context search endpoint
  server.post('/search-context', async (request, reply) => {
    try {
      const { query, repository } = request.body as any
      logger.info({ query, repository }, 'Context search request')
      
      // Mock context search - in real implementation this would:
      // 1. Search stored context in database
      // 2. Return relevant code samples and patterns
      // 3. Supply to LLM for intelligent code generation
      
      const mockContext = {
        query,
        repository,
        context: [
          {
            type: 'function',
            name: 'exampleFunction',
            code: 'function exampleFunction() {\n  // Implementation here\n  return result;\n}',
            file: 'src/example.js',
            line: 10
          }
        ],
        summary: 'Found relevant code patterns for your query',
        timestamp: new Date().toISOString()
      }

      return mockContext
    } catch (error) {
      logger.error(error, 'Context search error')
      return reply.status(500).send({ error: 'Context search failed' })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI MCP Server',
      version: '1.0.0',
      status: 'running',
      description: 'Simple MCP server for context-aware code generation',
      endpoints: {
        health: '/health',
        searchContext: '/search-context'
      },
      timestamp: new Date().toISOString(),
    }
  })

  return server
}