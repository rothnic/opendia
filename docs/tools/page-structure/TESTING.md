# Page Structure Testing Guide

## Quick Test

```bash
cd opendia-extension
npm run debug
```

Then in Chrome:
1. Open side panel (click extension icon → "Page Structure")
2. Navigate to a test page
3. Select format from dropdown
4. Click **Refresh**

## Test Pages

### Simple: example.com
Expected: ~10 lines, single section, 1 link

### E-commerce: amazon.com
Expected: 5-8 sections, card grids detected, <50 lines

### Product Grid: Local test page
```bash
cd tests/page-structure
npm test
```

## Format Testing

| Format | Recommended For | File Size |
|--------|----------------|-----------|
| Compact | LLM consumption | ~2KB |
| JSON | Programmatic access | ~7KB |

## Automated Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run specific test file
npm test -- tests/page-structure/comprehensive.test.js
```

### Test Coverage

| Test File | Coverage |
|-----------|----------|
| `comprehensive.test.js` | Unified output, selectors, groups |
| `page-structure.test.js` | Basic functionality |
| `format-comparison.test.js` | Format efficiency |

## Success Criteria

- [ ] Amazon: <50 lines, detects 5+ sections
- [ ] Product grid: Single card-grid with examples
- [ ] Simple page: <10 lines
- [ ] No console errors
- [ ] IDs are stable across refreshes

## Debugging

**Side panel blank:**
- Check content script loaded (console shows "OpenDia enhanced content script loaded")
- Ensure you're on a regular webpage (not chrome://)

**Structure incomplete:**
- Tool has budget limits (max_nodes: 400)
- Try increasing limits for large pages

**Groups not detected:**
- Requires 3+ similar siblings
- Check signature matching in console
