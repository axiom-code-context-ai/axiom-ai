import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('search-service')

export interface SearchQuery {
  query: string
  workspaceId: string
  type?: 'vector' | 'keyword' | 'hybrid'
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
  options?: {
    limit?: number
    offset?: number
    includeContent?: boolean
    similarityThreshold?: number
    keywordThreshold?: number
  }
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

export class SearchService {
  private apiClient: AxiosInstance

  constructor() {
    this.apiClient = axios.create({
      baseURL: env.SEARCH_API_URL,
      timeout: env.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${env.MCP_SERVER_NAME}/${env.MCP_SERVER_VERSION}`,
      },
    })

    // Add request/response interceptors for logging
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.debug('Making search API request', {
          method: config.method,
          url: config.url,
          data: config.data,
        })
        return config
      },
      (error: AxiosError) => {
        logger.error('Search API request error:', error)
        return Promise.reject(error)
      }
    )

    this.apiClient.interceptors.response.use(
      (response: AxiosResponse) => {
        logger.debug('Search API response received', {
          status: response.status,
          url: response.config.url,
          responseTime: response.headers['x-response-time'],
        })
        return response
      },
      (error: AxiosError) => {
        logger.error('Search API response error:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        })
        return Promise.reject(error)
      }
    )
  }

  /**
   * Perform code search using the search API
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    try {
      const response = await this.apiClient.post<SearchResponse>('/api/search', query)
      return response.data
    } catch (error) {
      logger.error('Search request failed:', error)
      
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 400) {
          throw new Error(`Invalid search query: ${error.response.data?.message || 'Bad request'}`)
        }
        if (error.response && error.response.status === 404) {
          throw new Error('Workspace not found or no access permissions')
        }
        if (error.response && error.response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.')
        }
        if (error.response && error.response.status !== undefined && error.response.status >= 500) {
          throw new Error('Search service is temporarily unavailable')
        }
      }
      
      throw new Error('Failed to perform code search')
    }
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(partialQuery: string, workspaceId: string, limit: number = 10): Promise<string[]> {
    try {
      const response = await this.apiClient.get<{ suggestions: string[] }>('/api/search/suggestions', {
        params: {
          query: partialQuery,
          workspaceId,
          limit,
        },
      })
      return response.data.suggestions
    } catch (error) {
      logger.error('Failed to get search suggestions:', error)
      return []
    }
  }

  /**
   * Find similar code patterns to a given pattern
   */
  async findSimilar(
    patternId: string,
    workspaceId: string,
    options: {
      limit?: number
      threshold?: number
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const response = await this.apiClient.get<{
        results: SearchResult[]
        totalCount: number
        patternId: string
      }>(`/api/search/similar/${patternId}`, {
        params: {
          workspaceId,
          ...options,
        },
      })
      return response.data.results
    } catch (error) {
      logger.error('Failed to find similar patterns:', error)
      throw new Error('Failed to find similar code patterns')
    }
  }

  /**
   * Get available search filters for a workspace
   */
  async getFilters(workspaceId: string): Promise<{
    languages: string[]
    patternTypes: string[]
    repositories: Array<{ id: string; name: string }>
    dateRange: {
      earliest: string
      latest: string
    }
  }> {
    try {
      const response = await this.apiClient.get(`/api/search/filters/${workspaceId}`)
      return response.data
    } catch (error) {
      logger.error('Failed to get search filters:', error)
      throw new Error('Failed to get available search filters')
    }
  }

  /**
   * Provide feedback on search results to improve ranking
   */
  async provideFeedback(
    query: string,
    workspaceId: string,
    feedback: {
      clicked?: string[]
      ignored?: string[]
      rated?: Record<string, number>
    }
  ): Promise<void> {
    try {
      await this.apiClient.post('/api/search/feedback', {
        query,
        workspaceId,
        feedback,
      })
      logger.info('Search feedback provided successfully')
    } catch (error) {
      logger.error('Failed to provide search feedback:', error)
      // Don't throw error for feedback - it's not critical
    }
  }

  /**
   * Perform vector similarity search only
   */
  async vectorSearch(query: SearchQuery): Promise<SearchResponse> {
    return this.search({
      ...query,
      type: 'vector',
    })
  }

  /**
   * Perform keyword search only
   */
  async keywordSearch(query: SearchQuery): Promise<SearchResponse> {
    return this.search({
      ...query,
      type: 'keyword',
    })
  }

  /**
   * Perform hybrid search (default)
   */
  async hybridSearch(query: SearchQuery): Promise<SearchResponse> {
    return this.search({
      ...query,
      type: 'hybrid',
    })
  }

  /**
   * Health check for the search service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/health')
      return response.status === 200
    } catch (error) {
      logger.error('Search service health check failed:', error)
      return false
    }
  }
}
