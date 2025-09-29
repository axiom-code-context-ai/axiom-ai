import Bull from 'bull'
import Redis from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// Job processors
import { processSyncJob } from '../workers/syncWorker.js'
import { processEmbeddingJob } from '../workers/embeddingWorker.js'
import { processSecurityJob } from '../workers/securityWorker.js'

// Job types
export interface SyncJobData {
  repositoryId: string
  type: 'full' | 'incremental'
  force?: boolean
}

export interface EmbeddingJobData {
  repositoryId: string
  filePaths: string[]
  batchSize?: number
}

export interface SecurityJobData {
  repositoryId: string
  scanTypes: ('owasp' | 'cve' | 'dependency' | 'compliance')[]
}

export interface QueueSystem {
  syncQueue: Bull.Queue<SyncJobData>
  embeddingQueue: Bull.Queue<EmbeddingJobData>
  securityQueue: Bull.Queue<SecurityJobData>
}

export async function initializeQueues(): Promise<QueueSystem> {
  // Create Redis connection
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  })

  // Test Redis connection
  try {
    await redis.ping()
    logger.info('Redis connection established')
  } catch (error) {
    logger.error('Failed to connect to Redis:', error)
    throw error
  }

  // Queue configuration
  const queueConfig = {
    redis: env.REDIS_URL,
    defaultJobOptions: {
      attempts: env.MAX_JOB_RETRIES,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 50,
      removeOnFail: 20,
      timeout: env.JOB_TIMEOUT,
    },
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    }
  }

  // Create queues
  const syncQueue = new Bull<SyncJobData>('sync-queue', queueConfig)
  const embeddingQueue = new Bull<EmbeddingJobData>('embedding-queue', queueConfig)
  const securityQueue = new Bull<SecurityJobData>('security-queue', queueConfig)

  // Setup queue processors
  syncQueue.process('sync-repository', env.QUEUE_CONCURRENCY, processSyncJob)
  embeddingQueue.process('generate-embeddings', env.QUEUE_CONCURRENCY, processEmbeddingJob)
  securityQueue.process('security-scan', env.QUEUE_CONCURRENCY, processSecurityJob)

  // Queue event handlers
  const setupQueueEvents = (queue: Bull.Queue, name: string) => {
    const queueLogger = logger.child({ queue: name })

    queue.on('ready', () => {
      queueLogger.info('Queue is ready')
    })

    queue.on('error', (error) => {
      queueLogger.error(error, 'Queue error')
    })

    queue.on('waiting', (jobId) => {
      queueLogger.debug({ jobId }, 'Job is waiting')
    })

    queue.on('active', (job) => {
      queueLogger.info({ jobId: job.id, data: job.data }, 'Job started')
    })

    queue.on('completed', (job, result) => {
      queueLogger.info({ jobId: job.id, processingTime: job.processedOn! - job.processedOn! }, 'Job completed')
    })

    queue.on('failed', (job, error) => {
      queueLogger.error({ 
        jobId: job?.id, 
        error: error.message, 
        attempts: job?.attemptsMade,
        data: job?.data 
      }, 'Job failed')
    })

    queue.on('progress', (job, progress) => {
      queueLogger.debug({ jobId: job.id, progress }, 'Job progress')
    })

    queue.on('stalled', (job) => {
      queueLogger.warn({ jobId: job.id }, 'Job stalled')
    })
  }

  setupQueueEvents(syncQueue, 'sync')
  setupQueueEvents(embeddingQueue, 'embedding')
  setupQueueEvents(securityQueue, 'security')

  // Health check for queues
  const checkQueueHealth = async (queue: Bull.Queue, name: string) => {
    try {
      const health = await queue.checkHealth()
      logger.debug({ queue: name, health }, 'Queue health check')
      return health
    } catch (error) {
      logger.error({ queue: name, error }, 'Queue health check failed')
      throw error
    }
  }

  // Periodic health checks
  setInterval(async () => {
    try {
      await Promise.all([
        checkQueueHealth(syncQueue, 'sync'),
        checkQueueHealth(embeddingQueue, 'embedding'),
        checkQueueHealth(securityQueue, 'security'),
      ])
    } catch (error) {
      logger.error('Queue health check failed:', error)
    }
  }, 60000) // Check every minute

  logger.info('All queues initialized successfully')

  return {
    syncQueue,
    embeddingQueue,
    securityQueue,
  }
}

// Queue management utilities
export class QueueManager {
  constructor(private queues: QueueSystem) {}

  async getQueueStats() {
    const [syncStats, embeddingStats, securityStats] = await Promise.all([
      this.getQueueStat(this.queues.syncQueue),
      this.getQueueStat(this.queues.embeddingQueue),
      this.getQueueStat(this.queues.securityQueue),
    ])

    return {
      sync: syncStats,
      embedding: embeddingStats,
      security: securityStats,
    }
  }

  private async getQueueStat(queue: Bull.Queue) {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.getPaused(),
    ])

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused.length,
    }
  }

  async pauseQueue(queueName: keyof QueueSystem) {
    const queue = this.queues[queueName]
    await queue.pause()
    logger.info(`Queue ${queueName} paused`)
  }

  async resumeQueue(queueName: keyof QueueSystem) {
    const queue = this.queues[queueName]
    await queue.resume()
    logger.info(`Queue ${queueName} resumed`)
  }

  async clearQueue(queueName: keyof QueueSystem, state?: 'waiting' | 'active' | 'completed' | 'failed') {
    const queue = this.queues[queueName]
    
    if (state) {
      await queue.clean(0, state)
      logger.info(`Cleared ${state} jobs from ${queueName} queue`)
    } else {
      await queue.empty()
      logger.info(`Cleared all jobs from ${queueName} queue`)
    }
  }

  async retryFailedJobs(queueName: keyof QueueSystem) {
    const queue = this.queues[queueName]
    const failedJobs = await queue.getFailed()
    
    for (const job of failedJobs) {
      await job.retry()
    }
    
    logger.info(`Retried ${failedJobs.length} failed jobs in ${queueName} queue`)
  }
}
