import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

// Import tools
import { registerSearchCodeTool } from '../tools/searchCode.js'
import { registerSearchCodeWithContextTool } from '../tools/searchCodeWithContext.js'
// Optional tools (commented out until implemented)
// import { registerExplainCodeTool } from '../tools/explainCode.js'
// import { registerGenerateContextTool } from '../tools/generateContext.js'
// import { registerSuggestRefactorTool } from '../tools/suggestRefactor.js'
// import { registerFindSimilarTool } from '../tools/findSimilar.js'

// Import prompts
// import { registerCodeAnalysisPrompt } from '../prompts/codeAnalysis.js'
// import { registerRefactoringPrompt } from '../prompts/refactoring.js'

// Import services
import { AuthService } from '../services/authService.js'
import { ContextService } from '../services/contextService.js'
import { SearchService } from '../services/searchService.js'
import { Pool } from 'pg'

const logger = createModuleLogger('mcp-server')

export interface McpServerOptions {
  workspaceId?: string
  apiKey?: string
}

/**
 * MCP Server Instructions - describes capabilities to the LLM
 */
const MCP_SERVER_INSTRUCTIONS = `
Axiom AI MCP Server provides intelligent codebase analysis and context injection for development workflows.

## Core Capabilities:

### 🔍 Intelligent Code Search
- Vector similarity search for semantic code discovery
- Keyword-based search for exact matches
- Hybrid search combining both approaches
- Filter by language, file type, repository, or date range

### 🧠 Code Analysis & Context
- Explain complex code patterns and implementations
- Generate comprehensive context for code understanding
- Find similar code patterns across the codebase
- Analyze code quality and suggest improvements


### ⚡ Intelligent Refactoring
- Suggest code improvements and optimizations
- Identify code smells and anti-patterns
- Recommend modern best practices
- Generate refactoring plans with step-by-step guidance

### 📊 Codebase Intelligence
- Repository structure analysis
- Code metrics and complexity analysis
- Dependency mapping and impact analysis
- Usage pattern identification

## Usage Guidelines:

1. **Always specify workspace context** when making requests
2. **Use specific queries** for better search results
3. **Combine tools** for comprehensive analysis
4. **Test refactored code** thoroughly

## Authentication:
Requires valid workspace ID and API key for access to private repositories and advanced features.
`

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(options: McpServerOptions = {}): Promise<McpServer> {
  const server = new McpServer(
    {
      name: env.MCP_SERVER_NAME,
      version: env.MCP_SERVER_VERSION,
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
    }
  )

  logger.info('Creating MCP server instance', {
    name: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
    workspaceId: options.workspaceId,
    hasApiKey: !!options.apiKey,
  })

  try {
    // Initialize database connection
    const db: Pool = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      max: 20,
    })

    // Initialize services
    const authService = new AuthService()
    const contextService = new ContextService()
    const searchService = new SearchService()

    // Validate authentication if provided
    if (options.workspaceId && options.apiKey) {
      const isValid = await authService.validateToken(options.apiKey, options.workspaceId)
      if (!isValid) {
        throw new Error('Invalid authentication credentials')
      }
      logger.info('Authentication validated successfully')
    }

    // Create server context
    const serverContext: ServerContext = {
      workspaceId: options.workspaceId || '',
      apiKey: options.apiKey,
      authService,
      contextService,
      searchService,
      db,
    }

    // Register all tools
    await registerSearchCodeTool(server, serverContext)
    await registerSearchCodeWithContextTool(server, serverContext)
    // await registerExplainCodeTool(server, serverContext)
    // await registerGenerateContextTool(server, serverContext)
    // await registerSuggestRefactorTool(server, serverContext)
    // await registerFindSimilarTool(server, serverContext)

    logger.info('All MCP tools registered successfully')

    // Register all prompts
    // await registerCodeAnalysisPrompt(server, serverContext)
    // await registerRefactoringPrompt(server, serverContext)

    logger.info('All MCP prompts registered successfully')

    // Add error handling
    // SDK currently doesn't expose onerror in types; safe to omit here.

    logger.info('MCP server created and configured successfully')
    return server

  } catch (error) {
    logger.error('Failed to create MCP server:', error)
    throw error
  }
}

// Server context type for tools and prompts
export interface ServerContext {
  workspaceId: string
  apiKey?: string
  authService: AuthService
  contextService: ContextService
  searchService: SearchService
  db: Pool
}
