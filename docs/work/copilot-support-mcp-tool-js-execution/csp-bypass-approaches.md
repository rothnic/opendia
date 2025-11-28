# CSP Bypass Approaches for Script Execution

## Overview

This document describes different approaches for executing JavaScript in browser tabs from a Chrome extension, especially when dealing with pages that have strict Content Security Policy (CSP) like LinkedIn.

## The Problem

Chrome extensions executing scripts via `browser.scripting.executeScript()` can be blocked by page CSP when:
- Using `eval()` in the extension context
- Using `new Function()` in the extension context  
- Injecting inline `<script>` elements
- Loading scripts from blob: URLs

LinkedIn, GitHub, and other security-conscious sites have strict CSPs that block these approaches.

## Approaches Tested

### Approach 1: MAIN World + eval() ⚠️ May Be Blocked

**Current implementation in `page_execute_script`**

```javascript
results = await browser.scripting.executeScript({
  target: { tabId },
  func: (scriptCode) => {
    return eval(scriptCode);  // eval runs in PAGE context
  },
  args: [script],
  world: 'MAIN'
});
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★★★ (10/10) |
| CSP Compatibility | ★★☆☆☆ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Can execute any JavaScript
- Full access to page context and variables
- Most flexible approach

**Cons:**
- Blocked by `script-src` CSP without `'unsafe-eval'`
- LinkedIn blocks this

---

### Approach 2: ISOLATED World (No eval) ✅ Recommended Fallback

**Pre-defined extractors running in isolated world**

```javascript
results = await browser.scripting.executeScript({
  target: { tabId },
  func: () => {
    // Pre-defined extraction logic
    return {
      title: document.title,
      url: window.location.href,
      // ...
    };
  },
  world: 'ISOLATED'
});
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★☆☆ (3/10) |
| CSP Compatibility | ★★★★★ |
| DOM Access | ✅ Full |
| Page Variables | ❌ No |

**Pros:**
- Never blocked by CSP
- Full DOM access
- Sandboxed and secure

**Cons:**
- Cannot execute arbitrary scripts
- Must pre-define all extractors
- No access to page JavaScript variables

---

### Approach 3: Script Element Injection ⚠️ May Be Blocked

**Create a `<script>` element in the DOM**

```javascript
const scriptEl = document.createElement('script');
scriptEl.textContent = `result = (${scriptCode})`;
document.head.appendChild(scriptEl);
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★★☆ (8/10) |
| CSP Compatibility | ★★☆☆☆ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Runs in page context
- Full JavaScript access

**Cons:**
- Blocked by `script-src` without `'unsafe-inline'`
- More complex implementation
- Requires async result retrieval

---

### Approach 4: Blob URL Injection ⚠️ May Be Blocked

**Create a blob URL and inject as script src**

```javascript
const blob = new Blob([scriptCode], { type: 'application/javascript' });
const blobUrl = URL.createObjectURL(blob);
const scriptEl = document.createElement('script');
scriptEl.src = blobUrl;
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★★☆ (8/10) |
| CSP Compatibility | ★★☆☆☆ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Different CSP directive (`blob:`)
- Full JavaScript access

**Cons:**
- Blocked by `script-src` without `blob:`
- Complex implementation

---

### Approach 5: Function Serialization ✅ Recommended

**Pass pre-compiled functions, not strings**

```javascript
function extractJobInfo() {
  return {
    title: document.querySelector('h1')?.textContent,
    // ...pre-defined logic
  };
}

results = await browser.scripting.executeScript({
  target: { tabId },
  func: extractJobInfo,  // Pass the function itself
  world: 'MAIN'
});
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★☆☆ (5/10) |
| CSP Compatibility | ★★★★★ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Never blocked by CSP
- Full DOM and page variable access
- Type-safe

**Cons:**
- Must define all functions in advance
- Cannot run arbitrary user scripts

---

### Approach 6: Dynamic Selectors ✅ Recommended

**Pre-defined operations with dynamic selector arguments**

```javascript
results = await browser.scripting.executeScript({
  target: { tabId },
  func: (selectors) => {
    const results = {};
    for (const [key, selector] of Object.entries(selectors)) {
      results[key] = document.querySelectorAll(selector);
    }
    return results;
  },
  args: [{
    titles: 'h1, .job-title',
    companies: '.company-name'
  }],
  world: 'MAIN'
});
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★★☆ (6/10) |
| CSP Compatibility | ★★★★★ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Not blocked by CSP
- Dynamic selector capabilities
- Good balance of flexibility and security

**Cons:**
- Limited to predefined operations
- Cannot run arbitrary JavaScript

---

### Approach 7: Function Constructor ⚠️ Same as eval

**Use `new Function()` instead of `eval()`**

```javascript
const fn = new Function('return ' + scriptCode);
return fn();
```

| Aspect | Rating |
|--------|--------|
| Flexibility | ★★★★★ (10/10) |
| CSP Compatibility | ★★☆☆☆ |
| DOM Access | ✅ Full |
| Page Variables | ✅ Full |

**Pros:**
- Same flexibility as eval

**Cons:**
- Same CSP restrictions as eval
- Both require `'unsafe-eval'` in CSP

---

## CSP Testing Tool

A test tool has been added to the extension: `test_csp_bypass`

### Usage

```json
{
  "method": "test_csp_bypass",
  "params": {
    "tab_id": 12345,
    "test_script": "document.title"
  }
}
```

### Output

Returns comparison of all approaches showing:
- Success/failure status
- CSP blocked indicator
- Flexibility rating
- Result if successful

## Recommendations

### For LinkedIn and Strict CSP Pages

1. **Primary:** Use **Approach 5 (Function Serialization)** or **Approach 6 (Dynamic Selectors)**
   - Create pre-defined extraction functions for common use cases
   - Pass dynamic arguments (selectors, options) to these functions

2. **Fallback:** Use **Approach 2 (ISOLATED World)**
   - For simple DOM queries when page variables aren't needed

3. **Last Resort:** Try **Approach 1 (MAIN + eval)** 
   - Some pages allow it, so try first and fall back if blocked

### Implementation Strategy

```javascript
async function executeWithFallback(tabId, script, extractorName) {
  // Try eval first (most flexible)
  try {
    const result = await approach1_mainWorldEval(tabId, script);
    if (result.success) return result;
  } catch (e) {
    if (!e.message.includes('CSP')) throw e;
  }
  
  // Fall back to pre-defined extractor
  return await approach5_functionSerialization(tabId, extractorName);
}
```

## Testing Against LinkedIn

1. Navigate to a LinkedIn job page: `https://www.linkedin.com/jobs/view/XXXXXXX`
2. Call `test_csp_bypass` tool
3. Review which approaches work
4. Implement appropriate fallback strategy

## Files

- `tests/csp-bypass/test-csp-approaches.js` - Approach definitions
- `tests/csp-bypass/csp-implementations.js` - Full implementations
- `tests/csp-bypass/test-runner.js` - Test runner utility
- `opendia-extension/src/background/background.js` - Contains `test_csp_bypass` tool
