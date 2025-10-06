import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('auth-service')

export interface TokenPayload {
  id: string
  workspaceId: string
  userId: string
  permissions: string[]
  type: 'mcp' | 'api'
  expiresAt?: Date
}

export class AuthService {
  private db: PrismaClient

  constructor() {
    this.db = new PrismaClient()
  }

  /**
   * Validate MCP token and return workspace access
   */
  async validateToken(token: string, workspaceId?: string): Promise<boolean> {
    try {
      // First try JWT validation
      if (token.startsWith('eyJ')) {
        return await this.validateJwtToken(token, workspaceId)
      }

      // Then try MCP token validation
      return await this.validateMcpToken(token, workspaceId)
    } catch (error) {
      logger.error('Token validation failed:', error)
      return false
    }
  }

  /**
   * Validate JWT token
   */
  private async validateJwtToken(token: string, workspaceId?: string): Promise<boolean> {
    try {
      if (!env.JWT_SECRET) {
        return false
      }
      const payload = jwt.verify(token, env.JWT_SECRET) as any
      
      if (!payload.id || !payload.workspaceId) {
        return false
      }

      if (workspaceId && payload.workspaceId !== workspaceId) {
        return false
      }

      // Check if user and workspace still exist and are active
      const user = await this.db.user.findFirst({
        where: {
          id: payload.id,
          isActive: true,
        },
        include: {
          workspaces: {
            where: {
              workspaceId: payload.workspaceId,
            },
            include: {
              workspace: {
                select: {
                  isActive: true,
                },
              },
            },
          },
        },
      })

      if (!user || user.workspaces.length === 0 || !user.workspaces[0].workspace.isActive) {
        return false
      }

      logger.debug('JWT token validated successfully', {
        userId: payload.id,
        workspaceId: payload.workspaceId,
      })

      return true
    } catch (error) {
      logger.debug('JWT validation failed:', error)
      return false
    }
  }

  /**
   * Validate MCP token
   */
  private async validateMcpToken(token: string, workspaceId?: string): Promise<boolean> {
    try {
      // Hash the token for database lookup
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

      const mcpToken = await this.db.mcpToken.findFirst({
        where: {
          tokenHash,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          workspace: {
            select: {
              id: true,
              isActive: true,
            },
          },
          user: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      })

      if (!mcpToken || !mcpToken.workspace.isActive || !mcpToken.user.isActive) {
        return false
      }

      if (workspaceId && mcpToken.workspaceId !== workspaceId) {
        return false
      }

      // Update last used timestamp
      await this.db.mcpToken.update({
        where: { id: mcpToken.id },
        data: { lastUsedAt: new Date() },
      })

      logger.debug('MCP token validated successfully', {
        tokenId: mcpToken.id,
        workspaceId: mcpToken.workspaceId,
        userId: mcpToken.userId,
      })

      return true
    } catch (error) {
      logger.debug('MCP token validation failed:', error)
      return false
    }
  }

  /**
   * Get workspace information for authenticated request
   */
  async getWorkspaceInfo(token: string): Promise<{
    id: string
    name: string
    permissions: string[]
  } | null> {
    try {
      let workspaceId: string | null = null
      let permissions: string[] = []

      // Try JWT first
      if (token.startsWith('eyJ')) {
        try {
          if (!env.JWT_SECRET) throw new Error('missing secret')
          const payload = jwt.verify(token, env.JWT_SECRET) as any
          workspaceId = payload.workspaceId
          permissions = payload.permissions || []
        } catch {
          // Fall through to MCP token
        }
      }

      // Try MCP token
      if (!workspaceId) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        const mcpToken = await this.db.mcpToken.findFirst({
          where: {
            tokenHash,
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        })

        if (mcpToken) {
          workspaceId = mcpToken.workspaceId
          permissions = Object.keys(mcpToken.permissions as any || {})
        }
      }

      if (!workspaceId) {
        return null
      }

      // Get workspace details
      const workspace = await this.db.workspace.findFirst({
        where: {
          id: workspaceId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      })

      if (!workspace) {
        return null
      }

      return {
        id: workspace.id,
        name: workspace.name,
        permissions,
      }
    } catch (error) {
      logger.error('Failed to get workspace info:', error)
      return null
    }
  }

  /**
   * Check if token has specific permission
   */
  async hasPermission(token: string, permission: string, workspaceId?: string): Promise<boolean> {
    try {
      const isValid = await this.validateToken(token, workspaceId)
      if (!isValid) {
        return false
      }

      const workspaceInfo = await this.getWorkspaceInfo(token)
      if (!workspaceInfo) {
        return false
      }

      // Check if user has the required permission
      return workspaceInfo.permissions.includes(permission) || 
             workspaceInfo.permissions.includes('*') || // Wildcard permission
             workspaceInfo.permissions.includes('admin') // Admin has all permissions
    } catch (error) {
      logger.error('Permission check failed:', error)
      return false
    }
  }

  /**
   * Generate a new MCP token
   */
  async generateMcpToken(
    userId: string,
    workspaceId: string,
    name: string,
    permissions: Record<string, boolean> = {},
    expiresAt?: Date
  ): Promise<string> {
    try {
      // Generate a secure random token
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

      // Store in database
      await this.db.mcpToken.create({
        data: {
          userId,
          workspaceId,
          name,
          tokenHash,
          permissions,
          expiresAt,
          isActive: true,
        },
      })

      logger.info('MCP token generated successfully', {
        userId,
        workspaceId,
        name,
        expiresAt,
      })

      return token
    } catch (error) {
      logger.error('Failed to generate MCP token:', error)
      throw new Error('Failed to generate authentication token')
    }
  }

  /**
   * Revoke an MCP token
   */
  async revokeMcpToken(tokenId: string): Promise<void> {
    try {
      await this.db.mcpToken.update({
        where: { id: tokenId },
        data: { isActive: false },
      })

      logger.info('MCP token revoked successfully', { tokenId })
    } catch (error) {
      logger.error('Failed to revoke MCP token:', error)
      throw new Error('Failed to revoke authentication token')
    }
  }

  /**
   * List active MCP tokens for a workspace
   */
  async listMcpTokens(workspaceId: string): Promise<Array<{
    id: string
    name: string
    lastUsedAt: Date | null
    expiresAt: Date | null
    createdAt: Date
  }>> {
    try {
      const tokens = await this.db.mcpToken.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return tokens
    } catch (error) {
      logger.error('Failed to list MCP tokens:', error)
      throw new Error('Failed to retrieve authentication tokens')
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await this.db.mcpToken.updateMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      })

      logger.info(`Cleaned up ${result.count} expired MCP tokens`)
      return result.count
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error)
      return 0
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.db.$disconnect()
  }
}
