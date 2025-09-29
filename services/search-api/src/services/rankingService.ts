import { createModuleLogger } from '../utils/logger.js'
import { SearchResult } from './searchEngine.js'

const logger = createModuleLogger('ranking-service')

export interface RankingWeights {
  vectorWeight: number
  keywordWeight: number
  recencyWeight: number
  popularityWeight: number
  fileTypeWeight?: number
  repositoryWeight?: number
}

export interface RankingOptions {
  boostFactors?: {
    languages?: Record<string, number>
    patternTypes?: Record<string, number>
    repositories?: Record<string, number>
  }
  penaltyFactors?: {
    minSimilarity?: number
    maxAge?: number // in days
  }
}

export class RankingService {
  
  /**
   * Rank search results using multiple factors
   */
  async rankResults(
    results: SearchResult[],
    originalQuery: string,
    weights: RankingWeights,
    options: RankingOptions = {}
  ): Promise<SearchResult[]> {
    try {
      // Calculate various ranking factors for each result
      const rankedResults = results.map(result => {
        const scores = this.calculateRankingScores(result, originalQuery, options)
        const finalScore = this.combineScores(scores, weights)
        
        return {
          ...result,
          combinedScore: finalScore,
          rankingFactors: scores,
        }
      })

      // Sort by final score
      const sortedResults = rankedResults.sort((a, b) => b.combinedScore - a.combinedScore)

      logger.debug({ 
        totalResults: results.length,
        query: originalQuery,
        topScore: sortedResults[0]?.combinedScore 
      }, 'Results ranked successfully')

      return sortedResults

    } catch (error) {
      logger.error({ query: originalQuery, error }, 'Failed to rank results')
      return results // Return original results if ranking fails
    }
  }

  /**
   * Calculate individual ranking scores for a result
   */
  private calculateRankingScores(
    result: SearchResult,
    query: string,
    options: RankingOptions
  ) {
    const scores = {
      vector: result.similarity,
      keyword: result.keywordScore,
      recency: this.calculateRecencyScore(result),
      popularity: this.calculatePopularityScore(result),
      fileType: this.calculateFileTypeScore(result, options),
      repository: this.calculateRepositoryScore(result, options),
      queryMatch: this.calculateQueryMatchScore(result, query),
      codeQuality: this.calculateCodeQualityScore(result),
    }

    // Apply boost factors
    if (options.boostFactors) {
      scores.vector *= this.getBoostFactor(
        result.language, 
        options.boostFactors.languages
      )
      scores.keyword *= this.getBoostFactor(
        result.patternType, 
        options.boostFactors.patternTypes
      )
    }

    // Apply penalty factors
    if (options.penaltyFactors) {
      if (options.penaltyFactors.minSimilarity && result.similarity < options.penaltyFactors.minSimilarity) {
        scores.vector *= 0.5 // Penalty for low similarity
      }
    }

    return scores
  }

  /**
   * Calculate recency score based on when the code was last modified
   */
  private calculateRecencyScore(result: SearchResult): number {
    try {
      // This would ideally use git commit dates or file modification times
      // For now, we'll use a placeholder implementation
      const metadata = result.metadata || {}
      const lastModified = metadata.lastModified || metadata.createdAt
      
      if (!lastModified) return 0.5 // Neutral score if no date available

      const now = new Date()
      const modifiedDate = new Date(lastModified)
      const daysDiff = (now.getTime() - modifiedDate.getTime()) / (1000 * 60 * 60 * 24)

      // Exponential decay: more recent = higher score
      return Math.exp(-daysDiff / 365) // Decay over a year
    } catch {
      return 0.5 // Neutral score on error
    }
  }

  /**
   * Calculate popularity score based on usage patterns
   */
  private calculatePopularityScore(result: SearchResult): number {
    try {
      const metadata = result.metadata || {}
      
      // Factors that might indicate popularity:
      const factors = {
        searchCount: metadata.searchCount || 0,
        viewCount: metadata.viewCount || 0,
        referenceCount: metadata.referenceCount || 0,
        starCount: metadata.starCount || 0,
      }

      // Normalize and combine factors
      const normalizedScore = Math.min(
        (factors.searchCount * 0.3 +
         factors.viewCount * 0.2 +
         factors.referenceCount * 0.3 +
         factors.starCount * 0.2) / 100,
        1.0
      )

      return normalizedScore
    } catch {
      return 0.5 // Neutral score on error
    }
  }

  /**
   * Calculate file type relevance score
   */
  private calculateFileTypeScore(result: SearchResult, options: RankingOptions): number {
    const fileTypeScores: Record<string, number> = {
      'typescript': 0.9,
      'javascript': 0.9,
      'python': 0.8,
      'java': 0.8,
      'go': 0.8,
      'rust': 0.8,
      'cpp': 0.7,
      'c': 0.7,
      'php': 0.6,
      'ruby': 0.6,
      'json': 0.5,
      'yaml': 0.5,
      'md': 0.4,
      'txt': 0.3,
    }

    const language = result.language?.toLowerCase() || 'unknown'
    return fileTypeScores[language] || 0.5
  }

  /**
   * Calculate repository relevance score
   */
  private calculateRepositoryScore(result: SearchResult, options: RankingOptions): number {
    // This could be enhanced with repository metrics like:
    // - Star count, fork count, commit frequency
    // - Repository size, contributor count
    // - Organization/user reputation
    
    const metadata = result.metadata || {}
    const repoMetrics = {
      stars: metadata.repositoryStars || 0,
      forks: metadata.repositoryForks || 0,
      commits: metadata.repositoryCommits || 0,
      contributors: metadata.repositoryContributors || 0,
    }

    // Simple scoring based on repository activity
    const activityScore = Math.min(
      (repoMetrics.stars * 0.001 + 
       repoMetrics.forks * 0.002 + 
       repoMetrics.commits * 0.0001 + 
       repoMetrics.contributors * 0.01),
      1.0
    )

    return Math.max(activityScore, 0.3) // Minimum score to avoid penalizing new repos
  }

  /**
   * Calculate query match quality score
   */
  private calculateQueryMatchScore(result: SearchResult, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/)
    const searchableText = [
      result.functionName,
      result.className,
      result.filePath,
      result.codeSnippet,
    ].filter(Boolean).join(' ').toLowerCase()

    let matchScore = 0
    let exactMatches = 0

    for (const term of queryTerms) {
      if (searchableText.includes(term)) {
        matchScore += 1
        
        // Bonus for exact word matches
        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`)
        if (wordBoundaryRegex.test(searchableText)) {
          exactMatches += 1
        }
      }
    }

    const termMatchRatio = matchScore / queryTerms.length
    const exactMatchBonus = exactMatches / queryTerms.length * 0.5

    return Math.min(termMatchRatio + exactMatchBonus, 1.0)
  }

  /**
   * Calculate code quality score based on various factors
   */
  private calculateCodeQualityScore(result: SearchResult): number {
    const factors = {
      hasFunction: result.functionName ? 0.3 : 0,
      hasClass: result.className ? 0.2 : 0,
      codeLength: this.normalizeCodeLength(result.codeSnippet?.length || 0),
      hasComments: this.hasComments(result.codeSnippet) ? 0.2 : 0,
      complexity: this.estimateComplexity(result.codeSnippet),
    }

    return Object.values(factors).reduce((sum, score) => sum + score, 0) / Object.keys(factors).length
  }

  /**
   * Normalize code length to a score between 0 and 1
   */
  private normalizeCodeLength(length: number): number {
    // Optimal length around 100-500 characters
    if (length < 50) return 0.3 // Too short
    if (length > 1000) return 0.5 // Too long
    if (length >= 100 && length <= 500) return 1.0 // Optimal
    
    // Gradual falloff
    return length < 100 ? 0.3 + (length - 50) / 50 * 0.7 : 1.0 - (length - 500) / 500 * 0.5
  }

  /**
   * Check if code has comments
   */
  private hasComments(code: string): boolean {
    if (!code) return false
    return /\/\/|\/\*|\*\/|#|"""/.test(code)
  }

  /**
   * Estimate code complexity (simplified)
   */
  private estimateComplexity(code: string): number {
    if (!code) return 0

    const complexityIndicators = [
      /if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /try\s*{/g,
      /catch\s*\(/g,
      /&&|\|\|/g,
    ]

    let complexity = 0
    for (const pattern of complexityIndicators) {
      const matches = code.match(pattern)
      complexity += matches ? matches.length : 0
    }

    // Normalize to 0-1 scale (higher complexity = lower score for readability)
    return Math.max(0, 1 - complexity / 10)
  }

  /**
   * Get boost factor for a given value
   */
  private getBoostFactor(value: string | undefined, boostMap?: Record<string, number>): number {
    if (!value || !boostMap) return 1.0
    return boostMap[value.toLowerCase()] || 1.0
  }

  /**
   * Combine individual scores using weights
   */
  private combineScores(scores: Record<string, number>, weights: RankingWeights): number {
    const weightedSum = 
      scores.vector * weights.vectorWeight +
      scores.keyword * weights.keywordWeight +
      scores.recency * weights.recencyWeight +
      scores.popularity * weights.popularityWeight +
      scores.fileType * (weights.fileTypeWeight || 0.1) +
      scores.repository * (weights.repositoryWeight || 0.1) +
      scores.queryMatch * 0.2 +
      scores.codeQuality * 0.1

    const totalWeight = 
      weights.vectorWeight +
      weights.keywordWeight +
      weights.recencyWeight +
      weights.popularityWeight +
      (weights.fileTypeWeight || 0.1) +
      (weights.repositoryWeight || 0.1) +
      0.2 + // queryMatch weight
      0.1   // codeQuality weight

    return weightedSum / totalWeight
  }

  /**
   * Re-rank results based on user feedback
   */
  async reRankWithFeedback(
    results: SearchResult[],
    feedback: {
      clicked: string[] // IDs of clicked results
      ignored: string[] // IDs of ignored results
      rated: Record<string, number> // ID -> rating (1-5)
    }
  ): Promise<SearchResult[]> {
    return results.map(result => {
      let adjustmentFactor = 1.0

      if (feedback.clicked.includes(result.id)) {
        adjustmentFactor *= 1.2 // Boost clicked results
      }

      if (feedback.ignored.includes(result.id)) {
        adjustmentFactor *= 0.8 // Reduce ignored results
      }

      if (feedback.rated[result.id]) {
        const rating = feedback.rated[result.id]
        adjustmentFactor *= 0.8 + (rating / 5) * 0.4 // Scale based on rating
      }

      return {
        ...result,
        combinedScore: result.combinedScore * adjustmentFactor,
      }
    }).sort((a, b) => b.combinedScore - a.combinedScore)
  }
}
