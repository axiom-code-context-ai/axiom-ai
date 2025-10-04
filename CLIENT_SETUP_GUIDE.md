# 🚀 Axiom AI - Complete Client Setup Guide

## 📋 Prerequisites

### System Requirements
- **OS**: macOS, Linux, or Windows
- **Node.js**: v18+ (recommended v20+)
- **Docker**: v20+ with Docker Compose
- **Git**: Latest version
- **PostgreSQL**: v14+ (via Docker)
- **Redis**: v7+ (via Docker)

### Development Tools
- **Cursor IDE**: For MCP integration
- **Git**: For repository cloning
- **Terminal**: Command line access

---

## 🎯 Step 1: Clone and Setup Repository

### 1.1 Clone Repository
```bash
git clone https://github.com/axiom-code-context-ai/axiom-ai.git
cd axiom-ai
```

### 1.2 Install Dependencies
```bash
# Install root dependencies
npm install

# Install service dependencies
cd services/web-portal && npm install && cd ../..
cd services/search-api && npm install && cd ../..
cd services/mcp-server && npm install && cd ../..
cd services/crawler-agent && npm install && cd ../..
cd services/security-scanner && npm install && cd ../..
```

---

## 🗄️ Step 2: Database Setup

### 2.1 Start Database Services
```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis
```

### 2.2 Wait for Database Initialization
```bash
# Wait 30 seconds for database to initialize
sleep 30

# Verify database is running
docker-compose ps
```

### 2.3 Verify Database Connection
```bash
# Test PostgreSQL connection
docker-compose exec postgres psql -U axiom -d axiom -c "SELECT version();"

# Test Redis connection
docker-compose exec redis redis-cli ping
```

---

## ⚙️ Step 3: Configuration Setup

### 3.1 Environment Variables

Create environment files for each service:

#### Web Portal (`services/web-portal/.env.local`)
```env
# Database
DATABASE_URL="postgresql://axiom:axiom_secure_password_2024@localhost:5432/axiom"

# NextAuth
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# API Keys
SEARCH_API_URL="http://localhost:4000"
MCP_SERVER_URL="http://localhost:18000"

# LLM Configuration
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
```

#### Search API (`services/search-api/.env`)
```env
# Server
PORT=4000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom
DB_USER=axiom
DB_PASSWORD=axiom_secure_password_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=""

# API Keys
API_KEY_SECRET="your-api-key-secret"
```

#### MCP Server (`services/mcp-server/.env`)
```env
# Server
PORT=18000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom
DB_USER=axiom
DB_PASSWORD=axiom_secure_password_2024

# Search API
SEARCH_API_URL=http://localhost:4000
SEARCH_API_KEY=your-api-key-secret

# LLM Configuration
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# MCP Configuration
MCP_API_KEY=your-mcp-api-key
```

#### Crawler Agent (`services/crawler-agent/.env`)
```env
# Server
PORT=5000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom
DB_USER=axiom
DB_PASSWORD=axiom_secure_password_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=""

# GitHub
GITHUB_TOKEN=your-github-token
```

### 3.2 LLM API Keys Setup

#### OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add to all service `.env` files

#### Anthropic API Key
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Add to all service `.env` files

#### GitHub Token (Optional)
1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Generate a token with `repo` scope
3. Add to crawler agent `.env` file

---

## 🚀 Step 4: Start Services

### 4.1 Start All Services
```bash
# Start all services
docker-compose up -d

# Verify all services are running
docker-compose ps
```

### 4.2 Build and Start Individual Services

#### Web Portal
```bash
cd services/web-portal
npm run build
npm start
# Runs on http://localhost:3000
```

#### Search API
```bash
cd services/search-api
npm run build
npm start
# Runs on http://localhost:4000
```

#### MCP Server
```bash
cd services/mcp-server
npm run build
npm start
# Runs on http://localhost:18000
```

#### Crawler Agent
```bash
cd services/crawler-agent
npm run build
npm start
# Runs on http://localhost:5000
```

---

## 🎯 Step 5: Cursor IDE Integration

### 5.1 Install Cursor IDE
1. Download from [cursor.sh](https://cursor.sh)
2. Install and launch Cursor
3. Create a new workspace

### 5.2 Configure MCP Server in Cursor

Create `cursor-mcp-config.json` in your workspace root:

```json
{
  "mcpServers": {
    "axiom-ai": {
      "command": "node",
      "args": ["/path/to/axiom-ai/services/mcp-server/dist/index.js"],
      "env": {
        "MCP_API_KEY": "your-mcp-api-key",
        "SEARCH_API_URL": "http://localhost:4000",
        "SEARCH_API_KEY": "your-api-key-secret",
        "OPENAI_API_KEY": "your-openai-api-key",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key"
      }
    }
  }
}
```

### 5.3 Test MCP Integration
1. Open Cursor IDE
2. Create a new file
3. Use AI chat to test MCP integration
4. Try prompts like: "Find all React hook patterns in our codebase"

---

## 🔧 Step 6: Web Portal Setup

### 6.1 Access Web Portal
1. Open browser to `http://localhost:3000`
2. Register a new account
3. Login to dashboard

### 6.2 Add Repository
1. Go to "Repositories" section
2. Click "Add Repository"
3. Enter GitHub repository URL
4. Configure sync settings
5. Start repository analysis

### 6.3 Configure Workspace
1. Go to "Workspaces" section
2. Create new workspace
3. Add team members
4. Configure permissions

---

## 🧪 Step 7: Testing and Verification

### 7.1 Test Search API
```bash
# Test search endpoint
curl "http://localhost:4000/search?query=useState&type=hybrid&limit=10"

# Test health endpoint
curl "http://localhost:4000/health"
```

### 7.2 Test MCP Server
```bash
# Test MCP server health
curl "http://localhost:18000/health"

# Test MCP tools
curl -X POST "http://localhost:18000/tools/search_code" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-mcp-api-key" \
  -d '{"query": "React hooks", "language": "typescript"}'
```

### 7.3 Test Web Portal
1. Open `http://localhost:3000`
2. Login with your account
3. Navigate through all sections
4. Test repository analysis
5. Verify dashboard functionality

---

## 🔍 Step 8: Repository Analysis

### 8.1 Add Repository via Web Portal
1. Login to web portal
2. Go to "Repositories" section
3. Click "Add Repository"
4. Enter repository URL (e.g., `https://github.com/facebook/react`)
5. Configure analysis settings
6. Start analysis

### 8.2 Monitor Analysis Progress
1. Check crawler agent logs
2. Monitor database for new patterns
3. Verify search results
4. Test MCP integration

### 8.3 Use MCP in Cursor
1. Open Cursor IDE
2. Use AI chat
3. Ask questions about your codebase
4. Generate code with context
5. Analyze security patterns

---

## 🛠️ Step 9: Advanced Configuration

### 9.1 Custom LLM Models
Edit service `.env` files to use different models:

```env
# OpenAI Models
OPENAI_MODEL=gpt-4-turbo
OPENAI_MODEL_EMBEDDING=text-embedding-3-large

# Anthropic Models
ANTHROPIC_MODEL=claude-3-opus-20240229
ANTHROPIC_MODEL_EMBEDDING=claude-3-sonnet-20240229
```

### 9.2 Performance Tuning
```env
# Search API
SEARCH_CACHE_TTL=3600
SEARCH_MAX_RESULTS=100
SEARCH_TIMEOUT=5000

# MCP Server
MCP_TIMEOUT=30000
MCP_MAX_CONCURRENT=10

# Crawler Agent
CRAWLER_BATCH_SIZE=50
CRAWLER_CONCURRENT_REPOS=5
```

### 9.3 Security Configuration
```env
# API Security
API_RATE_LIMIT=1000
API_RATE_WINDOW=3600000

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:4000
```

---

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
docker-compose ps postgres

# Restart database
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

#### Service Not Starting
```bash
# Check service logs
docker-compose logs [service-name]

# Restart service
docker-compose restart [service-name]

# Rebuild service
docker-compose up -d --build [service-name]
```

#### MCP Integration Issues
1. Verify MCP server is running
2. Check API keys in configuration
3. Verify Cursor MCP configuration
4. Test MCP server endpoints

#### Search Not Working
1. Verify database has data
2. Check search API logs
3. Test search endpoints directly
4. Verify vector embeddings

### Log Locations
- **Web Portal**: `services/web-portal/logs/`
- **Search API**: `services/search-api/logs/`
- **MCP Server**: `services/mcp-server/logs/`
- **Crawler Agent**: `services/crawler-agent/logs/`

---

## 📚 Additional Resources

### Documentation
- [README.md](./README.md) - Main project documentation
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [API Documentation](./docs/api.md) - API reference

### Support
- [GitHub Issues](https://github.com/axiom-code-context-ai/axiom-ai/issues)
- [Discussions](https://github.com/axiom-code-context-ai/axiom-ai/discussions)
- [Wiki](https://github.com/axiom-code-context-ai/axiom-ai/wiki)

---

## 🎉 Success!

Your Axiom AI system is now fully configured and ready to use! You can:

1. **Access Web Portal**: `http://localhost:3000`
2. **Use MCP in Cursor**: AI-powered code generation
3. **Analyze Repositories**: Add and analyze codebases
4. **Generate Context-Aware Code**: Using your enterprise patterns

For any issues, refer to the troubleshooting section or create an issue on GitHub.
