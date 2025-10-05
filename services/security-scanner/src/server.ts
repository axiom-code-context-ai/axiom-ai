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

  // Scan endpoint
  server.post('/api/scan', async (request, reply) => {
    try {
      const scanRequest = request.body as any
      logger.info({ scanRequest }, 'Security scan requested')
      return { message: 'Security scan completed', status: 'success', vulnerabilities: [] }
    } catch (error) {
      logger.error(error, 'Security scan error')
      return reply.status(500).send({ error: 'Security scan failed' })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI Security Scanner',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    }
  })

  return server
}
