# CSP Violation Fix Summary

**Branch:** `copilot/support-mcp-tool-js-execution`  
**Date:** October 23, 2025  
**Commit:** bca74d0

## Issue

When using `page_execute_script` tool to execute JavaScript in browser tabs, users encountered:
```
Refused to evaluate a string as JavaScript because 'unsafe-eval' 
is not an allowed source of script in the following Content Security Policy
```

## Root Cause

The extension was using `new Function()` to create functions from user-provided script strings in the **extension's context**, which violates the extension's Content Security Policy (CSP). The extension's CSP blocks `eval()` and `new Function()` for security.

**Previous code (Chrome MV3):**
```javascript
results = await browser.scripting.executeScript({
  target: { tabId: targetTab.id },
  func: new Function(`return (${script})`),  // ❌ Violates extension CSP
});
```

## Solution

Execute the script in the **page's main context** instead of the extension's isolated context. The page's CSP allows `eval()` for its own scripts.

**Fixed code (Chrome MV3):**
```javascript
results = await browser.scripting.executeScript({
  target: { tabId: targetTab.id },
  func: (scriptCode) => {
    // This runs in the page context, where eval is allowed
    // eslint-disable-next-line no-eval
    return eval(scriptCode);
  },
  args: [script],
  world: 'MAIN',  // ✅ Execute in page's main world
});
```

## Key Changes

1. **Inject a function** that takes the script as a parameter
2. **Use `eval()` inside the injected function** (runs in page context)
3. **Pass script as argument** via `args` parameter
4. **Set `world: 'MAIN'`** to execute in page's JavaScript environment, not extension's isolated world

## Why This Works

- **Extension CSP**: Blocks `new Function()` and `eval()` in extension context
- **Page CSP**: Typically allows `eval()` for the page's own scripts
- **World Parameter**: `'MAIN'` executes code in the page's main world where CSP restrictions are different
- **Isolated World**: Default behavior isolates extension scripts from page scripts

## Additional Changes

Added formatting configuration to prevent future large formatting diffs:

### `.editorconfig`
- Maintains consistent coding styles across editors
- Sets tab-based indentation for JS files
- Ensures LF line endings

### `.vscode/settings.json`
- Disables auto-format on save
- Disables format on paste
- Prevents automatic formatting changes
- Maintains existing code style

## Testing

1. Reload extension in Chrome: `chrome://extensions`
2. Execute test script in OpenCode:
   ```javascript
   Array.from(document.querySelectorAll('button')).map((btn, idx) => ({
     index: idx,
     text: btn.textContent
   }))
   ```
3. Verify no CSP errors in console
4. Verify script returns expected results

## Browser Compatibility

- **Chrome MV3**: Uses `browser.scripting.executeScript` with `world: 'MAIN'`
- **Firefox MV2**: Uses `browser.tabs.executeScript` with code string (more permissive)

## Related Commits

- `7066eaa` - Hybrid SSE response mode implementation
- `735d149` - Persistent connection with keepalive
- `bca74d0` - CSP violation fix (this commit)

## References

- [Chrome Extensions: Content Security Policy](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)
- [Chrome Scripting API: ExecutionWorld](https://developer.chrome.com/docs/extensions/reference/scripting/#type-ExecutionWorld)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
