#!/usr/bin/env node

import 'dotenv/config'
import { createServer } from './server.js'
import { logger } from './utils/logger.js'
import { validateEnvironment } from './config/env.js'
import { initializeQueues } from './queues/index.js'
import { gracefulShutdown } from './utils/shutdown.js'

async function main() {
  try {
    // Validate environment variables
    const env = validateEnvironment()
    logger.info('Environment validated successfully')

    // Initialize job queues
    const queues = await initializeQueues()
    logger.info('Job queues initialized')

    // Create and start the server
    const server = await createServer({ queues })
    
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST
    })

    logger.info(`Crawler Agent server running at ${address}`)

    // Setup graceful shutdown
    const shutdown = gracefulShutdown([
      {
        name: 'server',
        shutdown: () => server.close()
      },
      {
        name: 'queues',
        shutdown: () => Promise.all(Object.values(queues).map(queue => queue.close()))
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
    logger.error('Failed to start crawler agent:', error)
    process.exit(1)
  }
}

// Start the application
main()
