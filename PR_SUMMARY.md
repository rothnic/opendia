# MCP Tool for JavaScript Execution and Page Inspection

## Summary

This PR implements a new MCP tool called `page_execute_script` that enables AI agents to execute JavaScript code directly in browser tabs for page inspection and content extraction. This addresses the requirements in issue #[issue-number] to support agent JS execution and page inspection.

## What Changed

### New Tool: `page_execute_script`

A powerful new tool that allows AI agents to:
- ✅ Execute arbitrary JavaScript in any browser tab
- ✅ Inspect HTML source code
- ✅ Extract dynamic content via DOM queries
- ✅ Access page state and variables
- ✅ Work with background tabs without switching

### Key Features

1. **Full JavaScript Execution**
   - Run custom scripts in page context
   - Access DOM, window, document, and page variables
   - JSON-serialized return values

2. **Background Tab Support**
   - Execute scripts in specific tabs using `tab_id` parameter
   - No need to switch tabs during execution

3. **Safety & Reliability**
   - Configurable timeout protection (default 5s)
   - Comprehensive error handling
   - Browser context information included

4. **Cross-Browser Compatible**
   - Chrome MV3: Uses `browser.scripting.executeScript`
   - Firefox MV2: Uses `browser.tabs.executeScript`

## Usage Examples

### Basic HTML Inspection
```javascript
// Get page title
{ "script": "document.title" }

// Get complete HTML source
{ "script": "document.documentElement.outerHTML" }

// Get page text content
{ "script": "document.body.innerText.substring(0, 500)" }
```

### Advanced Content Extraction
```javascript
// Extract all headings
{
  "script": "Array.from(document.querySelectorAll('h1')).map(h => h.textContent)"
}

// Get page metadata
{
  "script": "({ url: window.location.href, title: document.title, html: document.documentElement.outerHTML })"
}
```

### Background Tab Operations
```javascript
// Execute in specific tab
{
  "script": "document.title",
  "tab_id": 12345
}
```

## Files Modified

1. **opendia-extension/src/background/background.js**
   - Added `page_execute_script` tool definition (~35 lines)
   - Added handler case in `handleMCPRequest`
   - Added `executeScriptInTab` function implementation (~90 lines)

2. **README.md**
   - Updated tool count from 18 to 19
   - Added "Execute JavaScript" to capabilities
   - Added example prompts for page inspection

3. **New Documentation**
   - `docs/page_execute_script.md` - Comprehensive tool documentation
   - `docs/IMPLEMENTATION_SUMMARY.md` - Technical implementation details

## Testing

Created comprehensive test suite (`/tmp/test_page_execute_script.js`) that validates:
- ✅ Tool registration (12/12 tests passed)
- ✅ Input schema and parameters
- ✅ Handler implementation
- ✅ Cross-browser API usage
- ✅ Timeout protection
- ✅ Context information
- ✅ Example scripts

Extension builds successfully for both Chrome and Firefox.

## Requirements Checklist

From the original issue:

- ✅ **Allow agent to control and inspect page source via JS execution** - Implemented via `page_execute_script` tool
- ✅ **Extract content as requested by agent** - Full flexibility with custom JavaScript
- ✅ **Ensure chrome extension permissions allow JS execution** - Uses existing `scripting` permission
- ✅ **Include browser context with MCP requests** - Returns tab ID, URL, title, status
- ✅ **Support for background tab operations** - Via `tab_id` parameter

## Permissions

No new permissions required! The implementation uses the existing `scripting` permission already present in the manifest.

## Security Considerations

- Uses existing extension permissions
- Executes in browser tab context only (not server-side)
- Subject to page's Content Security Policy
- Same access level as page's own JavaScript
- Should only be used with trusted AI agents

## Backward Compatibility

✅ Fully backward compatible - adds new functionality without breaking existing tools.

## Benefits for Users

This tool enables AI agents to:
- Inspect complete HTML source of any page
- Extract content not covered by existing structured tools
- Implement custom extraction logic for unique page structures
- Access dynamic content loaded by JavaScript
- Analyze page state and variables
- Work efficiently with multiple tabs

## Future Enhancements

Potential improvements for future iterations:
- Support for async/await scripts
- Script result caching
- Script library/templates
- Multi-script execution sequences

## How to Test

1. Load the extension in Chrome or Firefox
2. Start the MCP server: `cd opendia-mcp && npm start`
3. Connect a MCP client (Claude Desktop, etc.)
4. Use the `page_execute_script` tool with example scripts
5. Verify results and context information

## Documentation

- Tool documentation: `docs/page_execute_script.md`
- Implementation details: `docs/IMPLEMENTATION_SUMMARY.md`
- Examples in README.md

## Related Issues

Closes #[issue-number] - Support MCP tool for agent JS execution and page inspection
