import Fastify from 'fastify'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import { QueueManager } from './queues/index.js'

export interface ServerOptions {
  queues: QueueManager
}

export async function createServer(options: ServerOptions) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
  })

  // Add queues to server context
  server.decorate('queues', options.queues)

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return { status: 'healthy', timestamp: new Date().toISOString() }
  })

  // Crawl endpoint
  server.post('/api/crawl', async (request, reply) => {
    try {
      const crawlRequest = request.body as any
      await options.queues.crawlQueue.add('crawl-repo', crawlRequest)
      return { message: 'Crawl job queued', status: 'success' }
    } catch (error) {
      logger.error(error, 'Crawl error')
      return reply.status(500).send({ error: 'Crawl failed' })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI Crawler Agent',
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
    queues: QueueManager
  }
}