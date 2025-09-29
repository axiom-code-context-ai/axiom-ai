import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() }
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  }
})

// Create child loggers for different modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module })
}

// Performance logging utility
export function logPerformance<T>(
  operation: string,
  fn: () => Promise<T> | T,
  logger: pino.Logger = logger
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const start = Date.now()
    const operationLogger = logger.child({ operation })
    
    try {
      operationLogger.debug('Starting operation')
      const result = await fn()
      const duration = Date.now() - start
      operationLogger.info({ duration }, 'Operation completed successfully')
      resolve(result)
    } catch (error) {
      const duration = Date.now() - start
      operationLogger.error({ error, duration }, 'Operation failed')
      reject(error)
    }
  })
}
