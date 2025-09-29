import { z } from 'zod'

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(4000),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis Cache
  REDIS_URL: z.string().url(),

  // Search Configuration
  SEARCH_CACHE_TTL: z.coerce.number().default(3600), // 1 hour
  MAX_SEARCH_RESULTS: z.coerce.number().default(100),
  VECTOR_SIMILARITY_THRESHOLD: z.coerce.number().default(0.7),
  KEYWORD_MATCH_THRESHOLD: z.coerce.number().default(0.3),

  // Embedding Configuration
  OPENAI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  // Performance Settings
  MAX_CONCURRENT_SEARCHES: z.coerce.number().default(10),
  SEARCH_TIMEOUT: z.coerce.number().default(30000), // 30 seconds
  BATCH_SIZE: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
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
