#!/usr/bin/env node

import 'dotenv/config'
import { createServer } from './server.js'
import { createMcpServer } from './server/mcpServer.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { logger } from './utils/logger.js'
import { validateEnvironment } from './config/env.js'
import { gracefulShutdown } from './utils/shutdown.js'

async function runStdio() {
  try {
    logger.info('Starting MCP server in stdio mode...')
    // Start MCP over stdio for IDEs (Cursor/Cline)
    const mcp = await createMcpServer()
    const transport = new StdioServerTransport()
    await mcp.connect(transport)
    logger.info('MCP server connected successfully via stdio')
  } catch (error) {
    console.error('❌ Failed to start MCP server in stdio mode:')
    console.error(error)
    logger.error('Failed to start MCP server in stdio mode:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    process.exit(1)
  }
}

async function main() {
  try {
    // If launched with --stdio, run MCP stdio transport and exit
    if (process.argv.includes('--stdio')) {
      await runStdio()
      return
    }

    // Validate environment variables
    const env = validateEnvironment()
    logger.info('Environment validated successfully')

    // Create and start the server
    const server = await createServer()
    
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST
    })

    logger.info(`MCP Server running at ${address}`)

    // Setup graceful shutdown
    const shutdown = gracefulShutdown([
      {
        name: 'server',
        shutdown: () => server.close()
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
    logger.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

// Start the application
main()