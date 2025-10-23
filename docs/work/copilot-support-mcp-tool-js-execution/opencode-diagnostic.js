#!/usr/bin/env node

// OpenCode MCP Connection Diagnostic Tool
// This script helps diagnose OpenCode connection issues

const http = require('http');

console.log('🔍 OpenCode MCP Connection Diagnostic');
console.log('=====================================');

// Test 1: Basic connectivity
function testBasicConnection() {
  return new Promise((resolve, reject) => {
    console.log('\n1. Testing basic HTTP connectivity...');
    
    const req = http.get('http://localhost:5556/sse', (res) => {
      console.log(`   ✅ HTTP Status: ${res.statusCode}`);
      console.log(`   ✅ Headers: ${JSON.stringify(res.headers, null, 2)}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.includes('Connected to OpenDia')) {
          console.log(`   ✅ SSE Initial Message: ${data.trim()}`);
          req.destroy(); // Close connection
          resolve();
        }
      });
      
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 2000);
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ Connection failed: ${err.message}`);
      reject(err);
    });
  });
}

// Test 2: MCP Initialize
function testMCPInitialize() {
  return new Promise((resolve, reject) => {
    console.log('\n2. Testing MCP Initialize...');
    
    const postData = JSON.stringify({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize", 
      "params": {
        "protocolVersion": "2025-06-18",
        "clientInfo": {
          "name": "diagnostic-tool",
          "version": "1.0.0"
        },
        "capabilities": {}
      }
    });
    
    const options = {
      hostname: 'localhost',
      port: 5556,
      path: '/sse',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      console.log(`   ✅ POST Status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   ✅ Response: ${data}`);
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ POST failed: ${err.message}`);
      reject(err);
    });
    
    req.write(postData);
    req.end();
  });
}

// Test 3: SSE Stream monitoring
function testSSEStream() {
  return new Promise((resolve) => {
    console.log('\n3. Testing SSE stream for MCP messages...');
    
    const req = http.get('http://localhost:5556/sse', (res) => {
      console.log(`   ✅ SSE connected, listening for messages...`);
      
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        
        // Look for SSE messages
        if (buffer.includes('event: message')) {
          console.log(`   ✅ Found MCP message in SSE stream!`);
          console.log(`   📄 Stream content:\n${buffer}`);
        } else if (buffer.includes(': ping')) {
          console.log(`   ✅ Heartbeat detected`);
        } else if (buffer.includes('Connected to OpenDia')) {
          console.log(`   ✅ Connection message received`);
        }
      });
      
      // Close after 5 seconds
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 5000);
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ SSE failed: ${err.message}`);
      resolve();
    });
  });
}

// Main diagnostic flow
async function runDiagnostics() {
  try {
    await testBasicConnection();
    await testMCPInitialize(); 
    await testSSEStream();
    
    console.log('\n🎯 Diagnostic Summary:');
    console.log('   - If all tests pass, the server is working correctly');
    console.log('   - If OpenCode still fails, the issue may be in OpenCode configuration');
    console.log('   - Check OpenCode logs for specific error messages');
    
  } catch (error) {
    console.log(`\n❌ Diagnostic failed: ${error.message}`);
    console.log('   - Ensure OpenDia server is running: node server.js --sse-only');
    console.log('   - Check if port 5556 is available');
  }
}

runDiagnostics();