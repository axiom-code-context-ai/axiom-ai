import { PrismaClient } from '@prisma/client'
import Fuse from 'fuse.js'
import natural from 'natural'
import { removeStopwords } from 'stopword'
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('keyword-search')

export interface KeywordSearchOptions {
  threshold?: number
  limit?: number
  filters?: {
    languages?: string[]
    fileTypes?: string[]
    repositories?: string[]
    patternTypes?: string[]
    dateRange?: {
      from?: string
      to?: string
    }
  }
}

export interface KeywordSearchResult {
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
  score: number
  highlights: string[]
  metadata: Record<string, any>
}

export class KeywordSearchService {
  private db: PrismaClient
  private stemmer = natural.PorterStemmer

  constructor(db: PrismaClient) {
    this.db = db
  }

  /**
   * Perform keyword-based search with full-text search and fuzzy matching
   * @param query - Search query string
   * @param workspaceId - Optional workspace ID to filter results (searches ALL if not provided)
   * @param options - Search options
   */
  async search(
    query: string,
    workspaceId: string | undefined,
    options: KeywordSearchOptions = {}
  ): Promise<KeywordSearchResult[]> {
    const {
      threshold = 0.3,
      limit = 50,
      filters = {}
    } = options

    try {
      // Clean and process query
      const processedQuery = this.preprocessQuery(query)
      const searchTerms = this.extractSearchTerms(processedQuery)

      // Perform database search
      const dbResults = await this.performDatabaseSearch(
        processedQuery,
        searchTerms,
        workspaceId,
        filters,
        limit * 2 // Get more results for better ranking
      )

      // Perform fuzzy search on results
      const fuzzyResults = this.performFuzzySearch(dbResults, query, threshold)

      // Generate highlights
      const resultsWithHighlights = fuzzyResults.map(result => ({
        ...result,
        highlights: this.generateHighlights(result.codeSnippet, searchTerms),
      }))

      // Sort by score and apply limit
      return resultsWithHighlights
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

    } catch (error) {
      logger.error({ query, workspaceId, error }, 'Keyword search failed')
      throw error
    }
  }

  /**
   * Preprocess query for better search results
   */
  private preprocessQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }

  /**
   * Extract and process search terms
   */
  private extractSearchTerms(query: string): string[] {
    const words = query.split(' ').filter(word => word.length > 1)
    
    // Remove stop words
    const withoutStopwords = removeStopwords(words)
    
    // Add stemmed versions
    const stemmed = withoutStopwords.map(word => this.stemmer.stem(word))
    
    // Combine original and stemmed terms
    return [...new Set([...withoutStopwords, ...stemmed])]
  }

  /**
   * Perform database full-text search
   */
  private async performDatabaseSearch(
    query: string,
    searchTerms: string[],
    workspaceId: string | undefined,
    filters: any,
    limit: number
  ): Promise<any[]> {
    // Build WHERE clause
    let whereClause = '1=1'  // ✅ Start with always-true condition
    const params: any[] = []
    let paramIndex = 1
    
    // ✅ ONLY filter by workspace if provided
    if (workspaceId) {
      whereClause += ` AND r.workspace_id = $${paramIndex}`
      params.push(workspaceId)
      paramIndex++
    }

    // Add filters
    if (filters.languages && filters.languages.length > 0) {
      whereClause += ` AND cp.language = ANY($${paramIndex})`
      params.push(filters.languages)
      paramIndex++
    }

    if (filters.repositories && filters.repositories.length > 0) {
      whereClause += ` AND cp.repository_id = ANY($${paramIndex})`
      params.push(filters.repositories)
      paramIndex++
    }

    if (filters.patternTypes && filters.patternTypes.length > 0) {
      whereClause += ` AND cp.pattern_type = ANY($${paramIndex})`
      params.push(filters.patternTypes)
      paramIndex++
    }

    if (filters.dateRange?.from) {
      whereClause += ` AND cp.created_at >= $${paramIndex}`
      params.push(filters.dateRange.from)
      paramIndex++
    }

    if (filters.dateRange?.to) {
      whereClause += ` AND cp.created_at <= $${paramIndex}`
      params.push(filters.dateRange.to)
      paramIndex++
    }

    // Build the search query using PostgreSQL full-text search
    const searchQuery = `
      SELECT 
        cp.id,
        cp.repository_id,
        r.name as repository_name,
        cp.file_path,
        SPLIT_PART(cp.file_path, '/', -1) as file_name,
        cp.language,
        cp.pattern_type,
        cp.function_name,
        cp.class_name,
        cp.code_snippet,
        cp.full_content,
        cp.line_start,
        cp.line_end,
        cp.metadata,
        ts_rank(
          to_tsvector('english', 
            COALESCE(cp.code_snippet, '') || ' ' || 
            COALESCE(cp.function_name, '') || ' ' || 
            COALESCE(cp.class_name, '') || ' ' || 
            COALESCE(cp.file_path, '')
          ),
          plainto_tsquery('english', $${paramIndex})
        ) as rank
      FROM vector.code_patterns cp
      JOIN core.repositories r ON cp.repository_id = r.id
      WHERE ${whereClause}
        AND (
          to_tsvector('english', 
            COALESCE(cp.code_snippet, '') || ' ' || 
            COALESCE(cp.function_name, '') || ' ' || 
            COALESCE(cp.class_name, '') || ' ' || 
            COALESCE(cp.file_path, '')
          ) @@ plainto_tsquery('english', $${paramIndex})
          OR cp.code_snippet ILIKE $${paramIndex + 1}
          OR cp.function_name ILIKE $${paramIndex + 1}
          OR cp.class_name ILIKE $${paramIndex + 1}
          OR cp.file_path ILIKE $${paramIndex + 1}
        )
      ORDER BY rank DESC
      LIMIT $${paramIndex + 2}
    `

    params.push(query, `%${query}%`, limit)

    return await this.db.$queryRawUnsafe(searchQuery, ...params) as any[]
  }

  /**
   * Perform fuzzy search on database results
   */
  private performFuzzySearch(
    dbResults: any[],
    originalQuery: string,
    threshold: number
  ): KeywordSearchResult[] {
    // Configure Fuse.js for fuzzy searching
    const fuseOptions = {
      keys: [
        { name: 'code_snippet', weight: 0.4 },
        { name: 'function_name', weight: 0.25 },
        { name: 'class_name', weight: 0.25 },
        { name: 'file_path', weight: 0.1 }
      ],
      threshold,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
    }

    const fuse = new Fuse(dbResults, fuseOptions)
    const fuzzyResults = fuse.search(originalQuery)

    return fuzzyResults.map(result => ({
      id: result.item.id,
      repositoryId: result.item.repository_id,
      repositoryName: result.item.repository_name,
      filePath: result.item.file_path,
      fileName: result.item.file_name,
      language: result.item.language || 'unknown',
      patternType: result.item.pattern_type || 'unknown',
      functionName: result.item.function_name,
      className: result.item.class_name,
      codeSnippet: result.item.code_snippet,
      fullContent: result.item.full_content,
      lineStart: result.item.line_start,
      lineEnd: result.item.line_end,
      score: 1 - (result.score || 0), // Convert Fuse.js score to similarity score
      highlights: [],
      metadata: result.item.metadata || {},
    }))
  }

  /**
   * Generate highlights for search terms in text
   */
  private generateHighlights(text: string, searchTerms: string[]): string[] {
    const highlights: string[] = []
    const lowerText = text.toLowerCase()

    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase()
      let index = lowerText.indexOf(lowerTerm)
      
      while (index !== -1) {
        // Extract context around the match
        const start = Math.max(0, index - 30)
        const end = Math.min(text.length, index + term.length + 30)
        const context = text.substring(start, end)
        
        // Highlight the matching term
        const highlightedContext = context.replace(
          new RegExp(term, 'gi'),
          `<mark>$&</mark>`
        )
        
        highlights.push(
          (start > 0 ? '...' : '') + 
          highlightedContext + 
          (end < text.length ? '...' : '')
        )
        
        // Find next occurrence
        index = lowerText.indexOf(lowerTerm, index + 1)
        
        // Limit highlights per term
        if (highlights.length >= 3) break
      }
    }

    return highlights.slice(0, 5) // Limit total highlights
  }

  /**
   * Search for exact code patterns
   */
  async searchExact(
    query: string,
    workspaceId: string,
    options: KeywordSearchOptions = {}
  ): Promise<KeywordSearchResult[]> {
    const { limit = 20, filters = {} } = options

    try {
      let whereClause = 'r.workspace_id = $1'
      const params: any[] = [workspaceId]
      let paramIndex = 2

      // Add filters
      if (filters.languages && filters.languages.length > 0) {
        whereClause += ` AND cp.language = ANY($${paramIndex})`
        params.push(filters.languages)
        paramIndex++
      }

      if (filters.repositories && filters.repositories.length > 0) {
        whereClause += ` AND cp.repository_id = ANY($${paramIndex})`
        params.push(filters.repositories)
        paramIndex++
      }

      // Exact match query
      const exactQuery = `
        SELECT 
          cp.id,
          cp.repository_id,
          r.name as repository_name,
          cp.file_path,
          SPLIT_PART(cp.file_path, '/', -1) as file_name,
          cp.language,
          cp.pattern_type,
          cp.function_name,
          cp.class_name,
          cp.code_snippet,
          cp.full_content,
          cp.line_start,
          cp.line_end,
          cp.metadata,
          1.0 as score
        FROM vector.code_patterns cp
        JOIN core.repositories r ON cp.repository_id = r.id
        WHERE ${whereClause}
          AND (
            cp.code_snippet LIKE $${paramIndex}
            OR cp.function_name = $${paramIndex + 1}
            OR cp.class_name = $${paramIndex + 1}
          )
        ORDER BY cp.created_at DESC
        LIMIT $${paramIndex + 2}
      `

      params.push(`%${query}%`, query, limit)

      const results = await this.db.$queryRawUnsafe(exactQuery, ...params) as any[]

      return results.map(result => ({
        id: result.id,
        repositoryId: result.repository_id,
        repositoryName: result.repository_name,
        filePath: result.file_path,
        fileName: result.file_name,
        language: result.language || 'unknown',
        patternType: result.pattern_type || 'unknown',
        functionName: result.function_name,
        className: result.class_name,
        codeSnippet: result.code_snippet,
        fullContent: result.full_content,
        lineStart: result.line_start,
        lineEnd: result.line_end,
        score: result.score,
        highlights: this.generateHighlights(result.code_snippet, [query]),
        metadata: result.metadata || {},
      }))

    } catch (error) {
      logger.error({ query, workspaceId, error }, 'Exact search failed')
      throw error
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSuggestions(
    partialQuery: string,
    workspaceId: string,
    limit: number = 10
  ): Promise<string[]> {
    try {
      const query = `
        SELECT DISTINCT 
          CASE 
            WHEN cp.function_name ILIKE $2 THEN cp.function_name
            WHEN cp.class_name ILIKE $2 THEN cp.class_name
            ELSE SPLIT_PART(cp.file_path, '/', -1)
          END as suggestion
        FROM vector.code_patterns cp
        JOIN core.repositories r ON cp.repository_id = r.id
        WHERE r.workspace_id = $1
          AND (
            cp.function_name ILIKE $2
            OR cp.class_name ILIKE $2
            OR cp.file_path ILIKE $2
          )
        ORDER BY suggestion
        LIMIT $3
      `

      const results = await this.db.$queryRawUnsafe(
        query,
        workspaceId,
        `%${partialQuery}%`,
        limit
      ) as any[]

      return results
        .map(r => r.suggestion)
        .filter(Boolean)
        .filter(suggestion => suggestion.toLowerCase().includes(partialQuery.toLowerCase()))

    } catch (error) {
      logger.error({ partialQuery, workspaceId, error }, 'Failed to get suggestions')
      return []
    }
  }
}
