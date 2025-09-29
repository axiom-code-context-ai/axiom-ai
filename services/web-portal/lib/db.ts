import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Connection test function
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

// Database health check
export async function getDatabaseHealth(): Promise<{
  connected: boolean
  latency?: number
  error?: string
}> {
  const start = Date.now()
  
  try {
    await db.$queryRaw`SELECT 1`
    const latency = Date.now() - start
    
    return {
      connected: true,
      latency,
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await db.$disconnect()
  } catch (error) {
    console.error('Error disconnecting from database:', error)
  }
}

// Handle process termination
process.on('beforeExit', () => {
  disconnectDatabase()
})

process.on('SIGINT', () => {
  disconnectDatabase()
  process.exit(0)
})

process.on('SIGTERM', () => {
  disconnectDatabase()
  process.exit(0)
})
