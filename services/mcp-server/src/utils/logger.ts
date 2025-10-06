import pino, { Logger } from 'pino'

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
})

export const logger = baseLogger

export function createModuleLogger(module: string) {
  return logger.child({ module })
}