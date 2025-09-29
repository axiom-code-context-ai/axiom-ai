import { PrismaClient } from '@prisma/client'
import { createModuleLogger, logPerformance } from '../utils/logger.js'
import { env } from '../config/env.js'
import { VectorSearchService } from './vectorSearch.js'
import { KeywordSearchService } from './keywordSearch.js'
import { RankingService } from './rankingService.js'
import { CacheService } from './cacheService.js'
import { z } from 'zod'

const logger = createModuleLogger('search-engine')

// Search query schema
export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  workspaceId: z.string().uuid(),
  type: z.enum(['vector', 'keyword', 'hybrid']).default('hybrid'),
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
    limit: z.number().min(1).max(env.MAX_SEARCH_RESULTS).default(20),
    offset: z.number().min(0).default(0),
    includeContent: z.boolean().default(false),
    similarityThreshold: z.number().min(0).max(1).default(env.VECTOR_SIMILARITY_THRESHOLD),
    keywordThreshold: z.number().min(0).max(1).default(env.KEYWORD_MATCH_THRESHOLD),
  }).optional(),
})

export type SearchQuery = z.infer<typeof SearchQuerySchema>

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
  private db: PrismaClient
  private vectorSearch: VectorSearchService
  private keywordSearch: KeywordSearchService
  private ranking: RankingService
  private cache: CacheService

  constructor(
    db: PrismaClient,
    vectorSearch: VectorSearchService,
    keywordSearch: KeywordSearchService,
    ranking: RankingService,
    cache: CacheService
  ) {
    this.db = db
    this.vectorSearch = vectorSearch
    this.keywordSearch = keywordSearch
    this.ranking = ranking
    this.cache = cache
  }

  /**
   * Perform search with automatic query optimization and caching
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now()
    
    // Validate query
    const validatedQuery = SearchQuerySchema.parse(query)
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(validatedQuery)
    
    // Try to get from cache
    const cachedResult = await this.cache.get<SearchResponse>(cacheKey)
    if (cachedResult) {
      logger.debug({ query: validatedQuery.query, cacheHit: true }, 'Returning cached search results')
      return {
        ...cachedResult,
        searchTime: Date.now() - startTime
      }
    }

    try {
      let searchResults: SearchResult[] = []

      // Execute search based on type
      switch (validatedQuery.type) {
        case 'vector':
          searchResults = await this.performVectorSearch(validatedQuery)
          break
        case 'keyword':
          searchResults = await this.performKeywordSearch(validatedQuery)
          break
        case 'hybrid':
        default:
          searchResults = await this.performHybridSearch(validatedQuery)
          break
      }

      // Apply final ranking and filtering
      const rankedResults = await this.ranking.rankResults(
        searchResults, 
        validatedQuery.query,
        {
          vectorWeight: 0.4,
          keywordWeight: 0.2,
          recencyWeight: 0.2,
          popularityWeight: 0.2,
        }
      )

      // Apply pagination
      const { limit = 20, offset = 0 } = validatedQuery.options || {}
      const paginatedResults = rankedResults.slice(offset, offset + limit)

      // Generate search suggestions
      const suggestions = await this.generateSuggestions(validatedQuery.query, searchResults)

      const response: SearchResponse = {
        results: paginatedResults,
        totalCount: rankedResults.length,
        searchTime: Date.now() - startTime,
        query: validatedQuery.query,
        type: validatedQuery.type,
        filters: validatedQuery.filters,
        suggestions,
      }

      // Cache the results
      await this.cache.set(cacheKey, response, env.SEARCH_CACHE_TTL)

      logger.info({
        query: validatedQuery.query,
        type: validatedQuery.type,
        resultCount: response.totalCount,
        searchTime: response.searchTime,
      }, 'Search completed successfully')

      return response

    } catch (error) {
      logger.error({ query: validatedQuery.query, error }, 'Search failed')
      throw error
    }
  }

  /**
   * Perform vector similarity search
   */
  private async performVectorSearch(query: SearchQuery): Promise<SearchResult[]> {
    return logPerformance('vector-search', async () => {
      const embedding = await this.vectorSearch.generateEmbedding(query.query)
      const results = await this.vectorSearch.searchSimilar(
        embedding,
        query.workspaceId,
        {
          threshold: query.options?.similarityThreshold || env.VECTOR_SIMILARITY_THRESHOLD,
          limit: (query.options?.limit || 20) * 2, // Get more for ranking
          filters: query.filters,
        }
      )

      return results.map(result => ({
        ...result,
        similarity: result.similarity,
        keywordScore: 0,
        combinedScore: result.similarity,
        highlights: [],
      }))
    }, logger)
  }

  /**
   * Perform keyword-based search
   */
  private async performKeywordSearch(query: SearchQuery): Promise<SearchResult[]> {
    return logPerformance('keyword-search', async () => {
      const results = await this.keywordSearch.search(
        query.query,
        query.workspaceId,
        {
          threshold: query.options?.keywordThreshold || env.KEYWORD_MATCH_THRESHOLD,
          limit: (query.options?.limit || 20) * 2, // Get more for ranking
          filters: query.filters,
        }
      )

      return results.map(result => ({
        ...result,
        similarity: 0,
        keywordScore: result.score,
        combinedScore: result.score,
        highlights: result.highlights || [],
      }))
    }, logger)
  }

  /**
   * Perform hybrid search combining vector and keyword search
   */
  private async performHybridSearch(query: SearchQuery): Promise<SearchResult[]> {
    return logPerformance('hybrid-search', async () => {
      // Execute both searches in parallel
      const [vectorResults, keywordResults] = await Promise.all([
        this.performVectorSearch(query),
        this.performKeywordSearch(query),
      ])

      // Merge and deduplicate results
      const mergedResults = this.mergeSearchResults(vectorResults, keywordResults)

      return mergedResults
    }, logger)
  }

  /**
   * Merge vector and keyword search results
   */
  private mergeSearchResults(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[]
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>()

    // Add vector results
    for (const result of vectorResults) {
      resultMap.set(result.id, result)
    }

    // Merge keyword results
    for (const keywordResult of keywordResults) {
      const existing = resultMap.get(keywordResult.id)
      if (existing) {
        // Combine scores
        existing.keywordScore = keywordResult.keywordScore
        existing.combinedScore = this.calculateCombinedScore(
          existing.similarity,
          keywordResult.keywordScore
        )
        existing.highlights = [
          ...existing.highlights,
          ...keywordResult.highlights,
        ]
      } else {
        resultMap.set(keywordResult.id, keywordResult)
      }
    }

    return Array.from(resultMap.values())
  }

  /**
   * Calculate combined score for hybrid search
   */
  private calculateCombinedScore(vectorScore: number, keywordScore: number): number {
    const vectorWeight = 0.6
    const keywordWeight = 0.4
    return (vectorScore * vectorWeight) + (keywordScore * keywordWeight)
  }

  /**
   * Generate search suggestions based on query and results
   */
  private async generateSuggestions(query: string, results: SearchResult[]): Promise<string[]> {
    const suggestions: string[] = []

    try {
      // Extract common terms from successful results
      const commonTerms = this.extractCommonTerms(results)
      
      // Generate query variations
      const variations = this.generateQueryVariations(query)
      
      // Combine and deduplicate
      const allSuggestions = [...commonTerms, ...variations]
      const uniqueSuggestions = [...new Set(allSuggestions)]
      
      // Return top suggestions
      suggestions.push(...uniqueSuggestions.slice(0, 5))
    } catch (error) {
      logger.warn({ query, error }, 'Failed to generate suggestions')
    }

    return suggestions
  }

  /**
   * Extract common terms from search results
   */
  private extractCommonTerms(results: SearchResult[]): string[] {
    const termCounts = new Map<string, number>()

    for (const result of results) {
      // Extract terms from function names, class names, and file paths
      const terms = [
        result.functionName,
        result.className,
        ...result.filePath.split('/').pop()?.split('.') || [],
        ...result.language ? [result.language] : [],
      ].filter(Boolean) as string[]

      for (const term of terms) {
        const normalizedTerm = term.toLowerCase()
        termCounts.set(normalizedTerm, (termCounts.get(normalizedTerm) || 0) + 1)
      }
    }

    // Return most common terms
    return Array.from(termCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([term]) => term)
  }

  /**
   * Generate query variations for suggestions
   */
  private generateQueryVariations(query: string): string[] {
    const variations: string[] = []
    const words = query.toLowerCase().split(/\s+/)

    // Add individual words
    variations.push(...words.filter(word => word.length > 2))

    // Add partial matches
    if (words.length > 1) {
      variations.push(words.slice(0, -1).join(' '))
      variations.push(words.slice(1).join(' '))
    }

    return variations
  }

  /**
   * Generate cache key for search query
   */
  private generateCacheKey(query: SearchQuery): string {
    const key = {
      query: query.query,
      workspaceId: query.workspaceId,
      type: query.type,
      filters: query.filters,
      options: query.options,
    }
    return `search:${Buffer.from(JSON.stringify(key)).toString('base64')}`
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(workspaceId: string, timeRange?: { from: Date; to: Date }) {
    // This could be expanded to track search patterns, popular queries, etc.
    const analytics = {
      totalSearches: 0,
      popularQueries: [],
      searchPatterns: {},
      performanceMetrics: {
        averageSearchTime: 0,
        cacheHitRate: 0,
      },
    }

    return analytics
  }

  /**
   * Close search engine and cleanup resources
   */
  async close(): Promise<void> {
    logger.info('Closing search engine')
    await this.db.$disconnect()
  }
}

/**
 * Initialize search engine with all dependencies
 */
export async function initializeSearchEngine(): Promise<SearchEngine> {
  const db = new PrismaClient()
  
  // Test database connection
  await db.$connect()
  
  const vectorSearch = new VectorSearchService(db)
  const keywordSearch = new KeywordSearchService(db)
  const ranking = new RankingService()
  const cache = new CacheService()

  return new SearchEngine(db, vectorSearch, keywordSearch, ranking, cache)
}
