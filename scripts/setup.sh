#!/bin/bash

# Axiom AI - Quick Setup Script
# This script sets up the Axiom AI system for client installation

set -e

echo "🚀 Axiom AI - Quick Setup Script"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the axiom-ai root directory"
    exit 1
fi

print_info "Starting Axiom AI setup..."

# Step 1: Check prerequisites
print_info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js v18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi
print_status "Node.js $(node --version) is installed"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_status "Docker is installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_status "Docker Compose is installed"

# Check Git
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install Git first."
    exit 1
fi
print_status "Git is installed"

# Step 2: Install dependencies
print_info "Installing dependencies..."

# Install root dependencies
print_info "Installing root dependencies..."
npm install
print_status "Root dependencies installed"

# Install service dependencies
services=("web-portal" "search-api" "mcp-server" "crawler-agent" "security-scanner")

for service in "${services[@]}"; do
    if [ -d "services/$service" ]; then
        print_info "Installing dependencies for $service..."
        cd "services/$service"
        npm install
        cd ../..
        print_status "Dependencies installed for $service"
    else
        print_warning "Service $service not found, skipping..."
    fi
done

# Step 3: Create environment files
print_info "Creating environment files..."

# Create .env files for each service
if [ ! -f "services/web-portal/.env.local" ]; then
    print_info "Creating web-portal environment file..."
    cat > services/web-portal/.env.local << EOF
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
EOF
    print_status "Web portal environment file created"
fi

if [ ! -f "services/search-api/.env" ]; then
    print_info "Creating search-api environment file..."
    cat > services/search-api/.env << EOF
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
EOF
    print_status "Search API environment file created"
fi

if [ ! -f "services/mcp-server/.env" ]; then
    print_info "Creating mcp-server environment file..."
    cat > services/mcp-server/.env << EOF
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
EOF
    print_status "MCP server environment file created"
fi

if [ ! -f "services/crawler-agent/.env" ]; then
    print_info "Creating crawler-agent environment file..."
    cat > services/crawler-agent/.env << EOF
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
EOF
    print_status "Crawler agent environment file created"
fi

# Step 4: Start database services
print_info "Starting database services..."

# Start PostgreSQL and Redis
docker-compose up -d postgres redis
print_status "Database services started"

# Wait for database initialization
print_info "Waiting for database initialization..."
sleep 30

# Verify database is running
if docker-compose ps | grep -q "postgres.*Up"; then
    print_status "PostgreSQL is running"
else
    print_error "PostgreSQL failed to start"
    exit 1
fi

if docker-compose ps | grep -q "redis.*Up"; then
    print_status "Redis is running"
else
    print_error "Redis failed to start"
    exit 1
fi

# Step 5: Build services
print_info "Building services..."

for service in "${services[@]}"; do
    if [ -d "services/$service" ]; then
        print_info "Building $service..."
        cd "services/$service"
        npm run build
        cd ../..
        print_status "$service built successfully"
    fi
done

# Step 6: Create Cursor MCP configuration
print_info "Creating Cursor MCP configuration..."

# Get current directory
CURRENT_DIR=$(pwd)

cat > cursor-mcp-config.json << EOF
{
  "mcpServers": {
    "axiom-ai": {
      "command": "node",
      "args": ["$CURRENT_DIR/services/mcp-server/dist/index.js"],
      "env": {
        "MCP_API_KEY": "your-mcp-api-key",
        "SEARCH_API_URL": "http://localhost:4000",
        "SEARCH_API_KEY": "your-api-key-secret",
        "OPENAI_API_KEY": "your-openai-api-key",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key",
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "axiom",
        "DB_USER": "axiom",
        "DB_PASSWORD": "axiom_secure_password_2024"
      }
    }
  }
}
EOF

print_status "Cursor MCP configuration created"

# Step 7: Final instructions
print_info "Setup completed successfully!"
echo ""
echo "🎉 Next Steps:"
echo "=============="
echo ""
echo "1. 🔑 Configure API Keys:"
echo "   - Edit environment files in services/*/.env*"
echo "   - Add your OpenAI API key"
echo "   - Add your Anthropic API key (optional)"
echo "   - Add your GitHub token (optional)"
echo ""
echo "2. 🚀 Start Services:"
echo "   - Run: docker-compose up -d"
echo "   - Or start individual services with npm start"
echo ""
echo "3. 🌐 Access Web Portal:"
echo "   - Open: http://localhost:3000"
echo "   - Register and login"
echo ""
echo "4. 🎯 Configure Cursor IDE:"
echo "   - Copy cursor-mcp-config.json to your workspace"
echo "   - Update the path in the config file"
echo "   - Restart Cursor IDE"
echo ""
echo "5. 📚 Read Documentation:"
echo "   - CLIENT_SETUP_GUIDE.md for detailed instructions"
echo "   - README.md for project overview"
echo ""
echo "🔗 Useful URLs:"
echo "==============="
echo "Web Portal: http://localhost:3000"
echo "Search API: http://localhost:4000"
echo "MCP Server: http://localhost:18000"
echo "Crawler Agent: http://localhost:5000"
echo ""
print_status "Axiom AI is ready to use!"
