# Persistent Connection Fix for Chrome MV3

## Problem

The browser extension was disconnecting frequently in Chrome MV3 because:

1. **Chrome MV3 service workers are ephemeral** - they shut down after ~30 seconds of inactivity to save resources
2. Extension was creating "temporary connections" that would disconnect when service worker was unloaded
3. When OpenCode requested tools, extension was often disconnected, returning fallback tools without `page_execute_script`

## Solution

Implemented a **persistent connection with keepalive mechanism** that works for both Chrome MV3 and Firefox MV2:

### Key Changes

#### 1. Unified Connection Strategy
- **Before**: Chrome MV3 created temporary connections, Firefox maintained persistent ones
- **After**: Both browsers maintain persistent connections with proper keepalive

```javascript
async connect() {
  // Always maintain persistent connection (even in Chrome MV3)
  if (!this.mcpSocket || this.mcpSocket.readyState !== WebSocket.OPEN) {
    console.log('🔗 Creating persistent connection to MCP server');
    await this.createConnection();
  }
}
```

#### 2. Chrome MV3 Keepalive Alarms
Added periodic alarms to keep Chrome service worker alive:

```javascript
setupKeepalive() {
  if (this.isServiceWorker) {
    // Create alarm that fires every 30 seconds
    browser.alarms.create('keepalive', { periodInMinutes: 0.5 });
  }
  
  // Check for timeout (default 4 hours)
  this.keepaliveInterval = setInterval(() => {
    const elapsed = Date.now() - this.connectionStartTime;
    if (elapsed > this.keepaliveTimeout) {
      this.disconnect();
    }
  }, 60000);
}
```

#### 3. Alarm Listener
Added alarm handler that wakes up service worker and verifies connection:

```javascript
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // Wakes up service worker
    if (connectionManager.mcpSocket?.readyState === WebSocket.OPEN) {
      // Send ping to verify connection
      connectionManager.mcpSocket.send(JSON.stringify({ 
        type: 'ping', 
        timestamp: Date.now() 
      }));
    } else if (connectionManager.mcpSocket?.readyState === WebSocket.CLOSED) {
      connectionManager.connect();
    }
  }
});
```

#### 4. Configurable Timeout
Added support for configuring keepalive timeout:

```javascript
// Default: 4 hours
this.keepaliveTimeout = 4 * 60 * 60 * 1000;

// Can be changed via message:
// { action: "setKeepaliveTimeout", timeout: 2 * 60 * 60 * 1000 } // 2 hours
```

#### 5. Manual Disconnect
Added ability to manually disconnect when done:

```javascript
disconnect() {
  this.clearHeartbeat();
  this.clearKeepalive();
  this.clearReconnectInterval();
  
  if (this.mcpSocket) {
    this.mcpSocket.close(1000, 'Manual disconnect');
    this.mcpSocket = null;
  }
}
```

### How It Works

1. **Extension loads** → Connects to MCP server immediately
2. **Registers tools** → Sends full 19-tool list including `page_execute_script`
3. **Keepalive alarm** → Fires every 30 seconds to keep service worker active
4. **Heartbeat ping** → Sends WebSocket ping every 15 seconds to verify connection
5. **Connection monitoring** → Reconnects automatically if connection drops
6. **Timeout check** → After 4 hours (configurable), cleanly disconnects

### Benefits

✅ **Extension stays connected** - Chrome service worker kept alive with alarms
✅ **All tools available** - OpenCode always sees full 19-tool list
✅ **Configurable timeout** - Can set custom keepalive duration
✅ **Clean disconnect** - Proper cleanup when timeout reached
✅ **Cross-browser** - Works in both Chrome MV3 and Firefox MV2
✅ **Auto-reconnect** - Handles abnormal disconnections gracefully

## Testing

### Before Rebuild
```bash
# Extension shows 18 fallback tools (no page_execute_script)
Tools: page_analyze, page_extract_content, element_click, ...
```

### After Rebuild
```bash
# Extension shows all 19 tools including page_execute_script
✅ Registered 19 browser tools from extension
Tools: page_analyze, page_extract_content, element_click, ..., page_execute_script
```

### Verification Steps

1. **Load updated extension** in Chrome (reload from `dist/chrome`)
2. **Check server logs**:
   ```bash
   tail -f /tmp/opendia-server.log | grep -E "Registered|tools from extension"
   ```
3. **Should see**: `✅ Registered 19 browser tools from extension`
4. **OpenCode tools list** should now include `page_execute_script`

### Monitor Connection
```bash
# Watch for keepalive activity
tail -f /tmp/opendia-server.log | grep -E "ping|connected|disconnected"
```

You should see:
- `Browser Extension connected` when extension loads
- Regular ping messages every 15 seconds
- No unexpected disconnections
- After 4 hours (if configured), clean disconnect message

## Configuration

### Change Keepalive Timeout
From extension popup or console:

```javascript
// Set to 2 hours instead of default 4 hours
browser.runtime.sendMessage({
  action: "setKeepaliveTimeout",
  timeout: 2 * 60 * 60 * 1000
}, (response) => {
  console.log(`Keepalive timeout set to ${response.timeoutMinutes} minutes`);
});
```

### Manual Disconnect
```javascript
browser.runtime.sendMessage({
  action: "disconnect"
}, (response) => {
  console.log('Disconnected from MCP server');
});
```

### Reconnect
```javascript
browser.runtime.sendMessage({
  action: "reconnect"
}, (response) => {
  console.log('Reconnected to MCP server');
});
```

## Files Modified

- `opendia-extension/src/background/background.js`:
  - Updated `ConnectionManager` class with persistent connection logic
  - Added `setupKeepalive()` method
  - Added `clearKeepalive()` method
  - Added `disconnect()` method
  - Added `keepaliveTimeout` configuration
  - Added alarm listener for Chrome MV3
  - Simplified `connect()` method to always use persistent connections
  - Updated `onclose` handler to clean up keepalive

## Next Steps

1. ✅ Rebuild extension: `npm run build`
2. ✅ Reload extension in Chrome from `dist/chrome`
3. ✅ Verify connection in server logs
4. ✅ Test OpenCode sees all 19 tools
5. ✅ Monitor for stable connection over time

The extension will now stay connected reliably, ensuring all tools (including `page_execute_script`) are always available to MCP clients like OpenCode!
