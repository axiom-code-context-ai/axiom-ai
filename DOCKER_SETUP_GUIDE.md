# 🐳 Axiom AI - Docker Setup Guide

## 🎯 **Simple Docker Installation**

### **Prerequisites**
- **Docker**: v20+ with Docker Compose
- **Git**: Latest version
- **Terminal**: Command line access

### **API Keys Required**
- **OpenAI API Key** (Required)
- **Anthropic API Key** (Optional)
- **GitHub Token** (Optional)

---

## 🚀 **Step 1: Clone Repository**

```bash
git clone https://github.com/axiom-code-context-ai/axiom-ai.git
cd axiom-ai
```

---

## 🚀 **Step 2: One-Command Setup**

```bash
# Make script executable
chmod +x scripts/docker-setup.sh

# Run Docker setup
./scripts/docker-setup.sh
```

**That's it! The script will:**
- ✅ Check prerequisites (Docker, Docker Compose, Git)
- ✅ Create environment file from template
- ✅ Create data directories
- ✅ Build all Docker images
- ✅ Start all services
- ✅ Wait for services to be healthy
- ✅ Create Cursor MCP configuration

---

## 🔧 **Step 3: Configure API Keys**

### **Edit Environment File**
```bash
# Edit .env file
nano .env
```

### **Add Your API Keys**
```env
# LLM API Keys
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

# API Configuration
API_KEY_SECRET=your-generated-secret-here
MCP_API_KEY=your-generated-mcp-key-here

# GitHub Integration
GITHUB_TOKEN=ghp_your-github-token-here

# Security
NEXTAUTH_SECRET=your-generated-nextauth-secret-here
```

### **Generate Random Secrets**
```bash
# Generate random secrets
openssl rand -base64 32  # For API_KEY_SECRET
openssl rand -base64 32  # For MCP_API_KEY
openssl rand -base64 32  # For NEXTAUTH_SECRET
```

---

## 🎯 **Step 4: Access Services**

### **Web Portal**
- **URL**: http://localhost:3000
- **Features**: Dashboard, repository management, user interface

### **Search API**
- **URL**: http://localhost:4000
- **Features**: Code search, pattern matching, vector search

### **Crawler Agent**
- **URL**: http://localhost:5000
- **Features**: Repository analysis, code pattern extraction

### **Security Scanner**
- **URL**: http://localhost:6000
- **Features**: Vulnerability detection, security analysis

### **MCP Server**
- **URL**: http://localhost:18000
- **Features**: IDE integration, context-aware code generation

---

## 🎯 **Step 5: Cursor IDE Integration**

### **Configure MCP Server**
1. Copy `cursor-mcp-config.json` to your workspace root
2. Update the path to your Axiom AI installation
3. Add your API keys to the environment section
4. Restart Cursor IDE

### **Test MCP Integration**
1. Open Cursor IDE
2. Use AI chat
3. Try prompts like: "Find all React hook patterns in our codebase"

---

## 🔧 **Management Commands**

### **Start Services**
```bash
docker-compose -f docker-compose.simple.yml up -d
```

### **Stop Services**
```bash
docker-compose -f docker-compose.simple.yml down
```

### **View Logs**
```bash
# All services
docker-compose -f docker-compose.simple.yml logs -f

# Specific service
docker-compose -f docker-compose.simple.yml logs -f web-portal
```

### **Restart Services**
```bash
# All services
docker-compose -f docker-compose.simple.yml restart

# Specific service
docker-compose -f docker-compose.simple.yml restart web-portal
```

### **Rebuild Services**
```bash
# Rebuild all services
docker-compose -f docker-compose.simple.yml build

# Rebuild specific service
docker-compose -f docker-compose.simple.yml build web-portal
```

---

## 🧪 **Testing and Verification**

### **Test Web Portal**
```bash
# Check if web portal is accessible
curl http://localhost:3000

# Expected: HTML response
```

### **Test Search API**
```bash
# Test search endpoint
curl "http://localhost:4000/search?query=useState&type=hybrid&limit=10"

# Expected: JSON response with search results
```

### **Test MCP Server**
```bash
# Test MCP server health
curl "http://localhost:18000/health"

# Expected: JSON response with status
```

---

## 🚨 **Troubleshooting**

### **Common Issues**

#### **Services Not Starting**
```bash
# Check service status
docker-compose -f docker-compose.simple.yml ps

# Check logs for errors
docker-compose -f docker-compose.simple.yml logs

# Restart services
docker-compose -f docker-compose.simple.yml restart
```

#### **Database Connection Issues**
```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.simple.yml logs postgres

# Restart PostgreSQL
docker-compose -f docker-compose.simple.yml restart postgres
```

#### **Build Failures**
```bash
# Clean Docker cache
docker system prune -f

# Rebuild without cache
docker-compose -f docker-compose.simple.yml build --no-cache

# Start services
docker-compose -f docker-compose.simple.yml up -d
```

#### **Port Conflicts**
```bash
# Check if ports are in use
lsof -i :3000
lsof -i :4000
lsof -i :5000
lsof -i :6000
lsof -i :18000

# Stop conflicting services
sudo lsof -ti:3000 | xargs kill -9
```

---

## 📊 **System Requirements**

### **Minimum Requirements**
- **RAM**: 4GB
- **Disk**: 10GB free space
- **CPU**: 2 cores

### **Recommended Requirements**
- **RAM**: 8GB
- **Disk**: 20GB free space
- **CPU**: 4 cores

---

## 🎉 **Success!**

### **Your Axiom AI system is now fully operational!**

#### **What You Can Do:**
1. **Access Web Portal**: http://localhost:3000
2. **Use MCP in Cursor**: AI-powered code generation
3. **Analyze Repositories**: Add and analyze codebases
4. **Generate Context-Aware Code**: Using your enterprise patterns
5. **Search Code Patterns**: Find specific patterns in your codebase
6. **Security Analysis**: Scan for vulnerabilities

#### **Next Steps:**
1. Add more repositories for analysis
2. Configure team workspaces
3. Set up automated repository syncing
4. Customize LLM models and parameters
5. Integrate with your development workflow

**For any issues, refer to the troubleshooting section or create an issue on GitHub.**
