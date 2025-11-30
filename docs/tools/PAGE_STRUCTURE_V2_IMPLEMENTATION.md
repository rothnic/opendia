# Page Structure V2: Hybrid TOON + Section Detection

## Implementation Plan

Based on:
- Original TOON format's readability
- `PAGE_STRUCTURE_ANALYSIS_2.md` hybrid strategy
- Real-world Amazon complexity

---

## Target Output Format

### Compact Mode (TOON-inspired with Sections)

```
=== AMAZON.COM ===
📍 6 major sections | 47 actionable elements

S1: "Top Cyber Monday categories" [card-grid, 4 items]
│ C1: div.gw-col [280x360]
│ │ IMG: .quad-image [240x180]
│ │ H2: "Up to 30% off tech"
│ │ CTA: a.see-more 🔵
│ C2: div.gw-col [280x360] ... (3 more)

S2: "Lightning deals" [carousel, 12 items]
│ C1: div.deal-card [220x320]
│ │ IMG: .deal-image [200x200]
│ │ BADGE: "30% off"
│ │ PRICE: "$49.99"
│ │ CTA: a.deal-link 🔵
│ (showing 1 of 12)

S3: "Search & Nav" [controls]
│ SEARCH: input#twotabsearchtextbox 🔵
│ NAV: nav#nav-main ⭐
│ │ LINK: "Best Sellers" 🔵
│ │ LINK: "Gift Cards" 🔵
│ │ ... (8 more)
```

### Detail View (On-Demand)

```
Agent: get_element("S1.C1")

Returns:
{
  "id": "S1.C1",
  "section": "S1",
  "html": "<div class=\"gw-col\">...</div>",
  "context": ["body#a-page", "div#pageContent", "div#main-content"],
  "dimensions": { "w": 280, "h": 360 },
  "schema": {
    "image": "img.quad-image",
    "heading": "h2.headline",
    "cta": "a.see-more"
  }
}
```

---

## Implementation Phases

### Phase 1: Node Scanner (1-2 hours)
**File**: `content.js` - Add new function `scanVisibleNodes()`

```javascript
function scanVisibleNodes() {
  const nodes = [];
  const allElements = document.querySelectorAll('*');
  
  for (const el of allElements) {
    // Skip invisible
    if (!isVisible(el)) continue;
    
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    
    nodes.push({
      element: el,
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList),
      id: el.id,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      area: rect.width * rect.height,
      interactive: isInteractive(el),
      heading: /^h[1-6]$/.test(el.tagName.toLowerCase()),
      landmark: isLandmark(el),
      text: getShortText(el, 30) // Direct children only
    });
  }
  
  return nodes;
}
```

### Phase 2: Card/Container Detection (2-3 hours)
**File**: `content.js` - Add `detectCardContainers(nodes)`

```javascript
function detectCardContainers(nodes) {
  // 1. Find all actionable + heading nodes
  const seeds = nodes.filter(n => n.interactive || n.heading);
  
  // 2. For each, find minimal container
  const containers = new Map(); // dimensionKey -> [nodes]
  
  for (const seed of seeds) {
    const container = findMinimalContainer(seed.element);
    if (!container) continue;
    
    const rect = container.getBoundingClientRect();
    
    // Skip too small
    if (rect.width < 100 || rect.height < 100) continue;
    
    // Create dimension key with tolerance
    const dimKey = `${Math.round(rect.width / 10) * 10}x${Math.round(rect.height / 10) * 10}`;
    
    if (!containers.has(dimKey)) {
      containers.set(dimKey, []);
    }
    
    containers.get(dimKey).push({
      element: container,
      rect,
      seed: seed.element,
      classes: Array.from(container.classList)
    });
  }
  
  // 3. Filter to groups with 3+ items
  const cardGroups = [];
  for (const [dimKey, items] of containers) {
    if (items.length >= 3) {
      cardGroups.push({
        signature: dimKey,
        count: items.length,
        items: items.slice(0, 3), // Keep first 3 as examples
        allItems: items
      });
    }
  }
  
  return cardGroups;
}

function findMinimalContainer(anchor) {
  let el = anchor.parentElement;
  while (el && el !== document.body) {
    const anchors = el.querySelectorAll('a[href], button, [role="button"]');
    if (anchors.length === 1) {
      return el;
    }
    el = el.parentElement;
  }
  return anchor.parentElement;
}
```

### Phase 3: Section Detection (2-3 hours)
**File**: `content.js` - Add `detectSections(cardGroups, nodes)`

```javascript
function detectSections(cardGroups, nodes) {
  const sections = [];
  let sectionId = 0;
  
  for (const group of cardGroups) {
    // Find common parent of all items in group
    const parent = findCommonParent(group.allItems.map(i => i.element));
    if (!parent) continue;
    
    // Look for heading near parent
    const heading = findNearbyHeading(parent);
    const label = heading ? heading.textContent.trim() : `Section ${++sectionId}`;
    
    // Detect type
    const type = detectSectionType(parent, group);
    
    // Build context path
    const contextPath = buildContextPath(parent);
    
    sections.push({
      id: `S${sectionId}`,
      label,
      type,
      contextPath,
      parent,
      cardGroup: group,
      heading
    });
  }
  
  // Also detect major non-repeated sections
  const landmarks = nodes.filter(n => n.landmark);
  for (const lm of landmarks) {
    sections.push({
      id: `S${++sectionId}`,
      label: lm.text || lm.element.getAttribute('aria-label') || 'Navigation',
      type: 'landmark',
      contextPath: buildContextPath(lm.element),
      parent: lm.element,
      cardGroup: null
    });
  }
  
  return sections;
}

function detectSectionType(parent, group) {
  const classes = Array.from(parent.classList).join(' ');
  
  if (/carousel|slider|swiper/.test(classes)) return 'carousel';
  if (/grid|masonry/.test(classes)) return 'card-grid';
  if (/hero|banner/.test(classes)) return 'hero';
  if (/nav|menu/.test(classes)) return 'nav';
  
  // Use dimensions
  if (group.count >= 6) return 'card-grid';
  if (group.count >= 3) return 'card-row';
  
  return 'section';
}
```

### Phase 4: TOON Formatter (1-2 hours)
**File**: `content.js` - Add `formatAsTOONv2(sections, options)`

```javascript
function formatAsTOONv2(sections, options) {
  const lines = [];
  
  // Header
  lines.push(`=== ${document.title.toUpperCase()} ===`);
  lines.push(`📍 ${sections.length} major sections | ${countActionable(sections)} actionable elements`);
  lines.push('');
  
  // For each section
  for (const section of sections) {
    const prefix = section.id;
    
    // Section header
    lines.push(`${prefix}: "${section.label}" [${section.type}${section.cardGroup ? `, ${section.cardGroup.count} items` : ''}]`);
    
    if (section.cardGroup) {
      // Show first example card in detail
      const firstCard = section.cardGroup.items[0];
      lines.push(...formatCard(firstCard, '│ ', section.id));
      
      // Note about others
      if (section.cardGroup.count > 1) {
        lines.push(`│ (showing 1 of ${section.cardGroup.count})`);
      }
    } else {
      // Non-card section - show key interactive elements
      const controls = findControls(section.parent);
      for (const ctrl of controls.slice(0, 5)) {
        lines.push(`│ ${ctrl.tag.toUpperCase()}: ${ctrl.label || ctrl.text} 🔵`);
      }
      if (controls.length > 5) {
        lines.push(`│ ... (${controls.length - 5} more)`);
      }
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
}

function formatCard(cardInfo, indent, sectionId) {
  const lines = [];
  const el = cardInfo.element;
  
  // Card container
  const cardSelector = el.tagName.toLowerCase() + 
    (el.className ? '.' + Array.from(el.classList).slice(0, 2).join('.') : '');
  const dims = `[${Math.round(cardInfo.rect.width)}x${Math.round(cardInfo.rect.height)}]`;
  lines.push(`${indent}C1: ${cardSelector} ${dims}`);
  
  // Key children
  const img = el.querySelector('img');
  if (img) {
    const imgRect = img.getBoundingClientRect();
    lines.push(`${indent}│ IMG: ${img.className ? '.' + img.classList[0] : 'img'} [${Math.round(imgRect.width)}x${Math.round(imgRect.height)}]`);
  }
  
  const heading = el.querySelector('h1, h2, h3, h4, .headline, [class*="title"]');
  if (heading) {
    lines.push(`${indent}│ H${heading.tagName[1] || '?'}: "${heading.textContent.trim().substring(0, 30)}"`);
  }
  
  const price = el.querySelector('.price, [class*="price"]');
  if (price) {
    lines.push(`${indent}│ PRICE: "${price.textContent.trim()}"`);
  }
  
  const cta = el.querySelector('a[href], button');
  if (cta) {
    lines.push(`${indent}│ CTA: ${cta.tagName.toLowerCase()}.${cta.classList[0] || 'link'} 🔵`);
  }
  
  return lines;
}
```

### Phase 5: Element Registry & Retrieval API (1 hour)
**File**: `content.js` - Enhance registry

```javascript
// Global registry
window.__opendiaElementRegistryV2 = {
  sections: new Map(), // S1 -> { element, label, type, ... }
  cards: new Map(),    // S1.C1 -> { element, schema, ... }
};

// Tool: get_element_html
async function getElementHTML(data) {
  const { element_ids, max_depth = 3 } = data;
  const results = {};
  
  for (const id of element_ids) {
    const el = window.__opendiaElementRegistryV2.cards.get(id) ||
               window.__opendiaElementRegistryV2.sections.get(id);
    
    if (!el) {
      results[id] = { error: 'Not found' };
      continue;
    }
    
    results[id] = {
      html: getHTMLWithDepth(el.element, max_depth),
      context: buildContextPath(el.element),
      dimensions: el.rect,
      schema: el.schema || {}
    };
  }
  
  return results;
}
```

---

## Testing Plan

### Test 1: Simple Page (example.com)
Expected:
```
=== EXAMPLE DOMAIN ===
📍 2 major sections | 2 actionable elements

S1: "Example Domain" [section]
│ H1: "Example Domain"
│ CTA: a.more-info 🔵

S2: "Learn more" [section]
│ LINK: "More information..." 🔵
```

### Test 2: Product Grid
Expected:
```
S1: "Product Catalog" [card-grid, 10 items]
│ C1: div.product-card [280x360]
│ │ IMG: .product-image [240x200]
│ │ H3: "Product 1"
│ │ PRICE: "$19.99"
│ │ CTA: button.add-to-cart 🔵
│ (showing 1 of 10)
```

### Test 3: Amazon.com
Expected:
- 8-12 sections detected
- Card grids properly grouped (not individual cards listed)
- Major nav/search identified
- Total output < 100 lines (vs current 1000s)

---

## Migration Path

1. **Keep existing code** - Don't remove current implementation
2. **Add mode flag**: `format: 'toon-v2'` alongside 'compact' and 'json'
3. **Gradual rollout**:
   - Week 1: Implement scanner + card detection
   - Week 2: Add section detection
   - Week 3: Implement TOON formatter
   - Week 4: Add retrieval API
   - Week 5: A/B test with agents

---

## Open Questions

1. **Dimension tolerance**: Start with ±10px rounding?
2. **Min section size**: Require 3+ cards or allow 2?
3. **Heading proximity**: How far to search for section labels?
4. **Performance budget**: Scan all elements or sample?
5. **ID stability**: Hash-based or sequential per session?

---

## Success Metrics

- **Output size**: < 150 lines for average e-commerce page
- **Grouping accuracy**: >90% of card grids detected
- **Agent usability**: Agents can find target elements in <2 queries
- **Performance**: Analysis completes in <500ms
