# Page Structure Tool

The `page_structure` tool provides a **comprehensive, unified analysis** of a web page. Instead of separate modes, it now returns a single, rich structure that includes:

1.  **Hierarchical Tree**: A compact visual representation of the DOM.
2.  **Unique IDs**: Every element has a stable ID (e.g., `@root/main[1]/div[2]`) for targeting.
3.  **Group Detection**: Automatically identifies repeated patterns (like product lists) and generates CSS selectors.
4.  **Metadata**: Page title, URL, and pagination detection.

## Usage

```javascript
// Basic usage (comprehensive default)
const structure = await use_mcp_tool({
  server_name: "opendia-server",
  tool_name: "page_structure",
  arguments: {
    format: "compact" // Default and recommended
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

## Output Format (Compact)

The output is designed to be token-efficient while providing maximum context.

```text
=== PAGE ANALYSIS ===
Title: Product Catalog
URL: http://example.com/products
Pagination: [Next Page Available]

=== DETECTED REPEATED GROUPS (1) ===
[root/main[1]/div[1]/group[1]] 24 items
  Selector: .product-grid > .product-card
  Schema: product-card, image, title, price, button

=== STRUCTURE TREE ===
@root body
  @root/header[1] header ⭐ "My Store"
  @root/main[1] main
    @root/main[1]/h1[1] h1 "New Arrivals"
    @root/main[1]/div[1] div.product-grid
      @root/main[1]/div[1]/group[1] [GROUP: 24 items]
        Example 1:
          @root/main[1]/div[1]/div[1] div.product-card
            @root/main[1]/div[1]/div[1]/img[1] img "Product 1"
            @root/main[1]/div[1]/div[1]/h3[1] h3 "Product 1"
            @root/main[1]/div[1]/div[1]/button[1] button 🔵 "Add to Cart"
        Example 2:
          ...
```

## Key Features

### 1. Element Targeting
Every element in the tree has a unique ID starting with `@`. You can use this ID with the `page_structure_extract` tool or other interaction tools.

### 2. Intelligent Grouping
The tool automatically detects repeated structures (lists, grids, table rows). Instead of listing every single item, it groups them:
- Shows total count (e.g., "24 items")
- Shows 3 examples to understand the pattern
- Generates a **CSS Selector** (`.product-grid > .product-card`) you can use for scraping.

### 3. Pagination Detection
It looks for `rel="next"` links and common pagination patterns to inform you if there's more content.

### 4. Interactive Elements
Interactive elements (buttons, links, inputs) are marked with `🔵` and included even if they are deep in the tree. Landmarks (header, footer, nav) are marked with `⭐`.

## Extraction Tool

Use `page_structure_extract` to get content from specific elements or groups.

```javascript
// Extract all items in a group
await use_mcp_tool({
  server_name: "opendia-server",
  tool_name: "page_structure_extract",
  arguments: {
    element_id: "root/main[1]/div[1]/group[1]",
    format: "json"
  }
});
```
