import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('vector-search')

export interface VectorSearchOptions {
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

export interface VectorSearchResult {
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
  metadata: Record<string, any>
}

export class VectorSearchService {
  private db: PrismaClient
  private openai?: OpenAI

  constructor(db: PrismaClient) {
    this.db = db
    
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      })
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured')
    }

    try {
      const response = await this.openai.embeddings.create({
        model: env.EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float',
      })

      return response.data[0].embedding
    } catch (error) {
      logger.error({ text: text.substring(0, 100), error }, 'Failed to generate embedding')
      throw error
    }
  }

  /**
   * Search for similar code patterns using vector similarity
   */
  async searchSimilar(
    queryEmbedding: number[],
    workspaceId: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const {
      threshold = env.VECTOR_SIMILARITY_THRESHOLD,
      limit = env.MAX_SEARCH_RESULTS,
      filters = {}
    } = options

    try {
      // Build the SQL query with filters
      let whereClause = 'r.workspace_id = $2'
      const params: any[] = [queryEmbedding, workspaceId]
      let paramIndex = 3

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

      // Execute vector similarity search using pgvector
      const query = `
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
          (1 - (cp.embedding <=> $1::vector)) as similarity
        FROM vector.code_patterns cp
        JOIN core.repositories r ON cp.repository_id = r.id
        WHERE ${whereClause}
          AND cp.embedding IS NOT NULL
          AND (1 - (cp.embedding <=> $1::vector)) > $${paramIndex}
        ORDER BY similarity DESC
        LIMIT $${paramIndex + 1}
      `

      params.push(threshold, limit)

      const results = await this.db.$queryRawUnsafe(query, ...params)

      return (results as any[]).map(row => ({
        id: row.id,
        repositoryId: row.repository_id,
        repositoryName: row.repository_name,
        filePath: row.file_path,
        fileName: row.file_name,
        language: row.language || 'unknown',
        patternType: row.pattern_type || 'unknown',
        functionName: row.function_name,
        className: row.class_name,
        codeSnippet: row.code_snippet,
        fullContent: row.full_content,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata || {},
      }))

    } catch (error) {
      logger.error({ workspaceId, threshold, limit, error }, 'Vector search failed')
      throw error
    }
  }

  /**
   * Find similar code patterns to a given pattern
   */
  async findSimilarPatterns(
    patternId: string,
    workspaceId: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      // Get the embedding for the source pattern
      const sourcePattern = await this.db.$queryRaw`
        SELECT embedding
        FROM vector.code_patterns cp
        JOIN core.repositories r ON cp.repository_id = r.id
        WHERE cp.id = ${patternId}
          AND r.workspace_id = ${workspaceId}
          AND cp.embedding IS NOT NULL
      ` as any[]

      if (!sourcePattern.length) {
        throw new Error(`Pattern ${patternId} not found or has no embedding`)
      }

      const embedding = sourcePattern[0].embedding

      // Search for similar patterns
      return this.searchSimilar(embedding, workspaceId, {
        ...options,
        // Exclude the source pattern from results
        limit: (options.limit || 20) + 1,
      }).then(results => 
        results.filter(result => result.id !== patternId).slice(0, options.limit || 20)
      )

    } catch (error) {
      logger.error({ patternId, workspaceId, error }, 'Failed to find similar patterns')
      throw error
    }
  }

  /**
   * Get semantic clusters of code patterns
   */
  async getSemanticClusters(
    workspaceId: string,
    options: {
      minClusterSize?: number
      maxClusters?: number
      similarityThreshold?: number
    } = {}
  ) {
    const {
      minClusterSize = 3,
      maxClusters = 10,
      similarityThreshold = 0.8
    } = options

    try {
      // This is a simplified clustering approach
      // In production, you might want to use more sophisticated algorithms
      const query = `
        WITH pattern_similarities AS (
          SELECT 
            cp1.id as pattern1_id,
            cp2.id as pattern2_id,
            (1 - (cp1.embedding <=> cp2.embedding)) as similarity,
            cp1.pattern_type,
            cp1.language
          FROM vector.code_patterns cp1
          JOIN vector.code_patterns cp2 ON cp1.id < cp2.id
          JOIN core.repositories r1 ON cp1.repository_id = r1.id
          JOIN core.repositories r2 ON cp2.repository_id = r2.id
          WHERE r1.workspace_id = $1
            AND r2.workspace_id = $1
            AND cp1.embedding IS NOT NULL
            AND cp2.embedding IS NOT NULL
            AND (1 - (cp1.embedding <=> cp2.embedding)) > $2
        )
        SELECT 
          pattern_type,
          language,
          COUNT(*) as cluster_size,
          AVG(similarity) as avg_similarity
        FROM pattern_similarities
        GROUP BY pattern_type, language
        HAVING COUNT(*) >= $3
        ORDER BY cluster_size DESC, avg_similarity DESC
        LIMIT $4
      `

      const clusters = await this.db.$queryRawUnsafe(
        query,
        workspaceId,
        similarityThreshold,
        minClusterSize,
        maxClusters
      )

      return clusters

    } catch (error) {
      logger.error({ workspaceId, error }, 'Failed to get semantic clusters')
      throw error
    }
  }

  /**
   * Update embedding for a code pattern
   */
  async updatePatternEmbedding(patternId: string, text: string): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(text)
      
      await this.db.$executeRaw`
        UPDATE vector.code_patterns
        SET embedding = ${embedding}::vector
        WHERE id = ${patternId}
      `

      logger.debug({ patternId }, 'Pattern embedding updated')
    } catch (error) {
      logger.error({ patternId, error }, 'Failed to update pattern embedding')
      throw error
    }
  }

  /**
   * Batch update embeddings for multiple patterns
   */
  async batchUpdateEmbeddings(patterns: { id: string; text: string }[]): Promise<void> {
    const batchSize = env.BATCH_SIZE
    
    for (let i = 0; i < patterns.length; i += batchSize) {
      const batch = patterns.slice(i, i + batchSize)
      
      try {
        // Generate embeddings for the batch
        const embeddings = await Promise.all(
          batch.map(pattern => this.generateEmbedding(pattern.text))
        )

        // Update embeddings in database
        const updatePromises = batch.map((pattern, index) =>
          this.db.$executeRaw`
            UPDATE vector.code_patterns
            SET embedding = ${embeddings[index]}::vector
            WHERE id = ${pattern.id}
          `
        )

        await Promise.all(updatePromises)
        
        logger.info({ batchSize: batch.length, processed: i + batch.length }, 'Batch embeddings updated')
      } catch (error) {
        logger.error({ batch: batch.map(p => p.id), error }, 'Failed to update batch embeddings')
        throw error
      }
    }
  }

  /**
   * Get embedding statistics for workspace
   */
  async getEmbeddingStats(workspaceId: string) {
    try {
      const stats = await this.db.$queryRaw`
        SELECT 
          COUNT(*) as total_patterns,
          COUNT(cp.embedding) as patterns_with_embeddings,
          COUNT(CASE WHEN cp.embedding IS NULL THEN 1 END) as patterns_without_embeddings,
          COUNT(DISTINCT cp.language) as unique_languages,
          COUNT(DISTINCT cp.pattern_type) as unique_pattern_types
        FROM vector.code_patterns cp
        JOIN core.repositories r ON cp.repository_id = r.id
        WHERE r.workspace_id = ${workspaceId}
      ` as any[]

      return stats[0]
    } catch (error) {
      logger.error({ workspaceId, error }, 'Failed to get embedding stats')
      throw error
    }
  }
}
