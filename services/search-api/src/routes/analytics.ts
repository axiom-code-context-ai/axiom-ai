import { FastifyPluginAsync } from 'fastify'
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('analytics-routes')

const analyticsRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Search analytics for workspace
  fastify.get('/:workspaceId', {
    schema: {
      description: 'Get search analytics for a workspace',
      tags: ['analytics'],
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' },
          groupBy: { type: 'string', enum: ['hour', 'day', 'week'], default: 'hour' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string' },
            timeRange: { type: 'string' },
            totalSearches: { type: 'integer' },
            uniqueQueries: { type: 'integer' },
            averageResponseTime: { type: 'number' },
            searchTypes: {
              type: 'object',
              properties: {
                vector: { type: 'integer' },
                keyword: { type: 'integer' },
                hybrid: { type: 'integer' },
              },
            },
            popularQueries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  count: { type: 'integer' },
                  averageScore: { type: 'number' },
                },
              },
            },
            searchTrends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' },
                  count: { type: 'integer' },
                  averageResponseTime: { type: 'number' },
                },
              },
            },
            languageDistribution: {
              type: 'object',
              additionalProperties: { type: 'integer' },
            },
            patternTypeDistribution: {
              type: 'object',
              additionalProperties: { type: 'integer' },
            },
          },
        },
        404: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { workspaceId } = request.params as any
      const { timeRange = '24h', groupBy = 'hour' } = request.query as any

      // This would query actual analytics data from the database
      // For now, return mock data
      const analytics = {
        workspaceId,
        timeRange,
        totalSearches: 1250,
        uniqueQueries: 450,
        averageResponseTime: 125.5,
        searchTypes: {
          vector: 400,
          keyword: 350,
          hybrid: 500,
        },
        popularQueries: [
          { query: 'authentication function', count: 45, averageScore: 0.87 },
          { query: 'database connection', count: 38, averageScore: 0.82 },
          { query: 'error handling', count: 32, averageScore: 0.79 },
          { query: 'api endpoint', count: 28, averageScore: 0.85 },
          { query: 'user validation', count: 24, averageScore: 0.76 },
        ],
        searchTrends: generateMockTrends(timeRange, groupBy),
        languageDistribution: {
          typescript: 450,
          javascript: 320,
          python: 280,
          java: 120,
          go: 80,
        },
        patternTypeDistribution: {
          function: 600,
          class: 300,
          interface: 200,
          component: 150,
        },
      }

      return analytics
    } catch (error) {
      logger.error({ error, params: request.params }, 'Failed to get analytics')
      return reply.status(500).send({
        error: 'Analytics Failed',
        message: 'An error occurred while retrieving analytics',
        statusCode: 500,
      })
    }
  })

  // Performance metrics
  fastify.get('/:workspaceId/performance', {
    schema: {
      description: 'Get search performance metrics',
      tags: ['analytics'],
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string' },
            timeRange: { type: 'string' },
            responseTimePercentiles: {
              type: 'object',
              properties: {
                p50: { type: 'number' },
                p90: { type: 'number' },
                p95: { type: 'number' },
                p99: { type: 'number' },
              },
            },
            cacheHitRate: { type: 'number' },
            errorRate: { type: 'number' },
            throughput: { type: 'number' },
            slowQueries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  responseTime: { type: 'number' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { workspaceId } = request.params as any
      const { timeRange = '24h' } = request.query as any

      // Mock performance data
      const performance = {
        workspaceId,
        timeRange,
        responseTimePercentiles: {
          p50: 85.2,
          p90: 180.5,
          p95: 245.8,
          p99: 420.1,
        },
        cacheHitRate: 0.78,
        errorRate: 0.02,
        throughput: 12.5, // requests per second
        slowQueries: [
          {
            query: 'complex nested function with multiple parameters',
            responseTime: 1250.5,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            query: 'large class inheritance hierarchy',
            responseTime: 980.2,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
          },
        ],
      }

      return performance
    } catch (error) {
      logger.error({ error, params: request.params }, 'Failed to get performance metrics')
      return reply.status(500).send({
        error: 'Performance Metrics Failed',
        message: 'An error occurred while retrieving performance metrics',
        statusCode: 500,
      })
    }
  })

  // User behavior analytics
  fastify.get('/:workspaceId/behavior', {
    schema: {
      description: 'Get user search behavior analytics',
      tags: ['analytics'],
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string' },
            timeRange: { type: 'string' },
            searchPatterns: {
              type: 'object',
              properties: {
                averageQueryLength: { type: 'number' },
                mostCommonTerms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      term: { type: 'string' },
                      frequency: { type: 'integer' },
                    },
                  },
                },
                queryComplexity: {
                  type: 'object',
                  properties: {
                    simple: { type: 'integer' },
                    medium: { type: 'integer' },
                    complex: { type: 'integer' },
                  },
                },
              },
            },
            clickThroughRates: {
              type: 'object',
              properties: {
                overall: { type: 'number' },
                byPosition: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      position: { type: 'integer' },
                      rate: { type: 'number' },
                    },
                  },
                },
              },
            },
            abandonmentRate: { type: 'number' },
            refinementRate: { type: 'number' },
          },
        },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { workspaceId } = request.params as any
      const { timeRange = '24h' } = request.query as any

      // Mock behavior data
      const behavior = {
        workspaceId,
        timeRange,
        searchPatterns: {
          averageQueryLength: 3.2,
          mostCommonTerms: [
            { term: 'function', frequency: 120 },
            { term: 'class', frequency: 95 },
            { term: 'interface', frequency: 78 },
            { term: 'component', frequency: 65 },
            { term: 'service', frequency: 52 },
          ],
          queryComplexity: {
            simple: 780,
            medium: 350,
            complex: 120,
          },
        },
        clickThroughRates: {
          overall: 0.68,
          byPosition: [
            { position: 1, rate: 0.85 },
            { position: 2, rate: 0.72 },
            { position: 3, rate: 0.58 },
            { position: 4, rate: 0.42 },
            { position: 5, rate: 0.28 },
          ],
        },
        abandonmentRate: 0.15,
        refinementRate: 0.32,
      }

      return behavior
    } catch (error) {
      logger.error({ error, params: request.params }, 'Failed to get behavior analytics')
      return reply.status(500).send({
        error: 'Behavior Analytics Failed',
        message: 'An error occurred while retrieving behavior analytics',
        statusCode: 500,
      })
    }
  })
}

// Helper function to generate mock trend data
function generateMockTrends(timeRange: string, groupBy: string) {
  const now = new Date()
  const trends = []
  
  let intervals: number
  let intervalMs: number
  
  switch (timeRange) {
    case '1h':
      intervals = groupBy === 'hour' ? 1 : 60
      intervalMs = groupBy === 'hour' ? 3600000 : 60000
      break
    case '24h':
      intervals = groupBy === 'hour' ? 24 : groupBy === 'day' ? 1 : 24 * 60
      intervalMs = groupBy === 'hour' ? 3600000 : groupBy === 'day' ? 86400000 : 60000
      break
    case '7d':
      intervals = groupBy === 'day' ? 7 : groupBy === 'week' ? 1 : 7 * 24
      intervalMs = groupBy === 'day' ? 86400000 : groupBy === 'week' ? 604800000 : 3600000
      break
    case '30d':
      intervals = groupBy === 'day' ? 30 : groupBy === 'week' ? 4 : 30
      intervalMs = groupBy === 'day' ? 86400000 : groupBy === 'week' ? 604800000 : 86400000
      break
    default:
      intervals = 24
      intervalMs = 3600000
  }
  
  for (let i = intervals - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMs)
    trends.push({
      timestamp: timestamp.toISOString(),
      count: Math.floor(Math.random() * 50) + 10,
      averageResponseTime: Math.floor(Math.random() * 200) + 50,
    })
  }
  
  return trends
}

export default analyticsRoutes
