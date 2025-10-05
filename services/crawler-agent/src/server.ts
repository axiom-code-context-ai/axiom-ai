import Fastify from 'fastify'
import { logger } from './utils/logger.js'
import { env } from './config/env.js'
import { RepositoryAnalyzer } from './services/repositoryAnalyzer.js'
import { DatabaseService } from './services/databaseService.js'

export async function createServer() {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
  })

  const analyzer = new RepositoryAnalyzer()
  const database = new DatabaseService()

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return { 
      status: 'healthy', 
      service: 'Axiom AI Crawler Agent',
      timestamp: new Date().toISOString() 
    }
  })

  // REAL repository analysis endpoint
  server.post('/analyze', async (request, reply) => {
    try {
      const { gitUrl } = request.body as any
      
      if (!gitUrl) {
        return reply.status(400).send({ error: 'Git URL is required' })
      }
      
      logger.info({ gitUrl }, 'Starting REAL repository analysis')
      
      // REAL analysis with Git clone and code parsing
      const result = await analyzer.analyzeRepository(gitUrl)
      
      // Store in database
      try {
        await database.storeAnalysisResult(result)
        logger.info({ repository: result.repository }, 'Analysis stored in database')
      } catch (dbError) {
        logger.warn({ dbError }, 'Failed to store in database, continuing...')
      }
      
      logger.info({ 
        repository: result.repository, 
        filesProcessed: result.filesProcessed 
      }, 'Analysis complete')

      return result
    } catch (error) {
      logger.error(error, 'Analysis error')
      return reply.status(500).send({ 
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Axiom AI Crawler Agent',
      version: '1.0.0',
      status: 'running',
      description: 'Simple repository analysis and context generation',
      endpoints: {
        health: '/health',
        analyze: '/analyze'
      },
      timestamp: new Date().toISOString(),
    }
  })

  return server
}