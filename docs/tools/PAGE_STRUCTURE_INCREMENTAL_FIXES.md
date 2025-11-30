# Page Structure V2: Incremental Improvements

## Based on Feedback: "Your output is already close, just needs 6 specific fixes"

---

## Current State (What's Already Good)

✅ Major containers surfaced (`div#pageContent`, `div#gw-layout`)  
✅ Text preview is short (30 chars)  
✅ Landmarks marked (⭐), interactive marked (🔵)  
✅ Not exploding every descendant  

---

## 6 Specific Changes to Implement

### Change 1: Logical IDs Instead of Path IDs
**Problem:** `@root/div[1]/div[4]/div[2]/div[2]/div[1]/div[3]` is unusable

**Solution:** Assign short IDs during traversal, hide path IDs

**Before:**
```
@root/div[1]/div[4]/div[2]/div[1]/div[2] div#desktop-grid-2 "Amazon Devices deals..."
```

**After:**
```
S1.C2  desktop-grid-2  "Amazon Devices deals..."
```

**Implementation:**
```javascript
// In getPageStructure, add ID assignment phase
const logicalIds = assignLogicalIds(outline);

function assignLogicalIds(node, prefix = '', counters = {}) {
  if (!prefix) {
    // Root
    node.logicalId = 'root';
    prefix = '';
  } else {
    // Assign based on type
    const type = detectNodeType(node);
    if (!counters[type]) counters[type] = 0;
    counters[type]++;
    
    node.logicalId = prefix ? `${prefix}.${type[0].toUpperCase()}${counters[type]}` : `${type[0].toUpperCase()}${counters[type]}`;
  }
  
  if (node.children) {
    const childCounters = {};
    node.children.forEach(child => {
      assignLogicalIds(child, node.logicalId, childCounters);
    });
  }
  
  return node;
}

function detectNodeType(node) {
  if (node.kind === 'repeated_group') return 'group';
  if (node.landmark) return 'section';
  if (node.tag === 'nav') return 'nav';
  if (/grid|col/.test(node.attributes?.classes?.join(''))) return 'card';
  return 'element';
}
```

---

### Change 2: Collapse Repeated Siblings
**Problem:** 7 similar `desktop-grid-*` blocks listed separately

**Solution:** Group them into `G1 (7 sections)` with examples

**Before:**
```
@root/.../div[1] div#desktop-grid-1 "Up to 40% off..."
@root/.../div[2] div#desktop-grid-2 "Lightning deals..."
@root/.../div[3] div#desktop-grid-3 "Amazon Devices..."
... (4 more)
```

**After:**
```
S1.G1  gw-col.celwidget (7 sections)
  Example: S1.G1.I1  desktop-grid-1  "Up to 40% off..."
  Example: S1.G1.I2  desktop-grid-2  "Lightning deals..."
  (5 more similar)
```

**Implementation:**
```javascript
// Already partially done in summarizeChildren - enhance it

function enhanceGrouping(children) {
  // Existing grouping logic groups by structural signature
  // Add: also group siblings with similar classes/roles
  
  const grouped = [];
  const sameTypeRuns = [];
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const prevChild = i > 0 ? children[i-1] : null;
    
    // Check if this is a continuation of previous type
    const sameAsPreve = prevChild && 
      isSimilarNode(child, prevChild);
    
    if (sameAsPrev) {
      sameTypeRuns[sameTypeRuns.length - 1].push(child);
    } else {
      sameTypeRuns.push([child]);
    }
  }
  
  // Convert runs of 3+ into groups
  for (const run of sameTypeRuns) {
    if (run.length >= 3) {
      grouped.push({
        kind: 'sibling_group',
        count: run.length,
        examples: run.slice(0, 2),
        signature: getNodeSignature(run[0])
      });
    } else {
      grouped.push(...run);
    }
  }
  
  return grouped;
}

function isSimilarNode(a, b) {
  // Similar if same tag and overlapping classes
  if (a.tag !== b.tag) return false;
  
  const aClasses = new Set(a.attributes?.classes || []);
  const bClasses = new Set(b.attributes?.classes || []);
  const overlap = [...aClasses].filter(c => bClasses.has(c));
  
  return overlap.length >= 2; // At least 2 shared classes
}
```

---

### Change 3: Add Section Type and Label
**Problem:** No synthetic names like "card-grid" or "carousel"

**Solution:** Infer type from structure, extract label from heading

**After:**
```
S1  section: hero-grid  "Up to 40% off buzzworthy deals"
  S1.G1  type: card-grid  count: 4  label: "Up to 40% off..."
```

**Implementation:**
```javascript
function detectSectionType(node) {
  const classes = (node.attributes?.classes || []).join(' ');
  
  // Check class hints
  if (/carousel|slider|swiper/.test(classes)) return 'carousel';
  if (/grid|masonry/.test(classes)) return 'card-grid';
  if (/hero|banner/.test(classes)) return 'hero';
  if (/nav|menu/.test(classes)) return 'nav';
  
  // Check structure
  const childTags = (node.children || []).map(c => c.tag);
  if (childTags.filter(t => t === 'a').length >= 5) return 'nav';
  
  // Check for repeated cards
  const groups = node.children?.filter(c => c.kind === 'repeated_group');
  if (groups?.length > 0 && groups[0].total >= 4) return 'card-grid';
  
  return 'section';
}

function extractSectionLabel(node) {
  // Look for heading in first few children
  for (const child of (node.children || []).slice(0, 3)) {
    if (/^h[1-3]$/.test(child.tag)) {
      return child.textPreview || child.label;
    }
    if (child.attributes?.classes?.includes('headline')) {
      return child.textPreview;
    }
  }
  
  // Fallback to node's own text
  return node.textPreview || node.label || 'Unnamed Section';
}
```

---

### Change 4: Flatten Uninteresting Internals
**Problem:** Nav shortcuts expand to deep span trees

**Solution:** Aggregate items at landmark level, stop recursing

**Before:**
```
@root/div[1]/nav[1]/ul[5]/li[1] "Search opt + /"
  @root/div[1]/nav[1]/ul[5]/li[1]/a[1] a#nav-assist-search...
    @root/div[1]/nav[1]/ul[5]/li[1]/a[1]/div[1] div.keyboard-shortcut...
      @root/div[1]/nav[1]/ul[5]/li[1]/a[1]/div[1]/span[1] span.shortcut-name...
      @root/div[1]/nav[1]/ul[5]/li[1]/a[1]/div[1]/div[2] div.shortcut-keys...
        ... (5 more spans)
```

**After:**
```
N1  nav#shortcut-menu  "Keyboard shortcuts"
  - Search (opt + /)
  - Cart (shift + opt + C)
  - Home (shift + opt + H)
  - Orders (shift + opt + O)
  - Show/Hide shortcuts (shift + opt + Z)
```

**Implementation:**
```javascript
function formatLandmark(node, depth) {
  const indent = '  '.repeat(depth);
  const lines = [];
  
  lines.push(`${indent}${node.logicalId}  ${formatNodeSelector(node)}  "${node.textPreview}"`);
  
  // For landmarks, aggregate key children only
  const items = extractLandmarkItems(node);
  for (const item of items) {
    lines.push(`${indent}  - ${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`);
  }
  
  return lines.join('\n');
}

function extractLandmarkItems(node) {
  // For nav/menu, extract links/items
  if (node.tag === 'nav' || node.attributes?.classes?.includes('menu')) {
    return extractNavItems(node);
  }
  
  // For shortcuts, extract shortcut info
  if (node.attributes?.id?.includes('shortcut')) {
    return extractShortcutItems(node);
  }
  
  return [];
}

function extractShortcutItems(node) {
  const items = [];
  
  // Find all list items
  const findItems = (n) => {
    if (n.tag === 'li') {
      items.push({
        label: extractShortcutLabel(n),
        shortcut: extractShortcutKeys(n)
      });
    }
    (n.children || []).forEach(findItems);
  };
  
  findItems(node);
  return items;
}

function extractShortcutLabel(liNode) {
  // Find .shortcut-name or first text
  const find = (n) => {
    if (n.attributes?.classes?.includes('shortcut-name')) {
      return n.textPreview;
    }
    for (const child of (n.children || [])) {
      const result = find(child);
      if (result) return result;
    }
  };
  return find(liNode) || liNode.textPreview;
}

function extractShortcutKeys(liNode) {
  // Find all .shortcut-key spans and join
  const keys = [];
  const find = (n) => {
    if (n.attributes?.classes?.includes('shortcut-key')) {
      keys.push(n.textPreview);
    }
    (n.children || []).forEach(find);
  };
  find(liNode);
  return keys.join(' + ');
}
```

---

### Change 5: Drop Pure Layout Noise
**Problem:** `hr.card-flow-row-break` repeated 4 times adds no value

**Solution:** Filter out by tag/class during formatting

**Implementation:**
```javascript
function shouldSkipInOutline(node) {
  // Skip layout-only elements
  if (node.tag === 'hr') return true;
  if (node.tag === 'br') return true;
  
  // Skip pure spacing divs
  const classes = (node.attributes?.classes || []).join(' ');
  if (/spacer|separator|divider/.test(classes) && !node.interactive) return true;
  
  // Skip if no text, no interaction, no children
  if (!node.textPreview && !node.interactive && (!node.children || node.children.length === 0)) {
    return true;
  }
  
  return false;
}

// Use in formatting
function formatNode(node, depth) {
  if (shouldSkipInOutline(node)) return '';
  
  // ... rest of formatting
}
```

---

### Change 6: Reorder by Visual Position
**Problem:** Header appears after main content in DOM order

**Solution:** Sort top-level sections by Y coordinate

**Implementation:**
```javascript
function sortByVisualPosition(nodes) {
  return nodes.slice().sort((a, b) => {
    // Get Y position from stored bbox or infer from element
    const aY = a.bbox?.y || 0;
    const bY = b.bbox?.y || 0;
    return aY - bY;
  });
}

// In formatAsComprehensiveText
function formatAsComprehensiveText(result, options) {
  const { metadata, groups, outline } = result;
  
  // Sort top-level children by position
  if (outline.children) {
    outline.children = sortByVisualPosition(outline.children);
  }
  
  // ... rest of formatting
}
```

---

## Implementation Order

**Week 1: Low-hanging fruit**
1. ✅ Change 5 (drop hr/layout noise) - 30 min
2. ✅ Change 6 (sort by Y) - 30 min
3. ✅ Change 1 (logical IDs) - 2 hours

**Week 2: Grouping**
4. ✅ Change 2 (collapse siblings) - 3 hours
5. ✅ Change 3 (section types) - 2 hours

**Week 3: Polish**
6. ✅ Change 4 (flatten landmarks) - 3 hours
7. Test on Amazon, GitHub, product pages

---

## Expected Amazon Output After Changes

```
=== AMAZON.COM ===

H1  header#navbar-main  ⭐
  - Search bar
  - Primary nav: Cyber Monday, Amazon Haul, Best Sellers...
  - Account & Cart

S1  hero-carousel  "Featured content"
  - Previous/Next controls
  - (carousel items not expanded)

S2  deals-grid  "Main deals section"
  S2.G1  card-grid (7 sections)
    Example: S2.G1.I1  type: card  "Up to 40% off buzzworthy deals"
    Example: S2.G1.I2  type: card  "Lightning deals"
    (5 more similar)

S3  deals-grid  "Top Cyber Monday categories"
  S3.C1  carousel  "Top Cyber Monday categories"
  S3.G1  card-grid (2 sections)
    Example: S3.G1.I1  "Up to 30% off tech & gaming"
    Example: S3.G1.I2  "Up to 40% off kitchen"

N1  keyboard-shortcuts  (5 items)
  - Search (opt + /)
  - Cart (shift + opt + C)
  - Home (shift + opt + H)
  - Orders (shift + opt + O)
  - Show/Hide shortcuts (shift + opt + Z)
```

**Line count:** ~25 lines vs current 1000+  
**Scan time:** <10 seconds vs impossible  
**Agent usability:** Can reference `S2.G1.I1` vs `@root/div[1]/div[4]/div[2]/div[1]/div[2]`

---

## Testing Checklist

- [ ] Amazon.com: Detects 6-8 sections, <50 lines total
- [ ] GitHub.com: Detects repo structure, nav, readme
- [ ] Simple page (example.com): 2-3 sections, <10 lines
- [ ] Product grid test page: Single card-grid with examples
- [ ] Logical IDs are stable across refreshes
- [ ] Retrieval API maps logical IDs back to DOM correctly
