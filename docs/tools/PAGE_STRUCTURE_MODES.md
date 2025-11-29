# Page Structure Tool - Enhanced Modes

## Overview

The `page_structure` tool now supports **4 distinct modes** optimized for different use cases:

### 1. **Overview Mode** (Default)
General hierarchical structure with intelligent grouping

**Best for:** Understanding page layout, finding landmarks, seeing overall organization

**Example:**
```
=== PAGE STRUCTURE (OVERVIEW MODE) ===
body [0,21 1280x822]
  header [landmark] [0,21 1280x59]
  main [landmark] [0,80 1280x764]
    [GROUP] 10 similar elements
```

### 2. **Navigation Mode**
Focus on interactive elements and viewport visibility

**Best for:** Browser automation, clicking buttons, filling forms

**Example:**
```
=== PAGE STRUCTURE (NAVIGATION MODE) ===
📍 INTERACTIVE ELEMENTS: 15 total
   In viewport: 5
   Below fold: 10

🔵 IN VIEWPORT:
  [nav-0] button#submit.btn-primary
        Submit Form
        Position: (520, 300)
  [nav-1] a.nav-link
        About Us
        Position: (100, 50)
```

**Features:**
- Each element gets a unique ID (e.g., `nav-0`)
- Shows viewport visibility
- Includes position coordinates
- Use with `page_structure_extract` to interact

### 3. **Scraping Mode**
Focus on repeated patterns for data extraction

**Best for:** Building scrapers, extracting structured data, finding patterns

**Example:**
```
=== PAGE STRUCTURE (SCRAPING MODE) ===
🗂️  REPEATED GROUPS: 2 patterns found

[group-0] Group 1: 10 similar elements
    Signature: div||product-card|M|img|link|
    Pattern: {"tag":"div","hasImage":true,"hasLink":true}
    Example data: {"text":"Product 1","child0_h3":"Product 1","child1_price":"$19.99"}

💡 Use page_structure_extract with group ID to get all elements
```

**Features:**
- Identifies repeated patterns automatically
- Each group gets an ID (e.g., `group-0`)
- Shows example data structure
- Extract all items in group at once

### 4. **TOON Mode**
Ultra-compact tree visualization

**Best for:** Quick page scan, minimal token usage, visual debugging

**Example:**
```
# Product Catalog
URL: http://localhost:9879/

t0:body  
│ t1:header ⭐ "Product Catalog"
│ │ t2:h1 "Product Catalog"
│ t3:main ⭐ 
│ │ t4:div.product-grid 
│ │ │ t5:div.product-card 🔵  "Product 1 $19.99"
│ │ │ t6:div.product-card 🔵  "Product 2 $29.99"
```

**Symbols:**
- 🔵 = Interactive element
- ⭐ = Landmark
- `│` = Tree structure

---

## New Tool: `page_structure_extract`

Extract content from elements identified in page_structure

### Parameters:
- `element_id` (required): ID from page_structure (e.g., `"nav-0"`, `"group-0"`)
- `format`: 'text', 'html', 'markdown', 'json' (default: 'text')
- `include_children`: boolean (default: true)

### Usage Examples:

**Extract single element:**
```javascript
// 1. Get page structure in navigation mode
const structure = await callTool('page_structure', { 
  mode: 'navigation' 
});
// Returns: [nav-0] button "Submit"

// 2. Extract that button's HTML
const content = await callTool('page_structure_extract', {
  element_id: 'nav-0',
  format: 'html'
});
```

**Extract all items in a group:**
```javascript
// 1. Get page structure in scraping mode
const structure = await callTool('page_structure', {
  mode: 'scraping'
});
// Returns: [group-0] 10 product cards

// 2. Extract all products as JSON
const products = await callTool('page_structure_extract', {
  element_id: 'group-0',
  format: 'json'
});
// Returns: { isGroup: true, count: 10, items: [...] }
```

---

## Complete Workflow Examples

### Example 1: Browser Navigation
```javascript
// 1. Find clickable elements
const nav = await callTool('page_structure', { 
  mode: 'navigation' 
});
// See: [nav-2] button "Login"

// 2. Click the button
await callTool('element_click', { 
  selector: '[nav-2]' // Or use stored element
});
```

### Example 2: Data Scraping
```javascript
// 1. Find repeated patterns
const scraping = await callTool('page_structure', {
  mode: 'scraping'
});
// See: [group-0] 50 product cards

// 2. Extract all products as structured JSON
const data = await callTool('page_structure_extract', {
  element_id: 'group-0',
  format: 'json'
});
// Returns: Array of 50 product objects with text, links, images

// 3. Build scraping script from pattern
const script = buildScraperFrom(data.items[0]);
```

### Example 3: Quick Page Scan
```javascript
// Get ultra-compact view with TOON mode
const scan = await callTool('page_structure', {
  mode: 'toon'
});
// Minimal tokens, maximum context
```

---

## Mode Comparison

| Use Case | Mode | Output Size | Element IDs | Groups | Viewport Info |
|----------|------|-------------|-------------|--------|---------------|
| General structure | `overview` | Medium | No | Yes | No |
| Clicking/Navigation | `navigation` | Small | Yes | No | Yes |
| Data extraction | `scraping` | Medium | Yes (groups) | Yes | No |
| Quick scan | `toon` | Tiny | Yes | No | No |

---

## Parameter Reference

### page_structure
```javascript
{
  mode: 'overview' | 'navigation' | 'scraping' | 'toon',
  format: 'compact' | 'json', // compact recommended
  max_depth: 8,
  max_nodes: 400,
  max_children_per_group: 6,
  examples_per_group: 3
}
```

### page_structure_extract
```javascript
{
  element_id: string, // From page_structure output
  format: 'text' | 'html' | 'markdown' | 'json',
  include_children: boolean
}
```
