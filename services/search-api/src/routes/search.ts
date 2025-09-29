import { FastifyPluginAsync } from 'fastify'
import { SearchQuerySchema } from '../services/searchEngine.js'
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('search-routes')

const searchRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Main search endpoint
  fastify.post('/', {
    schema: {
      description: 'Search code patterns using vector similarity, keyword matching, or hybrid approach',
      tags: ['search'],
      body: { $ref: '#/definitions/SearchQuery' },
      response: {
        200: { $ref: '#/definitions/SearchResponse' },
        400: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      // Validate request body
      const query = SearchQuerySchema.parse(request.body)
      
      // Perform search
      const results = await fastify.searchEngine.search(query)
      
      return results
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid search query parameters',
          details: error.errors,
          statusCode: 400,
        })
      }
      
      logger.error({ error, body: request.body }, 'Search failed')
      return reply.status(500).send({
        error: 'Search Failed',
        message: 'An error occurred while searching',
        statusCode: 500,
      })
    }
  })

  // Vector similarity search
  fastify.post('/vector', {
    schema: {
      description: 'Search using vector similarity only',
      tags: ['search'],
      body: { $ref: '#/definitions/SearchQuery' },
      response: {
        200: { $ref: '#/definitions/SearchResponse' },
        400: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const query = SearchQuerySchema.parse({
        ...request.body as any,
        type: 'vector'
      })
      
      const results = await fastify.searchEngine.search(query)
      return results
    } catch (error) {
      logger.error({ error, body: request.body }, 'Vector search failed')
      return reply.status(500).send({
        error: 'Vector Search Failed',
        message: 'An error occurred during vector search',
        statusCode: 500,
      })
    }
  })

  // Keyword search
  fastify.post('/keyword', {
    schema: {
      description: 'Search using keyword matching only',
      tags: ['search'],
      body: { $ref: '#/definitions/SearchQuery' },
      response: {
        200: { $ref: '#/definitions/SearchResponse' },
        400: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const query = SearchQuerySchema.parse({
        ...request.body as any,
        type: 'keyword'
      })
      
      const results = await fastify.searchEngine.search(query)
      return results
    } catch (error) {
      logger.error({ error, body: request.body }, 'Keyword search failed')
      return reply.status(500).send({
        error: 'Keyword Search Failed',
        message: 'An error occurred during keyword search',
        statusCode: 500,
      })
    }
  })

  // Search suggestions endpoint
  fastify.get('/suggestions', {
    schema: {
      description: 'Get search suggestions for autocomplete',
      tags: ['search'],
      querystring: {
        type: 'object',
        required: ['query', 'workspaceId'],
        properties: {
          query: { type: 'string', minLength: 1 },
          workspaceId: { type: 'string', format: 'uuid' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            suggestions: { type: 'array', items: { type: 'string' } },
            query: { type: 'string' },
          },
        },
        400: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { query, workspaceId, limit = 10 } = request.query as any
      
      // This would be implemented in the search engine
      // For now, return empty suggestions
      const suggestions: string[] = []
      
      return {
        suggestions,
        query,
      }
    } catch (error) {
      logger.error({ error, query: request.query }, 'Failed to get suggestions')
      return reply.status(500).send({
        error: 'Suggestions Failed',
        message: 'An error occurred while getting suggestions',
        statusCode: 500,
      })
    }
  })

  // Similar patterns endpoint
  fastify.get('/similar/:patternId', {
    schema: {
      description: 'Find similar code patterns to a given pattern',
      tags: ['search'],
      params: {
        type: 'object',
        required: ['patternId'],
        properties: {
          patternId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.7 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: { type: 'array', items: { $ref: '#/definitions/SearchResult' } },
            totalCount: { type: 'integer' },
            patternId: { type: 'string' },
          },
        },
        404: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { patternId } = request.params as any
      const { workspaceId, limit = 20, threshold = 0.7 } = request.query as any
      
      // This would use the vector search service to find similar patterns
      // For now, return empty results
      const results: any[] = []
      
      return {
        results,
        totalCount: results.length,
        patternId,
      }
    } catch (error) {
      logger.error({ error, params: request.params }, 'Failed to find similar patterns')
      return reply.status(500).send({
        error: 'Similar Search Failed',
        message: 'An error occurred while finding similar patterns',
        statusCode: 500,
      })
    }
  })

  // Search filters endpoint
  fastify.get('/filters/:workspaceId', {
    schema: {
      description: 'Get available search filters for a workspace',
      tags: ['search'],
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            languages: { type: 'array', items: { type: 'string' } },
            patternTypes: { type: 'array', items: { type: 'string' } },
            repositories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
            dateRange: {
              type: 'object',
              properties: {
                earliest: { type: 'string', format: 'date-time' },
                latest: { type: 'string', format: 'date-time' },
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
      
      // This would query the database for available filters
      // For now, return sample data
      const filters = {
        languages: ['typescript', 'javascript', 'python', 'java', 'go'],
        patternTypes: ['function', 'class', 'interface', 'type', 'component'],
        repositories: [],
        dateRange: {
          earliest: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          latest: new Date().toISOString(),
        },
      }
      
      return filters
    } catch (error) {
      logger.error({ error, params: request.params }, 'Failed to get search filters')
      return reply.status(500).send({
        error: 'Filters Failed',
        message: 'An error occurred while getting search filters',
        statusCode: 500,
      })
    }
  })

  // Search feedback endpoint for improving results
  fastify.post('/feedback', {
    schema: {
      description: 'Provide feedback on search results to improve ranking',
      tags: ['search'],
      body: {
        type: 'object',
        required: ['query', 'workspaceId'],
        properties: {
          query: { type: 'string' },
          workspaceId: { type: 'string', format: 'uuid' },
          feedback: {
            type: 'object',
            properties: {
              clicked: { type: 'array', items: { type: 'string' } },
              ignored: { type: 'array', items: { type: 'string' } },
              rated: { type: 'object' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: { $ref: '#/definitions/Error' },
        500: { $ref: '#/definitions/Error' },
      },
    },
  }, async (request, reply) => {
    try {
      const { query, workspaceId, feedback } = request.body as any
      
      // Store feedback for improving search results
      // This could be used to train ranking algorithms
      logger.info({ query, workspaceId, feedback }, 'Search feedback received')
      
      return {
        success: true,
        message: 'Feedback recorded successfully',
      }
    } catch (error) {
      logger.error({ error, body: request.body }, 'Failed to record feedback')
      return reply.status(500).send({
        error: 'Feedback Failed',
        message: 'An error occurred while recording feedback',
        statusCode: 500,
      })
    }
  })
}

export default searchRoutes
