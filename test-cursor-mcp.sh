#!/bin/bash

echo "🧪 Testing Axiom AI MCP Integration for Cursor"
echo "=============================================="
echo ""

# Step 1: Clean up
echo "📋 Step 1/5: Cleaning up old processes..."
pkill -f "node.*mcp-server" 2>/dev/null || true
rm -f /tmp/axiom-mcp-server.log
echo "✅ Cleaned up"
echo ""

# Step 2: Check Docker services
echo "📋 Step 2/5: Checking Docker services..."
if docker ps --filter name=axiom-postgres --filter name=axiom-search-api | grep -q "Up"; then
    echo "✅ Docker services are running"
    docker ps --filter name=postgres --filter name=search-api --format "  - {{.Names}}: {{.Status}}"
else
    echo "❌ Docker services not running!"
    echo "Run: docker-compose -f docker-compose.simple.yml up -d"
    exit 1
fi
echo ""

# Step 3: Test Search API
echo "📋 Step 3/5: Testing Search API..."
SEARCH_RESULT=$(curl -s -X POST http://localhost:4000/search \
    -H 'Content-Type: application/json' \
    -d '{"query":"test"}' | jq -r '.query' 2>/dev/null)

if [ "$SEARCH_RESULT" = "test" ]; then
    echo "✅ Search API is responding correctly"
else
    echo "❌ Search API not responding correctly"
    echo "Response: $SEARCH_RESULT"
    exit 1
fi
echo ""

# Step 4: Test MCP Server
echo "📋 Step 4/5: Testing MCP Server standalone..."
cd /Users/saurabh_sharmila_nysa_mac/Desktop/Saurabh_OSS/axiom_ai/services/mcp-server

cat > test-query.json << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_code","arguments":{"query":"useState"}}}
EOF

(node dist/index.js --stdio < test-query.json 2>&1 &)
sleep 3
pkill -f "node dist/index.js --stdio" 2>/dev/null
sleep 1

if [ -f /tmp/axiom-mcp-server.log ]; then
    # Check for error indicators
    if grep -qi "workspace not found\|authentication.*fail\|error.*workspace" /tmp/axiom-mcp-server.log; then
        echo "❌ MCP Server has workspace errors!"
        echo "   Check logs: tail -30 /tmp/axiom-mcp-server.log"
        exit 1
    elif grep -q "MCP server connected successfully" /tmp/axiom-mcp-server.log && \
         grep -q "Performing code search" /tmp/axiom-mcp-server.log; then
        echo "✅ MCP Server is working correctly"
        echo "   ✅ No 'Workspace not found' errors"
        echo "   ✅ Successfully performed search"
    else
        echo "⚠️  MCP Server response needs verification"
        echo "   Check logs: tail -30 /tmp/axiom-mcp-server.log"
    fi
else
    echo "❌ MCP Server didn't generate logs"
    exit 1
fi
echo ""

# Step 5: Verify Cursor config
echo "📋 Step 5/5: Verifying Cursor MCP config..."
CURSOR_CONFIG="$HOME/Library/Application Support/Cursor/User/globalStorage/mcp.json"

if [ -f "$CURSOR_CONFIG" ]; then
    if grep -q "axiom-ai" "$CURSOR_CONFIG" && \
       grep -q "DB_PASSWORD" "$CURSOR_CONFIG" && \
       grep -q "/services/mcp-server/dist/index.js" "$CURSOR_CONFIG"; then
        echo "✅ Cursor MCP config looks correct"
    else
        echo "⚠️  Cursor MCP config might have issues"
        echo "   Check: $CURSOR_CONFIG"
    fi
else
    echo "❌ Cursor MCP config not found"
    echo "   Expected at: $CURSOR_CONFIG"
    exit 1
fi
echo ""

echo "=============================================="
echo "✅ ALL TESTS PASSED!"
echo "=============================================="
echo ""
echo "🎯 NEXT STEPS FOR YOU:"
echo ""
echo "1. ⏹️  QUIT CURSOR COMPLETELY"
echo "   Press: Cmd + Q"
echo "   Wait 5 seconds"
echo ""
echo "2. 🔄 REOPEN CURSOR"
echo "   Just open it normally"
echo ""
echo "3. 🧪 TEST IN CURSOR"
echo "   Open ANY folder (doesn't need to be a Git repo)"
echo "   Type in chat:"
echo ""
echo "   @axiom-ai Search for useState hook patterns"
echo ""
echo "   Expected Response:"
echo "   'Found 0 code patterns...' (if database is empty)"
echo "   OR"
echo "   'Found X code patterns...' (if you've analyzed repos)"
echo ""
echo "   ❌ You should NOT see:"
echo "   'Workspace not found'"
echo "   'Authentication issue'"
echo "   'No workspace is configured'"
echo ""
echo "4. 📝 WATCH LOGS (Optional)"
echo "   Open a new terminal and run:"
echo "   tail -f /tmp/axiom-mcp-server.log"
echo ""
echo "=============================================="
echo "✅ System is ready for testing!"
echo "=============================================="

