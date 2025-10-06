#!/bin/bash
set -e

echo "🔄 Rebuilding Axiom AI Services..."

# Stop all services
echo "⏹️  Stopping services..."
docker-compose -f docker-compose.simple.yml down

# Rebuild search-api
echo "🏗️  Rebuilding search-api..."
docker build --no-cache -t axiom-search-api:latest -f services/search-api/Dockerfile services/search-api

# Rebuild mcp-server (local)
echo "🏗️  Rebuilding mcp-server..."
cd services/mcp-server
npm install
npm run build
cd ../..

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.simple.yml up -d

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check health
echo "🏥 Checking health..."
curl -s http://localhost:4000/health | jq .

echo ""
echo "✅ All services rebuilt and started!"
echo ""
echo "📋 Next steps:"
echo "1. Restart Cursor completely (Cmd+Q and reopen)"
echo "2. Test with: @axiom-ai Search for useState hook patterns"
echo ""
echo "📝 Watch logs:"
echo "  MCP Server: tail -f /tmp/axiom-mcp-server.log"
echo "  Search API: docker logs -f axiom-search-api"

