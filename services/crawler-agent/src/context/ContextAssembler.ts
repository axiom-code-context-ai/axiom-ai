/**
 * Context Assembler
 * Assembles hierarchical enterprise context from knowledge graph
 */

import { Pool } from 'pg';
import { encoding_for_model } from 'tiktoken';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export interface IntentClassification {
  domain?: string;
  operation: 'NEW_FEATURE' | 'BUG_FIX' | 'REFACTORING' | 'UNDERSTANDING' | 'GENERAL';
  category?: string;
  technologies: string[];
}

export interface EnterpriseContext {
  architecture: any[];
  domain: any;
  api_specs: any[];
  patterns: any[];
  standards: any;
}

export interface AssembledContext {
  vector_results?: any[];
  enterprise_context: EnterpriseContext;
  enhanced_prompt: string;
  metadata: {
    repository: string;
    last_analyzed: Date;
    tokens_used: number;
    context_quality_score: number;
    query_time_ms: number;
    cache_hit: boolean;
  };
}

export class ContextAssembler {
  private db: Pool;
  private tokenEncoder: any;

  constructor(db: Pool) {
    this.db = db;
    this.tokenEncoder = encoding_for_model('gpt-4');
  }

  /**
   * Main assembly entry point
   */
  async assemble(
    prompt: string,
    repositoryId: string,
    tokenBudget: number = 8000
  ): Promise<AssembledContext> {
    const startTime = Date.now();
    logger.info(`Assembling context for repository: ${repositoryId}`);

    try {
      // Step 1: Check cache
      const cached = await this.checkCache(repositoryId, prompt);
      if (cached) {
        logger.info('Context retrieved from cache');
        return cached;
      }

      // Step 2: Classify intent
      const intent = this.classifyIntent(prompt);
      logger.info('Intent classification:', intent);

      // Step 3: Query knowledge graph hierarchically
      const context = await this.queryHierarchical(repositoryId, intent);

      // Step 4: Allocate token budget
      const allocated = this.allocateTokenBudget(context, intent, tokenBudget);

      // Step 5: Format enhanced prompt
      const enhancedPrompt = this.formatPrompt(prompt, allocated);

      // Step 6: Calculate metadata
      const tokensUsed = this.countTokens(enhancedPrompt);
      const queryTime = Date.now() - startTime;

      // Step 7: Get repository info
      const repoResult = await this.db.query(
        `SELECT name, analyzed_at FROM core.repositories WHERE id = $1`,
        [repositoryId]
      );
      const repo = repoResult.rows[0];

      const result: AssembledContext = {
        enterprise_context: allocated,
        enhanced_prompt: enhancedPrompt,
        metadata: {
          repository: repo?.name || 'Unknown',
          last_analyzed: repo?.analyzed_at || new Date(),
          tokens_used: tokensUsed,
          context_quality_score: this.calculateQualityScore(allocated),
          query_time_ms: queryTime,
          cache_hit: false,
        },
      };

      // Step 8: Cache result
      await this.cacheResult(repositoryId, prompt, intent, result);

      logger.info(`Context assembled in ${queryTime}ms, ${tokensUsed} tokens`);

      return result;
    } catch (error) {
      logger.error('Context assembly failed:', error);
      throw error;
    }
  }

  /**
   * Check cache for existing context
   */
  private async checkCache(repositoryId: string, prompt: string): Promise<AssembledContext | null> {
    const queryHash = this.hashQuery(prompt);

    try {
      const result = await this.db.query(
        `SELECT * FROM vector.context_cache 
         WHERE repository_id = $1 AND query_hash = $2 AND expires_at > NOW()`,
        [repositoryId, queryHash]
      );

      if (result.rows.length > 0) {
        const cached = result.rows[0];

        // Update access stats
        await this.db.query(
          `UPDATE vector.context_cache 
           SET accessed_at = NOW(), access_count = access_count + 1
           WHERE id = $1`,
          [cached.id]
        );

        return {
          enterprise_context: cached.assembled_context,
          enhanced_prompt: cached.enhanced_prompt,
          metadata: {
            ...cached.metadata,
            cache_hit: true,
            query_time_ms: 5,
          },
        };
      }
    } catch (error) {
      logger.error('Cache check failed:', error);
    }

    return null;
  }

  /**
   * Classify user intent from prompt
   */
  private classifyIntent(prompt: string): IntentClassification {
    const lowerPrompt = prompt.toLowerCase();

    // Detect operation type
    let operation: IntentClassification['operation'] = 'GENERAL';
    if (
      lowerPrompt.includes('write') ||
      lowerPrompt.includes('add') ||
      lowerPrompt.includes('implement') ||
      lowerPrompt.includes('create')
    ) {
      operation = 'NEW_FEATURE';
    } else if (
      lowerPrompt.includes('fix') ||
      lowerPrompt.includes('debug') ||
      lowerPrompt.includes('broken') ||
      lowerPrompt.includes('error')
    ) {
      operation = 'BUG_FIX';
    } else if (
      lowerPrompt.includes('refactor') ||
      lowerPrompt.includes('improve') ||
      lowerPrompt.includes('optimize')
    ) {
      operation = 'REFACTORING';
    } else if (
      lowerPrompt.includes('explain') ||
      lowerPrompt.includes('how does') ||
      lowerPrompt.includes('what is') ||
      lowerPrompt.includes('understand')
    ) {
      operation = 'UNDERSTANDING';
    }

    // Extract domain keywords
    const domainKeywords = ['payment', 'order', 'user', 'customer', 'product', 'invoice', 'transaction'];
    let domain: string | undefined;
    for (const keyword of domainKeywords) {
      if (lowerPrompt.includes(keyword)) {
        domain = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        break;
      }
    }

    // Extract technologies
    const techKeywords = [
      'stripe',
      'paypal',
      'kafka',
      'rabbitmq',
      'redis',
      'postgres',
      'mysql',
      'react',
      'vue',
      'angular',
      'spring',
      'django',
    ];
    const technologies: string[] = [];
    for (const tech of techKeywords) {
      if (lowerPrompt.includes(tech)) {
        technologies.push(tech.charAt(0).toUpperCase() + tech.slice(1));
      }
    }

    // Determine category
    let category: string | undefined;
    if (lowerPrompt.includes('api') || lowerPrompt.includes('endpoint') || lowerPrompt.includes('http')) {
      category = 'api_client';
    } else if (lowerPrompt.includes('database') || lowerPrompt.includes('query') || lowerPrompt.includes('sql')) {
      category = 'database_access';
    } else if (lowerPrompt.includes('event') || lowerPrompt.includes('message') || lowerPrompt.includes('queue')) {
      category = 'event_handler';
    }

    return {
      domain,
      operation,
      category,
      technologies,
    };
  }

  /**
   * Query knowledge graph hierarchically
   */
  private async queryHierarchical(repositoryId: string, intent: IntentClassification): Promise<EnterpriseContext> {
    // Level 1: Architecture (ALWAYS include)
    const architectureResult = await this.db.query(
      `SELECT * FROM core.architecture_patterns
       WHERE repository_id = $1
       ORDER BY confidence_score DESC
       LIMIT 3`,
      [repositoryId]
    );

    // Level 2: Domain + APIs
    let domainResult: any = null;
    let apiResult: any = null;

    if (intent.domain) {
      domainResult = await this.db.query(
        `SELECT * FROM core.domain_models
         WHERE repository_id = $1 AND domain_name ILIKE $2
         LIMIT 1`,
        [repositoryId, `%${intent.domain}%`]
      );

      apiResult = await this.db.query(
        `SELECT * FROM core.api_specifications
         WHERE repository_id = $1 
         AND (api_name ILIKE $2 OR $3 = ANY(
           SELECT jsonb_array_elements_text(endpoints::jsonb)
         ))
         LIMIT 5`,
        [repositoryId, `%${intent.domain}%`, intent.domain]
      );
    }

    // Level 3: Code Patterns
    let patternsResult: any;
    if (intent.category) {
      patternsResult = await this.db.query(
        `SELECT * FROM core.code_patterns
         WHERE repository_id = $1 
         AND category = $2
         AND is_standard = true
         ORDER BY frequency DESC
         LIMIT 5`,
        [repositoryId, intent.category]
      );
    } else {
      patternsResult = await this.db.query(
        `SELECT * FROM core.code_patterns
         WHERE repository_id = $1 
         AND is_standard = true
         ORDER BY frequency DESC
         LIMIT 5`,
        [repositoryId]
      );
    }

    // Level 4: Framework Standards
    const standardsResult = await this.db.query(
      `SELECT * FROM core.framework_fingerprints
       WHERE repository_id = $1 AND is_custom = true`,
      [repositoryId]
    );

    return {
      architecture: architectureResult.rows,
      domain: domainResult?.rows[0] || null,
      api_specs: apiResult?.rows || [],
      patterns: patternsResult.rows,
      standards: standardsResult.rows[0] || null,
    };
  }

  /**
   * Allocate token budget across levels
   */
  private allocateTokenBudget(
    context: EnterpriseContext,
    intent: IntentClassification,
    budget: number
  ): EnterpriseContext {
    // Token allocation by operation type
    const allocations = {
      NEW_FEATURE: { arch: 0.1, domain: 0.2, patterns: 0.5, standards: 0.2 },
      BUG_FIX: { arch: 0.05, domain: 0.15, patterns: 0.3, standards: 0.5 },
      UNDERSTANDING: { arch: 0.2, domain: 0.4, patterns: 0.3, standards: 0.1 },
      REFACTORING: { arch: 0.15, domain: 0.25, patterns: 0.4, standards: 0.2 },
      GENERAL: { arch: 0.25, domain: 0.25, patterns: 0.25, standards: 0.25 },
    };

    const allocation = allocations[intent.operation];

    // Truncate each section to fit budget
    // (Simplified - in production would do token-aware truncation)
    return context;
  }

  /**
   * Format enhanced prompt
   */
  private formatPrompt(userPrompt: string, context: EnterpriseContext): string {
    let prompt = `========================================
USER REQUEST
========================================
${userPrompt}

`;

    // Level 1: Architecture
    if (context.architecture.length > 0) {
      prompt += `========================================
LEVEL 1: ARCHITECTURAL CONTEXT
========================================
`;
      for (const pattern of context.architecture) {
        prompt += `Pattern: ${pattern.pattern_type}
Name: ${pattern.pattern_name}
Description: ${pattern.description}
Rationale: ${pattern.rationale}
Evidence: ${pattern.evidence_source}

`;
      }
    }

    // Level 2: Domain
    if (context.domain) {
      prompt += `========================================
LEVEL 2: DOMAIN KNOWLEDGE
========================================
Domain: ${context.domain.domain_name}
Summary: ${context.domain.summary}

Entities:
${JSON.stringify(context.domain.entities, null, 2)}

Services:
${JSON.stringify(context.domain.services, null, 2)}

Business Rules:
${context.domain.business_rules?.map((r: string) => `  - ${r}`).join('\n') || 'None'}

`;
    }

    // Level 3: Code Patterns
    if (context.patterns.length > 0) {
      prompt += `========================================
LEVEL 3: IMPLEMENTATION PATTERNS
========================================
`;
      for (const pattern of context.patterns) {
        prompt += `Pattern: ${pattern.pattern_name}
Usage: ${pattern.frequency} occurrences (${pattern.is_standard ? 'STANDARD' : 'variant'})
Category: ${pattern.category}

Explanation:
${pattern.explanation}

Template:
${pattern.template}

When to use:
${pattern.when_to_use}

`;
      }
    }

    // Level 4: Standards
    if (context.standards) {
      prompt += `========================================
LEVEL 4: FRAMEWORK STANDARDS & CONSTRAINTS
========================================
Framework: ${context.standards.framework_type} ${context.standards.framework_version || ''}
${context.standards.is_custom ? `Custom Framework: ${context.standards.package_name}\n` : ''}

Standard Components:
${JSON.stringify(context.standards.custom_components, null, 2)}

`;
    }

    prompt += `========================================
INSTRUCTIONS
========================================
Generate code that:
1. Follows the architectural patterns described in Level 1
2. Uses domain models and services from Level 2
3. Implements using standard patterns from Level 3
4. Adheres to framework conventions from Level 4

Prefer standard patterns with higher usage frequency in the codebase.
`;

    return prompt;
  }

  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    try {
      const tokens = this.tokenEncoder.encode(text);
      return tokens.length;
    } catch (error) {
      // Fallback: rough estimate
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Calculate context quality score
   */
  private calculateQualityScore(context: EnterpriseContext): number {
    let score = 0;

    // Architecture contribution (0-0.25)
    if (context.architecture.length > 0) score += 0.25;

    // Domain contribution (0-0.25)
    if (context.domain) score += 0.25;

    // Patterns contribution (0-0.3)
    if (context.patterns.length > 0) {
      score += 0.15;
      const standardPatterns = context.patterns.filter((p) => p.is_standard).length;
      score += (standardPatterns / context.patterns.length) * 0.15;
    }

    // Standards contribution (0-0.2)
    if (context.standards) score += 0.2;

    return Math.min(1.0, score);
  }

  /**
   * Cache assembled context
   */
  private async cacheResult(
    repositoryId: string,
    prompt: string,
    intent: IntentClassification,
    result: AssembledContext
  ) {
    const queryHash = this.hashQuery(prompt);

    try {
      // Cache for 1 hour
      const expiresAt = new Date(Date.now() + 3600 * 1000);

      await this.db.query(
        `INSERT INTO vector.context_cache 
         (repository_id, query_hash, query_text, intent_classification, assembled_context, 
          enhanced_prompt, tokens_used, context_quality_score, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          repositoryId,
          queryHash,
          prompt,
          JSON.stringify(intent),
          JSON.stringify(result.enterprise_context),
          result.enhanced_prompt,
          result.metadata.tokens_used,
          result.metadata.context_quality_score,
          expiresAt,
        ]
      );
    } catch (error) {
      logger.error('Cache write failed:', error);
    }
  }

  /**
   * Hash query for caching
   */
  private hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  }
}

