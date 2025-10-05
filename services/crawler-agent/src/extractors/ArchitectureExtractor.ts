/**
 * Architecture Extractor - Extractor 2
 * Extracts design patterns and architectural decisions
 */

import fs from 'fs/promises';
import path from 'path';
import { globby } from 'globby';
import MarkdownIt from 'markdown-it';
import OpenAI from 'openai';
import { treeSitterParser } from '../utils/treeSitterUtil.js';
import { logger } from '../utils/logger.js';

const md = new MarkdownIt();

export interface ArchitecturePattern {
  pattern_type: string;
  pattern_name: string;
  description: string;
  rationale: string;
  evidence_source: string;
  confidence_score: number;
  details: Record<string, any>;
  technologies: Array<{
    name: string;
    purpose: string;
    reasoning: string;
  }>;
  communication_patterns: string[];
  principles: string[];
}

export class ArchitectureExtractor {
  private repoPath: string;
  private openai: OpenAI;

  constructor(repoPath: string, openaiApiKey: string) {
    this.repoPath = repoPath;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Main extraction entry point
   */
  async extract(): Promise<ArchitecturePattern[]> {
    logger.info('Starting architecture extraction');
    const startTime = Date.now();

    try {
      const patterns: ArchitecturePattern[] = [];

      // Part A: Documentation Analysis (if docs exist)
      const docPatterns = await this.analyzeDocumentation();
      patterns.push(...docPatterns);

      // Part B: Code Pattern Inference (if no docs or to supplement)
      if (docPatterns.length === 0) {
        const inferredPatterns = await this.inferFromCode();
        patterns.push(...inferredPatterns);
      }

      const duration = Date.now() - startTime;
      logger.info(`Architecture extraction completed in ${duration}ms, found ${patterns.length} patterns`);

      return patterns;
    } catch (error) {
      logger.error('Architecture extraction failed:', error);
      throw error;
    }
  }

  /**
   * Part A: Analyze documentation files
   */
  private async analyzeDocumentation(): Promise<ArchitecturePattern[]> {
    const patterns: ArchitecturePattern[] = [];

    try {
      // Find architecture documentation
      const docFiles = await globby(
        ['**/docs/**/*.md', '**/architecture/**/*.md', '**/ADR*.md', '**/ARCHITECTURE.md', '**/README.md'],
        {
          cwd: this.repoPath,
          ignore: ['**/node_modules/**'],
          caseSensitiveMatch: false,
        }
      );

      logger.info(`Found ${docFiles.length} documentation files`);

      // Limit to 10 most relevant docs to control costs
      const relevantDocs = docFiles.slice(0, 10);

      for (const docFile of relevantDocs) {
        const fullPath = path.join(this.repoPath, docFile);
        const content = await fs.readFile(fullPath, 'utf-8');

        // Check if content is architecture-related
        if (this.isArchitectureRelated(content)) {
          const pattern = await this.analyzeDocWithLLM(content, docFile);
          if (pattern) {
            patterns.push(pattern);
          }
        }
      }
    } catch (error) {
      logger.error('Documentation analysis failed:', error);
    }

    return patterns;
  }

  /**
   * Check if document content is architecture-related
   */
  private isArchitectureRelated(content: string): boolean {
    const keywords = [
      'architecture',
      'design pattern',
      'microservices',
      'monolith',
      'event-driven',
      'CQRS',
      'saga',
      'REST',
      'gRPC',
      'messaging',
      'database',
      'decision',
      'ADR',
      'technical decision',
    ];

    const lowerContent = content.toLowerCase();
    return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
  }

  /**
   * Analyze document using LLM
   */
  private async analyzeDocWithLLM(content: string, filePath: string): Promise<ArchitecturePattern | null> {
    try {
      const prompt = `Analyze this architecture documentation and extract key patterns.

Documentation:
${content.slice(0, 8000)} 

Extract:
1. Architectural patterns (microservices, event-driven, monolith, CQRS, saga, etc.)
2. Technology choices (databases, message queues, frameworks)
3. Rationale for decisions (why this approach?)
4. Communication patterns (REST, gRPC, events, sync/async)
5. Data flow and boundaries

Output as JSON:
{
  "patterns": [{
    "type": "string",
    "name": "string",
    "description": "string",
    "rationale": "string"
  }],
  "technologies": [{
    "name": "string",
    "purpose": "string",
    "reasoning": "string"
  }],
  "communication_patterns": ["string"],
  "principles": ["string"]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert software architect analyzing documentation. Extract architectural patterns and return valid JSON only.',
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

      // Convert to architecture pattern format
      if (result.patterns && result.patterns.length > 0) {
        const mainPattern = result.patterns[0];
        return {
          pattern_type: mainPattern.type,
          pattern_name: mainPattern.name || mainPattern.type,
          description: mainPattern.description,
          rationale: mainPattern.rationale || '',
          evidence_source: filePath,
          confidence_score: 0.9, // High confidence from documentation
          details: {
            additional_patterns: result.patterns.slice(1),
          },
          technologies: result.technologies || [],
          communication_patterns: result.communication_patterns || [],
          principles: result.principles || [],
        };
      }
    } catch (error) {
      logger.error(`LLM analysis failed for ${filePath}:`, error);
    }

    return null;
  }

  /**
   * Part B: Infer patterns from code
   */
  private async inferFromCode(): Promise<ArchitecturePattern[]> {
    logger.info('Inferring architecture patterns from code');
    const patterns: ArchitecturePattern[] = [];

    try {
      // Detect event-driven architecture
      const eventDriven = await this.detectEventDriven();
      if (eventDriven) patterns.push(eventDriven);

      // Detect microservices vs monolith
      const servicePattern = await this.detectServiceArchitecture();
      if (servicePattern) patterns.push(servicePattern);

      // Detect database patterns
      const dbPattern = await this.detectDatabasePattern();
      if (dbPattern) patterns.push(dbPattern);

      // Detect messaging patterns
      const messagingPattern = await this.detectMessagingPattern();
      if (messagingPattern) patterns.push(messagingPattern);
    } catch (error) {
      logger.error('Code inference failed:', error);
    }

    return patterns;
  }

  /**
   * Detect event-driven architecture
   */
  private async detectEventDriven(): Promise<ArchitecturePattern | null> {
    try {
      const javaFiles = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
      });

      let eventListenerCount = 0;
      let kafkaListenerCount = 0;
      let rabbitListenerCount = 0;

      for (const file of javaFiles.slice(0, 100)) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (content.includes('@EventListener')) eventListenerCount++;
        if (content.includes('@KafkaListener')) kafkaListenerCount++;
        if (content.includes('@RabbitListener')) rabbitListenerCount++;
      }

      const totalEventAnnotations = eventListenerCount + kafkaListenerCount + rabbitListenerCount;

      if (totalEventAnnotations > 10) {
        let messageBackend = 'Unknown';
        if (kafkaListenerCount > rabbitListenerCount) messageBackend = 'Apache Kafka';
        else if (rabbitListenerCount > 0) messageBackend = 'RabbitMQ';

        return {
          pattern_type: 'event-driven',
          pattern_name: 'Event-Driven Architecture',
          description: 'Asynchronous event-based communication between components',
          rationale: 'Inferred from high usage of event listeners and message handlers',
          evidence_source: 'inferred from code',
          confidence_score: 0.75,
          details: {
            event_listener_count: eventListenerCount,
            kafka_listener_count: kafkaListenerCount,
            rabbit_listener_count: rabbitListenerCount,
            message_broker: messageBackend,
          },
          technologies: [
            {
              name: messageBackend,
              purpose: 'Message broker for event streaming',
              reasoning: `Found ${kafkaListenerCount + rabbitListenerCount} listener annotations`,
            },
          ],
          communication_patterns: ['asynchronous', 'event-driven'],
          principles: ['loose coupling', 'eventual consistency'],
        };
      }
    } catch (error) {
      logger.debug('Event-driven detection failed:', error);
    }

    return null;
  }

  /**
   * Detect service architecture (microservices vs monolith)
   */
  private async detectServiceArchitecture(): Promise<ArchitecturePattern | null> {
    try {
      const javaFiles = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/target/**'],
      });

      let controllerCount = 0;
      const serviceNames = new Set<string>();

      for (const file of javaFiles) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (content.includes('@RestController') || content.includes('@Controller')) {
          controllerCount++;
          
          // Extract service name from path
          const parts = file.split('/');
          if (parts.length > 2) {
            serviceNames.add(parts[0]);
          }
        }
      }

      if (controllerCount > 0) {
        const isMicroservices = serviceNames.size > 3;

        return {
          pattern_type: isMicroservices ? 'microservices' : 'monolith',
          pattern_name: isMicroservices ? 'Microservices Architecture' : 'Monolithic Architecture',
          description: isMicroservices
            ? 'Multiple independent services with their own controllers'
            : 'Single application with all functionality',
          rationale: `Found ${controllerCount} controllers across ${serviceNames.size} service(s)`,
          evidence_source: 'inferred from code',
          confidence_score: 0.7,
          details: {
            controller_count: controllerCount,
            service_count: serviceNames.size,
            service_names: Array.from(serviceNames),
          },
          technologies: [],
          communication_patterns: ['REST'],
          principles: isMicroservices ? ['service autonomy', 'decentralization'] : ['simplicity', 'single deployment'],
        };
      }
    } catch (error) {
      logger.debug('Service architecture detection failed:', error);
    }

    return null;
  }

  /**
   * Detect database patterns
   */
  private async detectDatabasePattern(): Promise<ArchitecturePattern | null> {
    try {
      const javaFiles = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/target/**'],
      });

      let repositoryCount = 0;
      let entityCount = 0;
      let transactionalCount = 0;

      for (const file of javaFiles.slice(0, 100)) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (content.includes('@Repository')) repositoryCount++;
        if (content.includes('@Entity')) entityCount++;
        if (content.includes('@Transactional')) transactionalCount++;
      }

      if (repositoryCount > 0) {
        return {
          pattern_type: 'repository-pattern',
          pattern_name: 'Repository Pattern with JPA',
          description: 'Data access abstraction using repository pattern',
          rationale: `Found ${repositoryCount} repositories and ${entityCount} entities`,
          evidence_source: 'inferred from code',
          confidence_score: 0.8,
          details: {
            repository_count: repositoryCount,
            entity_count: entityCount,
            transactional_count: transactionalCount,
          },
          technologies: [
            {
              name: 'JPA/Hibernate',
              purpose: 'ORM for database access',
              reasoning: 'Detected @Entity and @Repository annotations',
            },
          ],
          communication_patterns: [],
          principles: ['separation of concerns', 'abstraction'],
        };
      }
    } catch (error) {
      logger.debug('Database pattern detection failed:', error);
    }

    return null;
  }

  /**
   * Detect messaging patterns
   */
  private async detectMessagingPattern(): Promise<ArchitecturePattern | null> {
    try {
      const files = await globby('**/pom.xml', {
        cwd: this.repoPath,
      });

      for (const file of files) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        if (content.includes('spring-kafka') || content.includes('kafka-clients')) {
          return {
            pattern_type: 'messaging',
            pattern_name: 'Apache Kafka Messaging',
            description: 'Event streaming and messaging using Kafka',
            rationale: 'Kafka dependencies detected in project',
            evidence_source: file,
            confidence_score: 0.9,
            details: {
              messaging_system: 'Apache Kafka',
            },
            technologies: [
              {
                name: 'Apache Kafka',
                purpose: 'Distributed event streaming',
                reasoning: 'Found in dependencies',
              },
            ],
            communication_patterns: ['publish-subscribe', 'event-streaming'],
            principles: ['scalability', 'fault-tolerance'],
          };
        }

        if (content.includes('spring-rabbit') || content.includes('amqp-client')) {
          return {
            pattern_type: 'messaging',
            pattern_name: 'RabbitMQ Messaging',
            description: 'Message queue using RabbitMQ',
            rationale: 'RabbitMQ dependencies detected in project',
            evidence_source: file,
            confidence_score: 0.9,
            details: {
              messaging_system: 'RabbitMQ',
            },
            technologies: [
              {
                name: 'RabbitMQ',
                purpose: 'Message broker',
                reasoning: 'Found in dependencies',
              },
            ],
            communication_patterns: ['message-queue', 'publish-subscribe'],
            principles: ['reliability', 'loose-coupling'],
          };
        }
      }
    } catch (error) {
      logger.debug('Messaging pattern detection failed:', error);
    }

    return null;
  }
}

