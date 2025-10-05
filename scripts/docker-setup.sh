#!/bin/bash

# Axiom AI - Docker Setup Script
# This script sets up the Axiom AI system using Docker

set -e

echo "🚀 Axiom AI - Docker Setup Script"
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

print_info "Starting Axiom AI Docker setup..."

# Step 1: Check prerequisites
print_info "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    print_info "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi
print_status "Docker is installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    print_info "Install from: https://docs.docker.com/compose/install/"
    exit 1
fi
print_status "Docker Compose is installed"

# Check Git
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install Git first."
    exit 1
fi
print_status "Git is installed"

# Step 2: Create environment file
print_info "Creating environment file..."

if [ ! -f ".env" ]; then
    print_info "Creating .env file from template..."
    cp env.example .env
    print_warning "Please edit .env file and add your API keys:"
    print_warning "- OPENAI_API_KEY"
    print_warning "- ANTHROPIC_API_KEY (optional)"
    print_warning "- GITHUB_TOKEN (optional)"
    print_warning "- Generate random secrets for security"
else
    print_status "Environment file already exists"
fi

# Step 3: Create data directories
print_info "Creating data directories..."
mkdir -p data/repos data/logs data/cache
print_status "Data directories created"

# Step 4: Build and start services
print_info "Building and starting services..."

# Stop any existing containers
print_info "Stopping any existing containers..."
docker-compose -f docker-compose.simple.yml down 2>/dev/null || true

# Build and start services
print_info "Building Docker images..."
docker-compose -f docker-compose.simple.yml build

print_info "Starting services..."
docker-compose -f docker-compose.simple.yml up -d

# Step 5: Wait for services to be healthy
print_info "Waiting for services to be healthy..."
sleep 30

# Check service health
print_info "Checking service health..."

services=("postgres" "redis" "web-portal" "search-api" "crawler-agent" "security-scanner" "mcp-server")

for service in "${services[@]}"; do
    if docker-compose -f docker-compose.simple.yml ps | grep -q "${service}.*Up"; then
        print_status "${service} is running"
    else
        print_warning "${service} may not be healthy yet"
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
echo "🎉 Axiom AI is now running!"
echo "=========================="
echo ""
echo "🌐 Services:"
echo "Web Portal: http://localhost:3000"
echo "Search API: http://localhost:4000"
echo "Crawler Agent: http://localhost:5000"
echo "Security Scanner: http://localhost:6000"
echo "MCP Server: http://localhost:18000"
echo ""
echo "📋 Next Steps:"
echo "1. 🔑 Edit .env file and add your API keys"
echo "2. 🌐 Access Web Portal: http://localhost:3000"
echo "3. 🎯 Configure Cursor IDE:"
echo "   - Copy cursor-mcp-config.json to your workspace"
echo "   - Update the path in the config file"
echo "   - Add your API keys to the env section"
echo "   - Restart Cursor IDE"
echo "4. 📚 Read Documentation:"
echo "   - CLIENT_SETUP_GUIDE.md for detailed instructions"
echo "   - README.md for project overview"
echo ""
echo "🔧 Management Commands:"
echo "Start services: docker-compose -f docker-compose.simple.yml up -d"
echo "Stop services: docker-compose -f docker-compose.simple.yml down"
echo "View logs: docker-compose -f docker-compose.simple.yml logs -f"
echo "Restart services: docker-compose -f docker-compose.simple.yml restart"
echo ""
print_status "Axiom AI is ready to use!"
