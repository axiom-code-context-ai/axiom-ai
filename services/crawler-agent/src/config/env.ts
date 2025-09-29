import { z } from 'zod'

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(4001),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Git Authentication
  GITHUB_TOKEN: z.string().optional(),
  GITLAB_TOKEN: z.string().optional(),
  BITBUCKET_USERNAME: z.string().optional(),
  BITBUCKET_APP_PASSWORD: z.string().optional(),

  // Processing Limits
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  MAX_REPO_SIZE: z.coerce.number().default(1024 * 1024 * 1024), // 1GB
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
  MAX_JOB_RETRIES: z.coerce.number().default(3),
  JOB_TIMEOUT: z.coerce.number().default(300000), // 5 minutes

  // Storage Paths
  REPO_STORAGE_PATH: z.string().default('/data/repos'),
  CACHE_STORAGE_PATH: z.string().default('/data/cache'),

  // External Services
  EMBEDDING_API_URL: z.string().url().default('http://localhost:4003'),

  // Security
  ENCRYPTION_KEY: z.string().min(32),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
})

export type Environment = z.infer<typeof envSchema>

export function validateEnvironment(): Environment {
  const result = envSchema.safeParse(process.env)
  
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n')
    throw new Error(`Environment validation failed:\n${errors}`)
  }
  
  return result.data
}

export const env = validateEnvironment()
