/**
 * Domain Extractor - Extractor 3
 * Builds domain knowledge graph from entities and services
 */

import fs from 'fs/promises';
import path from 'path';
import { globby } from 'globby';
import OpenAI from 'openai';
import { treeSitterParser, SupportedLanguage } from '../utils/treeSitterUtil.js';
import { logger } from '../utils/logger.js';

export interface DomainModel {
  domain_name: string;
  summary: string;
  entities: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      primaryKey?: boolean;
    }>;
    relationships: Array<{
      type: string;
      target: string;
      field: string;
    }>;
    validations: Array<{
      field: string;
      rule: string;
    }>;
  }>;
  services: Array<{
    name: string;
    operations: string[];
    dependencies: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    description: string;
  }>;
  business_rules: string[];
  operations: string[];
}

export class DomainExtractor {
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
  async extract(): Promise<DomainModel[]> {
    logger.info('Starting domain extraction');
    const startTime = Date.now();

    try {
      // Part A: Extract entities
      const entities = await this.extractEntities();
      logger.info(`Found ${entities.length} entities`);

      // Part B: Extract services
      const services = await this.extractServices();
      logger.info(`Found ${services.length} services`);

      // Part C: Group by domain and synthesize with LLM
      const domains = this.groupByDomain(entities, services);
      logger.info(`Identified ${domains.size} domains`);

      const domainModels: DomainModel[] = [];

      for (const [domainName, data] of domains.entries()) {
        const model = await this.synthesizeDomain(domainName, data.entities, data.services);
        if (model) {
          domainModels.push(model);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Domain extraction completed in ${duration}ms, found ${domainModels.length} domain models`);

      return domainModels;
    } catch (error) {
      logger.error('Domain extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract entities from code
   */
  private async extractEntities(): Promise<any[]> {
    const entities: any[] = [];

    try {
      if (this.primaryLanguage === 'java') {
        const javaFiles = await globby('**/*.java', {
          cwd: this.repoPath,
          ignore: ['**/node_modules/**', '**/target/**', '**/test/**'],
        });

        for (const file of javaFiles) {
          const fullPath = path.join(this.repoPath, file);
          const content = await fs.readFile(fullPath, 'utf-8');

          // Check if it's an entity
          if (!content.includes('@Entity')) continue;

          const parseResult = treeSitterParser.parse(content, 'java');
          if (!parseResult) continue;

          const classes = treeSitterParser.extractJavaClasses(content);

          for (const cls of classes) {
            if (cls.annotations.some((a) => a.includes('@Entity'))) {
              // Extract fields
              const fields = await this.extractFields(content);
              const relationships = await this.extractRelationships(content);
              const validations = await this.extractValidations(content);

              entities.push({
                name: cls.name,
                file,
                fields,
                relationships,
                validations,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Entity extraction failed:', error);
    }

    return entities;
  }

  /**
   * Extract fields from entity
   */
  private async extractFields(content: string): Promise<any[]> {
    const fields: any[] = [];

    // Simple regex extraction for fields
    const fieldRegex = /private\s+(\w+(?:<.*?>)?)\s+(\w+);/g;
    let match;

    while ((match = fieldRegex.exec(content)) !== null) {
      const [, type, name] = match;

      // Check for annotations
      const linesBefore = content.substring(0, match.index).split('\n');
      const lastFewLines = linesBefore.slice(-5).join('\n');

      const nullable = !lastFewLines.includes('@NotNull');
      const primaryKey = lastFewLines.includes('@Id');

      fields.push({
        name,
        type,
        nullable,
        primaryKey,
      });
    }

    return fields;
  }

  /**
   * Extract relationships from entity
   */
  private async extractRelationships(content: string): Promise<any[]> {
    const relationships: any[] = [];

    const relPatterns = [
      { pattern: /@OneToMany[^)]*\)[\s\S]*?private\s+\w+<(\w+)>\s+(\w+);/, type: 'OneToMany' },
      { pattern: /@ManyToOne[^)]*\)[\s\S]*?private\s+(\w+)\s+(\w+);/, type: 'ManyToOne' },
      { pattern: /@OneToOne[^)]*\)[\s\S]*?private\s+(\w+)\s+(\w+);/, type: 'OneToOne' },
      { pattern: /@ManyToMany[^)]*\)[\s\S]*?private\s+\w+<(\w+)>\s+(\w+);/, type: 'ManyToMany' },
    ];

    for (const { pattern, type } of relPatterns) {
      const regex = new RegExp(pattern, 'g');
      let match;

      while ((match = regex.exec(content)) !== null) {
        relationships.push({
          type,
          target: match[1],
          field: match[2] || match[1],
        });
      }
    }

    return relationships;
  }

  /**
   * Extract validation rules
   */
  private async extractValidations(content: string): Promise<any[]> {
    const validations: any[] = [];

    const validationAnnotations = ['@NotNull', '@NotEmpty', '@Size', '@Min', '@Max', '@Pattern', '@Email'];

    for (const annotation of validationAnnotations) {
      const regex = new RegExp(`${annotation}[^\\n]*\\n\\s*private\\s+\\w+\\s+(\\w+);`, 'g');
      let match;

      while ((match = regex.exec(content)) !== null) {
        validations.push({
          field: match[1],
          rule: annotation,
        });
      }
    }

    return validations;
  }

  /**
   * Extract services from code
   */
  private async extractServices(): Promise<any[]> {
    const services: any[] = [];

    try {
      if (this.primaryLanguage === 'java') {
        const javaFiles = await globby('**/*.java', {
          cwd: this.repoPath,
          ignore: ['**/node_modules/**', '**/target/**', '**/test/**'],
        });

        for (const file of javaFiles) {
          const fullPath = path.join(this.repoPath, file);
          const content = await fs.readFile(fullPath, 'utf-8');

          // Check if it's a service
          if (!content.includes('@Service')) continue;

          const classes = treeSitterParser.extractJavaClasses(content);

          for (const cls of classes) {
            if (cls.annotations.some((a) => a.includes('@Service'))) {
              const operations = await this.extractMethods(content);
              const dependencies = await this.extractDependencies(content);

              services.push({
                name: cls.name,
                file,
                operations,
                dependencies,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Service extraction failed:', error);
    }

    return services;
  }

  /**
   * Extract methods from service
   */
  private async extractMethods(content: string): Promise<string[]> {
    const methods: string[] = [];

    const methodRegex = /public\s+\w+(?:<.*?>)?\s+(\w+)\s*\([^)]*\)/g;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      methods.push(match[1]);
    }

    return methods;
  }

  /**
   * Extract dependencies from service
   */
  private async extractDependencies(content: string): Promise<string[]> {
    const dependencies: string[] = [];

    const depRegex = /@Autowired[\s\S]*?private\s+(\w+)\s+\w+;/g;
    let match;

    while ((match = depRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return dependencies;
  }

  /**
   * Group entities and services by domain
   */
  private groupByDomain(
    entities: any[],
    services: any[]
  ): Map<
    string,
    {
      entities: any[];
      services: any[];
    }
  > {
    const domains = new Map<string, { entities: any[]; services: any[] }>();

    // Group entities by name pattern (e.g., Payment, Order, User)
    for (const entity of entities) {
      const domainName = this.extractDomainName(entity.name);

      if (!domains.has(domainName)) {
        domains.set(domainName, { entities: [], services: [] });
      }

      domains.get(domainName)!.entities.push(entity);
    }

    // Group services by name pattern
    for (const service of services) {
      const domainName = this.extractDomainName(service.name);

      if (!domains.has(domainName)) {
        domains.set(domainName, { entities: [], services: [] });
      }

      domains.get(domainName)!.services.push(service);
    }

    return domains;
  }

  /**
   * Extract domain name from class name
   */
  private extractDomainName(className: string): string {
    // Remove common suffixes
    const name = className.replace(/(Service|Entity|Repository|Controller|Dto|Request|Response)$/, '');

    // Handle camelCase - take the root word
    const words = name.split(/(?=[A-Z])/);
    return words[0] || 'Unknown';
  }

  /**
   * Synthesize domain with LLM
   */
  private async synthesizeDomain(domainName: string, entities: any[], services: any[]): Promise<DomainModel | null> {
    try {
      const prompt = `Analyze this domain based on extracted structure.

Domain: ${domainName}

Entities:
${JSON.stringify(entities, null, 2)}

Services:
${JSON.stringify(services, null, 2)}

Generate:
1. Domain summary (2-3 sentences describing what this domain is about)
2. Key entity relationships (how entities connect)
3. Primary operations (main business functions)
4. Inferred business rules (from validations and method names)

Output JSON:
{
  "summary": "string",
  "relationships": [{"from": "string", "to": "string", "type": "string", "description": "string"}],
  "operations": ["string"],
  "business_rules": ["string"]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a domain expert analyzing business domains. Return valid JSON only.',
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

      return {
        domain_name: domainName,
        summary: result.summary || `${domainName} domain`,
        entities: entities.map((e) => ({
          name: e.name,
          fields: e.fields,
          relationships: e.relationships,
          validations: e.validations,
        })),
        services: services.map((s) => ({
          name: s.name,
          operations: s.operations,
          dependencies: s.dependencies,
        })),
        relationships: result.relationships || [],
        business_rules: result.business_rules || [],
        operations: result.operations || [],
      };
    } catch (error) {
      logger.error(`Domain synthesis failed for ${domainName}:`, error);
      return null;
    }
  }
}

