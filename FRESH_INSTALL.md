# 🚀 Axiom AI - Fresh Installation Guide

## Complete step-by-step installation from scratch

### Prerequisites

Make sure you have:
- Docker Desktop installed and running
- Git installed
- Internet connection

### Step 1: Clone the Repository

```bash
# Navigate to your desired directory
cd ~/Desktop

# Clone the repository
git clone https://github.com/axiom-code-context-ai/axiom-ai.git

# Enter the project directory
cd axiom-ai
```

### Step 2: Verify Files

```bash
# List files to ensure clone was successful
ls -la

# You should see:
# - docker-compose.simple.yml
# - services/ directory
# - database/ directory
# - README.md
# - etc.
```

### Step 3: Create Environment File (Optional)

```bash
# Copy the example env file
cp env.example .env

# The system works with default values, but you can customize:
# - OPENAI_API_KEY (for LLM integration)
# - GITHUB_TOKEN (for private repos)
# - Other API keys as needed
```

### Step 4: Start All Services

```bash
# Build and start all services
docker-compose -f docker-compose.simple.yml up -d --build

# This will:
# - Download base images
# - Build all microservices
# - Start PostgreSQL + pgvector
# - Start Redis
# - Start Web Portal
# - Start Search API
# - Start MCP Server
# - Start Crawler Agent
```

### Step 5: Wait for Services to Start

```bash
# Check service status
docker-compose -f docker-compose.simple.yml ps

# Wait until all services show "Up" status
# This may take 2-3 minutes for first build
```

### Step 6: Verify Installation

```bash
# Check Web Portal
curl http://localhost:3000/api/health

# Check Search API
curl http://localhost:4000/health

# Check MCP Server
curl http://localhost:18000/health

# Check Database
docker exec axiom-postgres psql -U axiom -d axiom -c "SELECT version();"
```

### Step 7: Access the Web Portal

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the Axiom AI web interface!

### Step 8: Test the Workflow

1. **Enter a Git URL** in the web interface
2. **Click "Analyze"** to trigger repository analysis
3. **View Results** - see the analyzed context
4. **Ready for MCP** - context is now stored and searchable

---

## 🎯 Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| Web Portal | http://localhost:3000 | Git URL input & analysis UI |
| Search API | http://localhost:4000 | Context search endpoints |
| MCP Server | http://localhost:18000 | IDE integration (Cursor/Cline) |
| PostgreSQL | localhost:5432 | Database (internal) |
| Redis | localhost:6379 | Cache (internal) |

---

## 🔧 Useful Commands

### View Logs
```bash
# All services
docker-compose -f docker-compose.simple.yml logs -f

# Specific service
docker logs axiom-web-portal -f
docker logs axiom-search-api -f
docker logs axiom-mcp-server -f
```

### Stop Services
```bash
docker-compose -f docker-compose.simple.yml down
```

### Stop and Remove All Data
```bash
docker-compose -f docker-compose.simple.yml down -v
```

### Restart a Service
```bash
docker-compose -f docker-compose.simple.yml restart web-portal
```

### Rebuild After Code Changes
```bash
docker-compose -f docker-compose.simple.yml up -d --build
```

---

## 🎊 You're Ready!

Your Axiom AI platform is now running and ready for:
- Repository analysis
- Context generation
- MCP integration with Cursor/Cline
- Enterprise-aware code development

---

## 🆘 Troubleshooting

### Services won't start?
```bash
# Check Docker is running
docker ps

# Check logs for errors
docker-compose -f docker-compose.simple.yml logs
```

### Port already in use?
```bash
# Find what's using the port
lsof -i :3000  # or :4000, :18000, etc.

# Stop the conflicting service or change port in docker-compose.simple.yml
```

### Database connection issues?
```bash
# Restart PostgreSQL
docker-compose -f docker-compose.simple.yml restart postgres

# Check database logs
docker logs axiom-postgres
```

### Need to start fresh?
```bash
# Stop everything and remove volumes
docker-compose -f docker-compose.simple.yml down -v

# Remove all images
docker rmi $(docker images | grep axiom | awk '{print $3}')

# Start again from Step 4
```

---

## 📚 Next Steps

1. **Configure MCP for Cursor/Cline** - See `cursor-mcp-config-final.json`
2. **Analyze your first repository** - Use the web portal
3. **Integrate with your IDE** - Connect MCP server
4. **Start coding** - Let Axiom supply enterprise context!

**Happy Coding! 🚀**

