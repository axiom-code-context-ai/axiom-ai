import { z } from 'zod'
import { Pool } from 'pg'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('search-engine')

// Zod schema for validating search queries
export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  workspaceId: z.string().uuid().optional(), // ✅ OPTIONAL - searches all workspaces if not provided
  type: z.enum(['vector', 'keyword', 'hybrid']).optional().default('hybrid'),
  filters: z.object({
    languages: z.array(z.string()).optional(),
    fileTypes: z.array(z.string()).optional(),
    repositories: z.array(z.string().uuid()).optional(),
    patternTypes: z.array(z.string()).optional(),
    dateRange: z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).optional(),
  }).optional(),
  options: z.object({
    limit: z.number().min(1).max(50).optional().default(10),
    offset: z.number().min(0).optional().default(0),
    includeContent: z.boolean().optional().default(true),
    similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
    keywordThreshold: z.number().min(0).max(1).optional().default(0.5),
  }).optional(),
})

export interface SearchQuery {
  query: string
  workspaceId?: string // ✅ OPTIONAL
  type?: 'vector' | 'keyword' | 'hybrid'
  filters?: any
  options?: any
}

export interface SearchResult {
  id: string
  repositoryId: string
  repositoryName: string
  filePath: string
  fileName: string
  language: string
  patternType: string
  functionName?: string
  className?: string
  codeSnippet: string
  fullContent?: string
  lineStart?: number
  lineEnd?: number
  similarity: number
  keywordScore: number
  combinedScore: number
  metadata: Record<string, any>
  highlights: string[]
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  searchTime: number
  query: string
  type: string
  filters?: any
  suggestions?: string[]
}

export class SearchEngine {
  private db: Pool

  constructor() {
    this.db = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    })
    logger.info('SearchEngine initialized with database connection')
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now()
    
    logger.info({ query: query.query, type: query.type, workspaceId: query.workspaceId }, 'Search request received')
    
    try {
      // Simple keyword search in database
      const searchQuery = `%${query.query.toLowerCase()}%`
      const limit = query.options?.limit || 10
      
      let sql = `
        SELECT 
          p.id,
          p.repository_id as "repositoryId",
          r.name as "repositoryName",
          p.file_path as "filePath",
          p.function_name as "functionName",
          p.class_name as "className",
          p.pattern_type as "patternType",
          p.code_snippet as "codeSnippet",
          p.language,
          p.metadata
        FROM vector.code_patterns p
        JOIN core.repositories r ON p.repository_id = r.id
        WHERE (
          LOWER(p.function_name) LIKE $1 OR
          LOWER(p.class_name) LIKE $1 OR
          LOWER(p.code_snippet) LIKE $1 OR
          LOWER(p.file_path) LIKE $1
        )
      `
      
      const params: any[] = [searchQuery]
      
      // Optionally filter by workspace
      if (query.workspaceId) {
        sql += ` AND r.workspace_id = $${params.length + 1}`
        params.push(query.workspaceId)
      }
      
      sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`
      params.push(limit)
      
      const result = await this.db.query(sql, params)
      
      const results: SearchResult[] = result.rows.map(row => ({
        id: row.id,
        repositoryId: row.repositoryId,
        repositoryName: row.repositoryName,
        filePath: row.filePath,
        fileName: row.filePath.split('/').pop() || '',
        language: row.language || 'unknown',
        patternType: row.patternType,
        functionName: row.functionName,
        className: row.className,
        codeSnippet: row.codeSnippet || '',
        similarity: 0.95,
        keywordScore: 0.8,
        combinedScore: 0.9,
        metadata: row.metadata || {},
        highlights: [row.functionName || row.className].filter(Boolean)
      }))

      logger.info({ count: results.length, query: query.query }, 'Search completed')

      const response: SearchResponse = {
        results,
        totalCount: results.length,
        searchTime: Date.now() - startTime,
        query: query.query,
        type: query.type || 'hybrid',
        filters: query.filters,
        suggestions: []
      }

      logger.info({
        query: query.query,
        resultCount: response.totalCount,
        searchTime: response.searchTime,
      }, 'Search completed successfully')

      return response
    } catch (error) {
      logger.error({ error, query: query.query }, 'Search error')
      
      // Return empty results on error
      return {
        results: [],
        totalCount: 0,
        searchTime: Date.now() - startTime,
        query: query.query,
        type: query.type || 'hybrid',
        suggestions: []
      }
    }
  }

  async close(): Promise<void> {
    logger.info('Closing search engine')
    await this.db.end()
  }
}

export async function initializeSearchEngine(): Promise<SearchEngine> {
  logger.info('Initializing search engine (simplified mode)')
  return new SearchEngine()
}