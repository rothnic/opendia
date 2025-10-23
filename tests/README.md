# OpenDia Tests

Integration tests for OpenDia MCP server and browser extension.

## Prerequisites

Before running tests:

1. **Start the MCP server**:
   ```bash
   cd opendia-mcp
   npm start
   ```

2. **Load the browser extension**:
   - Chrome: Load `opendia-extension/dist/chrome` in `chrome://extensions`
   - Firefox: Load `opendia-extension/dist/firefox` in `about:debugging`

3. **Ensure extension is connected**:
   - Check the extension popup shows "Connected" status
   - Verify the server logs show "Registered 19 browser tools from extension"

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Integration Tests (`tests/integration.test.js`)

Tests the full integration between:
- MCP server WebSocket connection
- Browser extension tool registration
- `page_execute_script` tool functionality
- CSP violation checks
- Persistent connection with keepalive

### Key Test Areas

1. **MCP Server Connection**
   - Verifies server is accessible on ws://localhost:5555
   - Tests WebSocket connection establishment

2. **Extension Registration**
   - Confirms extension connects and registers tools
   - Verifies all 19 tools are available
   - Checks for `page_execute_script` specifically

3. **page_execute_script Tool**
   - Tests JavaScript execution in page context
   - Verifies no CSP (Content Security Policy) violations
   - Tests DOM queries and manipulation
   - Validates browser context inclusion

4. **SSE Transport**
   - Tests hybrid response mode (POST + SSE)

5. **Persistent Connection**
   - Verifies keepalive mechanism maintains connection

## Test Output

When extension is connected:
```
✓ tests/integration.test.js (15 tests) 892ms
  ✓ MCP Server Connection (2)
  ✓ Extension Registration (3)
  ✓ page_execute_script Tool (5)
  ✓ SSE Transport (1)
  ✓ Persistent Connection (1)
```

When extension is not connected:
```
⚠️  Extension did not register tools. Some tests will be skipped.
✓ tests/integration.test.js (15 tests - 10 skipped) 892ms
```

## Troubleshooting

### Extension Not Connected

If you see warnings about the extension not being connected:

1. Check the extension is loaded in your browser
2. Verify the extension popup shows "Connected" status
3. Check browser console for errors
4. Reload the extension
5. Restart the MCP server

### CSP Violations

If tests fail with CSP errors:

1. Ensure you're using the latest version of the extension
2. Check that the CSP fix (commit bca74d0) is applied
3. Verify the extension is using `world: 'MAIN'` for script execution
4. Check browser console for detailed CSP error messages

### Test Timeouts

If tests timeout:

1. Increase timeout in `vitest.config.js`:
   ```javascript
   testTimeout: 15000  // 15 seconds
   ```
2. Check network connectivity to localhost
3. Verify server is not overloaded
4. Check for browser tabs that may be blocking

## CI/CD Integration

To run tests in CI/CD:

```bash
# Start server in background
cd opendia-mcp && npm start &

# Wait for server to be ready
sleep 2

# Run tests
npm test

# Kill background server
pkill -f "node server.js"
```

Note: Browser extension tests require a browser to be running, so full integration tests may not work in headless CI environments without additional setup (e.g., using Puppeteer or Playwright).

## Writing New Tests

Add new test files in the `tests/` directory:

```javascript
import { describe, it, expect } from 'vitest';

describe('My Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

Run tests in watch mode while developing:
```bash
npm run test:watch
```
