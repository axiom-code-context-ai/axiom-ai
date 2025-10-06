import { exec } from 'child_process'
import { promisify } from 'util'
import { Pool } from 'pg'
import { createModuleLogger } from '../utils/logger.js'
import crypto from 'crypto'

const execAsync = promisify(exec)
const logger = createModuleLogger('workspace-detector')

export interface DetectedWorkspace {
  id: string
  name: string
  gitUrl: string
  localPath: string
}

export class WorkspaceDetector {
  private db: Pool
  private cachedWorkspace: DetectedWorkspace | null = null

  constructor(db: Pool) {
    this.db = db
  }

  /**
   * Auto-detect the current Git repository and return/create workspace
   */
  async detectAndGetWorkspace(): Promise<DetectedWorkspace | null> {
    // Return cached if available
    if (this.cachedWorkspace) {
      return this.cachedWorkspace
    }

    try {
      // Try to detect from environment variable (set by Cursor/IDE)
      const workspacePath = process.env.CURSOR_WORKSPACE_PATH || process.cwd()
      
      logger.info('Detecting Git repository', { workspacePath })

      // Get Git remote URL
      const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', {
        cwd: workspacePath,
        timeout: 5000,
      }).catch(() => ({ stdout: '' }))

      if (!remoteUrl.trim()) {
        logger.warn('No Git remote URL found')
        return null
      }

      const gitUrl = remoteUrl.trim()
      const repoName = this.extractRepoName(gitUrl)

      logger.info('Git repository detected', { gitUrl, repoName })

      // Find or create workspace
      const workspace = await this.findOrCreateWorkspace(gitUrl, repoName, workspacePath)
      
      this.cachedWorkspace = workspace
      return workspace
    } catch (error) {
      logger.error('Failed to detect workspace:', error)
      return null
    }
  }

  /**
   * Find existing workspace or create new one
   */
  private async findOrCreateWorkspace(
    gitUrl: string,
    name: string,
    localPath: string
  ): Promise<DetectedWorkspace> {
    try {
      // Generate consistent workspace ID from Git URL
      const workspaceId = this.generateWorkspaceId(gitUrl)

      // Check if workspace exists
      const existing = await this.db.query(
        `SELECT id, name, git_url, local_path 
         FROM workspaces 
         WHERE id = $1 OR git_url = $2 
         LIMIT 1`,
        [workspaceId, gitUrl]
      )

      if (existing.rows.length > 0) {
        const row = existing.rows[0]
        logger.info('Found existing workspace', { id: row.id, name: row.name })
        return {
          id: row.id,
          name: row.name,
          gitUrl: row.git_url,
          localPath: row.local_path || localPath,
        }
      }

      // Create new workspace
      logger.info('Creating new workspace', { id: workspaceId, name, gitUrl })
      
      await this.db.query(
        `INSERT INTO workspaces (id, name, git_url, local_path, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [workspaceId, name, gitUrl, localPath]
      )

      return {
        id: workspaceId,
        name,
        gitUrl,
        localPath,
      }
    } catch (error) {
      logger.error('Failed to find/create workspace:', error)
      throw error
    }
  }

  /**
   * Extract repository name from Git URL
   */
  private extractRepoName(gitUrl: string): string {
    // Remove .git suffix
    const urlWithoutGit = gitUrl.replace(/\.git$/, '')
    
    // Extract last part of path
    const parts = urlWithoutGit.split('/')
    const repoName = parts[parts.length - 1] || 'unknown-repo'
    
    return repoName
  }

  /**
   * Generate consistent workspace ID from Git URL
   */
  private generateWorkspaceId(gitUrl: string): string {
    // Normalize URL (remove .git, lowercase, trim)
    const normalized = gitUrl.toLowerCase().replace(/\.git$/, '').trim()
    
    // Generate UUID v5 from URL (deterministic)
    const hash = crypto.createHash('sha256').update(normalized).digest('hex')
    
    // Format as UUID
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-')
  }

  /**
   * Clear cached workspace
   */
  clearCache(): void {
    this.cachedWorkspace = null
  }
}

