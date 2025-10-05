import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('queues')

export interface QueueManager {
  crawlQueue: any
  analysisQueue: any
}

export async function initializeQueues(): Promise<QueueManager> {
  logger.info('Initializing job queues (simplified mode)')
  
  // Return mock queues for now
  return {
    crawlQueue: {
      close: () => Promise.resolve(),
      add: (job: any) => {
        logger.info({ job }, 'Mock crawl job added')
        return Promise.resolve()
      }
    },
    analysisQueue: {
      close: () => Promise.resolve(),
      add: (job: any) => {
        logger.info({ job }, 'Mock analysis job added')
        return Promise.resolve()
      }
    }
  }
}