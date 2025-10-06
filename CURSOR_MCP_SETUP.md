# 🚀 Axiom AI MCP Server Setup for Cursor

## Quick Setup (5 minutes)

### Step 1: Build the MCP Server

```bash
cd /Users/saurabh_sharmila_nysa_mac/Desktop/Saurabh_OSS/axiom_ai/services/mcp-server
npm install
npm run build
```

### Step 2: Add MCP Server to Cursor

1. Open Cursor Settings: **Cmd + ,**
2. Search for: **"MCP"**
3. Click **"Edit in mcp.json"** or navigate to:
   ```
   ~/Library/Application Support/Cursor/User/globalStorage/mcp.json
   ```

4. Add this configuration:

```json
{
  "mcpServers": {
    "axiom-ai": {
      "command": "node",
      "args": [
        "/Users/saurabh_sharmila_nysa_mac/Desktop/Saurabh_OSS/axiom_ai/services/mcp-server/dist/index.js",
        "--stdio"
      ],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_URL": "postgresql://axiom:axiom_secure_password_2024@localhost:5432/axiom",
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "axiom",
        "DB_USER": "axiom",
        "DB_PASSWORD": "axiom_secure_password_2024",
        "SEARCH_API_URL": "http://localhost:4000",
        "LOG_LEVEL": "info",
        "MCP_SERVER_NAME": "axiom-ai",
        "MCP_SERVER_VERSION": "1.0.0",
        "OPENAI_API_KEY": "your-openai-api-key-here"
      }
    }
  }
}
```

**⚠️ Important:** Replace `your-openai-api-key-here` with your actual OpenAI API key!

### Step 3: Restart Cursor

```bash
# Quit Cursor completely
Cmd + Q

# Wait 5 seconds

# Reopen Cursor
```

### Step 4: Verify MCP Server Loaded

1. Open Cursor Settings: **Cmd + ,**
2. Search for: **"MCP"**
3. Look for **"axiom-ai"** with a ✅ green checkmark

### Step 5: Test It!

Open any folder in Cursor and try:

```
@axiom-ai Search for useState hook patterns
```

---

## 🔍 Troubleshooting

### Check Logs

```bash
tail -f /tmp/axiom-mcp-server.log
```

### Common Issues

#### 1. "Database connection error"
- Check Docker is running: `docker ps`
- Verify password matches: `axiom_secure_password_2024`
- Ensure PostgreSQL container is healthy

#### 2. "MCP server not loading"
- Verify the path in mcp.json points to the correct location
- Check build succeeded: `ls -la services/mcp-server/dist/index.js`
- Check Node.js is installed: `node --version`

#### 3. "OpenAI API error"
- Verify your API key is valid
- Check you have credits: https://platform.openai.com/account/usage

### Test Docker Services

```bash
cd /Users/saurabh_sharmila_nysa_mac/Desktop/Saurabh_OSS/axiom_ai
docker-compose -f docker-compose.simple.yml ps
```

All services should show "healthy" status.

---

## 📊 How It Works

### Architecture

```
Cursor IDE
    ↓
Axiom MCP Server (local Node.js process)
    ↓
Search API (Docker container on :4000)
    ↓
PostgreSQL Database (Docker container on :5432)
```

### Search Flow

1. **User types:** `@axiom-ai Search for useState patterns`
2. **Cursor** sends request to MCP server via stdio
3. **MCP server** calls Search API at http://localhost:4000
4. **Search API** queries PostgreSQL with vector similarity
5. **Results** flow back to Cursor with code patterns

### No Workspace Needed!

Unlike other systems, Axiom AI searches **ALL analyzed repositories** by default. No workspace ID, no manual configuration - it just works! 🎉

---

## 🎯 Next Steps

1. **Analyze a repository** via web portal: http://localhost:3000
2. **Try different searches:**
   ```
   @axiom-ai Find custom hooks with useState
   @axiom-ai Search for authentication patterns
   @axiom-ai Show error handling examples
   ```

3. **Watch logs** to see what's happening:
   ```bash
   tail -f /tmp/axiom-mcp-server.log
   ```

---

## 🆘 Need Help?

If you're still having issues:

1. **Clear logs and restart:**
   ```bash
   rm /tmp/axiom-mcp-server.log
   pkill -f "node.*mcp-server"
   # Then restart Cursor
   ```

2. **Check Docker services:**
   ```bash
   docker-compose -f docker-compose.simple.yml logs search-api
   docker-compose -f docker-compose.simple.yml logs postgres
   ```

3. **Test search-api directly:**
   ```bash
   curl -X POST http://localhost:4000/search \
     -H 'Content-Type: application/json' \
     -d '{"query":"useState","limit":5}'
   ```

---

**That's it! You're all set! 🚀**
