/**
 * Extraction Orchestrator
 * Coordinates all extraction pipeline components
 */

import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { RepositoryAnalyzer } from '../extractors/RepositoryAnalyzer.js';
import { ArchitectureExtractor } from '../extractors/ArchitectureExtractor.js';
import { DomainExtractor } from '../extractors/DomainExtractor.js';
import { PatternMiner } from '../extractors/PatternMiner.js';
import { APISpecExtractor } from '../extractors/APISpecExtractor.js';
import { SupportedLanguage } from '../utils/treeSitterUtil.js';

export interface ExtractionProgress {
  repository_id: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed' | 'partial';
  current_component?: string;
  progress_percentage: number;
  components: {
    [key: string]: {
      status: 'pending' | 'started' | 'completed' | 'failed';
      duration_ms?: number;
      items_extracted?: number;
      cost_usd?: number;
    };
  };
}

export class ExtractionOrchestrator {
  private db: Pool;
  private openaiApiKey: string;
  private tempDir: string;

  constructor(db: Pool, openaiApiKey: string) {
    this.db = db;
    this.openaiApiKey = openaiApiKey;
    this.tempDir = path.join(os.tmpdir(), 'axiom-repos');
  }

  /**
   * Main orchestration entry point
   */
  async extract(repositoryId: string, gitUrl: string): Promise<ExtractionProgress> {
    logger.info(`Starting extraction for repository: ${repositoryId}`);

    const progress: ExtractionProgress = {
      repository_id: repositoryId,
      status: 'analyzing',
      progress_percentage: 0,
      components: {
        RepositoryAnalyzer: { status: 'pending' },
        ArchitectureExtractor: { status: 'pending' },
        DomainExtractor: { status: 'pending' },
        PatternMiner: { status: 'pending' },
        APISpecExtractor: { status: 'pending' },
      },
    };

    const overallStartTime = Date.now();
    let repoPath: string | null = null;

    try {
      // Step 1: Update repository status
      await this.updateRepositoryStatus(repositoryId, 'analyzing');

      // Step 2: Clone repository
      repoPath = await this.cloneRepository(gitUrl, repositoryId);
      logger.info(`Repository cloned to: ${repoPath}`);

      // Step 3: Run RepositoryAnalyzer (MUST run first)
      logger.info('Step 1/5: Running RepositoryAnalyzer...');
      progress.current_component = 'RepositoryAnalyzer';
      progress.progress_percentage = 10;
      progress.components.RepositoryAnalyzer.status = 'started';

      const analyzerResult = await this.runRepositoryAnalyzer(repositoryId, repoPath);
      progress.components.RepositoryAnalyzer = {
        status: 'completed',
        duration_ms: analyzerResult.duration,
        items_extracted: analyzerResult.fingerprints.length,
        cost_usd: 0,
      };
      progress.progress_percentage = 20;

      // Get primary language and custom components for next steps
      const primaryLanguage = analyzerResult.primaryLanguage;
      const customComponents = analyzerResult.customComponents;

      // Step 4: Run remaining extractors in parallel
      logger.info('Step 2-5: Running parallel extractors...');
      progress.progress_percentage = 30;

      const parallelResults = await Promise.allSettled([
        this.runArchitectureExtractor(repositoryId, repoPath),
        this.runDomainExtractor(repositoryId, repoPath, primaryLanguage),
        this.runPatternMiner(repositoryId, repoPath, primaryLanguage, customComponents),
        this.runAPISpecExtractor(repositoryId, repoPath),
      ]);

      // Process results
      const [archResult, domainResult, patternResult, apiResult] = parallelResults;

      // Architecture
      if (archResult.status === 'fulfilled') {
        progress.components.ArchitectureExtractor = {
          status: 'completed',
          duration_ms: archResult.value.duration,
          items_extracted: archResult.value.patterns.length,
          cost_usd: archResult.value.cost,
        };
      } else {
        progress.components.ArchitectureExtractor = { status: 'failed' };
        logger.error('ArchitectureExtractor failed:', archResult.reason);
      }

      // Domain
      if (domainResult.status === 'fulfilled') {
        progress.components.DomainExtractor = {
          status: 'completed',
          duration_ms: domainResult.value.duration,
          items_extracted: domainResult.value.domains.length,
          cost_usd: domainResult.value.cost,
        };
      } else {
        progress.components.DomainExtractor = { status: 'failed' };
        logger.error('DomainExtractor failed:', domainResult.reason);
      }

      // Pattern
      if (patternResult.status === 'fulfilled') {
        progress.components.PatternMiner = {
          status: 'completed',
          duration_ms: patternResult.value.duration,
          items_extracted: patternResult.value.patterns.length,
          cost_usd: patternResult.value.cost,
        };
      } else {
        progress.components.PatternMiner = { status: 'failed' };
        logger.error('PatternMiner failed:', patternResult.reason);
      }

      // API
      if (apiResult.status === 'fulfilled') {
        progress.components.APISpecExtractor = {
          status: 'completed',
          duration_ms: apiResult.value.duration,
          items_extracted: apiResult.value.specs.length,
          cost_usd: apiResult.value.cost,
        };
      } else {
        progress.components.APISpecExtractor = { status: 'failed' };
        logger.error('APISpecExtractor failed:', apiResult.reason);
      }

      progress.progress_percentage = 100;

      // Determine overall status
      const failedCount = Object.values(progress.components).filter((c) => c.status === 'failed').length;
      if (failedCount === 0) {
        progress.status = 'completed';
      } else if (failedCount === Object.keys(progress.components).length) {
        progress.status = 'failed';
      } else {
        progress.status = 'partial';
      }

      // Step 5: Update final repository status
      const totalDuration = Date.now() - overallStartTime;
      const totalCost = Object.values(progress.components).reduce((sum, c) => sum + (c.cost_usd || 0), 0);

      await this.updateRepositoryCompletion(repositoryId, progress.status, totalDuration, totalCost);

      logger.info(`Extraction completed in ${totalDuration}ms with status: ${progress.status}`);
      logger.info(`Total cost: $${totalCost.toFixed(4)}`);

      return progress;
    } catch (error) {
      logger.error('Extraction orchestration failed:', error);
      progress.status = 'failed';
      await this.updateRepositoryStatus(repositoryId, 'failed');
      throw error;
    } finally {
      // Cleanup: Remove cloned repository
      if (repoPath) {
        try {
          await fs.rm(repoPath, { recursive: true, force: true });
          logger.info('Cleaned up temporary repository');
        } catch (error) {
          logger.error('Failed to cleanup repository:', error);
        }
      }
    }
  }

  /**
   * Clone git repository
   */
  private async cloneRepository(gitUrl: string, repositoryId: string): Promise<string> {
    const repoPath = path.join(this.tempDir, repositoryId);

    // Create temp directory if it doesn't exist
    await fs.mkdir(this.tempDir, { recursive: true });

    // Clone repository
    const git = simpleGit();
    await git.clone(gitUrl, repoPath, ['--depth', '1']); // Shallow clone

    return repoPath;
  }

  /**
   * Run RepositoryAnalyzer
   */
  private async runRepositoryAnalyzer(repositoryId: string, repoPath: string) {
    const startTime = Date.now();
    await this.logExtractionStart(repositoryId, 'RepositoryAnalyzer');

    try {
      const analyzer = new RepositoryAnalyzer(repoPath);
      const fingerprints = await analyzer.analyze();

      // Store fingerprints in database
      for (const fingerprint of fingerprints) {
        await this.db.query(
          `INSERT INTO core.framework_fingerprints 
           (repository_id, framework_type, framework_version, is_custom, package_name, 
            custom_components, dependency_file, config_namespaces, detected_languages, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            repositoryId,
            fingerprint.framework_type,
            fingerprint.framework_version,
            fingerprint.is_custom,
            fingerprint.package_name,
            JSON.stringify(fingerprint.custom_components),
            fingerprint.dependency_file,
            fingerprint.config_namespaces,
            JSON.stringify(fingerprint.detected_languages),
            JSON.stringify(fingerprint.metadata),
          ]
        );
      }

      // Update repository with primary language
      const languages = fingerprints[0]?.detected_languages || {};
      const primaryLanguage = Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] || 'java';

      await this.db.query(`UPDATE core.repositories SET primary_language = $1 WHERE id = $2`, [
        primaryLanguage,
        repositoryId,
      ]);

      const duration = Date.now() - startTime;
      await this.logExtractionComplete(repositoryId, 'RepositoryAnalyzer', duration, fingerprints.length, 0);

      // Extract custom components for pattern mining
      const customComponents: string[] = [];
      for (const fp of fingerprints) {
        if (fp.is_custom) {
          customComponents.push(...fp.custom_components.map((c) => c.name));
        }
      }

      return {
        duration,
        fingerprints,
        primaryLanguage: primaryLanguage as SupportedLanguage,
        customComponents,
      };
    } catch (error) {
      await this.logExtractionError(repositoryId, 'RepositoryAnalyzer', error);
      throw error;
    }
  }

  /**
   * Run ArchitectureExtractor
   */
  private async runArchitectureExtractor(repositoryId: string, repoPath: string) {
    const startTime = Date.now();
    await this.logExtractionStart(repositoryId, 'ArchitectureExtractor');

    try {
      const extractor = new ArchitectureExtractor(repoPath, this.openaiApiKey);
      const patterns = await extractor.extract();

      // Store patterns
      for (const pattern of patterns) {
        await this.db.query(
          `INSERT INTO core.architecture_patterns 
           (repository_id, pattern_type, pattern_name, description, rationale, evidence_source, 
            confidence_score, details, technologies, communication_patterns, principles)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            repositoryId,
            pattern.pattern_type,
            pattern.pattern_name,
            pattern.description,
            pattern.rationale,
            pattern.evidence_source,
            pattern.confidence_score,
            JSON.stringify(pattern.details),
            JSON.stringify(pattern.technologies),
            JSON.stringify(pattern.communication_patterns),
            pattern.principles,
          ]
        );
      }

      const duration = Date.now() - startTime;
      const cost = patterns.length * 0.01; // Approximate cost
      await this.logExtractionComplete(repositoryId, 'ArchitectureExtractor', duration, patterns.length, cost);

      return { duration, patterns, cost };
    } catch (error) {
      await this.logExtractionError(repositoryId, 'ArchitectureExtractor', error);
      throw error;
    }
  }

  /**
   * Run DomainExtractor
   */
  private async runDomainExtractor(repositoryId: string, repoPath: string, primaryLanguage: SupportedLanguage) {
    const startTime = Date.now();
    await this.logExtractionStart(repositoryId, 'DomainExtractor');

    try {
      const extractor = new DomainExtractor(repoPath, this.openaiApiKey, primaryLanguage);
      const domains = await extractor.extract();

      // Store domains
      for (const domain of domains) {
        await this.db.query(
          `INSERT INTO core.domain_models 
           (repository_id, domain_name, summary, entities, services, relationships, business_rules, operations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            repositoryId,
            domain.domain_name,
            domain.summary,
            JSON.stringify(domain.entities),
            JSON.stringify(domain.services),
            JSON.stringify(domain.relationships),
            domain.business_rules,
            domain.operations,
          ]
        );
      }

      const duration = Date.now() - startTime;
      const cost = domains.length * 0.02;
      await this.logExtractionComplete(repositoryId, 'DomainExtractor', duration, domains.length, cost);

      return { duration, domains, cost };
    } catch (error) {
      await this.logExtractionError(repositoryId, 'DomainExtractor', error);
      throw error;
    }
  }

  /**
   * Run PatternMiner
   */
  private async runPatternMiner(
    repositoryId: string,
    repoPath: string,
    primaryLanguage: SupportedLanguage,
    customComponents: string[]
  ) {
    const startTime = Date.now();
    await this.logExtractionStart(repositoryId, 'PatternMiner');

    try {
      const miner = new PatternMiner(repoPath, this.openaiApiKey, primaryLanguage);
      const patterns = await miner.extract(customComponents);

      // Store patterns
      for (const pattern of patterns) {
        await this.db.query(
          `INSERT INTO core.code_patterns 
           (repository_id, pattern_name, language, category, frequency, is_standard, template, 
            explanation, when_to_use, configuration_options, examples, variations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            repositoryId,
            pattern.pattern_name,
            pattern.language,
            pattern.category,
            pattern.frequency,
            pattern.is_standard,
            pattern.template,
            pattern.explanation,
            pattern.when_to_use,
            JSON.stringify(pattern.configuration_options),
            JSON.stringify(pattern.examples),
            JSON.stringify(pattern.variations),
          ]
        );
      }

      const duration = Date.now() - startTime;
      const cost = patterns.length * 0.05;
      await this.logExtractionComplete(repositoryId, 'PatternMiner', duration, patterns.length, cost);

      return { duration, patterns, cost };
    } catch (error) {
      await this.logExtractionError(repositoryId, 'PatternMiner', error);
      throw error;
    }
  }

  /**
   * Run APISpecExtractor
   */
  private async runAPISpecExtractor(repositoryId: string, repoPath: string) {
    const startTime = Date.now();
    await this.logExtractionStart(repositoryId, 'APISpecExtractor');

    try {
      const extractor = new APISpecExtractor(repoPath, this.openaiApiKey);
      const specs = await extractor.extract();

      // Store specs
      for (const spec of specs) {
        await this.db.query(
          `INSERT INTO core.api_specifications 
           (repository_id, api_name, base_url, version, authentication_method, endpoints, 
            common_headers, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            repositoryId,
            spec.api_name,
            spec.base_url,
            spec.version,
            spec.authentication_method,
            JSON.stringify(spec.endpoints),
            JSON.stringify(spec.common_headers),
            spec.source,
          ]
        );
      }

      const duration = Date.now() - startTime;
      const cost = specs.length * 0.05;
      await this.logExtractionComplete(repositoryId, 'APISpecExtractor', duration, specs.length, cost);

      return { duration, specs, cost };
    } catch (error) {
      await this.logExtractionError(repositoryId, 'APISpecExtractor', error);
      throw error;
    }
  }

  /**
   * Update repository status
   */
  private async updateRepositoryStatus(repositoryId: string, status: string) {
    await this.db.query(`UPDATE core.repositories SET extraction_status = $1 WHERE id = $2`, [status, repositoryId]);
  }

  /**
   * Update repository on completion
   */
  private async updateRepositoryCompletion(
    repositoryId: string,
    status: string,
    duration: number,
    cost: number
  ) {
    await this.db.query(
      `UPDATE core.repositories 
       SET extraction_status = $1, analyzed_at = NOW(), extraction_duration_ms = $2, extraction_cost_usd = $3
       WHERE id = $4`,
      [status, duration, cost, repositoryId]
    );
  }

  /**
   * Log extraction start
   */
  private async logExtractionStart(repositoryId: string, component: string) {
    await this.db.query(
      `INSERT INTO core.extraction_logs (repository_id, component, status, started_at)
       VALUES ($1, $2, 'started', NOW())`,
      [repositoryId, component]
    );
  }

  /**
   * Log extraction completion
   */
  private async logExtractionComplete(
    repositoryId: string,
    component: string,
    duration: number,
    itemsExtracted: number,
    cost: number
  ) {
    await this.db.query(
      `UPDATE core.extraction_logs 
       SET status = 'completed', completed_at = NOW(), duration_ms = $3, items_extracted = $4, cost_usd = $5
       WHERE repository_id = $1 AND component = $2 AND status = 'started'`,
      [repositoryId, component, duration, itemsExtracted, cost]
    );
  }

  /**
   * Log extraction error
   */
  private async logExtractionError(repositoryId: string, component: string, error: any) {
    await this.db.query(
      `UPDATE core.extraction_logs 
       SET status = 'failed', completed_at = NOW(), errors = $3
       WHERE repository_id = $1 AND component = $2 AND status = 'started'`,
      [repositoryId, component, JSON.stringify([{ message: error.message, stack: error.stack }])]
    );
  }
}

