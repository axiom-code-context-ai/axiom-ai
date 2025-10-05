import simpleGit from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('repository-analyzer')

export interface AnalysisResult {
  repository: string
  status: string
  filesProcessed: number
  contextGenerated: boolean
  patterns: PatternSummary[]
  codeStats: CodeStats
  fileTree: FileNode[]
  timestamp: string
}

export interface PatternSummary {
  type: string
  count: number
  examples?: string[]
}

export interface CodeStats {
  totalLines: number
  totalFiles: number
  languages: Record<string, number>
  directories: number
}

export interface FileNode {
  path: string
  type: 'file' | 'directory'
  size?: number
  language?: string
}

export class RepositoryAnalyzer {
  private workDir: string

  constructor(workDir: string = '/tmp/axiom-repos') {
    this.workDir = workDir
  }

  async analyzeRepository(gitUrl: string): Promise<AnalysisResult> {
    const repoName = this.extractRepoName(gitUrl)
    const repoPath = path.join(this.workDir, repoName)

    try {
      logger.info({ gitUrl, repoPath }, 'Starting repository analysis')

      // 1. Clone repository
      await this.cloneRepository(gitUrl, repoPath)

      // 2. Analyze file structure
      const fileTree = await this.buildFileTree(repoPath)

      // 3. Collect code statistics
      const codeStats = await this.collectCodeStats(repoPath)

      // 4. Extract patterns (simplified - real TreeSitter would go here)
      const patterns = await this.extractPatterns(repoPath)

      // 5. Generate context summary
      const context = this.generateContext(repoName, codeStats, patterns)

      logger.info({ repoName, filesProcessed: codeStats.totalFiles }, 'Analysis complete')

      return {
        repository: gitUrl,
        status: 'analyzed',
        filesProcessed: codeStats.totalFiles,
        contextGenerated: true,
        patterns,
        codeStats,
        fileTree,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error({ error, gitUrl }, 'Analysis failed')
      throw error
    } finally {
      // Cleanup: remove cloned repo
      await this.cleanup(repoPath)
    }
  }

  private async cloneRepository(gitUrl: string, targetPath: string): Promise<void> {
    logger.info({ gitUrl, targetPath }, 'Cloning repository')

    // Ensure work directory exists
    await fs.mkdir(this.workDir, { recursive: true })

    // Remove existing directory if it exists
    try {
      await fs.rm(targetPath, { recursive: true, force: true })
    } catch (error) {
      // Ignore if directory doesn't exist
    }

    // Clone repository
    const git = simpleGit()
    await git.clone(gitUrl, targetPath, ['--depth', '1'])

    logger.info({ targetPath }, 'Repository cloned successfully')
  }

  private async buildFileTree(repoPath: string): Promise<FileNode[]> {
    const files: FileNode[] = []
    
    const allFiles = await glob('**/*', {
      cwd: repoPath,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.log'],
      nodir: false
    })

    for (const file of allFiles.slice(0, 100)) { // Limit for performance
      const fullPath = path.join(repoPath, file)
      try {
        const stats = await fs.stat(fullPath)
        files.push({
          path: file,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.isFile() ? stats.size : undefined,
          language: stats.isFile() ? this.detectLanguage(file) : undefined
        })
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return files
  }

  private async collectCodeStats(repoPath: string): Promise<CodeStats> {
    const stats: CodeStats = {
      totalLines: 0,
      totalFiles: 0,
      languages: {},
      directories: 0
    }

    const files = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs,cpp,c,h,php,rb,swift,kt}', {
      cwd: repoPath,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    })

    stats.totalFiles = files.length

    for (const file of files.slice(0, 50)) { // Limit for performance
      const fullPath = path.join(repoPath, file)
      try {
        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n').length
        stats.totalLines += lines

        const language = this.detectLanguage(file)
        stats.languages[language] = (stats.languages[language] || 0) + 1
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return stats
  }

  private async extractPatterns(repoPath: string): Promise<PatternSummary[]> {
    // Simplified pattern extraction - real TreeSitter would parse AST
    const patterns: Record<string, { count: number; examples: string[] }> = {
      function: { count: 0, examples: [] },
      class: { count: 0, examples: [] },
      component: { count: 0, examples: [] },
      interface: { count: 0, examples: [] }
    }

    const files = await glob('**/*.{js,ts,jsx,tsx}', {
      cwd: repoPath,
      ignore: ['node_modules/**', '.git/**', 'dist/**']
    })

    for (const file of files.slice(0, 20)) { // Limit for performance
      const fullPath = path.join(repoPath, file)
      try {
        const content = await fs.readFile(fullPath, 'utf-8')

        // Simple regex pattern matching (TreeSitter would be more accurate)
        const functionMatches = content.match(/function\s+(\w+)/g) || []
        const classMatches = content.match(/class\s+(\w+)/g) || []
        const componentMatches = content.match(/(?:export\s+)?(?:const|function)\s+(\w+)\s*=.*(?:React\.FC|Component)/g) || []
        const interfaceMatches = content.match(/interface\s+(\w+)/g) || []

        patterns.function.count += functionMatches.length
        patterns.class.count += classMatches.length
        patterns.component.count += componentMatches.length
        patterns.interface.count += interfaceMatches.length

        // Store examples
        if (functionMatches.length > 0 && patterns.function.examples.length < 3) {
          patterns.function.examples.push(...functionMatches.slice(0, 1))
        }
        if (classMatches.length > 0 && patterns.class.examples.length < 3) {
          patterns.class.examples.push(...classMatches.slice(0, 1))
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return Object.entries(patterns).map(([type, data]) => ({
      type,
      count: data.count,
      examples: data.examples.slice(0, 3)
    }))
  }

  private generateContext(repoName: string, stats: CodeStats, patterns: PatternSummary[]): string {
    // RepoMix-style context generation
    const context = `
# Repository Context: ${repoName}

## Overview
- Total Files: ${stats.totalFiles}
- Total Lines: ${stats.totalLines}
- Languages: ${Object.keys(stats.languages).join(', ')}

## Code Patterns
${patterns.map(p => `- ${p.type}: ${p.count} instances`).join('\n')}

## Language Distribution
${Object.entries(stats.languages).map(([lang, count]) => `- ${lang}: ${count} files`).join('\n')}

## Examples
${patterns.filter(p => p.examples && p.examples.length > 0).map(p => `
### ${p.type.charAt(0).toUpperCase() + p.type.slice(1)}s
${p.examples?.join('\n') || ''}
`).join('\n')}
`
    return context
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const languageMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.cpp': 'C++',
      '.c': 'C',
      '.h': 'C/C++',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin'
    }
    return languageMap[ext] || 'Unknown'
  }

  private extractRepoName(gitUrl: string): string {
    return gitUrl.split('/').pop()?.replace('.git', '') || 'unknown-repo'
  }

  private async cleanup(repoPath: string): Promise<void> {
    try {
      await fs.rm(repoPath, { recursive: true, force: true })
      logger.info({ repoPath }, 'Cleanup complete')
    } catch (error) {
      logger.warn({ error, repoPath }, 'Cleanup failed')
    }
  }
}
