import pino, { Logger } from 'pino'
import fs from 'fs'
import path from 'path'

// When running in stdio mode (for MCP), we need to log to stderr or a file
// because stdout is used for MCP protocol communication
const isStdioMode = process.argv.includes('--stdio')

let baseLogger: Logger

if (isStdioMode) {
  // In stdio mode, write logs to a file
  const logDir = '/tmp'
  const logFile = path.join(logDir, 'axiom-mcp-server.log')
  
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
  }, pino.destination(logFile))
  
  // Also write startup message to stderr
  console.error(`📝 MCP Server logs: ${logFile}`)
} else {
  // Normal mode - log to stdout with pretty printing
  baseLogger = pino({
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
}

export const logger = baseLogger

export function createModuleLogger(module: string) {
  return logger.child({ module })
}