import pg from 'pg'
import { createModuleLogger } from '../utils/logger.js'
import { AnalysisResult, PatternSummary } from './repositoryAnalyzer.js'

const { Pool } = pg
const logger = createModuleLogger('database-service')

export class DatabaseService {
  private pool: pg.Pool | null = null

  constructor() {
    const dbUrl = process.env.DATABASE_URL
    if (dbUrl) {
      this.pool = new Pool({
        connectionString: dbUrl
      })
      logger.info('Database connection pool created')
    } else {
      logger.warn('DATABASE_URL not provided, database storage disabled')
    }
  }

  async storeAnalysisResult(result: AnalysisResult): Promise<void> {
    if (!this.pool) {
      logger.warn('Database not configured, skipping storage')
      return
    }

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // 1. Create or get workspace
      const workspaceResult = await client.query(
        `INSERT INTO core.workspaces (name, slug, description, settings)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        ['Default Workspace', 'default', 'Default workspace for repository analysis', {}]
      )
      const workspaceId = workspaceResult.rows[0].id

      // 2. Create or update repository
      const repoResult = await client.query(
        `INSERT INTO core.repositories (workspace_id, url, branch, auth_type, auth_config, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, url) 
         DO UPDATE SET 
           metadata = $6,
           updated_at = NOW()
         RETURNING id`,
        [
          workspaceId,
          result.repository,
          'main',
          'none',
          {},
          {
            lastAnalyzed: result.timestamp,
            filesProcessed: result.filesProcessed,
            languages: result.codeStats.languages
          }
        ]
      )
      const repositoryId = repoResult.rows[0].id

      // 3. Store code patterns
      for (const pattern of result.patterns) {
        if (pattern.count > 0 && pattern.examples) {
          for (const example of pattern.examples.slice(0, 5)) {
            await client.query(
              `INSERT INTO vector.code_patterns 
               (repository_id, file_path, pattern_type, code_snippet, language, line_start, line_end, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                repositoryId,
                'multiple-files', // Would be specific file in real TreeSitter analysis
                pattern.type,
                example, // code_snippet
                'JavaScript', // language - Would be detected from file
                1, // line_start
                1, // line_end
                {
                  patternCount: pattern.count,
                  analyzed: result.timestamp,
                  example: example
                }
              ]
            )
          }
        }
      }

      // 4. Store repository summary
      await client.query(
        `INSERT INTO vector.code_patterns 
         (repository_id, file_path, pattern_type, code_snippet, language, line_start, line_end, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          repositoryId,
          'REPOSITORY_SUMMARY',
          'summary',
          this.generateContext(result), // code_snippet
          'markdown', // language
          1, // line_start
          1, // line_end
          {
            totalFiles: result.filesProcessed,
            totalLines: result.codeStats.totalLines,
            languages: result.codeStats.languages,
            patterns: result.patterns,
            context: this.generateContext(result)
          }
        ]
      )

      await client.query('COMMIT')
      logger.info({ repositoryId, patterns: result.patterns.length }, 'Analysis stored in database')
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error({ error }, 'Failed to store analysis in database')
      throw error
    } finally {
      client.release()
    }
  }

  private generateContext(result: AnalysisResult): string {
    return `
# Repository Analysis: ${result.repository}

## Statistics
- Files Processed: ${result.filesProcessed}
- Total Lines: ${result.codeStats.totalLines}
- Languages: ${Object.keys(result.codeStats.languages).join(', ')}

## Code Patterns
${result.patterns.map(p => `- ${p.type}: ${p.count} instances`).join('\n')}

## Language Distribution
${Object.entries(result.codeStats.languages)
  .map(([lang, count]) => `- ${lang}: ${count} files`)
  .join('\n')}

## Pattern Examples
${result.patterns
  .filter(p => p.examples && p.examples.length > 0)
  .map(p => `
### ${p.type.charAt(0).toUpperCase() + p.type.slice(1)}
${p.examples?.join('\n') || ''}
`)
  .join('\n')}

---
*Analyzed: ${result.timestamp}*
`
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      logger.info('Database connection pool closed')
    }
  }
}
