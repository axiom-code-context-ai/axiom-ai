# Axiom AI - Enterprise Knowledge System Quickstart

Get up and running with the enterprise-aware code intelligence system in under 30 minutes.

## Prerequisites Check

```bash
# Node.js 20+
node --version  # Should be v20.x.x or higher

# PostgreSQL with pgvector
psql --version  # Should be 14+ or higher

# Redis
redis-cli ping  # Should return PONG

# Git
git --version
```

## Step 1: Database Setup (5 minutes)

### 1.1 Run Base Schema

```bash
cd database
psql -U postgres -c "CREATE DATABASE axiom_db;"
psql -U postgres -c "CREATE USER axiom WITH PASSWORD 'axiom_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE axiom_db TO axiom;"

# Run base schema
psql -U axiom -d axiom_db -f 01-schema.sql
```

### 1.2 Run Enterprise Knowledge Migration

```bash
psql -U axiom -d axiom_db -f migrations/02-enterprise-knowledge-schema.sql
```

**Verify:**
```bash
psql -U axiom -d axiom_db -c "\dt core.*" | grep "framework_fingerprints\|architecture_patterns\|domain_models\|code_patterns"
```

You should see:
- core.framework_fingerprints
- core.architecture_patterns
- core.domain_models
- core.code_patterns
- core.api_specifications
- core.extraction_logs

## Step 2: Environment Configuration (2 minutes)

Create `.env` file in project root:

```bash
cat > .env << 'EOF'
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom_db
DB_USER=axiom
DB_PASSWORD=axiom_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenAI (required for extraction)
OPENAI_API_KEY=sk-your-openai-key-here

# Optional: Anthropic (alternative LLM)
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# Service Ports
CRAWLER_AGENT_PORT=3001
MCP_SERVER_PORT=3002

# Node Environment
NODE_ENV=development
EOF
```

**Get OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Copy and paste into `.env`

## Step 3: Install Dependencies (5 minutes)

### 3.1 Install Crawler Agent Dependencies

```bash
cd services/crawler-agent
npm install
```

This installs:
- Tree-sitter + language parsers
- OpenAI SDK
- Database connectors
- Queue management

### 3.2 Install MCP Server Dependencies

```bash
cd ../mcp-server
npm install
```

### 3.3 Build Services

```bash
# Build crawler agent
cd services/crawler-agent
npm run build

# Build MCP server
cd ../mcp-server
npm run build
```

## Step 4: Start Services (2 minutes)

### 4.1 Start Redis (if not running)

```bash
redis-server --daemonize yes
```

### 4.2 Start Crawler Agent

```bash
cd services/crawler-agent
npm start
```

**Verify:** Open http://localhost:3001/health
Should see: `{"status":"healthy","service":"Axiom AI Crawler Agent"}`

### 4.3 Start MCP Server (in new terminal)

```bash
cd services/mcp-server
npm start
```

**Verify:** Check logs for "MCP server created and configured successfully"

## Step 5: Test Extraction (10 minutes)

### 5.1 Create a Test Repository

```bash
# In database
psql -U axiom -d axiom_db << 'EOF'
INSERT INTO core.repositories (id, workspace_id, name, url, auth_type, auth_config)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002',
  'Test Repo',
  'https://github.com/spring-projects/spring-petclinic.git',
  'public',
  '{}'
);
EOF
```

### 5.2 Trigger Extraction

```bash
curl -X POST http://localhost:3001/api/extraction/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repository_id": "00000000-0000-0000-0000-000000000100",
    "git_url": "https://github.com/spring-projects/spring-petclinic.git",
    "priority": 5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Extraction queued successfully",
  "data": {
    "job_id": 1,
    "repository_id": "00000000-0000-0000-0000-000000000100",
    "status": "queued"
  }
}
```

### 5.3 Monitor Progress

```bash
# Check status every 30 seconds
watch -n 30 'curl -s http://localhost:3001/api/extraction/status/00000000-0000-0000-0000-000000000100 | jq ".data.repository.extraction_status"'
```

Statuses:
- `pending` → Job queued
- `analyzing` → Extraction running
- `completed` → Success! ✓
- `failed` → Check logs
- `partial` → Some extractors failed, but context available

**Expected Duration:** 5-10 minutes for spring-petclinic

### 5.4 View Results

```bash
# Get extraction statistics
curl -s http://localhost:3001/api/extraction/stats/00000000-0000-0000-0000-000000000100 | jq

# Get detailed logs
curl -s http://localhost:3001/api/extraction/logs/00000000-0000-0000-0000-000000000100 | jq
```

**Expected Stats:**
```json
{
  "statistics": {
    "frameworks": 1,
    "architecture_patterns": 2-3,
    "domain_models": 5-10,
    "code_patterns": 10-20,
    "api_specifications": 1-2,
    "standard_patterns": 7-15,
    "total_pattern_occurrences": 50-100
  }
}
```

## Step 6: Configure Cursor (5 minutes)

### 6.1 Create MCP Configuration

Find your Cursor MCP config location:
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
- **Windows:** `%APPDATA%\Cursor\User\globalStorage\rooveterinaryinc.roo-cline\settings\cline_mcp_settings.json`
- **Linux:** `~/.config/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

Add Axiom AI server:

```json
{
  "mcpServers": {
    "axiom-ai": {
      "command": "node",
      "args": ["/absolute/path/to/axiom_ai/services/mcp-server/dist/index.js"],
      "env": {
        "WORKSPACE_ID": "00000000-0000-0000-0000-000000000002",
        "API_KEY": "your-api-key-if-needed",
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "axiom_db",
        "DB_USER": "axiom",
        "DB_PASSWORD": "axiom_password"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/axiom_ai` with your actual path!

### 6.2 Restart Cursor

Close and reopen Cursor completely.

### 6.3 Verify Connection

In Cursor, open the command palette and type "MCP". You should see Axiom AI tools available.

Or check logs:
```bash
tail -f ~/Library/Logs/Cursor/mcp-server.log  # macOS
```

## Step 7: Test in Cursor (5 minutes)

### 7.1 Open a Project

Open any project in Cursor (or the test repo).

### 7.2 Ask for Enterprise Context

In Cursor chat, try:

```
@axiom-ai Explain the architecture patterns in this codebase
```

Or for code generation:

```
@axiom-ai Show me how to add a new REST endpoint following our standard patterns
```

### 7.3 Expected Response

You should see:
```
# Enterprise Context for: "Show me how to add a new REST endpoint..."

**Repository:** Test Repo
**Primary Language:** java
**Last Analyzed:** [timestamp]

---

## 📊 Enterprise Knowledge Available

- Architecture Patterns: 2
- Domain Models: 8
- Code Patterns: 15
- Custom Frameworks: 1
- API Specifications: 1

**Context Quality Score:** 85%

## 📝 Enhanced Context Prompt

The following comprehensive context has been assembled for you...

## LEVEL 1: ARCHITECTURAL PATTERNS

### Repository Pattern with JPA
**Type:** repository-pattern
**Description:** Data access abstraction using repository pattern
...

## LEVEL 2: DOMAIN MODELS

### Pet Domain
Entities: Pet, Owner, Visit
Services: PetService, OwnerService
...

## LEVEL 3: STANDARD IMPLEMENTATION PATTERNS

### JPA Repository Pattern
**Usage:** 8 occurrences (STANDARD ✓)
**Category:** database_access

Template:
```java
public interface ${EntityName}Repository extends JpaRepository<${EntityName}, ${IdType}> {
  // Custom query methods
}
```
...
```

## 🎉 Success!

You now have:
- ✅ Database with enterprise knowledge schema
- ✅ Services running (crawler-agent + MCP server)
- ✅ Test repository analyzed
- ✅ Cursor configured with MCP
- ✅ Enterprise context available for code generation

## What's Next?

### Analyze Your Own Repository

```bash
# 1. Add your repository
psql -U axiom -d axiom_db << 'EOF'
INSERT INTO core.repositories (workspace_id, name, url, auth_type, auth_config)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'My Company Repo',
  'https://github.com/mycompany/myrepo.git',
  'token',
  '{"token": "ghp_your_token_here"}'
)
RETURNING id;
EOF

# 2. Copy the returned ID

# 3. Trigger extraction
curl -X POST http://localhost:3001/api/extraction/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "repository_id": "paste-id-here",
    "git_url": "https://github.com/mycompany/myrepo.git"
  }'

# 4. Wait 10-30 minutes depending on repo size

# 5. Use in Cursor!
```

### Set Up Webhooks (Optional)

Auto-trigger extraction on git push:

```bash
# GitHub webhook URL
POST http://your-server.com:3001/api/extraction/webhook/github
```

### Monitor Production

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3002/health

# View extraction queue
redis-cli LLEN bull:extraction:wait

# Check database stats
psql -U axiom -d axiom_db -c "
  SELECT 
    r.name,
    r.extraction_status,
    COUNT(DISTINCT cp.id) as patterns,
    COUNT(DISTINCT dm.id) as domains,
    r.extraction_cost_usd
  FROM core.repositories r
  LEFT JOIN core.code_patterns cp ON cp.repository_id = r.id
  LEFT JOIN core.domain_models dm ON dm.repository_id = r.id
  GROUP BY r.id
"
```

## Troubleshooting

### Extraction Stuck at "pending"

```bash
# Check queue
redis-cli LLEN bull:extraction:wait

# Check worker logs
cd services/crawler-agent
npm run dev  # Restart with detailed logs
```

### Cursor Not Finding MCP Tool

1. **Check MCP config path:** Ensure JSON is valid
2. **Restart Cursor:** Completely quit and reopen
3. **Check logs:** `tail -f ~/Library/Logs/Cursor/mcp-server.log`
4. **Test manually:**
   ```bash
   node services/mcp-server/dist/index.js
   ```

### Database Connection Error

```bash
# Test connection
psql -U axiom -d axiom_db -c "SELECT 1"

# Check .env file
cat .env | grep DB_

# Verify user permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE axiom_db TO axiom;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core TO axiom;"
```

### Out of Memory During Extraction

```bash
# Increase Node memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

## Support

- **Documentation:** See `ENTERPRISE_KNOWLEDGE_SETUP.md` for detailed guide
- **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md`
- **Issues:** Check logs in `services/*/dist/logs/`

---

**Total Setup Time:** ~30 minutes
**Time to First Enterprise Context:** ~45 minutes (including first extraction)

Happy coding with enterprise-aware AI! 🚀

