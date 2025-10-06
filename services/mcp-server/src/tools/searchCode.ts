import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createModuleLogger } from '../utils/logger.js'
import { ServerContext } from '../server/mcpServer.js'

const logger = createModuleLogger('search-code-tool')

// Input schema for search code tool
const SearchCodeInputSchema = z.object({
  query: z.string().min(1).max(1000).describe('Search query for finding code patterns, functions, or implementations'),
  workspaceId: z.string().uuid().optional().describe('Workspace ID to search in (optional if provided in context)'),
  searchType: z.enum(['vector', 'keyword', 'hybrid']).default('hybrid').describe('Type of search to perform'),
  filters: z.object({
    languages: z.array(z.string()).optional().describe('Filter by programming languages (e.g., typescript, python)'),
    fileTypes: z.array(z.string()).optional().describe('Filter by file extensions (e.g., .ts, .py)'),
    repositories: z.array(z.string().uuid()).optional().describe('Filter by specific repository IDs'),
    patternTypes: z.array(z.string()).optional().describe('Filter by code pattern types (function, class, interface)'),
    dateRange: z.object({
      from: z.string().datetime().optional().describe('Search from this date'),
      to: z.string().datetime().optional().describe('Search until this date'),
    }).optional().describe('Filter by date range'),
  }).optional().describe('Additional search filters'),
  options: z.object({
    limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return'),
    includeContent: z.boolean().default(true).describe('Include full code content in results'),
    similarityThreshold: z.number().min(0).max(1).default(0.7).describe('Minimum similarity threshold for vector search'),
  }).optional().describe('Search options and limits'),
})

type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>

/**
 * Register the search code tool with the MCP server
 */
export async function registerSearchCodeTool(server: McpServer, context: ServerContext) {
  // CRITICAL: MCP SDK wraps the schema in z.object() (see sdk/dist/esm/server/mcp.js line 449)
  // So we must pass the SHAPE, not the ZodObject itself!
  const schemaShape = SearchCodeInputSchema.shape
  
  server.registerTool(
    'search_code',
    {
      title: 'Search Code',
      description: 'Search for code patterns, functions, classes, or implementations across the codebase using intelligent vector similarity, keyword matching, or hybrid search approaches.',
      inputSchema: schemaShape as any,
    },
    (async (args: any) => {
      const { query, workspaceId, searchType = 'hybrid', filters, options } = args || {}
      try {
        // Auto-detect workspace if not provided
        let effectiveWorkspaceId = workspaceId || context.workspaceId
        
        if (!effectiveWorkspaceId) {
          logger.info('No workspace ID provided, attempting auto-detection...')
          const detectedWorkspace = await context.workspaceDetector.detectAndGetWorkspace()
          
          if (detectedWorkspace) {
            // Check if detected workspace has any code patterns
            const patternCheck = await context.db.query(
              `SELECT COUNT(*) as count FROM vector.code_patterns cp
               JOIN core.repositories r ON cp.repository_id = r.id
               WHERE r.workspace_id = $1`,
              [detectedWorkspace.id]
            )
            
            const patternCount = parseInt(patternCheck.rows[0]?.count || '0')
            
            if (patternCount > 0) {
              effectiveWorkspaceId = detectedWorkspace.id
              logger.info('Auto-detected workspace from Git repository', {
                id: detectedWorkspace.id,
                name: detectedWorkspace.name,
                gitUrl: detectedWorkspace.gitUrl,
                patterns: patternCount,
              })
            } else {
              // Detected workspace has no patterns - search all workspaces
              logger.info('Detected workspace has no patterns, searching across all workspaces', {
                detectedWorkspace: detectedWorkspace.name,
              })
              effectiveWorkspaceId = null as any // Will search all workspaces
            }
          } else {
            // No Git repo detected - search across ALL workspaces
            logger.info('No Git repository detected, searching across all workspaces')
            effectiveWorkspaceId = null as any // Will search all workspaces
          }
        }
        
        // Validate input (skip workspaceId validation if searching all workspaces)
        const inputToValidate: any = {
          query,
          searchType,
          filters,
          options,
        }
        if (effectiveWorkspaceId) {
          inputToValidate.workspaceId = effectiveWorkspaceId
        }
        
        const validatedInput = SearchCodeInputSchema.parse(inputToValidate)

        logger.info('Performing code search', {
          query: validatedInput.query,
          workspaceId: effectiveWorkspaceId || 'all',
          searchType: validatedInput.searchType,
          filters: validatedInput.filters,
        })

        // Perform the search using the search service
        const searchResults = await context.searchService.search({
          query: validatedInput.query,
          workspaceId: effectiveWorkspaceId || undefined,
          type: validatedInput.searchType,
          filters: validatedInput.filters,
          options: validatedInput.options,
        })

        // Format results for MCP response
        const formattedResults = searchResults.results.map(result => ({
          id: result.id,
          repository: {
            id: result.repositoryId,
            name: result.repositoryName,
          },
          file: {
            path: result.filePath,
            name: result.fileName,
            language: result.language,
          },
          pattern: {
            type: result.patternType,
            functionName: result.functionName,
            className: result.className,
            lineStart: result.lineStart,
            lineEnd: result.lineEnd,
          },
          code: {
            snippet: result.codeSnippet,
            fullContent: validatedInput.options?.includeContent ? result.fullContent : undefined,
          },
          relevance: {
            similarity: result.similarity,
            keywordScore: result.keywordScore,
            combinedScore: result.combinedScore,
          },
          highlights: result.highlights,
          metadata: result.metadata,
        }))

        const responseText = `Found ${searchResults.totalCount} code patterns matching "${validatedInput.query}" using ${validatedInput.searchType} search.

## Search Results (${formattedResults.length} shown):

${formattedResults.map((result, index) => `
### ${index + 1}. ${result.pattern.functionName || result.pattern.className || result.file.name}
**File:** \`${result.file.path}\` (${result.file.language})
**Repository:** ${result.repository.name}
**Pattern Type:** ${result.pattern.type}
**Relevance Score:** ${(result.relevance.combinedScore * 100).toFixed(1)}%

\`\`\`${result.file.language || 'text'}
${result.code.snippet}
\`\`\`

${result.highlights.length > 0 ? `**Highlights:** ${result.highlights.join(', ')}` : ''}
`).join('\n')}

## Search Statistics:
- **Total Results:** ${searchResults.totalCount}
- **Search Time:** ${searchResults.searchTime}ms
- **Search Type:** ${searchResults.type}
${searchResults.suggestions && searchResults.suggestions.length > 0 ? `- **Related Suggestions:** ${searchResults.suggestions.join(', ')}` : ''}

${formattedResults.length < searchResults.totalCount ? `\n*Showing first ${formattedResults.length} results. Use pagination or refine your search for more specific results.*` : ''}
`

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
          meta: {
            searchResults: formattedResults,
            totalCount: searchResults.totalCount,
            searchTime: searchResults.searchTime,
            searchType: searchResults.type,
            suggestions: searchResults.suggestions,
          },
        }

      } catch (error) {
        logger.error('Code search failed:', error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Code Search Failed**

**Error:** ${errorMessage}

**Troubleshooting:**
1. Verify your search query is specific and relevant
2. Check that the workspace ID is valid and accessible
3. Try adjusting search filters or using a different search type
4. Ensure you have proper authentication and permissions

**Search Tips:**
- Use specific function names, class names, or code patterns
- Try different search types: 'vector' for semantic similarity, 'keyword' for exact matches
- Use filters to narrow down results by language or repository
- Adjust the similarity threshold for more or fewer results`,
            },
          ],
        }
      }
    }) as any
  )

  logger.info('Search code tool registered successfully')
}
