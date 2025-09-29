import { FastifyPluginAsync } from 'fastify'
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('health-routes')

const healthRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Basic health check
  fastify.get('/', {
    schema: {
      description: 'Basic health check',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  })

  // Detailed health check
  fastify.get('/detailed', {
    schema: {
      description: 'Detailed health check with service status',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latency: { type: 'number' },
                  },
                },
                cache: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    connected: { type: 'boolean' },
                  },
                },
                searchEngine: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                  },
                },
              },
            },
            memory: {
              type: 'object',
              properties: {
                used: { type: 'number' },
                total: { type: 'number' },
                percentage: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: { status: 'unknown', latency: 0 },
        cache: { status: 'unknown', connected: false },
        searchEngine: { status: 'healthy' },
      },
      memory: {
        used: 0,
        total: 0,
        percentage: 0,
      },
    }

    try {
      // Check database health
      const dbStart = Date.now()
      await fastify.searchEngine['db'].$queryRaw`SELECT 1`
      const dbLatency = Date.now() - dbStart
      healthData.services.database = {
        status: 'healthy',
        latency: dbLatency,
      }
    } catch (error) {
      logger.error('Database health check failed:', error)
      healthData.services.database = {
        status: 'unhealthy',
        latency: -1,
      }
      healthData.status = 'degraded'
    }

    try {
      // Check cache health
      const cacheStats = await fastify.cache.getStats()
      healthData.services.cache = {
        status: 'healthy',
        connected: cacheStats.connected,
      }
    } catch (error) {
      logger.error('Cache health check failed:', error)
      healthData.services.cache = {
        status: 'unhealthy',
        connected: false,
      }
      healthData.status = 'degraded'
    }

    // Memory usage
    const memUsage = process.memoryUsage()
    healthData.memory = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    }

    return healthData
  })

  // Readiness probe
  fastify.get('/ready', {
    schema: {
      description: 'Readiness probe for container orchestration',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      // Check if all critical services are available
      await fastify.searchEngine['db'].$queryRaw`SELECT 1`
      await fastify.cache.redis.ping()

      return {
        ready: true,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.error('Readiness check failed:', error)
      return reply.status(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        reason: 'Critical services unavailable',
      })
    }
  })

  // Liveness probe
  fastify.get('/live', {
    schema: {
      description: 'Liveness probe for container orchestration',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    }
  })

  // Metrics endpoint (Prometheus format)
  fastify.get('/metrics', {
    schema: {
      description: 'Metrics in Prometheus format',
      tags: ['health'],
      response: {
        200: {
          type: 'string',
        },
      },
    },
  }, async (request, reply) => {
    const memUsage = process.memoryUsage()
    const uptime = process.uptime()

    const metrics = [
      '# HELP axiom_search_uptime_seconds Total uptime in seconds',
      '# TYPE axiom_search_uptime_seconds counter',
      `axiom_search_uptime_seconds ${uptime}`,
      '',
      '# HELP axiom_search_memory_usage_bytes Memory usage in bytes',
      '# TYPE axiom_search_memory_usage_bytes gauge',
      `axiom_search_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}`,
      `axiom_search_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}`,
      `axiom_search_memory_usage_bytes{type="rss"} ${memUsage.rss}`,
      '',
      '# HELP axiom_search_nodejs_version Node.js version info',
      '# TYPE axiom_search_nodejs_version gauge',
      `axiom_search_nodejs_version{version="${process.version}"} 1`,
      '',
    ].join('\n')

    reply.type('text/plain')
    return metrics
  })
}

export default healthRoutes
