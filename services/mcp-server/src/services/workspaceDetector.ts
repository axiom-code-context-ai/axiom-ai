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

      // Check if a repository with this URL already exists
      const existingRepo = await this.db.query(
        `SELECT r.id, r.workspace_id, r.url, r.local_path, w.name as workspace_name
         FROM core.repositories r
         JOIN core.workspaces w ON w.id = r.workspace_id
         WHERE r.url = $1 AND r.is_active = true
         LIMIT 1`,
        [gitUrl]
      )

      if (existingRepo.rows.length > 0) {
        const row = existingRepo.rows[0]
        logger.info('Found existing workspace via repository', { 
          workspaceId: row.workspace_id, 
          workspaceName: row.workspace_name,
          gitUrl: row.url
        })
        return {
          id: row.workspace_id,
          name: row.workspace_name,
          gitUrl: row.url,
          localPath: row.local_path || localPath,
        }
      }

      // No existing repository found - create workspace and repository
      logger.info('Creating new workspace and repository', { id: workspaceId, name, gitUrl })
      
      // First, check if workspace exists
      const existingWorkspace = await this.db.query(
        `SELECT id, name FROM core.workspaces WHERE id = $1`,
        [workspaceId]
      )

      let finalWorkspaceId = workspaceId

      if (existingWorkspace.rows.length === 0) {
        // Create workspace (without git_url column)
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        await this.db.query(
          `INSERT INTO core.workspaces (id, enterprise_id, name, slug, description, is_active, created_at, updated_at)
           VALUES ($1, '00000000-0000-0000-0000-000000000001', $2, $3, $4, true, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [workspaceId, name, slug, `Auto-detected from ${gitUrl}`]
        )
        logger.info('Created new workspace', { id: workspaceId, name, slug })
      } else {
        finalWorkspaceId = existingWorkspace.rows[0].id
        logger.info('Using existing workspace', { id: finalWorkspaceId })
      }

      // Create repository linked to workspace
      await this.db.query(
        `INSERT INTO core.repositories (workspace_id, name, url, branch, auth_type, auth_config, local_path, sync_status, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'main', 'none', '{}', $4, 'pending', true, NOW(), NOW())
         ON CONFLICT (workspace_id, url) DO NOTHING`,
        [finalWorkspaceId, name, gitUrl, localPath]
      )
      logger.info('Created repository', { workspaceId: finalWorkspaceId, name, gitUrl })

      return {
        id: finalWorkspaceId,
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


