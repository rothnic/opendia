# Debug Mode - Side Panel Page Structure Viewer

The OpenDia extension includes a **debug side panel** that displays real-time page structure analysis as you browse. This is useful for:
- Understanding how the `page_structure` tool sees a webpage
- Debugging page analysis issues
- Developing and testing structure-based automation

## Quick Start

```bash
cd opendia-extension
npm run debug
```

This will:
1. Build the Chrome extension (`dist/chrome`)
2. Launch Google Chrome with the extension pre-loaded
3. Open with DevTools enabled

## Using the Side Panel

1. **Open the Side Panel:**
   - Click the OpenDia extension icon in Chrome
   - Or go to `chrome://extensions` and find OpenDia
   - Click "Open side panel" in the extension details

2. **Analyze a Page:**
   - Navigate to any webpage
   - Click the **Refresh** button in the side panel
   - The page structure will appear in the panel

3. **Auto-Refresh Mode:**
   - Check the **Auto** checkbox
   - The panel will automatically refresh when you navigate to new pages
   - Useful for quickly comparing structures across multiple pages

## What You'll See

The side panel displays the same output as the `page_structure` MCP tool:

```
=== PAGE ANALYSIS ===
Title: Example Product Page
URL: https://example.com/products
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

### Legend
- `🔵` Interactive element (button, link, input)
- `⭐` Landmark (header, nav, main, footer)
- `@root/...` Unique element ID for targeting
- `[GROUP: N items]` Repeated pattern detected

## Tips

- **Test your selectors:** The side panel shows CSS selectors for repeated groups. You can verify these in Chrome DevTools console: `document.querySelectorAll('.product-grid > .product-card')`
- **Compare pages:** Navigate between similar pages (e.g., different product listings) to see how the structure varies
- **Debug pagination:** The panel shows if next/previous pages are detected
- **Monitor performance:** Check the console for any errors or warnings from the page structure analysis

## Development Workflow

When developing page automation workflows:

1. **Run debug mode:** `npm run debug`
2. **Open side panel**
3. **Navigate to target page**
4. **Analyze structure** to understand the page
5. **Copy element IDs** from the tree for use in automation scripts
6. **Test with MCP:** Use the same `page_structure` tool via MCP server to verify

## Troubleshooting

**Side panel is blank or shows an error:**
- Make sure you're on a regular webpage (not `chrome://` or extension pages)
- Check the browser console for JavaScript errors
- Try clicking Refresh again

**Structure looks incomplete:**
- The tool has budget limits (`max_nodes: 400` by default)
- For very large pages, some content may be omitted
- You can adjust these limits in the `sidepanel.js` file

**Auto-refresh not working:**
- Make sure the checkbox is actually checked
- Some single-page apps may not trigger navigation events
- You can manually click Refresh
