import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'
import { SearchResult } from './searchService.js'

const logger = createModuleLogger('context-service')

export interface ContextOptions {
  maxTokens?: number
  includeMetadata?: boolean
  includeHighlights?: boolean
  prioritizeRelevance?: boolean
}

export interface GeneratedContext {
  summary: string
  keyPatterns: string[]
  codeExamples: Array<{
    title: string
    code: string
    explanation: string
    language: string
  }>
  recommendations: string[]
  relatedConcepts: string[]
  tokenCount: number
}

export class ContextService {
  private openai?: OpenAI
  private anthropic?: Anthropic

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      })
    }

    if (env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      })
    }
  }

  /**
   * Generate intelligent context from search results
   */
  async generateContext(
    query: string,
    searchResults: SearchResult[],
    options: ContextOptions = {}
  ): Promise<GeneratedContext> {
    const {
      maxTokens = env.MAX_CONTEXT_LENGTH,
      includeMetadata = true,
      includeHighlights = true,
      prioritizeRelevance = true,
    } = options

    try {
      // Sort results by relevance if requested
      const sortedResults = prioritizeRelevance 
        ? searchResults.sort((a, b) => b.combinedScore - a.combinedScore)
        : searchResults

      // Prepare context data
      const contextData = this.prepareContextData(sortedResults, {
        includeMetadata,
        includeHighlights,
      })

      // Generate context using LLM
      const generatedContext = await this.generateContextWithLLM(
        query,
        contextData,
        maxTokens
      )

      logger.info('Context generated successfully', {
        query,
        resultCount: searchResults.length,
        tokenCount: generatedContext.tokenCount,
      })

      return generatedContext
    } catch (error) {
      logger.error('Failed to generate context:', error)
      throw new Error('Failed to generate intelligent context')
    }
  }

  /**
   * Prepare context data from search results
   */
  private prepareContextData(
    results: SearchResult[],
    options: {
      includeMetadata: boolean
      includeHighlights: boolean
    }
  ): string {
    const contextParts = []

    contextParts.push(`## Codebase Analysis Results (${results.length} patterns found)\n`)

    for (const [index, result] of results.entries()) {
      const section = []
      
      section.push(`### ${index + 1}. ${result.functionName || result.className || result.fileName}`)
      section.push(`**File:** \`${result.filePath}\` (${result.language})`)
      section.push(`**Repository:** ${result.repositoryName}`)
      section.push(`**Pattern Type:** ${result.patternType}`)
      section.push(`**Relevance:** ${(result.combinedScore * 100).toFixed(1)}%`)
      
      if (result.lineStart && result.lineEnd) {
        section.push(`**Lines:** ${result.lineStart}-${result.lineEnd}`)
      }

      section.push(`\n\`\`\`${result.language || 'text'}`)
      section.push(result.codeSnippet)
      section.push('```\n')

      if (options.includeHighlights && result.highlights.length > 0) {
        section.push(`**Key Highlights:** ${result.highlights.join(', ')}`)
      }

      if (options.includeMetadata && Object.keys(result.metadata).length > 0) {
        section.push(`**Metadata:** ${JSON.stringify(result.metadata, null, 2)}`)
      }

      contextParts.push(section.join('\n'))
    }

    return contextParts.join('\n\n')
  }

  /**
   * Generate context using LLM
   */
  private async generateContextWithLLM(
    query: string,
    contextData: string,
    maxTokens: number
  ): Promise<GeneratedContext> {
    const prompt = `Analyze the following codebase search results for the query: "${query}"

${contextData}

Please provide a comprehensive analysis with:
1. A concise summary of what was found
2. Key patterns and common themes
3. Relevant code examples with explanations
4. Recommendations for usage or improvement
5. Related concepts to explore

Focus on practical insights that would help a developer understand and use this code effectively.`

    try {
      // Try OpenAI first
      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert code analyst helping developers understand codebases. Provide clear, actionable insights.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: Math.min(maxTokens, 4096),
          temperature: 0.3,
        })

        return this.parseContextResponse(response.choices[0]?.message?.content || '', maxTokens)
      }

      // Fall back to Anthropic
      if (this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: Math.min(maxTokens, 4096),
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        })

        const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
        return this.parseContextResponse(content, maxTokens)
      }

      throw new Error('No LLM provider available')
    } catch (error) {
      logger.error('LLM context generation failed:', error)
      
      // Fallback to rule-based context generation
      return this.generateFallbackContext(query, contextData, maxTokens)
    }
  }

  /**
   * Parse LLM response into structured context
   */
  private parseContextResponse(content: string, maxTokens: number): GeneratedContext {
    // This is a simplified parser - in production, you'd want more robust parsing
    const sections = content.split(/\n(?=#{1,3}\s)/g)
    
    let summary = ''
    const keyPatterns: string[] = []
    const codeExamples: any[] = []
    const recommendations: string[] = []
    const relatedConcepts: string[] = []

    for (const section of sections) {
      const lines = section.split('\n')
      const header = lines[0]?.toLowerCase() || ''
      const sectionContent = lines.slice(1).join('\n')

      if (header.includes('summary')) {
        summary = sectionContent.trim()
      } else if (header.includes('pattern') || header.includes('theme')) {
        const patterns = sectionContent.match(/[-*]\s*(.+)/g) || []
        keyPatterns.push(...patterns.map(p => p.replace(/[-*]\s*/, '')))
      } else if (header.includes('example')) {
        // Extract code examples
        const codeBlocks = sectionContent.match(/```(\w+)?\n([\s\S]*?)```/g) || []
        for (const block of codeBlocks) {
          const match = block.match(/```(\w+)?\n([\s\S]*?)```/)
          if (match) {
            codeExamples.push({
              title: 'Code Example',
              code: match[2].trim(),
              explanation: 'Generated code example',
              language: match[1] || 'text',
            })
          }
        }
      } else if (header.includes('recommend')) {
        const recs = sectionContent.match(/[-*]\s*(.+)/g) || []
        recommendations.push(...recs.map(r => r.replace(/[-*]\s*/, '')))
      } else if (header.includes('related') || header.includes('concept')) {
        const concepts = sectionContent.match(/[-*]\s*(.+)/g) || []
        relatedConcepts.push(...concepts.map(c => c.replace(/[-*]\s*/, '')))
      }
    }

    return {
      summary: summary || 'Analysis completed successfully',
      keyPatterns: keyPatterns.slice(0, 10), // Limit to top 10
      codeExamples: codeExamples.slice(0, 5), // Limit to top 5
      recommendations: recommendations.slice(0, 8), // Limit to top 8
      relatedConcepts: relatedConcepts.slice(0, 10), // Limit to top 10
      tokenCount: Math.floor(content.length / 4), // Rough token estimate
    }
  }

  /**
   * Generate fallback context without LLM
   */
  private generateFallbackContext(
    query: string,
    contextData: string,
    maxTokens: number
  ): GeneratedContext {
    const lines = contextData.split('\n')
    const codeBlocks = contextData.match(/```[\s\S]*?```/g) || []
    
    // Extract patterns from the data
    const languages = new Set<string>()
    const patternTypes = new Set<string>()
    const functions = new Set<string>()
    
    for (const line of lines) {
      if (line.includes('(') && line.includes(')')) {
        const langMatch = line.match(/\((\w+)\)/)
        if (langMatch) languages.add(langMatch[1])
      }
      if (line.includes('Pattern Type:')) {
        const typeMatch = line.match(/Pattern Type:\s*(\w+)/)
        if (typeMatch) patternTypes.add(typeMatch[1])
      }
      if (line.includes('###') && line.includes('.')) {
        const funcMatch = line.match(/###\s*\d+\.\s*(.+)/)
        if (funcMatch) functions.add(funcMatch[1])
      }
    }

    return {
      summary: `Found ${codeBlocks.length} code patterns related to "${query}" across ${languages.size} programming languages.`,
      keyPatterns: Array.from(patternTypes).slice(0, 10),
      codeExamples: codeBlocks.slice(0, 3).map((block, i) => ({
        title: `Example ${i + 1}`,
        code: block.replace(/```\w*\n?|\n?```/g, ''),
        explanation: 'Code pattern found in search results',
        language: Array.from(languages)[0] || 'text',
      })),
      recommendations: [
        'Review the code patterns for best practices',
        'Consider consistency across similar implementations',
        'Look for opportunities to refactor common patterns',
      ],
      relatedConcepts: Array.from(functions).slice(0, 10),
      tokenCount: Math.floor(contextData.length / 4),
    }
  }

  /**
   * Explain a specific code pattern
   */
  async explainCode(
    code: string,
    language: string,
    context?: string
  ): Promise<{
    explanation: string
    keyFeatures: string[]
    bestPractices: string[]
    potentialIssues: string[]
  }> {
    const prompt = `Explain the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

${context ? `Context: ${context}` : ''}

Please provide:
1. A clear explanation of what this code does
2. Key features and patterns used
3. Best practices demonstrated
4. Potential issues or improvements`

    try {
      let response = ''

      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert code reviewer. Provide clear, educational explanations.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        })
        response = completion.choices[0]?.message?.content || ''
      } else if (this.anthropic) {
        const completion = await this.anthropic.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        })
        response = completion.content[0]?.type === 'text' ? completion.content[0].text : ''
      }

      // Parse the response (simplified)
      return {
        explanation: response || 'Code explanation not available',
        keyFeatures: [],
        bestPractices: [],
        potentialIssues: [],
      }
    } catch (error) {
      logger.error('Code explanation failed:', error)
      return {
        explanation: 'Unable to generate code explanation',
        keyFeatures: [],
        bestPractices: [],
        potentialIssues: [],
      }
    }
  }

  /**
   * Health check for context service
   */
  async healthCheck(): Promise<{
    openai: boolean
    anthropic: boolean
  }> {
    return {
      openai: !!this.openai,
      anthropic: !!this.anthropic,
    }
  }
}
