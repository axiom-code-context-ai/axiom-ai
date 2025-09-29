# Axiom AI - Complete Codebase Intelligence Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-%3E%3D20.10.0-blue)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D14.0-blue)](https://www.postgresql.org/)

> **Transform your development workflow with AI-powered codebase intelligence, advanced search capabilities, and seamless IDE integration through Model Context Protocol (MCP).**

## 🌟 Overview

Axiom AI is a comprehensive codebase intelligence platform that combines the power of **vector similarity search**, **keyword matching**, **security analysis**, and **AI-driven insights** to revolutionize how developers understand, search, and work with their codebases.

### 🎯 Key Features

- **🔍 Intelligent Search**: Vector similarity + keyword search with hybrid ranking
- **🤖 MCP Integration**: Seamless Cursor, VS Code, and IDE integration
- **🛡️ Security Analysis**: OWASP Top 10, CVE detection, compliance checking
- **📊 Real-time Analytics**: Performance metrics and search insights
- **🔄 Auto-sync**: Incremental repository synchronization
- **🎨 Modern UI**: Beautiful Next.js dashboard with real-time updates
- **⚡ High Performance**: Optimized for large codebases with pgvector
- **🔐 Enterprise Security**: JWT authentication, RBAC, encryption

## 🏗️ Architecture

Axiom AI follows a **microservices architecture** with independent, scalable services:

```mermaid
graph TB
    Client[IDE/Browser] --> Gateway[API Gateway]
    Gateway --> Portal[Web Portal]
    Gateway --> MCP[MCP Server]
    Gateway --> Search[Search API]
    
    Portal --> DB[(PostgreSQL)]
    MCP --> Search
    MCP --> Security[Security Scanner]
    Search --> DB
    Search --> Cache[(Redis)]
    
    Crawler[Crawler Agent] --> DB
    Crawler --> Queue[Job Queue]
    Security --> DB
    
    DB --> Vector[pgvector]
```

### 🧩 Service Components

| Service | Technology | Purpose |
|---------|------------|---------|
| **Web Portal** | Next.js 14, React 18, Tailwind CSS | User interface and workspace management |
| **MCP Server** | Node.js, MCP Protocol | IDE integration and AI context |
| **Search API** | Fastify, pgvector | Vector and keyword search engine |
| **Crawler Agent** | Node.js, Bull Queue | Repository processing and indexing |
| **Security Scanner** | Node.js, OWASP | Vulnerability detection and compliance |

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **Docker & Docker Compose**
- **Git**
- **PostgreSQL 14+** (with pgvector extension)
- **Redis 7+**

### 1. One-Line Installation

```bash
curl -fsSL https://install.axiom.ai | bash
```

### 2. Manual Installation

```bash
# Clone the repository
git clone https://github.com/axiom-ai/axiom-ai.git
cd axiom-ai

# Run the installation script
chmod +x scripts/install.sh
./scripts/install.sh
```

### 3. Docker Compose (Recommended)

```bash
# Clone and setup
git clone https://github.com/axiom-ai/axiom-ai.git
cd axiom-ai

# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up -d

# Check service health
docker-compose ps
```

## 📋 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://axiom:password@localhost:5432/axiom
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_32_character_secret_key_here
ENCRYPTION_KEY=your_32_character_encryption_key

# LLM Providers (Optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_KEY=...

# Git Authentication
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...

# External APIs
NVD_API_KEY=...  # For CVE database access
```

### Service Ports

| Service | Port | URL |
|---------|------|-----|
| Web Portal | 3000 | http://localhost:3000 |
| Search API | 4000 | http://localhost:4000 |
| Crawler Agent | 4001 | http://localhost:4001 |
| Security Scanner | 4002 | http://localhost:4002 |
| MCP Server | 5000 | http://localhost:5000 |

## 🔧 Development

### Local Development Setup

```bash
# Install dependencies
npm install

# Install service dependencies
npm run install:services

# Setup database
npm run db:setup

# Start development servers
npm run dev

# Or start individual services
npm run dev:portal
npm run dev:search
npm run dev:crawler
npm run dev:mcp
npm run dev:security
```

### Building Services

```bash
# Build all services
npm run build

# Build individual services
npm run build:portal
npm run build:search
npm run build:crawler
npm run build:mcp
npm run build:security
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific service tests
npm run test:portal
npm run test:search
```

## 🔌 IDE Integration

### Cursor IDE

1. Install Axiom AI MCP server:
   ```json
   {
     "mcpServers": {
       "axiom-ai": {
         "url": "http://localhost:5000/mcp",
         "headers": {
           "X-Workspace-Id": "your-workspace-id",
           "X-API-Key": "your-api-key"
         }
       }
     }
   }
   ```

2. Use in prompts:
   ```
   Search for authentication patterns in our codebase
   Explain this React component's functionality
   Find security vulnerabilities in this code
   ```

### VS Code

1. Install the Axiom AI extension
2. Configure MCP server endpoint
3. Use Command Palette: "Axiom AI: Search Code"

### Claude Desktop

```json
{
  "mcpServers": {
    "axiom-ai": {
      "command": "npx",
      "args": ["-y", "@axiom-ai/mcp-server", "--workspace-id", "your-workspace-id"]
    }
  }
}
```

## 🔍 Usage Examples

### Code Search

```typescript
// Search for authentication patterns
const results = await axiom.search({
  query: "JWT token validation middleware",
  type: "hybrid",
  filters: {
    languages: ["typescript", "javascript"],
    patternTypes: ["function", "middleware"]
  }
})
```

### Security Analysis

```typescript
// Run security scan
const scan = await axiom.security.scan({
  workspaceId: "workspace-123",
  scanTypes: ["owasp", "cve", "dependency"],
  options: { severity: "high" }
})
```

### MCP Tools

Available MCP tools for IDE integration:

- `search_code` - Intelligent code search
- `explain_code` - AI-powered code explanation
- `analyze_security` - Security vulnerability analysis
- `generate_context` - Generate comprehensive code context
- `suggest_refactor` - Refactoring recommendations
- `find_similar` - Find similar code patterns

## 📊 Monitoring & Analytics

### Built-in Dashboards

- **Search Analytics**: Query patterns, performance metrics
- **Security Dashboard**: Vulnerability trends, compliance scores
- **Repository Health**: Sync status, indexing progress
- **System Metrics**: Service health, resource usage

### Prometheus Metrics

```bash
# Service health
axiom_service_health{service="search-api"} 1

# Search performance
axiom_search_duration_seconds{type="hybrid"} 0.125
axiom_search_results_total{workspace="workspace-123"} 1250

# Security metrics
axiom_vulnerabilities_total{severity="high"} 5
axiom_compliance_score{framework="owasp"} 0.85
```

### Grafana Integration

Pre-built dashboards for:
- Service performance monitoring
- Search analytics and trends
- Security posture tracking
- Resource utilization

## 🛡️ Security

### Authentication & Authorization

- **JWT-based sessions** for web portal
- **Token-based auth** for MCP server
- **API key authentication** for service-to-service
- **RBAC** with workspace-level permissions

### Data Protection

- **Encryption at rest** for sensitive data
- **TLS/HTTPS** for all communications
- **Secret management** with environment variables
- **Audit logging** for all operations

### Compliance

- **OWASP Top 10** vulnerability detection
- **SOC 2** compliance checks
- **GDPR** data protection compliance
- **Custom security rules** and policies

## 🚀 Deployment

### Production Deployment

```bash
# Production deployment with Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Or use Kubernetes
kubectl apply -f k8s/

# Or deploy to cloud platforms
./scripts/deploy-aws.sh
./scripts/deploy-gcp.sh
./scripts/deploy-azure.sh
```

### Scaling

```bash
# Scale specific services
docker-compose up -d --scale search-api=3 --scale mcp-server=2

# Auto-scaling with Kubernetes HPA
kubectl autoscale deployment search-api --cpu-percent=70 --min=2 --max=10
```

### Health Checks

All services include comprehensive health checks:
- Database connectivity
- External service availability
- Memory and CPU usage
- Queue processing status

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- **TypeScript** for all services
- **ESLint + Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Jest** for testing

## 📚 Documentation

- [API Documentation](https://docs.axiom.ai/api)
- [MCP Integration Guide](https://docs.axiom.ai/mcp)
- [Security Best Practices](https://docs.axiom.ai/security)
- [Deployment Guide](https://docs.axiom.ai/deployment)
- [Troubleshooting](https://docs.axiom.ai/troubleshooting)

## 🆘 Support

- 📖 [Documentation](https://docs.axiom.ai)
- 💬 [Discord Community](https://discord.gg/axiom-ai)
- 🐛 [Issue Tracker](https://github.com/axiom-ai/axiom-ai/issues)
- 📧 [Email Support](mailto:support@axiom.ai)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with inspiration from:
- [Context7](https://github.com/upstash/context7) - MCP integration patterns
- [Repomix](https://github.com/yamadashy/repomix) - Repository processing architecture
- [Model Context Protocol](https://modelcontextprotocol.io) - IDE integration standard

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=axiom-ai/axiom-ai&type=Date)](https://star-history.com/#axiom-ai/axiom-ai&Date)

---

<div align="center">
  <strong>Built with ❤️ by the Axiom AI Team</strong>
  <br>
  <a href="https://axiom.ai">Website</a> • 
  <a href="https://docs.axiom.ai">Documentation</a> • 
  <a href="https://discord.gg/axiom-ai">Community</a>
</div>