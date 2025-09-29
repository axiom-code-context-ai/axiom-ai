#!/usr/bin/env node

import 'dotenv/config'
import { createServer } from './server.js'
import { logger } from './utils/logger.js'
import { validateEnvironment } from './config/env.js'
import { initializeSearchEngine } from './services/searchEngine.js'
import { initializeCache } from './services/cacheService.js'
import { gracefulShutdown } from './utils/shutdown.js'

async function main() {
  try {
    // Validate environment variables
    const env = validateEnvironment()
    logger.info('Environment validated successfully')

    // Initialize cache service
    const cache = await initializeCache()
    logger.info('Cache service initialized')

    // Initialize search engine
    const searchEngine = await initializeSearchEngine()
    logger.info('Search engine initialized')

    // Create and start the server
    const server = await createServer({ 
      cache, 
      searchEngine 
    })
    
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST
    })

    logger.info(`Search API server running at ${address}`)

    // Setup graceful shutdown
    const shutdown = gracefulShutdown([
      {
        name: 'server',
        shutdown: () => server.close()
      },
      {
        name: 'cache',
        shutdown: () => cache.disconnect()
      },
      {
        name: 'search-engine',
        shutdown: () => searchEngine.close()
      }
    ])

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error)
      shutdown()
    })
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason)
      shutdown()
    })

  } catch (error) {
    logger.error('Failed to start search API:', error)
    process.exit(1)
  }
}

// Start the application
main()
