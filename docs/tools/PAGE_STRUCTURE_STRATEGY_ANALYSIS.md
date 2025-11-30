# Page Structure Analysis: Current vs Proposed Approach

## Current Approach Summary

### Strategy
The current implementation uses a **hierarchical tree traversal** approach:

1. **Start at document.body** and recursively traverse all visible children
2. **Group similar siblings** by structural signature:
   - Tag name + classes + area bucket + child element types
   - When >6 similar siblings found, create a "repeated_group"
3. **Generate unique IDs** using path notation: `@root/main[1]/div[2]`
4. **Include text content** from all descendants (truncated to 30 chars)
5. **Mark special elements**:
   - Interactive: 🔵 (links, buttons, inputs)
   - Landmarks: ⭐ (header, nav, main, footer)

### Element Selection Criteria
- **Visibility**: Elements with display:none or visibility:hidden excluded
- **Bounding box**: Must have width/height > 0
- **Importance scoring**: Based on area, interactivity, landmark status, text length
- **Budget limits**: Max depth (default 6), max nodes (default 200)

### Output Format
```
@root/main[1]/div[2] div.product-grid "Lightning deals Shop the..."
  @root/main[1]/div[2]/group[1] [GROUP: 24 items]
    Example 1:
      @root/main[1]/div[2]/div[1] div.product-card "Product 1 $19.99..."
```

### Current Issues
1. **Too verbose**: Full descendant text makes lines unreadable on complex pages
2. **Deep nesting**: Many levels of divs that don't represent semantic structure
3. **Weak grouping**: Misses visually repeated patterns that don't share exact classes
4. **No dimension awareness**: Doesn't use size/layout as grouping signal
5. **Context buried**: Hard to see "where in the page" an element is
6. **ID complexity**: Long IDs like `@root/main[1]/div[4]/div[2]/div[2]/div[1]`

### What's Included
- ✅ Interactive elements (links, buttons, inputs)
- ✅ Landmarks (header, nav, main, footer)
- ✅ Element attributes (id, classes, href, type, name)
- ⚠️ Text content (but from all descendants, making it noisy)
- ❌ Headings (h1-h6) not specifically prioritized
- ❌ Dimension/layout information
- ❌ Visual similarity detection

---

## Proposed Approach: Anchor-Up + Dimension Matching

### Strategy
A **bottom-up, dimension-aware** approach:

1. **Find all actionable elements** (anchors, buttons, inputs, etc.)
2. **Walk up the DOM tree** from each actionable element:
   - Stop when reaching a container that doesn't contain another unique anchor
   - Record this container's dimensions
3. **Find similar containers** by dimension matching:
   - Same width/height (within configurable margin, e.g., ±5px)
   - Minimum size threshold (e.g., 100x100)
   - Bonus points for same-sized images
4. **Recursively group containers**:
   - Walk up to find parent containing multiple matched containers
   - Repeat at parent level to find repeated sections
5. **Generate concise IDs**: Short, stable identifiers (e.g., `C1`, `C2.I3`)
6. **Provide skeletal context**: Separate structure with only tag+class+id ancestry

### Implementation Steps

```javascript
// 1. Find all actionable elements
const actionable = document.querySelectorAll('a[href], button, input, [role="button"]');

// 2. For each, find minimal container
function findMinimalContainer(anchor) {
  let el = anchor.parentElement;
  while (el) {
    const otherAnchors = el.querySelectorAll('a[href]');
    if (otherAnchors.length === 1) return el;
    el = el.parentElement;
  }
  return anchor.parentElement;
}

// 3. Measure and group by dimensions
const containers = actionable.map(findMinimalContainer);
const groups = groupByDimensions(containers, { margin: 5, minSize: 100 });

// 4. Find parent groups
const sections = findParentsContainingMultiple(groups);

// 5. Assign concise IDs
const registry = new Map(); // conciseId -> element
sections.forEach((section, i) => {
  registry.set(`S${i+1}`, section);
  section.items.forEach((item, j) => {
    registry.set(`S${i+1}.I${j+1}`, item);
  });
});

// 6. Generate skeletal ancestry
function getAncestry(el) {
  const path = [];
  let current = el;
  while (current && current !== document.body) {
    path.unshift({
      tag: current.tagName.toLowerCase(),
      class: current.className,
      id: current.id
    });
    current = current.parentElement;
  }
  return path;
}
```

### Output Format

```json
{
  "elements": {
    "S1": {
      "selector": ".product-grid",
      "count": 24,
      "items": ["S1.I1", "S1.I2", "S1.I3", "..."],
      "schema": {
        "image": "img._product-image",
        "title": "h3.product-title",
        "price": ".price",
        "cta": "button.add-to-cart"
      }
    },
    "S1.I1": {
      "selector": ".product-card",
      "dimensions": { "w": 280, "h": 360 },
      "context": ["body", "div#page", "main", "div.grid", "div.product-card"]
    }
  },
  "metadata": {
    "totalSections": 12,
    "totalItems": 156
  }
}
```

### Retrieval API
```javascript
// Get full HTML for specific elements
chrome.tabs.sendMessage(tabId, {
  action: 'get_elements_html',
  element_ids: ['S1.I1', 'S1.I2', 'S2.I5'],
  max_depth: 3  // Limit descendant nesting
});
```

---

## Comparison Matrix

| Aspect | Current (Tree Traversal) | Proposed (Anchor-Up + Dimensions) |
|--------|-------------------------|-----------------------------------|
| **Starting Point** | document.body (top-down) | Actionable elements (bottom-up) |
| **Grouping Signal** | Structural signature (tag+classes) | Dimensions + visual layout |
| **Element IDs** | Path-based: `@root/main[1]/div[4]` | Concise: `S1.I5` |
| **Context Representation** | Full tree with text | Skeletal ancestry (tag+class only) |
| **Semantic Focus** | All visible elements | Actionable/important elements |
| **Size Awareness** | No | Yes (core to grouping) |
| **Output Size** | Large (full tree) | Compact (sections + items) |
| **Agent Usability** | Verbose, hard to parse | Clean, targeted |

---

## Pros & Cons

### Current Approach

**Pros:**
- ✅ Comprehensive: Captures entire visible DOM
- ✅ Stable IDs: Path-based IDs are deterministic
- ✅ Works for any page structure
- ✅ Already implemented and tested

**Cons:**
- ❌ Too verbose for complex pages
- ❌ Buries important elements in noise
- ❌ Misses visually obvious patterns
- ❌ Long, unwieldy IDs
- ❌ Text from descendants creates line clutter
- ❌ Doesn't prioritize actionable content

### Proposed Approach

**Pros:**
- ✅ Focuses on actionable elements (what agents need)
- ✅ Uses visual layout (how humans see the page)
- ✅ Concise IDs and output
- ✅ Skeletal context separates structure from content
- ✅ Better at finding Amazon-style card grids
- ✅ Bonus signal: image dimensions
- ✅ Configurable thresholds (min size, margin)

**Cons:**
- ❌ Misses non-actionable content (static text, headings without links)
- ❌ Dimension matching fragile across responsive breakpoints
- ❌ Requires layout measurement (performance cost)
- ❌ May miss nested patterns (cards within sections)
- ❌ Harder to implement and test
- ❌ Needs careful tuning of thresholds

---

## Open Issues & Questions

### Current Approach
1. **Heading prioritization**: Should h1-h6 be marked like landmarks?
2. **Text truncation**: Should we exclude descendant text entirely?
3. **Grouping threshold**: Is 6 children the right cutoff?
4. **ID shortening**: Could we use hash-based short IDs?
5. **Noise reduction**: How to filter irrelevant wrapper divs?

### Proposed Approach
1. **Dimension tolerance**: What's the right margin (5px? 10px? percentage-based)?
2. **Minimum size**: 100x100 too aggressive? Too lenient?
3. **Nested patterns**: How to handle cards within carousels?
4. **Missing content**: What about important text without links (prices, descriptions)?
5. **Class-based hints**: Should we combine dimensions with class hints (`.card`, `.item`)?
6. **Performance**: Measuring every element's dimensions expensive?
7. **Dynamic pages**: How to handle elements added after initial load?
8. **Context depth**: How many ancestor levels to include in skeletal path?

---

## Hybrid Approach (Recommendation)

Combine the best of both:

### Phase 1: Identify Key Sections (Anchor-Up)
- Find actionable containers using dimension matching
- Assign concise section IDs (`S1`, `S2`, etc.)

### Phase 2: Enrich with Context (Selective Tree)
- For each section, provide:
  - Skeletal ancestry (tag+class only, no text)
  - First 3 item examples with full structure
  - Schema detection (image, title, price, cta)

### Phase 3: On-Demand Retrieval
- Agent requests specific items: `get_elements(['S1.I5', 'S2.I3'])`
- Return full HTML up to max_depth=3

### Benefits
- ✅ Compact initial output (sections only)
- ✅ Detailed data available on demand
- ✅ Visual grouping + semantic structure
- ✅ Prioritizes actionable elements
- ✅ Preserves context without verbosity

---

## Recommendations for Implementation

1. **Start with dimension-based grouping** as experimental mode
2. **Add heading prioritization** to current approach (quick win)
3. **Implement concise ID system** (hash-based or sequential)
4. **Separate context from content** (skeletal ancestry)
5. **Add retrieval API** for on-demand HTML
6. **A/B test** both approaches on real pages
7. **Measure performance** (analysis time, output size, agent success rate)

---

## Example: Amazon Card Detection

### Current Output (Verbose)
```
@root/div[1]/div[4]/div[2]/div[1]/div[2] div#desktop-grid-2 "Amazon Devices deals 30% off..."
  @root/div[1]/div[4]/div[2]/div[1]/div[2]/div[1] div#CardInstance... "Amazon Devices deals..."
```

### Proposed Output (Concise)
```json
{
  "S1": {
    "type": "card-grid",
    "selector": ".gw-col",
    "count": 4,
    "context": ["body", "div#page", "div#gw-layout", "div#main-content"],
    "items": {
      "I1": { "dim": [280, 360], "cta": "a.product-link" },
      "I2": { "dim": [280, 360], "cta": "a.product-link" },
      "I3": { "dim": [280, 360], "cta": "a.product-link" },
      "I4": { "dim": [280, 360], "cta": "a.product-link" }
    }
  }
}
```

Agent request: `get_elements(['S1.I1'])` → Full HTML for first card
