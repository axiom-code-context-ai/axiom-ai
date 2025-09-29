import { simpleGit, SimpleGit, CleanOptions } from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'
import CryptoJS from 'crypto-js'

const logger = createModuleLogger('git-service')

export interface GitAuthConfig {
  type: 'ssh' | 'token' | 'oauth' | 'basic'
  username?: string
  password?: string
  token?: string
  privateKey?: string
  passphrase?: string
}

export interface CloneOptions {
  branch?: string
  depth?: number
  singleBranch?: boolean
}

export interface RepoInfo {
  url: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'other'
  owner: string
  name: string
  branch?: string
}

export class GitService {
  private git: SimpleGit

  constructor(private workingDir: string) {
    this.git = simpleGit({
      baseDir: workingDir,
      binary: 'git',
      maxConcurrentProcesses: env.QUEUE_CONCURRENCY,
      timeout: {
        block: env.JOB_TIMEOUT,
      },
    })
  }

  /**
   * Parse Git repository URL to extract information
   */
  static parseRepoUrl(url: string): RepoInfo {
    // GitHub patterns
    const githubHttps = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?(?:\/tree\/([^\/]+))?/)
    const githubSsh = url.match(/git@github\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?/)
    
    if (githubHttps) {
      return {
        url: url,
        provider: 'github',
        owner: githubHttps[1],
        name: githubHttps[2],
        branch: githubHttps[3],
      }
    }
    
    if (githubSsh) {
      return {
        url: url,
        provider: 'github',
        owner: githubSsh[1],
        name: githubSsh[2],
      }
    }

    // GitLab patterns
    const gitlabHttps = url.match(/https:\/\/gitlab\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?(?:\/-\/tree\/([^\/]+))?/)
    const gitlabSsh = url.match(/git@gitlab\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?/)
    
    if (gitlabHttps) {
      return {
        url: url,
        provider: 'gitlab',
        owner: gitlabHttps[1],
        name: gitlabHttps[2],
        branch: gitlabHttps[3],
      }
    }
    
    if (gitlabSsh) {
      return {
        url: url,
        provider: 'gitlab',
        owner: gitlabSsh[1],
        name: gitlabSsh[2],
      }
    }

    // Bitbucket patterns
    const bitbucketHttps = url.match(/https:\/\/bitbucket\.org\/([^\/]+)\/([^\/\.]+)(?:\.git)?(?:\/src\/([^\/]+))?/)
    const bitbucketSsh = url.match(/git@bitbucket\.org:([^\/]+)\/([^\/\.]+)(?:\.git)?/)
    
    if (bitbucketHttps) {
      return {
        url: url,
        provider: 'bitbucket',
        owner: bitbucketHttps[1],
        name: bitbucketHttps[2],
        branch: bitbucketHttps[3],
      }
    }
    
    if (bitbucketSsh) {
      return {
        url: url,
        provider: 'bitbucket',
        owner: bitbucketSsh[1],
        name: bitbucketSsh[2],
      }
    }

    // Generic Git URL
    const genericMatch = url.match(/([^\/]+)\/([^\/\.]+)(?:\.git)?$/)
    if (genericMatch) {
      return {
        url: url,
        provider: 'other',
        owner: genericMatch[1],
        name: genericMatch[2],
      }
    }

    throw new Error(`Unable to parse repository URL: ${url}`)
  }

  /**
   * Decrypt authentication configuration
   */
  private decryptAuthConfig(encryptedConfig: string): GitAuthConfig {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedConfig, env.ENCRYPTION_KEY)
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8)
      return JSON.parse(decryptedData)
    } catch (error) {
      logger.error('Failed to decrypt auth config:', error)
      throw new Error('Invalid authentication configuration')
    }
  }

  /**
   * Setup Git authentication based on configuration
   */
  private async setupAuthentication(authConfig: GitAuthConfig, repoUrl: string): Promise<string> {
    const repoInfo = GitService.parseRepoUrl(repoUrl)
    
    switch (authConfig.type) {
      case 'token':
        // Use token authentication for HTTPS URLs
        if (repoInfo.provider === 'github' && authConfig.token) {
          return repoUrl.replace('https://github.com/', `https://${authConfig.token}@github.com/`)
        }
        if (repoInfo.provider === 'gitlab' && authConfig.token) {
          return repoUrl.replace('https://gitlab.com/', `https://oauth2:${authConfig.token}@gitlab.com/`)
        }
        if (repoInfo.provider === 'bitbucket' && authConfig.username && authConfig.password) {
          return repoUrl.replace('https://bitbucket.org/', `https://${authConfig.username}:${authConfig.password}@bitbucket.org/`)
        }
        break

      case 'ssh':
        // SSH authentication requires key setup
        if (authConfig.privateKey) {
          const sshDir = path.join(process.env.HOME || '/root', '.ssh')
          const keyPath = path.join(sshDir, 'axiom_git_key')
          
          await fs.mkdir(sshDir, { recursive: true, mode: 0o700 })
          await fs.writeFile(keyPath, authConfig.privateKey, { mode: 0o600 })
          
          // Setup SSH config
          const sshConfig = `
Host ${repoInfo.provider}.com
  HostName ${repoInfo.provider}.com
  User git
  IdentityFile ${keyPath}
  IdentitiesOnly yes
  StrictHostKeyChecking no
`
          await fs.writeFile(path.join(sshDir, 'config'), sshConfig, { mode: 0o600 })
        }
        return repoUrl

      case 'basic':
        // Basic authentication
        if (authConfig.username && authConfig.password) {
          const url = new URL(repoUrl)
          url.username = authConfig.username
          url.password = authConfig.password
          return url.toString()
        }
        break

      case 'oauth':
        // OAuth token authentication
        if (authConfig.token) {
          const url = new URL(repoUrl)
          url.username = authConfig.token
          url.password = 'x-oauth-basic'
          return url.toString()
        }
        break
    }

    return repoUrl
  }

  /**
   * Clone a repository with authentication
   */
  async cloneRepository(
    repoUrl: string, 
    localPath: string, 
    authConfig: GitAuthConfig,
    options: CloneOptions = {}
  ): Promise<void> {
    const startTime = Date.now()
    logger.info({ repoUrl, localPath, options }, 'Starting repository clone')

    try {
      // Setup authentication
      const authenticatedUrl = await this.setupAuthentication(authConfig, repoUrl)
      
      // Ensure target directory doesn't exist
      try {
        await fs.access(localPath)
        logger.warn({ localPath }, 'Target directory exists, removing')
        await fs.rm(localPath, { recursive: true, force: true })
      } catch {
        // Directory doesn't exist, which is fine
      }

      // Clone options
      const cloneOptions = [
        authenticatedUrl,
        localPath,
      ]

      if (options.branch) {
        cloneOptions.push('--branch', options.branch)
      }

      if (options.depth) {
        cloneOptions.push('--depth', options.depth.toString())
      }

      if (options.singleBranch) {
        cloneOptions.push('--single-branch')
      }

      // Perform clone
      await this.git.clone(authenticatedUrl, localPath, {
        '--branch': options.branch,
        '--depth': options.depth,
        '--single-branch': options.singleBranch ? null : undefined,
      })

      const duration = Date.now() - startTime
      logger.info({ repoUrl, localPath, duration }, 'Repository cloned successfully')

    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({ repoUrl, localPath, error, duration }, 'Repository clone failed')
      throw error
    }
  }

  /**
   * Pull latest changes from repository
   */
  async pullRepository(localPath: string, authConfig: GitAuthConfig): Promise<void> {
    const startTime = Date.now()
    logger.info({ localPath }, 'Pulling repository changes')

    try {
      const git = simpleGit(localPath)
      
      // Get remote URL
      const remotes = await git.getRemotes(true)
      const origin = remotes.find(remote => remote.name === 'origin')
      
      if (!origin) {
        throw new Error('No origin remote found')
      }

      // Setup authentication for the remote URL
      const authenticatedUrl = await this.setupAuthentication(authConfig, origin.refs.fetch)
      
      // Update remote URL with authentication
      await git.remote(['set-url', 'origin', authenticatedUrl])
      
      // Pull changes
      await git.pull('origin', undefined, {
        '--rebase': 'false',
      })

      const duration = Date.now() - startTime
      logger.info({ localPath, duration }, 'Repository pulled successfully')

    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({ localPath, error, duration }, 'Repository pull failed')
      throw error
    }
  }

  /**
   * Get repository status and information
   */
  async getRepositoryInfo(localPath: string) {
    try {
      const git = simpleGit(localPath)
      
      const [status, log, remotes, branches] = await Promise.all([
        git.status(),
        git.log({ maxCount: 1 }),
        git.getRemotes(true),
        git.branch(['-a']),
      ])

      return {
        status,
        latestCommit: log.latest,
        remotes,
        branches: branches.all,
        currentBranch: branches.current,
        isClean: status.isClean(),
        ahead: status.ahead,
        behind: status.behind,
      }
    } catch (error) {
      logger.error({ localPath, error }, 'Failed to get repository info')
      throw error
    }
  }

  /**
   * Get changed files since last commit
   */
  async getChangedFiles(localPath: string, since?: string): Promise<string[]> {
    try {
      const git = simpleGit(localPath)
      
      let command = ['diff', '--name-only']
      if (since) {
        command.push(since)
      }

      const result = await git.raw(command)
      return result.trim().split('\n').filter(Boolean)
    } catch (error) {
      logger.error({ localPath, error }, 'Failed to get changed files')
      throw error
    }
  }

  /**
   * Get file content at specific commit
   */
  async getFileAtCommit(localPath: string, filePath: string, commit?: string): Promise<string> {
    try {
      const git = simpleGit(localPath)
      const ref = commit ? `${commit}:${filePath}` : filePath
      return await git.show([ref])
    } catch (error) {
      logger.error({ localPath, filePath, commit, error }, 'Failed to get file content')
      throw error
    }
  }

  /**
   * Clean repository working directory
   */
  async cleanRepository(localPath: string): Promise<void> {
    try {
      const git = simpleGit(localPath)
      await git.clean(CleanOptions.FORCE + CleanOptions.RECURSIVE + CleanOptions.IGNORED_INCLUDED)
      logger.info({ localPath }, 'Repository cleaned')
    } catch (error) {
      logger.error({ localPath, error }, 'Failed to clean repository')
      throw error
    }
  }
}
