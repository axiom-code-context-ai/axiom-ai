/**
 * Enhanced Search Code with Enterprise Context Tool
 * Provides hierarchical enterprise-aware context for code generation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createModuleLogger } from '../utils/logger.js';
import { ServerContext } from '../server/mcpServer.js';
import axios from 'axios';

const logger = createModuleLogger('search-code-with-context-tool');

// Input schema
const SearchCodeWithContextInputSchema = z.object({
  query: z.string().min(1).max(2000).describe('User query or task description'),
  workspaceId: z.string().uuid().optional().describe('Workspace ID (optional if in context)'),
  tokenBudget: z.number().min(1000).max(16000).default(8000).describe('Token budget for context (default: 8000)'),
  includeHierarchy: z.boolean().default(true).describe('Include hierarchical enterprise context'),
  includeVectorSearch: z.boolean().default(true).describe('Include traditional vector search results'),
});

type SearchCodeWithContextInput = z.infer<typeof SearchCodeWithContextInputSchema>;

/**
 * Register the enhanced search tool with enterprise context
 */
export async function registerSearchCodeWithContextTool(server: McpServer, context: ServerContext) {
  // CRITICAL: MCP SDK wraps the schema in z.object() (see sdk/dist/esm/server/mcp.js line 449)
  // So we must pass the SHAPE, not the ZodObject itself!
  const schemaShape = SearchCodeWithContextInputSchema.shape
  
  server.registerTool(
    'search_code_with_enterprise_context',
    {
      title: 'Search Code with Enterprise Context',
      description:
        'Advanced code search that provides hierarchical enterprise-aware context including architecture patterns, domain models, implementation patterns, and framework conventions. This is the recommended tool for code generation tasks.',
      inputSchema: schemaShape as any,
    },
    (async (args: any) => {
      const { query, workspaceId, tokenBudget = 8000, includeHierarchy = true, includeVectorSearch = true } = args || {}
      try {
        // Validate input
        const validatedInput = SearchCodeWithContextInputSchema.parse({
          query,
          workspaceId,
          tokenBudget,
          includeHierarchy,
          includeVectorSearch,
        });

        // Use workspace ID from context if not provided
        const targetWorkspaceId = validatedInput.workspaceId || context.workspaceId;
        if (!targetWorkspaceId) {
          throw new Error('Workspace ID is required for code search');
        }

        logger.info('Performing enterprise context search', {
          query: validatedInput.query,
          workspaceId: targetWorkspaceId,
          tokenBudget: validatedInput.tokenBudget,
        });

        // Get repository for workspace
        const repoResult = await context.db.query(
          `SELECT id, name, primary_language, analyzed_at, extraction_status 
           FROM core.repositories 
           WHERE workspace_id = $1 
           ORDER BY analyzed_at DESC NULLS LAST
           LIMIT 1`,
          [targetWorkspaceId]
        );

        if (repoResult.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ **No Repository Found**

No analyzed repository found for this workspace. Please add and analyze a repository first.

**Next Steps:**
1. Add a repository to this workspace
2. Trigger analysis to extract enterprise knowledge
3. Wait for extraction to complete
4. Try your query again`,
              },
            ],
          };
        }

        const repository = repoResult.rows[0];

        if (repository.extraction_status !== 'completed') {
          return {
            content: [
              {
                type: 'text',
                text: `⚠️  **Repository Analysis In Progress**

Repository: ${repository.name}
Status: ${repository.extraction_status}

Enterprise context is not yet available. The repository is currently being analyzed.

**For now, using basic search...**`,
              },
            ],
          };
        }

        // Call context assembler (via crawler-agent service)
        let enterpriseContext: any = null;
        let enhancedPrompt: string | null = null;

        if (includeHierarchy) {
          try {
            // In production, this would call the crawler-agent service
            // For now, we'll query the database directly
            const contextResult = await context.db.query(
              `SELECT * FROM get_enterprise_context($1, NULL, NULL)`,
              [repository.id]
            );

            if (contextResult.rows.length > 0) {
              enterpriseContext = contextResult.rows[0].get_enterprise_context;

              // Format enhanced prompt
              enhancedPrompt = await formatEnhancedPrompt(query, enterpriseContext, repository);

              logger.info('Enterprise context assembled', {
                tokensUsed: Math.ceil(enhancedPrompt.length / 4),
                qualityScore: calculateQualityScore(enterpriseContext),
              });
            }
          } catch (error) {
            logger.error('Failed to assemble enterprise context:', error);
            // Continue with vector search only
          }
        }

        // Traditional vector search (if requested)
        let vectorResults: any[] = [];
        if (includeVectorSearch) {
          try {
            const searchResults = await context.searchService.search({
              query: validatedInput.query,
              workspaceId: targetWorkspaceId,
              type: 'hybrid',
              options: {
                limit: 10,
                includeContent: true,
              },
            });

            vectorResults = searchResults.results;
          } catch (error) {
            logger.error('Vector search failed:', error);
          }
        }

        // Format response
        const responseText = formatEnterpriseResponse(
          query,
          repository,
          enterpriseContext,
          vectorResults,
          enhancedPrompt
        );

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
          meta: {
            repository: {
              id: repository.id,
              name: repository.name,
              language: repository.primary_language,
              analyzed_at: repository.analyzed_at,
            },
            enterprise_context_available: !!enterpriseContext,
            enhanced_prompt_length: enhancedPrompt?.length || 0,
            vector_results_count: vectorResults.length,
            context_quality_score: enterpriseContext ? calculateQualityScore(enterpriseContext) : 0,
          },
        };
      } catch (error) {
        logger.error('Enterprise context search failed:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          content: [
            {
              type: 'text',
              text: `❌ **Enterprise Context Search Failed**

**Error:** ${errorMessage}

**Troubleshooting:**
1. Verify the repository has been analyzed
2. Check that enterprise knowledge extraction completed successfully
3. Ensure proper database connectivity
4. Try with a simpler query

**Need Help?**
- Check extraction logs: \`GET /api/repositories/{id}/extraction-logs\`
- Re-trigger analysis if needed: \`POST /api/repositories/{id}/analyze\``,
            },
          ],
        };
      }
    }) as any
  );

  logger.info('Search code with enterprise context tool registered successfully');
}

/**
 * Format enhanced prompt with hierarchical context
 */
async function formatEnhancedPrompt(
  userQuery: string,
  enterpriseContext: any,
  repository: any
): Promise<string> {
  let prompt = `# TASK
${userQuery}

---

# ENTERPRISE CONTEXT FOR: ${repository.name}
Last analyzed: ${new Date(repository.analyzed_at).toLocaleString()}

`;

  // Level 1: Architecture
  if (enterpriseContext.architecture && enterpriseContext.architecture.length > 0) {
    prompt += `## LEVEL 1: ARCHITECTURAL PATTERNS

`;
    for (const pattern of enterpriseContext.architecture) {
      prompt += `### ${pattern.pattern_name}
**Type:** ${pattern.pattern_type}
**Description:** ${pattern.description}
**Rationale:** ${pattern.rationale}
**Evidence:** ${pattern.evidence_source}
**Confidence:** ${(pattern.confidence_score * 100).toFixed(0)}%

`;
    }
  }

  // Level 2: Domain Models
  if (enterpriseContext.domains && enterpriseContext.domains.length > 0) {
    prompt += `## LEVEL 2: DOMAIN MODELS

`;
    for (const domain of enterpriseContext.domains) {
      prompt += `### ${domain.domain_name} Domain
${domain.summary}

**Entities:** ${domain.entities?.length || 0}
**Services:** ${domain.services?.length || 0}
**Business Rules:**
${domain.business_rules?.map((rule: string) => `- ${rule}`).join('\n') || 'None specified'}

`;
    }
  }

  // Level 3: Code Patterns
  if (enterpriseContext.patterns && enterpriseContext.patterns.length > 0) {
    prompt += `## LEVEL 3: STANDARD IMPLEMENTATION PATTERNS

`;
    for (const pattern of enterpriseContext.patterns.slice(0, 5)) {
      prompt += `### ${pattern.pattern_name}
**Category:** ${pattern.category}
**Usage:** ${pattern.frequency} occurrences (${pattern.is_standard ? 'STANDARD ✓' : 'variant'})
**Language:** ${pattern.language}

**Explanation:** ${pattern.explanation}

**When to use:** ${pattern.when_to_use}

**Template:**
\`\`\`${pattern.language}
${pattern.template}
\`\`\`

`;
    }
  }

  // Level 4: Framework Standards
  if (enterpriseContext.frameworks && enterpriseContext.frameworks.length > 0) {
    prompt += `## LEVEL 4: FRAMEWORK STANDARDS & CONVENTIONS

`;
    for (const framework of enterpriseContext.frameworks) {
      if (framework.is_custom) {
        prompt += `### Custom Framework: ${framework.package_name}
**Type:** ${framework.framework_type}
**Version:** ${framework.framework_version || 'unknown'}

**Standard Components (USE THESE):**
${
  framework.custom_components
    ?.map((comp: any) => `- **${comp.name}** (${comp.type}): ${comp.usage} - Used ${comp.occurrence_count || 0} times`)
    .join('\n') || 'None'
}

**Configuration Namespaces:**
${framework.config_namespaces?.map((ns: string) => `- ${ns}`).join('\n') || 'None'}

`;
      }
    }
  }

  // Level 5: API Specifications
  if (enterpriseContext.apis && enterpriseContext.apis.length > 0) {
    prompt += `## LEVEL 5: API SPECIFICATIONS

`;
    for (const api of enterpriseContext.apis) {
      prompt += `### ${api.api_name}
**Base URL:** ${api.base_url}
**Version:** ${api.version || 'unknown'}
**Authentication:** ${api.authentication_method}

**Endpoints:**
${
  api.endpoints
    ?.slice(0, 5)
    .map((ep: any) => `- ${ep.method} ${ep.path}`)
    .join('\n') || 'None'
}

`;
    }
  }

  prompt += `---

# INSTRUCTIONS

Generate code that:
1. **Follows** the architectural patterns from Level 1
2. **Uses** domain models and services from Level 2
3. **Implements** using standard patterns from Level 3 (prefer patterns with higher usage counts)
4. **Adheres** to framework conventions from Level 4 (use custom components, not generic alternatives)
5. **Integrates** with APIs using specifications from Level 5

**IMPORTANT:** Prefer standard patterns (marked with ✓) that have high usage counts in the codebase. These represent your organization's established conventions.
`;

  return prompt;
}

/**
 * Format response text
 */
function formatEnterpriseResponse(
  query: string,
  repository: any,
  enterpriseContext: any,
  vectorResults: any[],
  enhancedPrompt: string | null
): string {
  let response = `# Enterprise Context for: "${query}"

**Repository:** ${repository.name}
**Primary Language:** ${repository.primary_language}
**Last Analyzed:** ${new Date(repository.analyzed_at).toLocaleString()}

---

`;

  if (enterpriseContext) {
    response += `## 📊 Enterprise Knowledge Available

`;

    const stats = {
      architecturePatterns: enterpriseContext.architecture?.length || 0,
      domains: enterpriseContext.domains?.length || 0,
      codePatterns: enterpriseContext.patterns?.length || 0,
      frameworks: enterpriseContext.frameworks?.length || 0,
      apis: enterpriseContext.apis?.length || 0,
    };

    response += `- **Architecture Patterns:** ${stats.architecturePatterns}
- **Domain Models:** ${stats.domains}
- **Code Patterns:** ${stats.codePatterns}
- **Custom Frameworks:** ${stats.frameworks}
- **API Specifications:** ${stats.apis}

**Context Quality Score:** ${(calculateQualityScore(enterpriseContext) * 100).toFixed(0)}%

`;

    if (enhancedPrompt) {
      response += `## 📝 Enhanced Context Prompt

The following comprehensive context has been assembled for you. Use this to guide your code generation:

---

${enhancedPrompt}

---

`;
    }
  } else {
    response += `## ⚠️ Enterprise Context Not Available

Enterprise knowledge extraction has not been completed for this repository.

`;
  }

  if (vectorResults.length > 0) {
    response += `## 🔍 Relevant Code Examples (Vector Search)

Found ${vectorResults.length} relevant code examples:

${vectorResults
  .slice(0, 5)
  .map(
    (result, i) => `
### ${i + 1}. ${result.functionName || result.className || result.fileName}
**File:** \`${result.filePath}\`
**Relevance:** ${(result.combinedScore * 100).toFixed(1)}%

\`\`\`${result.language || 'text'}
${result.codeSnippet}
\`\`\`
`
  )
  .join('\n')}

`;
  }

  response += `## 💡 Next Steps

1. Review the enterprise context above
2. Follow the standard patterns and conventions
3. Use custom framework components where applicable
4. Ensure generated code matches your organization's architecture

**Need more specific examples?** Try refining your query with:
- Specific component names (e.g., "GingerClient usage")
- Domain context (e.g., "Payment processing")
- Pattern categories (e.g., "API integration patterns")
`;

  return response;
}

/**
 * Calculate context quality score
 */
function calculateQualityScore(context: any): number {
  let score = 0;

  if (context.architecture && context.architecture.length > 0) score += 0.25;
  if (context.domains && context.domains.length > 0) score += 0.25;
  if (context.patterns && context.patterns.length > 0) {
    score += 0.15;
    const standardPatterns = context.patterns.filter((p: any) => p.is_standard).length;
    if (standardPatterns > 0) {
      score += (standardPatterns / context.patterns.length) * 0.15;
    }
  }
  if (context.frameworks && context.frameworks.filter((f: any) => f.is_custom).length > 0) {
    score += 0.2;
  }

  return Math.min(1.0, score);
}

