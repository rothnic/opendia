# Page Structure Tool - Format Comparison

## Overview

The `page_structure` tool now supports two output formats:
- **`compact`** (default): Efficient text-based tree format that's 60-70% smaller
- **`json`**: Full nested JSON structure for programmatic processing

## Format Examples

### Compact Format (Default)

```
PAGE STRUCTURE: Product Catalog
URL: http://localhost:9879/
Viewport: 1280x720

body [0,21 1280x822]
  header [landmark] [0,21 1280x59] "Test Website"
    h1 [20,29 193x43] "Product Catalog"
  main [landmark] [0,80 1280x764]
    div .product-grid [0,80 1280x764]
      [GROUP] 10 similar elements (showing 3, omitting 7)
        Signature: div||product-card|M|img|link|
        Example 1:
          div .product-card [20,100 400x166]
            img [36,116 368x93] "Product 1"
            h3 [36,144 368x21] "Product 1"
            p .price [36,181 368x18] "$19.99"
            button [interactive] [36,215 368x35] "Add to Cart" type=submit
        Example 2:
          div .product-card [440,100 400x166]
            img [456,116 368x93] "Product 2"
            h3 [456,144 368x21] "Product 2"
            p .price [456,181 368x18] "$29.99"
            button [interactive] [456,215 368,35] "Add to Cart" type=submit
        Example 3:
          div .product-card [860,100 400x166]
            ...
```

**Benefits:**
- ✅ 60-72% smaller than JSON
- ✅ Human-readable tree structure
- ✅ Easier for LLMs to parse and understand
- ✅ Shows element hierarchy at a glance
- ✅ Includes position, size, and key attributes inline

**Size:** ~2KB for 10 product cards

### JSON Format

Request with `format: 'json'`:

```json
{
  "format": "json",
  "outline": {
    "kind": "node",
    "id": "root",
    "tag": "body",
    "role": null,
    "interactive": false,
    "landmark": false,
    "bbox": { "x": 0, "y": 21, "width": 1280, "height": 822, "area": 1052160, "viewportAreaRatio": 1.14 },
    "label": undefined,
    "textPreview": "Product Catalog Product 1...",
    "attributes": {},
    "children": [
      {
        "kind": "node",
        "id": "root/main[1]",
        "tag": "main",
        "landmark": true,
        "children": [
          {
            "kind": "repeated_group",
            "id": "root/main[1]/div[1]/group[1]",
            "signature": "div||product-card|M|img|link|",
            "total": 10,
            "shown": 3,
            "omitted": 7,
            "examples": [
              {
                "kind": "node",
                "tag": "div",
                "attributes": {
                  "classes": ["product-card"],
                  "data-product-id": "1"
                },
                "children": [...]
              }
            ]
          }
        ]
      }
    ]
  },
  "stats": {...}
}
```

**Size:** ~7KB for the same content

## Efficiency Results

### Test Page (10 Product Cards)
- **Compact:** 2,032 bytes
- **JSON:** 7,289 bytes  
- **Reduction:** 72.1% smaller ✅

### GitHub Homepage
- **Compact:** 2,701 bytes
- **JSON:** 7,198 bytes
- **Reduction:** 62.5% smaller ✅

## Usage

### Default (Compact Format)
```javascript
// No format parameter needed - compact is default
const result = await callTool('page_structure', {
  max_nodes: 300
});

// Returns text in result.text
console.log(result.text);
```

### Explicit JSON Format
```javascript
const result = await callTool('page_structure', {
  format: 'json',
  max_nodes: 300
});

// Returns nested structure in result.outline
console.log(result.outline);
```

## When to Use Each Format

### Use Compact Format When:
- ✅ You want the most efficient token usage
- ✅ You need a quick overview of page structure
- ✅ You're using this with LLMs
- ✅ You want human-readable output
- ✅ **This is the default and recommended format**

### Use JSON Format When:
- You need programmatic access to the full tree
- You're building tools that process the structure
- You need exact bounding box coordinates
- You need all metadata for every node

## Running Tests

```bash
# Test both formats and compare efficiency
cd tests/page-structure
npm run test:format

# Run full test suite (uses JSON for validation)
npm test
```
