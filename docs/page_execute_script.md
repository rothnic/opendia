# page_execute_script Tool

## Overview

The `page_execute_script` tool enables AI agents to execute arbitrary JavaScript code in a browser tab context. This allows for flexible page inspection, HTML source extraction, and custom content analysis that goes beyond the capabilities of pre-defined tools.

## Purpose

This tool was added to support the following use cases:
- **HTML Source Inspection**: Access and extract the complete HTML source of any page
- **Dynamic Content Extraction**: Run custom JavaScript to extract specific data from pages
- **Page State Analysis**: Inspect complex page states, variables, and DOM structures
- **Custom Data Collection**: Create tailored extraction logic for unique requirements
- **Multi-tab Inspection**: Execute scripts in background tabs without switching

## Features

✅ Execute arbitrary JavaScript in page context  
✅ Access DOM, window, document, and all page variables  
✅ Background tab support (execute without switching tabs)  
✅ Timeout protection (default 5000ms)  
✅ Browser context information (URL, title, tab status)  
✅ Cross-browser compatible (Chrome MV3 + Firefox MV2)  
✅ JSON serialization of complex return values  

## Parameters

### Required
- **script** (string): JavaScript code to execute in the page context. Can be an expression or include return statements.

### Optional
- **tab_id** (number): Specific tab ID to target. If omitted, executes in the current active tab. Use `tab_list` tool to get tab IDs.
- **timeout** (number): Maximum execution time in milliseconds. Default: 5000ms
- **include_context** (boolean): Include browser context (URL, title, tab info) in response. Default: true

## Examples

### Basic Examples

**Get page title:**
```json
{
  "script": "document.title"
}
```

**Get first 500 characters of page text:**
```json
{
  "script": "document.body.innerText.substring(0, 500)"
}
```

**Get all H1 headings:**
```json
{
  "script": "Array.from(document.querySelectorAll('h1')).map(h => h.textContent)"
}
```

### Advanced Examples

**Get complete page information with HTML:**
```json
{
  "script": "({ url: window.location.href, title: document.title, html: document.documentElement.outerHTML })"
}
```

**Extract metadata tags:**
```json
{
  "script": "Array.from(document.querySelectorAll('meta')).map(meta => ({ name: meta.name || meta.property, content: meta.content }))"
}
```

**Get page structure summary:**
```json
{
  "script": "({ links: document.querySelectorAll('a').length, images: document.querySelectorAll('img').length, forms: document.querySelectorAll('form').length })"
}
```

## Response Format

```json
{
  "success": true,
  "result": "<script execution result>",
  "execution_time": 1234567890,
  "context": {
    "tab_id": 12345,
    "url": "https://example.com/page",
    "title": "Example Page",
    "tab_status": "complete",
    "active": true
  }
}
```

## Use Cases

### HTML Source Inspection
```json
{ "script": "document.documentElement.outerHTML" }
```

### Dynamic Content Analysis
```json
{
  "script": "Array.from(document.querySelectorAll('.product')).map(p => ({ title: p.querySelector('.title')?.textContent, price: p.querySelector('.price')?.textContent }))"
}
```

### Multi-Tab Research
1. Get tab IDs with `tab_list`
2. Execute on each tab:
```json
{
  "script": "({ title: document.title, url: window.location.href })",
  "tab_id": 12345
}
```

## Security Considerations

⚠️ **Important**: This tool executes arbitrary JavaScript. Only use with trusted AI agents in controlled environments.

- Leverages existing `scripting` permission in manifest
- Executes in browser tab context only (not server-side)
- Subject to page's Content Security Policy
- Same access level as page's own JavaScript

## Best Practices

1. Keep scripts simple and focused
2. Use `JSON.stringify` for complex return values
3. Handle null/undefined with optional chaining (`?.`)
4. Set appropriate timeouts for long-running scripts
5. Batch multiple extractions into one script when possible

## Limitations

- Scripts must complete within timeout (default 5000ms)
- Return values must be JSON-serializable
- Cannot execute on restricted pages (chrome://, about:, etc.)
- Subject to Content Security Policy

## Technical Details

**Chrome (MV3)**: Uses `browser.scripting.executeScript()`  
**Firefox (MV2)**: Uses `browser.tabs.executeScript()`  

Both include:
- Timeout protection via Promise.race
- Consistent response format
- Browser context information
- Graceful error handling
