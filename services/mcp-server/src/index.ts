#!/usr/bin/env node

import 'dotenv/config'
import { Command } from 'commander'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createServer } from 'http'
import { logger, createModuleLogger } from './utils/logger.js'
import { validateEnvironment } from './config/env.js'
import { createMcpServer } from './server/mcpServer.js'
import { gracefulShutdown } from './utils/shutdown.js'

const appLogger = createModuleLogger('app')

// CLI configuration
const program = new Command()
  .name('axiom-mcp')
  .description('Axiom AI MCP Server - Intelligent code context for IDEs')
  .version('1.0.0')
  .option('--transport <type>', 'Transport type: stdio, http, or websocket', 'stdio')
  .option('--port <number>', 'Port for HTTP/WebSocket transport', '5000')
  .option('--host <host>', 'Host for HTTP/WebSocket transport', '0.0.0.0')
  .option('--workspace-id <id>', 'Workspace ID for authentication')
  .option('--api-key <key>', 'API key for authentication')
  .allowUnknownOption()
  .parse(process.argv)

const options = program.opts()

async function main() {
  try {
    // Validate environment
    const env = validateEnvironment()
    appLogger.info('Environment validated successfully')

    // Create MCP server instance
    const mcpServer = await createMcpServer({
      workspaceId: options.workspaceId,
      apiKey: options.apiKey,
    })

    appLogger.info('MCP server created successfully')

    // Setup transport based on CLI option
    const transport = options.transport.toLowerCase()
    
    switch (transport) {
      case 'stdio':
        await runStdioServer(mcpServer)
        break
      case 'http':
        await runHttpServer(mcpServer, {
          port: parseInt(options.port, 10) || 5000,
          host: options.host || '0.0.0.0'
        })
        break
      case 'websocket':
        await runWebSocketServer(mcpServer, {
          port: parseInt(options.port, 10) || 5000,
          host: options.host || '0.0.0.0'
        })
        break
      default:
        throw new Error(`Unsupported transport type: ${transport}`)
    }

  } catch (error) {
    appLogger.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

/**
 * Run MCP server with stdio transport (for CLI tools)
 */
async function runStdioServer(mcpServer: McpServer) {
  const transport = new StdioServerTransport()
  
  const shutdown = gracefulShutdown([
    {
      name: 'mcp-server',
      shutdown: () => mcpServer.close()
    }
  ])

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await mcpServer.connect(transport)
    appLogger.info('Axiom MCP Server running on stdio transport')
  } catch (error) {
    appLogger.error('Failed to start stdio server:', error)
    process.exit(1)
  }
}

/**
 * Run MCP server with HTTP transport (for web clients)
 */
async function runHttpServer(mcpServer: McpServer, config: { port: number; host: string }) {
  const httpServer = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id, X-API-Key')
    res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id')

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    try {
      // Extract authentication from headers
      const workspaceId = req.headers['x-workspace-id'] as string
      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') as string

      if (pathname === '/mcp') {
        // Create new server instance for each request with auth context
        const requestServer = await createMcpServer({ workspaceId, apiKey })
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })

        res.on('close', () => {
          transport.close()
          requestServer.close()
        })

        await requestServer.connect(transport)
        await transport.handleRequest(req, res)
      } else if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'healthy',
          service: 'Axiom AI MCP Server',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not Found' }))
      }
    } catch (error) {
      appLogger.error('HTTP request error:', error)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal Server Error' }))
      }
    }
  })

  const shutdown = gracefulShutdown([
    {
      name: 'http-server',
      shutdown: () => new Promise<void>((resolve) => {
        httpServer.close(() => resolve())
      })
    },
    {
      name: 'mcp-server',
      shutdown: () => mcpServer.close()
    }
  ])

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  httpServer.listen(config.port, config.host, () => {
    appLogger.info(`Axiom MCP Server running on HTTP at http://${config.host}:${config.port}/mcp`)
  })
}

/**
 * Run MCP server with WebSocket transport (for real-time clients)
 */
async function runWebSocketServer(mcpServer: McpServer, config: { port: number; host: string }) {
  // WebSocket implementation would go here
  // For now, fall back to HTTP
  appLogger.warn('WebSocket transport not yet implemented, falling back to HTTP')
  await runHttpServer(mcpServer, config)
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  appLogger.error('Unhandled rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Start the application
main()
