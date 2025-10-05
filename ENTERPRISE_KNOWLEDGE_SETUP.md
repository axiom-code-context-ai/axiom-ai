# Enterprise Knowledge System - Setup Guide

This guide covers the setup and configuration of Axiom AI's Enterprise Knowledge Extraction system.

## Overview

The Enterprise Knowledge system extracts and maintains hierarchical knowledge from your codebases:

1. **Architecture Patterns** - Design decisions and patterns
2. **Domain Models** - Business entities and relationships
3. **Code Patterns** - Implementation templates and conventions
4. **Framework Standards** - Custom framework usage patterns
5. **API Specifications** - Internal and external API specs

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ with pgvector extension
- Redis 7+
- OpenAI API key (for LLM-powered extraction)
- Tree-sitter language parsers (installed via npm)

## Installation

### 1. Database Setup

Run the new migration to create enterprise knowledge tables:

```bash
cd database/migrations
psql -U axiom -d axiom_db -f 02-enterprise-knowledge-schema.sql
```

This creates:
- `core.framework_fingerprints`
- `core.architecture_patterns`
- `core.domain_models`
- `core.code_patterns`
- `core.api_specifications`
- `core.extraction_logs`
- `vector.context_cache`

### 2. Install Dependencies

Update crawler-agent service dependencies:

```bash
cd services/crawler-agent
npm install
```

This installs:
- Tree-sitter and language parsers (Java, Python, TypeScript, Go, Rust, C#)
- OpenAPI parser
- Markdown parser
- YAML/TOML parsers
- Tiktoken (for token counting)

### 3. Environment Configuration

Add to your `.env` file:

```bash
# OpenAI API Key for LLM extraction
OPENAI_API_KEY=sk-your-key-here

# Optional: Anthropic API Key (alternative LLM)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Redis for job queue and caching
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom_db
DB_USER=axiom
DB_PASSWORD=your-password

# MCP Server
MCP_SERVER_NAME=axiom-ai-enterprise
MCP_SERVER_VERSION=2.0.0
```

### 4. Build Services

```bash
# Build crawler-agent
cd services/crawler-agent
npm run build

# Build MCP server
cd ../mcp-server
npm run build
```

## Usage

### 1. Trigger Extraction for a Repository

Use the API to trigger extraction:

```bash
curl -X POST http://localhost:3001/api/extraction/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repository_id": "your-repo-uuid",
    "git_url": "https://github.com/yourorg/yourrepo.git",
    "priority": 5
  }'
```

This queues an extraction job that will:
1. Clone the repository
2. Run RepositoryAnalyzer (detect languages, frameworks, custom components)
3. Run 4 extractors in parallel:
   - ArchitectureExtractor
   - DomainExtractor
   - PatternMiner
   - APISpecExtractor
4. Store results in database
5. Clean up temporary files

### 2. Monitor Extraction Progress

Check status:

```bash
curl http://localhost:3001/api/extraction/status/{repository_id}
```

View detailed logs:

```bash
curl http://localhost:3001/api/extraction/logs/{repository_id}
```

Get extraction statistics:

```bash
curl http://localhost:3001/api/extraction/stats/{repository_id}
```

### 3. Use Enterprise Context in Cursor/Cline

In Cursor or Cline, the enhanced MCP tool is automatically available:

**Standard search:**
```
User: "Find authentication code"
Tool: search_code (traditional vector search)
```

**Enterprise-aware search:**
```
User: "Implement payment processing with Stripe"
Tool: search_code_with_enterprise_context

Returns:
- Architecture context: "Event-driven with async processing"
- Domain context: "Payment domain entities and services"
- Standard patterns: "Use GingerClient for HTTP (95% usage)"
- Framework standards: "Custom R1 framework conventions"
- API specs: "Payment API v2.1.3 endpoints"
```

## Extraction Performance

### Expected Duration

- **Small repo** (<10K files): 10-15 minutes
- **Medium repo** (10-50K files): 20-30 minutes
- **Large repo** (50K+ files): 30-60 minutes

### Cost Estimates (LLM API calls)

Per repository extraction:
- RepositoryAnalyzer: $0 (no LLM)
- ArchitectureExtractor: ~$0.10 (if docs exist, $0 if inferred)
- DomainExtractor: ~$0.20
- PatternMiner: ~$1.00
- APISpecExtractor: ~$0.25 (if no OpenAPI spec)

**Total:** ~$1.50 per repository

### Incremental Updates

For faster subsequent extractions, the system supports incremental updates:

```bash
curl -X POST http://localhost:3001/api/extraction/incremental \
  -d '{"repository_id": "uuid", "since_commit": "abc123"}'
```

This re-runs extractors only for changed files, reducing time to 2-5 minutes.

## Architecture

### Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  ExtractionOrchestrator                                     │
│  ├─ Step 1: RepositoryAnalyzer (SEQUENTIAL)                │
│  │   └─ Detects: Languages, frameworks, custom components  │
│  │                                                           │
│  └─ Step 2-5: Parallel Execution                           │
│      ├─ ArchitectureExtractor (docs + code inference)      │
│      ├─ DomainExtractor (entities + services)              │
│      ├─ PatternMiner (code patterns + templates)           │
│      └─ APISpecExtractor (OpenAPI + code inference)        │
└─────────────────────────────────────────────────────────────┘
```

### Context Assembly at Runtime

```
User Query: "Add payment processing"
      ↓
┌─────────────────────────────────────┐
│  ContextAssembler                   │
│  ├─ Intent Classification           │
│  ├─ Hierarchical Query              │
│  │   ├─ Level 1: Architecture       │
│  │   ├─ Level 2: Domain + APIs      │
│  │   ├─ Level 3: Code Patterns      │
│  │   └─ Level 4: Framework Standards│
│  ├─ Token Budget Allocation         │
│  └─ Enhanced Prompt Formatting      │
└─────────────────────────────────────┘
      ↓
Enhanced Context (8000 tokens)
      ↓
Cursor/Claude generates code
```

### Caching Strategy

- **Context Cache:** Assembled contexts cached for 1 hour (Redis)
- **Query Hash:** SHA-256 of normalized query
- **Invalidation:** On new extraction or explicit cache clear
- **Hit Rate Target:** 60%+

## Troubleshooting

### Extraction Fails

**Check logs:**
```bash
curl http://localhost:3001/api/extraction/logs/{repository_id}
```

**Common issues:**
1. **Git clone failure:** Check repository URL and credentials
2. **LLM API timeout:** Retry with exponential backoff (automatic)
3. **Tree-sitter parse error:** Check file encoding (skip on error)
4. **Out of memory:** Reduce parallel extractors or increase node memory

**Re-trigger extraction:**
```bash
curl -X POST http://localhost:3001/api/extraction/trigger \
  -d '{"repository_id": "uuid", "git_url": "...", "priority": 10}'
```

### Poor Context Quality

**Check extraction stats:**
```bash
curl http://localhost:3001/api/extraction/stats/{repository_id}
```

**Quality indicators:**
- Architecture patterns: ≥1 (at least one detected)
- Domain models: ≥3 (multiple business domains)
- Code patterns: ≥10 (standard patterns identified)
- Standard pattern ratio: ≥70% (most patterns are standard)

**If quality is low:**
1. Ensure repository has documentation (ADRs, architecture docs)
2. Check that custom frameworks are detected
3. Verify code follows consistent patterns
4. Consider manual pattern annotation

### Context Not Appearing in Cursor

1. **Verify extraction completed:**
   ```bash
   curl http://localhost:3001/api/extraction/status/{repository_id}
   # Should show: extraction_status: "completed"
   ```

2. **Check MCP server connection:**
   - Restart Cursor
   - Verify MCP server is running
   - Check MCP logs for errors

3. **Test MCP tool directly:**
   ```bash
   npx @modelcontextprotocol/inspector dist/index.js
   ```

4. **Clear cache and retry:**
   ```bash
   curl -X DELETE http://localhost:3001/api/extraction/cache/{repository_id}
   ```

## Best Practices

### 1. Run Extraction During Off-Hours

Extraction is CPU and API-intensive. Schedule for:
- Overnight (10 PM - 6 AM)
- Weekends
- Low-usage periods

### 2. Incremental Updates

After initial extraction, use incremental updates:
- Trigger on git webhook (new commits)
- Run daily for active repos
- Full re-extraction monthly

### 3. Monitor Costs

Track LLM API costs:
```bash
curl http://localhost:3001/api/extraction/stats/{repository_id}
# Check: extraction_cost_usd
```

Set budget alerts in OpenAI dashboard.

### 4. Cache Warming

For frequently accessed repos, warm cache:
```bash
# Common developer queries
curl -X POST http://localhost:3001/api/context/warm \
  -d '{
    "repository_id": "uuid",
    "queries": [
      "add authentication",
      "payment processing",
      "database integration"
    ]
  }'
```

### 5. Quality Reviews

Periodically review extracted knowledge:
1. Check pattern accuracy
2. Verify framework detection
3. Validate API specifications
4. Update manual annotations if needed

## Migration from V1

If upgrading from basic vector search:

1. **Backup database:**
   ```bash
   pg_dump axiom_db > backup.sql
   ```

2. **Run migration:**
   ```bash
   psql -U axiom -d axiom_db -f 02-enterprise-knowledge-schema.sql
   ```

3. **Trigger extraction for all repositories:**
   ```bash
   # Get all repository IDs
   psql -U axiom -d axiom_db -c "SELECT id, url FROM core.repositories"
   
   # Trigger each one
   for repo in $(cat repo_ids.txt); do
     curl -X POST http://localhost:3001/api/extraction/trigger \
       -d "{\"repository_id\": \"$repo\", \"git_url\": \"...\"}"
   done
   ```

4. **Verify extraction:**
   ```bash
   psql -U axiom -d axiom_db -c "
     SELECT 
       r.name, 
       r.extraction_status,
       COUNT(cp.id) as patterns,
       COUNT(dm.id) as domains
     FROM core.repositories r
     LEFT JOIN core.code_patterns cp ON cp.repository_id = r.id
     LEFT JOIN core.domain_models dm ON dm.repository_id = r.id
     GROUP BY r.id, r.name, r.extraction_status
   "
   ```

5. **Update Cursor MCP config:**
   ```json
   {
     "mcpServers": {
       "axiom-ai": {
         "command": "node",
         "args": ["/path/to/axiom-ai/services/mcp-server/dist/index.js"],
         "env": {
           "WORKSPACE_ID": "your-workspace-id",
           "API_KEY": "your-api-key"
         }
       }
     }
   }
   ```

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourorg/axiom-ai/issues
- Documentation: https://docs.axiom-ai.dev
- Discord: https://discord.gg/axiom-ai

## Next Steps

1. **Analyze your first repository** using the API
2. **Try the enhanced MCP tool** in Cursor
3. **Review extraction quality** and iterate
4. **Set up webhook** for automatic updates
5. **Configure caching** for better performance

Happy coding with enterprise-aware AI! 🚀

