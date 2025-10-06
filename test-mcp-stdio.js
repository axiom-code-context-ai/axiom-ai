#!/usr/bin/env node

/**
 * Test MCP Server via stdio - Simulates EXACTLY what Cursor does
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing MCP Server (stdio mode) - EXACTLY as Cursor runs it\n');

const mcpServerPath = path.join(__dirname, 'services/mcp-server/dist/index.js');

// Exact same environment variables that Cursor passes
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://axiom:axiom_secure_password_2024@localhost:5432/axiom',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'axiom',
  DB_USER: 'axiom',
  DB_PASSWORD: 'axiom_secure_password_2024',
  SEARCH_API_URL: 'http://localhost:4000',
  LOG_LEVEL: 'info',
  MCP_SERVER_NAME: 'axiom-ai',
  MCP_SERVER_VERSION: '1.0.0',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
};

console.log('📍 Environment Variables:');
console.log('   DB_HOST:', env.DB_HOST);
console.log('   DB_PASSWORD:', '***' + env.DB_PASSWORD.slice(-4));
console.log('   SEARCH_API_URL:', env.SEARCH_API_URL);
console.log('');

const mcp = spawn('node', [mcpServerPath, '--stdio'], {
  env,
  stdio: ['pipe', 'pipe', 'pipe']
});

let initTimeout;
let outputBuffer = '';

mcp.stdout.on('data', (data) => {
  outputBuffer += data.toString();
  // MCP protocol uses JSON-RPC over stdio
  // Look for initialization response
  if (outputBuffer.includes('"jsonrpc"') && outputBuffer.includes('"result"')) {
    console.log('✅ MCP Server initialized via stdio');
    console.log('📤 Sending search_code request...\n');
    
    // Send a search_code tool call (JSON-RPC format)
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_code',
        arguments: {
          query: 'useState hook patterns',
          searchType: 'hybrid'
        }
      }
    };
    
    mcp.stdin.write(JSON.stringify(request) + '\n');
  }
  
  // Look for tool response
  if (outputBuffer.includes('"id":1') && outputBuffer.includes('"result"')) {
    console.log('📥 MCP Server Response:');
    try {
      const lines = outputBuffer.split('\n').filter(l => l.trim());
      const lastResponse = lines[lines.length - 1];
      const response = JSON.parse(lastResponse);
      
      if (response.result && response.result.content) {
        const content = response.result.content[0].text;
        console.log(content.substring(0, 500));
        console.log('\n✅ MCP Server working correctly!');
      } else if (response.error) {
        console.log('❌ ERROR:', response.error.message);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2).substring(0, 500));
      }
    } catch (e) {
      console.log('Raw output:', outputBuffer.substring(0, 500));
    }
    
    mcp.kill();
    clearTimeout(initTimeout);
  }
});

mcp.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('error') || msg.includes('Error')) {
    console.log('❌ STDERR:', msg);
  }
});

mcp.on('error', (error) => {
  console.error('❌ Failed to start MCP server:', error.message);
  process.exit(1);
});

mcp.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`❌ MCP server exited with code ${code}`);
    console.log('\n📋 Check logs at: /tmp/axiom-mcp-server.log');
  }
  clearTimeout(initTimeout);
  setTimeout(() => process.exit(code || 0), 100);
});

// Send initialize request
setTimeout(() => {
  console.log('📤 Sending initialize request to MCP server...\n');
  const initRequest = {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  mcp.stdin.write(JSON.stringify(initRequest) + '\n');
}, 500);

// Timeout after 10 seconds
initTimeout = setTimeout(() => {
  console.log('⏱️  Test timeout - checking logs...');
  console.log('\n📋 Check logs at: /tmp/axiom-mcp-server.log');
  mcp.kill();
  process.exit(1);
}, 10000);

