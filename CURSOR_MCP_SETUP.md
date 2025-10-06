# 🚀 Cursor MCP Setup - READY TO TEST!

## ✅ Everything is configured! Follow these 3 steps:

---

## 📋 Step 1: Add MCP Config to Cursor

1. **Open Cursor Settings** (Cmd + ,)
2. Search for **"MCP"** or go to **Features → Model Context Protocol**
3. Click **"Edit Config"** or **"Configure"**
4. **Copy-paste this entire JSON:**

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
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "axiom",
        "POSTGRES_PASSWORD": "axiom_secure_password_2024",
        "POSTGRES_DB": "axiom",
        "SEARCH_API_URL": "http://localhost:4000",
        "LOG_LEVEL": "info",
        "MCP_SERVER_NAME": "axiom-ai",
        "MCP_SERVER_VERSION": "1.0.0"
      }
    }
  }
}
```

5. **Save** the config

---

## 🔄 Step 2: Restart Cursor

**Important:** Quit Cursor completely (Cmd + Q) and reopen it.

After restart, check that **"axiom-ai"** appears in the MCP servers list in settings.

---

## 🧪 Step 3: Test with These Prompts

Open the **Axiom AI repository** in Cursor:
```
/Users/saurabh_sharmila_nysa_mac/Desktop/Saurabh_OSS/axiom_ai
```

### Test Prompt 1 (Basic):
```
@axiom-ai Find all FastifyInstance usage in this codebase
```

### Test Prompt 2 (Advanced):
```
@axiom-ai Search for authentication patterns and show me how context is assembled
```

### Test Prompt 3 (Enterprise Context):
```
@axiom-ai Using this codebase's patterns, show me how to add a new MCP tool
```

---

## 📊 How to Verify It's Working

### ✅ Signs MCP is Working:
1. **Cursor chat shows** tool calls like: `[Called: search_code]` or `[Called: search_code_with_enterprise_context]`
2. **Response includes** specific file paths and code from YOUR codebase
3. **Log file grows** at `/tmp/axiom-mcp-server.log`

### Watch Logs Live:
```bash
tail -f /tmp/axiom-mcp-server.log
```

Look for these messages:
- `"No workspace ID provided, auto-detecting from Git repository..."`
- `"Auto-detected workspace"`
- `"Search code tool called"`

---

## ❌ Troubleshooting

### Problem: "axiom-ai" doesn't appear in MCP servers list
**Fix:** Make sure you saved the config and restarted Cursor completely.

### Problem: Tool calls shown but errors returned
**Fix:** Check Docker services are running:
```bash
docker ps
```
You should see all 6 containers (postgres, redis, search-api, crawler-agent, web-portal, mcp-server).

### Problem: "No workspace found"
**Fix:** Make sure you opened a Git repository in Cursor (the axiom_ai folder).

---

## 🎯 Expected Behavior

When you use `@axiom-ai` in a prompt:

1. **Cursor** calls the MCP server via stdio
2. **MCP server** auto-detects your Git repository
3. **MCP server** queries the database for enterprise context
4. **Response** includes:
   - Relevant code snippets from YOUR codebase
   - Architectural patterns YOU use
   - Implementation templates from YOUR code
   - Standards and conventions detected in YOUR repo

---

## 📝 Log File Location

All MCP server activity is logged to:
```
/tmp/axiom-mcp-server.log
```

View latest logs:
```bash
tail -50 /tmp/axiom-mcp-server.log
```

---

## ✨ You're Ready!

1. ✅ MCP server built and configured
2. ✅ Logging enabled at `/tmp/axiom-mcp-server.log`
3. ✅ Config file ready to copy
4. ✅ Docker services running

**Next:** Add the config to Cursor, restart, and test! 🚀

