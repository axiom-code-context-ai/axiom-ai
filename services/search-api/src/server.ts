import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import { SearchEngine } from './services/searchEngine.js'
import { CacheService } from './services/cacheService.js'

// Route imports
import searchRoutes from './routes/search.js'
import analyticsRoutes from './routes/analytics.js'
import healthRoutes from './routes/health.js'

export interface ServerOptions {
  searchEngine: SearchEngine
  cache: CacheService
}

export async function createServer(options: ServerOptions) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    bodyLimit: 1048576 * 5, // 5MB
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
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Rate Limit Exceeded',
      message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
      statusCode: 429,
    })
  })

  // Swagger documentation
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'Axiom AI Search API',
        description: 'High-performance search API with vector and keyword search capabilities',
        version: '1.0.0',
      },
      host: `localhost:${env.PORT}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'search', description: 'Search operations' },
        { name: 'analytics', description: 'Search analytics' },
        { name: 'health', description: 'Health checks' },
      ],
      definitions: {
        SearchQuery: {
          type: 'object',
          required: ['query', 'workspaceId'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 1000 },
            workspaceId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['vector', 'keyword', 'hybrid'], default: 'hybrid' },
            filters: {
              type: 'object',
              properties: {
                languages: { type: 'array', items: { type: 'string' } },
                fileTypes: { type: 'array', items: { type: 'string' } },
                repositories: { type: 'array', items: { type: 'string' } },
                patternTypes: { type: 'array', items: { type: 'string' } },
                dateRange: {
                  type: 'object',
                  properties: {
                    from: { type: 'string', format: 'date-time' },
                    to: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
            options: {
              type: 'object',
              properties: {
                limit: { type: 'integer', minimum: 1, maximum: env.MAX_SEARCH_RESULTS, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 },
                includeContent: { type: 'boolean', default: false },
                similarityThreshold: { type: 'number', minimum: 0, maximum: 1, default: env.VECTOR_SIMILARITY_THRESHOLD },
                keywordThreshold: { type: 'number', minimum: 0, maximum: 1, default: env.KEYWORD_MATCH_THRESHOLD },
              },
            },
          },
        },
        SearchResult: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            repositoryId: { type: 'string' },
            repositoryName: { type: 'string' },
            filePath: { type: 'string' },
            fileName: { type: 'string' },
            language: { type: 'string' },
            patternType: { type: 'string' },
            functionName: { type: 'string' },
            className: { type: 'string' },
            codeSnippet: { type: 'string' },
            fullContent: { type: 'string' },
            lineStart: { type: 'integer' },
            lineEnd: { type: 'integer' },
            similarity: { type: 'number' },
            keywordScore: { type: 'number' },
            combinedScore: { type: 'number' },
            metadata: { type: 'object' },
            highlights: { type: 'array', items: { type: 'string' } },
          },
        },
        SearchResponse: {
          type: 'object',
          properties: {
            results: { type: 'array', items: { $ref: '#/definitions/SearchResult' } },
            totalCount: { type: 'integer' },
            searchTime: { type: 'number' },
            query: { type: 'string' },
            type: { type: 'string' },
            filters: { type: 'object' },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
      },
    },
  })

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  })

  // Add services to server context
  server.decorate('searchEngine', options.searchEngine)
  server.decorate('cache', options.cache)

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
        statusCode: 400,
      })
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.name || 'Client Error',
        message: error.message,
        statusCode: error.statusCode,
      })
    }

    // Internal server errors
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      statusCode: 500,
    })
  })

  // Not found handler
  server.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    })
  })

  // Register routes
  await server.register(healthRoutes, { prefix: '/health' })
  await server.register(searchRoutes, { prefix: '/api/search' })
  await server.register(analyticsRoutes, { prefix: '/api/analytics' })

  // Root endpoint
  server.get('/', {
    schema: {
      description: 'API information',
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string' },
            timestamp: { type: 'string' },
            documentation: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      service: 'Axiom AI Search API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      documentation: '/docs',
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
