# Page Structure Tool

> **Status:** Production-ready with ongoing improvements

The `page_structure` tool provides comprehensive, unified analysis of web pages for AI agents.

## Quick Start

```javascript
// Basic usage (recommended)
const structure = await use_mcp_tool({
  server_name: "opendia-server",
  tool_name: "page_structure",
  arguments: {
    format: "compact" // Default - 60-70% smaller than JSON
  }
});

// JSON format for programmatic processing
const jsonStructure = await use_mcp_tool({
  server_name: "opendia-server",
  tool_name: "page_structure",
  arguments: {
    format: "json"
  }
});
```

## What It Returns

1. **Hierarchical Tree** - Compact visual representation of the DOM
2. **Unique IDs** - Every element gets a stable ID (e.g., `@root/main[1]/div[2]`)
3. **Repeated Groups** - Automatic detection of patterns (product lists, nav items)
4. **CSS Selectors** - Generated selectors for each group
5. **Metadata** - Page title, URL, pagination detection

## Output Example (Compact Format)

```
=== PAGE ANALYSIS ===
Title: Product Catalog
URL: http://example.com/products
Pagination: [Next Page Available]

=== DETECTED REPEATED GROUPS (1) ===
[root/main[1]/div[1]/group[1]] 24 items
  Selector: .product-grid > .product-card
  Schema: image, title, price, button

=== STRUCTURE TREE ===
@root body
  @root/header[1] header ⭐ "My Store"
  @root/main[1] main
    @root/main[1]/h1[1] h1 "New Arrivals"
    @root/main[1]/div[1] div.product-grid
      @root/main[1]/div[1]/group[1] [GROUP: 24 items]
        Example 1:
          @root/main[1]/div[1]/div[1] div.product-card
            ...
```

## Visual Indicators

- `🔵` Interactive element (button, link, input)
- `⭐` Landmark (header, nav, main, footer)
- `[GROUP: N items]` Repeated pattern detected

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `compact` \| `json` | `compact` | Output format |
| `max_depth` | number | 8 | Maximum tree depth |
| `max_nodes` | number | 400 | Maximum nodes in outline |
| `max_children_per_group` | number | 6 | Max siblings before grouping |
| `examples_per_group` | number | 3 | Examples shown per group |
| `tab_id` | number | active | Target tab ID |

## Format Comparison

| Metric | Compact | JSON |
|--------|---------|------|
| Size | ~2KB | ~7KB |
| Reduction | 60-72% smaller | Full data |
| Use Case | LLM parsing | Programmatic access |

## Documentation

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - How it works internally
- [TESTING.md](./TESTING.md) - How to test changes

## Related Tools

- `page_execute_script` - Execute custom JavaScript
- `page_analyze` - Quick page overview
