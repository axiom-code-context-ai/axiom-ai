/**
 * Pattern Miner - Extractor 4
 * Finds common implementation patterns and generates templates
 */

import fs from 'fs/promises';
import path from 'path';
import { globby } from 'globby';
import OpenAI from 'openai';
import { treeSitterParser, SupportedLanguage } from '../utils/treeSitterUtil.js';
import { logger } from '../utils/logger.js';

export interface CodePattern {
  pattern_name: string;
  language: SupportedLanguage;
  category: string;
  frequency: number;
  is_standard: boolean;
  template: string;
  explanation: string;
  when_to_use: string;
  configuration_options: Array<{
    param: string;
    description: string;
    default: string;
  }>;
  examples: Array<{
    file: string;
    line: number;
    code: string;
    context?: string;
  }>;
  variations: Array<{
    frequency: number;
    reason: string;
    is_valid: boolean;
    recommendation?: string;
  }>;
}

interface PatternOccurrence {
  file: string;
  line: number;
  code: string;
  structure: any;
}

export class PatternMiner {
  private repoPath: string;
  private openai: OpenAI;
  private primaryLanguage: SupportedLanguage;

  constructor(repoPath: string, openaiApiKey: string, primaryLanguage: SupportedLanguage = 'java') {
    this.repoPath = repoPath;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.primaryLanguage = primaryLanguage;
  }

  /**
   * Main extraction entry point
   */
  async extract(customComponents: string[] = []): Promise<CodePattern[]> {
    logger.info('Starting pattern mining');
    const startTime = Date.now();

    try {
      const patterns: CodePattern[] = [];

      // Mine patterns for each custom component
      for (const component of customComponents) {
        const pattern = await this.mineComponentPattern(component);
        if (pattern) {
          patterns.push(pattern);
        }
      }

      // Mine common patterns even without custom components
      if (customComponents.length === 0) {
        const commonPatterns = await this.mineCommonPatterns();
        patterns.push(...commonPatterns);
      }

      const duration = Date.now() - startTime;
      logger.info(`Pattern mining completed in ${duration}ms, found ${patterns.length} patterns`);

      return patterns;
    } catch (error) {
      logger.error('Pattern mining failed:', error);
      throw error;
    }
  }

  /**
   * Mine patterns for a specific component
   */
  private async mineComponentPattern(componentName: string): Promise<CodePattern | null> {
    logger.info(`Mining patterns for: ${componentName}`);

    try {
      // Step 1: Find all usages
      const occurrences = await this.findComponentUsages(componentName);
      logger.info(`Found ${occurrences.length} occurrences of ${componentName}`);

      if (occurrences.length === 0) return null;

      // Step 2: Analyze structure and group by similarity
      const grouped = this.groupByStructure(occurrences);
      logger.info(`Grouped into ${grouped.length} pattern variations`);

      // Step 3: Identify the standard pattern (most common)
      const standardGroup = grouped[0]; // Already sorted by frequency
      const isStandard = standardGroup.occurrences.length / occurrences.length > 0.7;

      // Step 4: Generate template with LLM
      const templateData = await this.generateTemplate(componentName, standardGroup.occurrences.slice(0, 5));

      if (!templateData) return null;

      // Step 5: Analyze variations
      const variations = await this.analyzeVariations(grouped.slice(1), standardGroup);

      return {
        pattern_name: `${componentName} Integration Pattern`,
        language: this.primaryLanguage,
        category: this.categorizePattern(componentName),
        frequency: occurrences.length,
        is_standard: isStandard,
        template: templateData.template,
        explanation: templateData.explanation,
        when_to_use: templateData.when_to_use,
        configuration_options: templateData.configuration_options,
        examples: standardGroup.occurrences.slice(0, 3).map((occ) => ({
          file: occ.file,
          line: occ.line,
          code: occ.code,
        })),
        variations,
      };
    } catch (error) {
      logger.error(`Pattern mining failed for ${componentName}:`, error);
      return null;
    }
  }

  /**
   * Find all usages of a component
   */
  private async findComponentUsages(componentName: string): Promise<PatternOccurrence[]> {
    const occurrences: PatternOccurrence[] = [];

    try {
      const files = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/target/**', '**/test/**'],
      });

      for (const file of files) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (!content.includes(componentName)) continue;

        // Find usage context
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(componentName)) {
            // Extract surrounding context (5 lines before and after)
            const start = Math.max(0, i - 5);
            const end = Math.min(lines.length, i + 10);
            const code = lines.slice(start, end).join('\n');

            // Extract structure
            const structure = this.extractStructure(code, componentName);

            occurrences.push({
              file,
              line: i + 1,
              code,
              structure,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Usage search failed for ${componentName}:`, error);
    }

    return occurrences;
  }

  /**
   * Extract structural features from code
   */
  private extractStructure(code: string, componentName: string): any {
    const structure: any = {
      declaration: 'unknown',
      configuration: 'unknown',
      params: [] as string[],
      response_check: 'none',
      error_handling: 'none',
    };

    // Declaration pattern
    if (code.includes('@Autowired')) structure.declaration = 'field_autowired';
    else if (code.includes('new ' + componentName)) structure.declaration = 'manual_new';
    else if (code.includes('private final')) structure.declaration = 'constructor_inject';

    // Configuration pattern
    if (code.includes('.builder()')) structure.configuration = 'builder_pattern';
    else if (code.includes('new ' + componentName + '(')) structure.configuration = 'constructor_config';

    // Parameters
    if (code.includes('baseUrl')) structure.params.push('baseUrl');
    if (code.includes('timeout')) structure.params.push('timeout');
    if (code.includes('retryPolicy')) structure.params.push('retryPolicy');

    // Response handling
    if (code.includes('.isSuccess()')) structure.response_check = 'isSuccess_method';
    else if (code.includes('.getStatus()')) structure.response_check = 'getStatus_method';

    // Error handling
    if (code.includes('try {')) structure.error_handling = 'try_catch';
    else if (code.includes('if (')) structure.error_handling = 'if_else';

    return structure;
  }

  /**
   * Group occurrences by structural similarity
   */
  private groupByStructure(occurrences: PatternOccurrence[]): Array<{ structure: any; occurrences: PatternOccurrence[] }> {
    const groups = new Map<string, PatternOccurrence[]>();

    for (const occ of occurrences) {
      const key = JSON.stringify(occ.structure);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)!.push(occ);
    }

    // Convert to array and sort by frequency
    const result = Array.from(groups.entries())
      .map(([key, occs]) => ({
        structure: JSON.parse(key),
        occurrences: occs,
      }))
      .sort((a, b) => b.occurrences.length - a.occurrences.length);

    return result;
  }

  /**
   * Generate template with LLM
   */
  private async generateTemplate(componentName: string, examples: PatternOccurrence[]): Promise<any | null> {
    try {
      const examplesText = examples.map((ex, i) => `Example ${i + 1}:\n${ex.code}`).join('\n\n');

      const prompt = `These code examples all follow the same pattern for using ${componentName}:

${examplesText}

Generate:
1. A generalized template with placeholders:
   - Use \${ClassName} for class names
   - Use \${ServiceName} for service names
   - Use \${baseUrl} for URLs
   - Use \${methodName} for method names
   - Use \${RequestType} and \${ResponseType} for types

2. Explanation: What does this pattern do? (2-3 sentences)

3. When to use: Guidelines for applying this pattern (2-3 sentences)

4. Configuration options: What parameters are customizable?

Output JSON:
{
  "template": "string (with placeholders)",
  "explanation": "string",
  "when_to_use": "string",
  "configuration_options": [{"param": "string", "description": "string", "default": "string"}]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert code analyzer. Extract patterns and generate templates. Return valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result;
    } catch (error) {
      logger.error(`Template generation failed for ${componentName}:`, error);
      return null;
    }
  }

  /**
   * Analyze pattern variations
   */
  private async analyzeVariations(
    variations: Array<{ structure: any; occurrences: PatternOccurrence[] }>,
    standard: { structure: any; occurrences: PatternOccurrence[] }
  ): Promise<any[]> {
    const results: any[] = [];

    for (const variation of variations.slice(0, 3)) {
      // Limit to top 3 variations
      const frequency = variation.occurrences.length;
      const percentOfTotal = (frequency / (standard.occurrences.length + frequency)) * 100;

      // Simple heuristic for validity
      const isValid = percentOfTotal > 5; // More than 5% usage suggests valid use case

      results.push({
        frequency,
        reason: `Structural variation: ${JSON.stringify(variation.structure)}`,
        is_valid: isValid,
        recommendation: isValid
          ? 'Valid alternative pattern for specific use cases'
          : 'Consider refactoring to standard pattern',
      });
    }

    return results;
  }

  /**
   * Categorize pattern by name
   */
  private categorizePattern(componentName: string): string {
    if (componentName.includes('Client')) return 'api_client';
    if (componentName.includes('Repository')) return 'database_access';
    if (componentName.includes('Service')) return 'business_logic';
    if (componentName.includes('Controller')) return 'rest_controller';
    if (componentName.includes('Handler')) return 'event_handler';
    return 'general';
  }

  /**
   * Mine common patterns (fallback when no custom components)
   */
  private async mineCommonPatterns(): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];

    try {
      // Look for common API client patterns
      const apiPattern = await this.mineAPIClientPattern();
      if (apiPattern) patterns.push(apiPattern);

      // Look for common repository patterns
      const repoPattern = await this.mineRepositoryPattern();
      if (repoPattern) patterns.push(repoPattern);
    } catch (error) {
      logger.error('Common pattern mining failed:', error);
    }

    return patterns;
  }

  /**
   * Mine API client patterns
   */
  private async mineAPIClientPattern(): Promise<CodePattern | null> {
    try {
      const files = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/test/**'],
      });

      const occurrences: PatternOccurrence[] = [];

      for (const file of files) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (content.includes('RestTemplate') || content.includes('WebClient')) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('.postForEntity') || lines[i].includes('.exchange')) {
              const start = Math.max(0, i - 3);
              const end = Math.min(lines.length, i + 7);
              const code = lines.slice(start, end).join('\n');

              occurrences.push({
                file,
                line: i + 1,
                code,
                structure: {},
              });
            }
          }
        }
      }

      if (occurrences.length > 5) {
        return {
          pattern_name: 'REST API Client Pattern',
          language: 'java',
          category: 'api_client',
          frequency: occurrences.length,
          is_standard: true,
          template: 'RestTemplate template = new RestTemplate();\nResponseEntity<${ResponseType}> response = template.exchange(url, HttpMethod.POST, entity, ${ResponseType}.class);',
          explanation: 'Standard Spring RestTemplate pattern for making HTTP requests',
          when_to_use: 'Use when making synchronous HTTP calls to external APIs',
          configuration_options: [],
          examples: occurrences.slice(0, 3).map((occ) => ({
            file: occ.file,
            line: occ.line,
            code: occ.code,
          })),
          variations: [],
        };
      }
    } catch (error) {
      logger.debug('API pattern mining failed:', error);
    }

    return null;
  }

  /**
   * Mine repository patterns
   */
  private async mineRepositoryPattern(): Promise<CodePattern | null> {
    try {
      const files = await globby('**/*Repository.java', {
        cwd: this.repoPath,
        ignore: ['**/test/**'],
      });

      if (files.length > 5) {
        return {
          pattern_name: 'JPA Repository Pattern',
          language: 'java',
          category: 'database_access',
          frequency: files.length,
          is_standard: true,
          template: 'public interface ${EntityName}Repository extends JpaRepository<${EntityName}, ${IdType}> {\n  // Custom query methods\n}',
          explanation: 'Spring Data JPA repository pattern for database access',
          when_to_use: 'Use for all database entity operations',
          configuration_options: [],
          examples: [],
          variations: [],
        };
      }
    } catch (error) {
      logger.debug('Repository pattern mining failed:', error);
    }

    return null;
  }
}

