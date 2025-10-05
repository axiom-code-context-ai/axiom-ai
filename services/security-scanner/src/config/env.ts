import { z } from 'zod'
import { logger } from '../utils/logger.js'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(6000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  
  // Database
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('axiom'),
  DB_USER: z.string().default('axiom'),
  DB_PASSWORD: z.string().default(''),
  
  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
})

export type Env = z.infer<typeof envSchema>

export function validateEnvironment(): Env {
  try {
    const env = envSchema.parse(process.env)
    logger.info('Environment validated successfully')
    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n')
      logger.error({ errors }, 'Environment validation failed')
      throw new Error(`Environment validation failed:\n${errors}`)
    }
    throw error
  }
}

export const env = validateEnvironment()
