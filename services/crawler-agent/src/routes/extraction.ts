/**
 * Extraction Management API Routes
 * Endpoints for triggering and monitoring extraction pipeline
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ExtractionOrchestrator } from '../orchestrator/ExtractionOrchestrator.js';
import { logger } from '../utils/logger.js';
import Bull from 'bull';

// Request schemas
const TriggerExtractionSchema = z.object({
  repository_id: z.string().uuid(),
  git_url: z.string().url(),
  priority: z.number().min(0).max(10).default(5),
});

const GetExtractionStatusSchema = z.object({
  repository_id: z.string().uuid(),
});

/**
 * Register extraction routes
 */
export async function registerExtractionRoutes(app: FastifyInstance) {
  // Create extraction queue
  const extractionQueue = new Bull('extraction', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });

  /**
   * POST /api/extraction/trigger
   * Trigger extraction pipeline for a repository
   */
  app.post(
    '/api/extraction/trigger',
    async (request: FastifyRequest<{ Body: z.infer<typeof TriggerExtractionSchema> }>, reply: FastifyReply) => {
      try {
        const { repository_id, git_url, priority } = TriggerExtractionSchema.parse(request.body);

        logger.info('Triggering extraction', { repository_id, git_url });

        // Add job to queue
        const job = await extractionQueue.add(
          'extract',
          {
            repository_id,
            git_url,
          },
          {
            priority,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 60000, // 1 minute
            },
          }
        );

        // Update repository status to pending
        await app.pg.query(`UPDATE core.repositories SET extraction_status = 'pending' WHERE id = $1`, [repository_id]);

        reply.code(202).send({
          success: true,
          message: 'Extraction queued successfully',
          data: {
            job_id: job.id,
            repository_id,
            status: 'queued',
            priority,
          },
        });
      } catch (error) {
        logger.error('Failed to trigger extraction:', error);
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to trigger extraction',
        });
      }
    }
  );

  /**
   * GET /api/extraction/status/:repository_id
   * Get extraction status for a repository
   */
  app.get('/api/extraction/status/:repository_id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { repository_id } = request.params as { repository_id: string };

      // Get repository status
      const repoResult = await app.pg.query(
        `SELECT id, name, extraction_status, analyzed_at, extraction_duration_ms, extraction_cost_usd
         FROM core.repositories
         WHERE id = $1`,
        [repository_id]
      );

      if (repoResult.rows.length === 0) {
        reply.code(404).send({
          success: false,
          error: 'Repository not found',
        });
        return;
      }

      const repo = repoResult.rows[0];

      // Get extraction logs
      const logsResult = await app.pg.query(
        `SELECT component, status, duration_ms, items_extracted, cost_usd, started_at, completed_at, errors
         FROM core.extraction_logs
         WHERE repository_id = $1
         ORDER BY started_at DESC`,
        [repository_id]
      );

      reply.send({
        success: true,
        data: {
          repository: {
            id: repo.id,
            name: repo.name,
            extraction_status: repo.extraction_status,
            analyzed_at: repo.analyzed_at,
            duration_ms: repo.extraction_duration_ms,
            cost_usd: repo.extraction_cost_usd,
          },
          components: logsResult.rows,
        },
      });
    } catch (error) {
      logger.error('Failed to get extraction status:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get extraction status',
      });
    }
  });

  /**
   * GET /api/extraction/logs/:repository_id
   * Get detailed extraction logs
   */
  app.get('/api/extraction/logs/:repository_id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { repository_id } = request.params as { repository_id: string };

      const logsResult = await app.pg.query(
        `SELECT * FROM core.extraction_logs
         WHERE repository_id = $1
         ORDER BY started_at DESC
         LIMIT 100`,
        [repository_id]
      );

      reply.send({
        success: true,
        data: {
          logs: logsResult.rows,
        },
      });
    } catch (error) {
      logger.error('Failed to get extraction logs:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get extraction logs',
      });
    }
  });

  /**
   * GET /api/extraction/stats/:repository_id
   * Get extraction statistics
   */
  app.get('/api/extraction/stats/:repository_id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { repository_id } = request.params as { repository_id: string };

      // Get counts from all tables
      const [
        frameworksResult,
        architectureResult,
        domainsResult,
        patternsResult,
        apisResult,
      ] = await Promise.all([
        app.pg.query(`SELECT COUNT(*) as count FROM core.framework_fingerprints WHERE repository_id = $1`, [
          repository_id,
        ]),
        app.pg.query(`SELECT COUNT(*) as count FROM core.architecture_patterns WHERE repository_id = $1`, [
          repository_id,
        ]),
        app.pg.query(`SELECT COUNT(*) as count FROM core.domain_models WHERE repository_id = $1`, [repository_id]),
        app.pg.query(`SELECT COUNT(*) as count FROM core.code_patterns WHERE repository_id = $1`, [repository_id]),
        app.pg.query(`SELECT COUNT(*) as count FROM core.api_specifications WHERE repository_id = $1`, [
          repository_id,
        ]),
      ]);

      // Get pattern statistics
      const patternStatsResult = await app.pg.query(
        `SELECT 
          COUNT(*) FILTER (WHERE is_standard = true) as standard_patterns,
          SUM(frequency) as total_pattern_occurrences
         FROM core.code_patterns
         WHERE repository_id = $1`,
        [repository_id]
      );

      reply.send({
        success: true,
        data: {
          repository_id,
          statistics: {
            frameworks: parseInt(frameworksResult.rows[0].count),
            architecture_patterns: parseInt(architectureResult.rows[0].count),
            domain_models: parseInt(domainsResult.rows[0].count),
            code_patterns: parseInt(patternsResult.rows[0].count),
            api_specifications: parseInt(apisResult.rows[0].count),
            standard_patterns: parseInt(patternStatsResult.rows[0].standard_patterns || 0),
            total_pattern_occurrences: parseInt(patternStatsResult.rows[0].total_pattern_occurrences || 0),
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get extraction stats:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get extraction stats',
      });
    }
  });

  /**
   * DELETE /api/extraction/cache/:repository_id
   * Clear context cache for a repository
   */
  app.delete('/api/extraction/cache/:repository_id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { repository_id } = request.params as { repository_id: string };

      await app.pg.query(`DELETE FROM vector.context_cache WHERE repository_id = $1`, [repository_id]);

      reply.send({
        success: true,
        message: 'Context cache cleared successfully',
      });
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear cache',
      });
    }
  });

  // Process extraction queue
  extractionQueue.process('extract', async (job) => {
    const { repository_id, git_url } = job.data;

    logger.info(`Processing extraction job ${job.id}`, { repository_id, git_url });

    try {
      const orchestrator = new ExtractionOrchestrator(app.pg, process.env.OPENAI_API_KEY || '');

      const progress = await orchestrator.extract(repository_id, git_url);

      logger.info(`Extraction completed for job ${job.id}`, {
        repository_id,
        status: progress.status,
        progress: progress.progress_percentage,
      });

      return {
        success: true,
        progress,
      };
    } catch (error) {
      logger.error(`Extraction failed for job ${job.id}:`, error);
      throw error;
    }
  });

  // Queue event handlers
  extractionQueue.on('completed', (job, result) => {
    logger.info(`Extraction job ${job.id} completed`, result);
  });

  extractionQueue.on('failed', (job, error) => {
    logger.error(`Extraction job ${job.id} failed:`, error);
  });

  extractionQueue.on('stalled', (job) => {
    logger.warn(`Extraction job ${job.id} stalled`);
  });

  logger.info('Extraction routes registered successfully');
}

