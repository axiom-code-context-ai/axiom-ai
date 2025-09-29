import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import { Queue } from 'bull'

// Route imports
import healthRoutes from './routes/health.js'
import repositoryRoutes from './routes/repositories.js'
import jobRoutes from './routes/jobs.js'
import webhookRoutes from './routes/webhooks.js'

export interface ServerOptions {
  queues: {
    syncQueue: Queue
    embeddingQueue: Queue
    securityQueue: Queue
  }
}

export async function createServer(options: ServerOptions) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    bodyLimit: 1048576 * 10, // 10MB
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  })

  // Security plugins
  await server.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API
  })

  await server.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [
      'http://localhost:3000',
      'https://axiom.ai',
    ],
    credentials: true,
  })

  await server.register(rateLimit, {
    max: env.NODE_ENV === 'development' ? 1000 : 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Rate Limit Exceeded',
      message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
      statusCode: 429,
    })
  })

  // Add queues to server context
  server.decorate('queues', options.queues)

  // Request logging
  server.addHook('onRequest', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    }, 'Incoming request')
  })

  // Response logging
  server.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed')
  })

  // Error handling
  server.setErrorHandler(async (error, request, reply) => {
    request.log.error(error, 'Request error')
    
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation,
      })
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.name || 'Client Error',
        message: error.message,
      })
    }

    // Internal server errors
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    })
  })

  // Not found handler
  server.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    })
  })

  // Register routes
  await server.register(healthRoutes, { prefix: '/health' })
  await server.register(repositoryRoutes, { prefix: '/api/repositories' })
  await server.register(jobRoutes, { prefix: '/api/jobs' })
  await server.register(webhookRoutes, { prefix: '/api/webhooks' })

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
    queues: {
      syncQueue: Queue
      embeddingQueue: Queue
      securityQueue: Queue
    }
  }
}
