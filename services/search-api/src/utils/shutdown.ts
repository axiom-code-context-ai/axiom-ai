import { logger } from './logger.js'

interface ShutdownHandler {
  name: string
  shutdown: () => Promise<void>
}

export function gracefulShutdown(handlers: ShutdownHandler[]) {
  let isShuttingDown = false
  
  return async (signal?: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal')
      return
    }
    
    isShuttingDown = true
    logger.info(`Received ${signal || 'shutdown'} signal, starting graceful shutdown`)
    
    const shutdownPromises = handlers.map(async (handler) => {
      try {
        logger.debug(`Shutting down ${handler.name}`)
        await handler.shutdown()
        logger.debug(`Successfully shut down ${handler.name}`)
      } catch (error) {
        logger.error(`Error shutting down ${handler.name}:`, error)
      }
    })
    
    try {
      await Promise.all(shutdownPromises)
      logger.info('Graceful shutdown completed')
      process.exit(0)
    } catch (error) {
      logger.error('Error during graceful shutdown:', error)
      process.exit(1)
    }
  }
}
