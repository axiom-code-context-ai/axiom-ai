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
    return { status: 'healthy', timestamp: new Date().toISOString() }
  })

  // MCP endpoint
  server.post('/mcp', async (request, reply) => {
    try {
      const mcpRequest = request.body as any
      logger.info({ mcpRequest }, 'MCP request received')
      return { message: 'MCP request processed', status: 'success' }
    } catch (error) {
      logger.error(error, 'MCP error')
      return reply.status(500).send({ error: 'MCP request failed' })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI MCP Server',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    }
  })

  return server
}
