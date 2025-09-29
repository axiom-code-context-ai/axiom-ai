import { z } from 'zod'

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // External Services
  SEARCH_API_URL: z.string().url().default('http://localhost:4000'),
  SECURITY_API_URL: z.string().url().default('http://localhost:4002'),
  WEB_PORTAL_URL: z.string().url().default('http://localhost:3000'),

  // LLM Providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().default('gpt-4'),

  // Authentication
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),

  // MCP Configuration
  MCP_SERVER_NAME: z.string().default('Axiom AI'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),
  MAX_CONTEXT_LENGTH: z.coerce.number().default(100000), // tokens
  MAX_SEARCH_RESULTS: z.coerce.number().default(50),
  CONTEXT_WINDOW_SIZE: z.coerce.number().default(8192), // tokens

  // Performance
  REQUEST_TIMEOUT: z.coerce.number().default(30000), // 30 seconds
  MAX_CONCURRENT_REQUESTS: z.coerce.number().default(10),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Security
  RATE_LIMIT_MAX: z.coerce.number().default(100),
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
