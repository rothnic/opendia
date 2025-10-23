# OpenCode Connection Troubleshooting

## Current Status

### ✅ **What's Working**
- OpenDia MCP server starts successfully on localhost:5556
- SSE endpoint responds correctly with proper headers
- Manual curl tests show correct MCP JSON-RPC responses
- SSE framing is proper (`event: message`, `data: <json>`)
- Protocol version echoing works (returns client's version)

### ❌ **What's Not Working**
- OpenCode connects briefly but then disconnects
- OpenCode logs show: `service=bus type=* unsubscribing` and `event disconnected`

## Diagnostic Results

### Server Response Test ✅
```bash
curl -v http://localhost:5556/sse
# Returns proper SSE headers and heartbeat pings
```

### MCP Initialize Test ✅
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' \
  http://localhost:5556/sse
# Returns: {"ok":true} and SSE message with proper response
```

## Possible Root Causes

### 1. **Timing Issues**
OpenCode might expect faster responses during initialization. The current implementation processes the request asynchronously which could cause timeouts.

### 2. **SSE Connection Management**
OpenCode might expect the SSE connection to remain stable during the POST/response cycle. Current implementation may not handle concurrent connections properly.

### 3. **MCP Protocol Expectations**
OpenCode might expect specific capabilities or serverInfo fields that don't match our current implementation.

### 4. **Connection Lifecycle**
OpenCode might expect certain connection patterns that our implementation doesn't follow.

## Debugging Steps

### 1. Use Diagnostic Script
```bash
cd /Users/nroth/workspace/opendia-1/opendia-mcp
node ../docs/work/copilot-support-mcp-tool-js-execution/opencode-diagnostic.js
```

### 2. Monitor Server Logs
Start server with verbose logging:
```bash
node server.js --sse-only
# Watch for connection/disconnection patterns
```

### 3. Check OpenCode Configuration
Verify `/Users/nroth/workspace/opencode-testing/opencode.json`:
```json
{
  "mcp": {
    "opendia": {
      "type": "remote",
      "url": "http://localhost:5556/sse",
      "enabled": true
    }
  }
}
```

### 4. Test with Different MCP Clients
- Try with Claude Desktop MCP configuration
- Test with other MCP clients to isolate OpenCode-specific issues

## Potential Fixes

### 1. **Improve Connection Handling**
- Add connection pooling for SSE clients
- Ensure POST responses don't interfere with SSE streams
- Add connection state tracking

### 2. **Enhanced Error Handling**
- Add detailed logging for connection lifecycle
- Implement proper error responses for malformed requests
- Add timeout handling

### 3. **Protocol Compliance**
- Verify MCP specification compliance
- Add missing capabilities or serverInfo fields
- Implement proper connection negotiation

### 4. **Configuration Options**
- Add OpenCode-specific compatibility mode
- Allow custom timeout configurations
- Add debug logging levels

## Next Steps

1. **Run diagnostic script** to confirm current behavior
2. **Check OpenCode logs** for specific error patterns  
3. **Test with simple MCP server** to isolate issues
4. **Compare with working MCP implementations**
5. **Add enhanced logging** to track connection lifecycle

## Working Configuration Summary

**OpenCode config** (`opencode.json`):
```json
{
  "mcp": {
    "opendia": {
      "type": "remote", 
      "url": "http://localhost:5556/sse",
      "enabled": true
    }
  }
}
```

**Server command**:
```bash
node server.js --sse-only
```

The foundation is solid - this appears to be a protocol timing or connection management issue rather than a fundamental implementation problem.