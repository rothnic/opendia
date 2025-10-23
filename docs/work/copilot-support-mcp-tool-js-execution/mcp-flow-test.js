#!/usr/bin/env node

// Targeted MCP SSE Flow Test
// Tests the exact sequence OpenCode would use

const http = require('http');

console.log('🎯 MCP SSE Flow Test');
console.log('====================');

function testMCPFlow() {
  return new Promise((resolve) => {
    console.log('\n1. Starting SSE connection...');
    
    // Step 1: Start SSE connection (like OpenCode would)
    const sseReq = http.get('http://localhost:5556/sse', (sseRes) => {
      console.log('   ✅ SSE connected');
      
      let sseBuffer = '';
      sseRes.on('data', (chunk) => {
        sseBuffer += chunk;
        console.log(`   📨 SSE received: ${chunk.toString().trim()}`);
        
        // Look for MCP message
        if (chunk.toString().includes('event: message')) {
          console.log('   🎉 FOUND MCP RESPONSE ON SSE STREAM!');
          console.log(`   📄 Full response: ${chunk.toString()}`);
        }
      });
      
      sseRes.on('end', () => {
        console.log('   ❌ SSE stream ended');
      });
    });
    
    sseReq.on('error', (err) => {
      console.log(`   ❌ SSE error: ${err.message}`);
    });
    
    // Step 2: Wait a moment, then send POST request
    setTimeout(() => {
      console.log('\n2. Sending MCP Initialize POST...');
      
      const postData = JSON.stringify({
        "jsonrpc": "2.0",
        "id": 42,
        "method": "initialize",
        "params": {
          "protocolVersion": "2025-06-18", 
          "clientInfo": {"name": "flow-test", "version": "1.0.0"},
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
      
      const postReq = http.request(options, (postRes) => {
        console.log(`   ✅ POST Status: ${postRes.statusCode}`);
        
        let postData = '';
        postRes.on('data', (chunk) => {
          postData += chunk;
        });
        
        postRes.on('end', () => {
          console.log(`   ✅ POST Response: ${postData}`);
        });
      });
      
      postReq.on('error', (err) => {
        console.log(`   ❌ POST error: ${err.message}`);
      });
      
      postReq.write(postData);
      postReq.end();
      
    }, 2000); // Wait 2 seconds for SSE to be established
    
    // Step 3: Close after 10 seconds
    setTimeout(() => {
      console.log('\n3. Closing connections...');
      sseReq.destroy();
      
      console.log('\n📊 Test Results:');
      console.log('   - If you see "FOUND MCP RESPONSE", the flow works');  
      console.log('   - If not, there\'s an issue with SSE response routing');
      
      resolve();
    }, 8000);
  });
}

testMCPFlow();