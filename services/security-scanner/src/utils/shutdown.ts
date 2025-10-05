import { logger } from './logger.js'

export interface ShutdownHandler {
  name: string
  shutdown: () => Promise<void> | void
}

export function gracefulShutdown(handlers: ShutdownHandler[]) {
  return async (signal?: string) => {
    logger.info({ signal }, 'Received shutdown signal')
    
    const shutdownPromises = handlers.map(async (handler) => {
      try {
        logger.info({ handler: handler.name }, 'Shutting down service')
        await handler.shutdown()
        logger.info({ handler: handler.name }, 'Service shutdown complete')
      } catch (error) {
        logger.error({ handler: handler.name, error }, 'Error during service shutdown')
      }
    })

    await Promise.all(shutdownPromises)
    logger.info('All services shutdown complete')
    process.exit(0)
  }
}
