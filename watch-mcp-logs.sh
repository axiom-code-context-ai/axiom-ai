#!/bin/bash

# Watch MCP Server Logs in Real-Time
# This script monitors the MCP server logs and shows activity when Cursor calls it

LOG_FILE="/tmp/axiom-mcp-server.log"

echo "🔍 Watching MCP Server Logs..."
echo "📝 Log file: $LOG_FILE"
echo ""
echo "Waiting for MCP activity from Cursor..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create log file if it doesn't exist
touch "$LOG_FILE"

# Watch the log file with pretty formatting
tail -f "$LOG_FILE" | while read line; do
  # Color codes
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  NC='\033[0m' # No Color
  
  # Highlight important events
  if [[ $line == *"search_code"* ]]; then
    echo -e "${GREEN}🔍 SEARCH TOOL CALLED${NC}"
    echo "$line" | jq -r '.msg' 2>/dev/null || echo "$line"
  elif [[ $line == *"Auto-detected workspace"* ]]; then
    echo -e "${BLUE}📦 WORKSPACE DETECTED${NC}"
    echo "$line" | jq -r '.msg' 2>/dev/null || echo "$line"
  elif [[ $line == *"error"* ]] || [[ $line == *"Error"* ]]; then
    echo -e "${RED}❌ ERROR${NC}"
    echo "$line" | jq -r '.msg' 2>/dev/null || echo "$line"
  elif [[ $line == *"Starting MCP server"* ]]; then
    echo -e "${YELLOW}🚀 MCP SERVER STARTING${NC}"
    echo "$line" | jq -r '.msg' 2>/dev/null || echo "$line"
  else
    # Regular log line
    echo "$line" | jq -r '"\(.time | tonumber | strftime("%H:%M:%S")) [\(.module // "mcp")] \(.msg)"' 2>/dev/null || echo "$line"
  fi
  echo ""
done

