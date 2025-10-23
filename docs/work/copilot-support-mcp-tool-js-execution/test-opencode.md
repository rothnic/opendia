# Testing OpenCode with Hybrid Mode

## What Changed
Server now sends MCP responses in **BOTH** places:
1. ✅ POST response body (full JSON-RPC message)
2. ✅ SSE stream (event: message format)

## Why This Helps
Some MCP clients might:
- Expect responses in POST body (traditional HTTP)
- Also listen on SSE stream for async notifications
- Have SSE parsing bugs with multi-chunk messages
- Timeout if POST doesn't return promptly

## Test Steps

1. **Start OpenCode** (if not running):
   ```bash
   cd ~/workspace/opencode-testing
   ./cursor-0.45.8-250325vjbj49f6hx/cursor.AppImage
   ```

2. **Check current status**:
   - Look for "OpenDia MCP Server" in OpenCode's MCP servers list
   - Status should show "Connected" or at least attempt connection

3. **Watch server logs**:
   ```bash
   tail -f /tmp/opendia-server.log
   ```

4. **Try using OpenDia tools in OpenCode**:
   - Type: "@OpenDia analyze this page"
   - Or: "Use OpenDia to list my open tabs"

## Expected Results

✅ **Good signs**:
- Server logs show: "MCP request received via SSE"
- Server logs show: "SSE mode: sending to N clients"
- OpenCode receives and displays tool results
- No disconnection messages in logs

❌ **Still having issues?**:
- Check if OpenCode disconnects after initialize
- Look for timing/timeout errors in OpenCode console
- May need to investigate OpenCode's specific SSE client implementation

## What's Different from Before

**Before** (ACK mode):
```
POST → {"ok": true}
SSE → (response comes later on stream)
```

**Now** (Hybrid mode):
```
POST → {full JSON-RPC response}
SSE → {same response also on stream}
```

This ensures compatibility with clients that expect either pattern or both!