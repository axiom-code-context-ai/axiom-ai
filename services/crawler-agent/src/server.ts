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
      service: 'Axiom AI Crawler Agent',
      timestamp: new Date().toISOString() 
    }
  })

  // Simple repository analysis endpoint
  server.post('/analyze', async (request, reply) => {
    try {
      const { gitUrl } = request.body as any
      logger.info({ gitUrl }, 'Repository analysis request')
      
      // Mock analysis - in real implementation this would:
      // 1. Clone the repository
      // 2. Run TreeSitter AST analysis
      // 3. Generate RepoMix-style context
      // 4. Store in database for MCP server access
      
      const mockAnalysis = {
        repository: gitUrl,
        status: 'analyzed',
        filesProcessed: Math.floor(Math.random() * 100) + 50,
        contextGenerated: true,
        patterns: [
          { type: 'function', count: 25 },
          { type: 'class', count: 8 },
          { type: 'component', count: 12 }
        ],
        timestamp: new Date().toISOString()
      }

      // Simulate analysis delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      return mockAnalysis
    } catch (error) {
      logger.error(error, 'Analysis error')
      return reply.status(500).send({ error: 'Analysis failed' })
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