/**
 * API Spec Extractor - Extractor 5
 * Extracts API specifications from OpenAPI docs or code
 */

import fs from 'fs/promises';
import path from 'path';
import { globby } from 'globby';
import yaml from 'js-yaml';
import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

export interface APISpecification {
  api_name: string;
  base_url: string;
  version?: string;
  authentication_method: string;
  endpoints: Array<{
    method: string;
    path: string;
    request_schema?: any;
    response_schema?: any;
    security?: string[];
    description?: string;
  }>;
  common_headers: Record<string, string>;
  rate_limits?: any;
  error_codes?: any[];
  source: string;
}

export class APISpecExtractor {
  private repoPath: string;
  private openai: OpenAI;

  constructor(repoPath: string, openaiApiKey: string) {
    this.repoPath = repoPath;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Main extraction entry point
   */
  async extract(): Promise<APISpecification[]> {
    logger.info('Starting API specification extraction');
    const startTime = Date.now();

    try {
      const specs: APISpecification[] = [];

      // Part A: OpenAPI/Swagger detection
      const openApiSpecs = await this.extractFromOpenAPI();
      specs.push(...openApiSpecs);

      // Part B: Code-based extraction (if no OpenAPI found)
      if (openApiSpecs.length === 0) {
        const codeBasedSpecs = await this.extractFromCode();
        specs.push(...codeBasedSpecs);
      }

      const duration = Date.now() - startTime;
      logger.info(`API specification extraction completed in ${duration}ms, found ${specs.length} APIs`);

      return specs;
    } catch (error) {
      logger.error('API specification extraction failed:', error);
      throw error;
    }
  }

  /**
   * Part A: Extract from OpenAPI/Swagger files
   */
  private async extractFromOpenAPI(): Promise<APISpecification[]> {
    const specs: APISpecification[] = [];

    try {
      const openApiFiles = await globby(
        ['**/openapi.yaml', '**/openapi.json', '**/swagger.yaml', '**/swagger.json', '**/api-docs.yaml'],
        {
          cwd: this.repoPath,
          ignore: ['**/node_modules/**'],
          caseSensitiveMatch: false,
        }
      );

      logger.info(`Found ${openApiFiles.length} OpenAPI specification files`);

      for (const file of openApiFiles) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        let spec: any;
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          spec = yaml.load(content);
        } else {
          spec = JSON.parse(content);
        }

        // Parse OpenAPI spec
        const parsed = this.parseOpenAPISpec(spec, file);
        if (parsed) {
          specs.push(parsed);
        }
      }
    } catch (error) {
      logger.debug('OpenAPI extraction failed:', error);
    }

    return specs;
  }

  /**
   * Parse OpenAPI specification
   */
  private parseOpenAPISpec(spec: any, source: string): APISpecification | null {
    try {
      const info = spec.info || {};
      const servers = spec.servers || [];
      const paths = spec.paths || {};

      const endpoints: any[] = [];

      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const endpoint = details as any;

            endpoints.push({
              method: method.toUpperCase(),
              path,
              description: endpoint.summary || endpoint.description,
              request_schema: endpoint.requestBody?.content?.['application/json']?.schema,
              response_schema: endpoint.responses?.['200']?.content?.['application/json']?.schema,
              security: endpoint.security ? Object.keys(endpoint.security[0] || {}) : [],
            });
          }
        }
      }

      // Determine authentication method
      let authMethod = 'None';
      if (spec.components?.securitySchemes) {
        const schemes = spec.components.securitySchemes;
        if (schemes.bearerAuth || schemes.Bearer) authMethod = 'OAuth2 Bearer';
        else if (schemes.apiKey || schemes.ApiKeyAuth) authMethod = 'API Key';
        else if (schemes.basicAuth) authMethod = 'Basic Auth';
      }

      return {
        api_name: info.title || 'Unknown API',
        base_url: servers[0]?.url || 'unknown',
        version: info.version,
        authentication_method: authMethod,
        endpoints,
        common_headers: {},
        source,
      };
    } catch (error) {
      logger.error('OpenAPI parsing failed:', error);
      return null;
    }
  }

  /**
   * Part B: Extract from code
   */
  private async extractFromCode(): Promise<APISpecification[]> {
    const specs: APISpecification[] = [];

    try {
      // Extract HTTP calls from code
      const httpCalls = await this.extractHTTPCalls();
      logger.info(`Found ${httpCalls.length} HTTP calls in code`);

      if (httpCalls.length > 0) {
        // Group by base URL
        const grouped = this.groupByBaseURL(httpCalls);

        for (const [baseUrl, calls] of grouped.entries()) {
          const spec = await this.inferAPISpec(baseUrl, calls);
          if (spec) {
            specs.push(spec);
          }
        }
      }
    } catch (error) {
      logger.error('Code-based extraction failed:', error);
    }

    return specs;
  }

  /**
   * Extract HTTP calls from Java code
   */
  private async extractHTTPCalls(): Promise<any[]> {
    const calls: any[] = [];

    try {
      const javaFiles = await globby('**/*.java', {
        cwd: this.repoPath,
        ignore: ['**/test/**', '**/target/**'],
      });

      for (const file of javaFiles) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');

        // Look for HTTP client calls
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // RestTemplate patterns
          if (line.includes('.postForEntity') || line.includes('.exchange') || line.includes('.getForEntity')) {
            const method = line.includes('postForEntity')
              ? 'POST'
              : line.includes('getForEntity')
              ? 'GET'
              : line.includes('PUT')
              ? 'PUT'
              : 'UNKNOWN';

            // Try to extract URL
            const urlMatch = line.match(/["']([^"']+)["']/);
            const url = urlMatch ? urlMatch[1] : null;

            if (url) {
              // Extract request/response types
              const typeMatch = content.substring(Math.max(0, content.indexOf(line) - 500), content.indexOf(line) + 500);

              calls.push({
                file,
                line: i + 1,
                method,
                url,
                context: typeMatch,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('HTTP call extraction failed:', error);
    }

    return calls;
  }

  /**
   * Group HTTP calls by base URL
   */
  private groupByBaseURL(calls: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const call of calls) {
      try {
        const url = new URL(call.url);
        const baseUrl = `${url.protocol}//${url.host}`;

        if (!grouped.has(baseUrl)) {
          grouped.set(baseUrl, []);
        }

        grouped.get(baseUrl)!.push(call);
      } catch {
        // If not a full URL, try to extract base from context
        const baseMatch = call.context.match(/(https?:\/\/[^\/\s"']+)/);
        if (baseMatch) {
          const baseUrl = baseMatch[1];
          if (!grouped.has(baseUrl)) {
            grouped.set(baseUrl, []);
          }
          grouped.get(baseUrl)!.push(call);
        }
      }
    }

    return grouped;
  }

  /**
   * Infer API specification using LLM
   */
  private async inferAPISpec(baseUrl: string, calls: any[]): Promise<APISpecification | null> {
    try {
      const callsText = calls
        .slice(0, 10)
        .map((c) => `Method: ${c.method}\nURL: ${c.url}\n`)
        .join('\n');

      const prompt = `Analyze these HTTP client usages to infer API behavior:

Base URL: ${baseUrl}

Calls found:
${callsText}

Infer:
1. API name (what service is this?)
2. API version (v1, v2 in paths?)
3. Authentication method (from headers in code)
4. Common patterns (always JSON? always include request-id?)

Output JSON:
{
  "api_name": "string",
  "version": "string or null",
  "authentication": "string",
  "common_headers": ["string"],
  "patterns": ["string"]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an API expert analyzing HTTP client code. Return valid JSON only.',
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

      // Convert calls to endpoints
      const endpoints = calls.map((call) => {
        try {
          const url = new URL(call.url);
          return {
            method: call.method,
            path: url.pathname,
          };
        } catch {
          return {
            method: call.method,
            path: call.url,
          };
        }
      });

      return {
        api_name: result.api_name || 'Unknown API',
        base_url: baseUrl,
        version: result.version,
        authentication_method: result.authentication || 'Unknown',
        endpoints,
        common_headers: result.common_headers?.reduce((acc: any, h: string) => {
          acc[h] = 'inferred';
          return acc;
        }, {}) || {},
        source: 'inferred from code',
      };
    } catch (error) {
      logger.error('API spec inference failed:', error);
      return null;
    }
  }
}

