#!/usr/bin/env node

// OpenCode MCP Flow Simulator
// Simulates the exact sequence OpenCode uses

const http = require('http');

console.log('🎯 OpenCode MCP Flow Simulator');
console.log('================================\n');

let sseConnection = null;

function sendMCPRequest(method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    console.log(`📤 Sending: ${method} (id: ${id})`);
    
    const postData = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
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
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`✅ POST Response (${res.statusCode}): ${data}`);
        resolve({ status: res.statusCode, body: data });
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ POST Error: ${err.message}`);
      reject(err);
    });
    
    req.write(postData);
    req.end();
  });
}

function startSSEConnection() {
  return new Promise((resolve) => {
    console.log('🔌 Opening SSE connection...');
    
    sseConnection = http.get('http://localhost:5556/sse', (res) => {
      console.log(`✅ SSE connected (${res.statusCode})`);
      
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        
        // DEBUG: Show raw data
        console.log(`📡 RAW CHUNK (${chunk.length} bytes)`);
        
        // Parse complete SSE messages from buffer
        while (true) {
          // Look for complete SSE message (event + data + blank line)
          const eventMatch = buffer.match(/event: message\ndata: (.+?)\n\n/);
          if (eventMatch) {
            const jsonStr = eventMatch[1];
            buffer = buffer.substring(eventMatch[0].length);
            
            try {
              const json = JSON.parse(jsonStr);
              console.log(`\n📥 SSE MESSAGE (id: ${json.id})`);
              if (json.result) {
                console.log(`   ✅ Result received`);
                if (json.result.protocolVersion) console.log(`   Protocol: ${json.result.protocolVersion}`);
                if (json.result.serverInfo) console.log(`   Server: ${json.result.serverInfo.name}`);
                if (json.result.tools) console.log(`   Tools: ${json.result.tools.length}`);
              } else if (json.error) {
                console.log(`   ❌ Error: ${json.error.message}`);
              }
            } catch (e) {
              console.log(`   ⚠️  Parse error: ${e.message}`);
            }
          } else {
            // Check for heartbeat/comments
            const commentMatch = buffer.match(/^: (.+?)\n/);
            if (commentMatch) {
              console.log(`💓 ${commentMatch[1]}`);
              buffer = buffer.substring(commentMatch[0].length);
            } else {
              // No complete message yet, wait for more data
              break;
            }
          }
        }
      });
      
      res.on('end', () => {
        console.log('❌ SSE connection ended');
      });
      
      resolve();
    });
    
    sseConnection.on('error', (err) => {
      console.log(`❌ SSE Error: ${err.message}`);
      resolve();
    });
  });
}

async function runSimulation() {
  console.log('Starting OpenCode MCP simulation...\n');
  
  // Step 1: Open SSE connection (OpenCode does this first)
  await startSSEConnection();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 2: Send initialize request
  console.log('\n📋 Step 1: Initialize');
  await sendMCPRequest('initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'opencode-simulator', version: '0.15.14' },
    capabilities: {}
  }, 1);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 3: Send tools/list request
  console.log('\n📋 Step 2: List Tools');
  await sendMCPRequest('tools/list', {}, 2);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 4: Keep SSE connection open for a bit
  console.log('\n⏳ Waiting for more messages...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 5: Clean up
  console.log('\n🔚 Closing SSE connection');
  if (sseConnection) {
    sseConnection.destroy();
  }
  
  console.log('\n✅ Simulation complete');
  console.log('\nExpected behavior:');
  console.log('  1. SSE connected');
  console.log('  2. POST returns {"ok":true}');
  console.log('  3. SSE receives initialize response');
  console.log('  4. POST returns {"ok":true}');
  console.log('  5. SSE receives tools/list response');
}

runSimulation().catch(console.error);