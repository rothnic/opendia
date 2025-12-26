# Page Structure Implementation

> Technical details for developers working on the page structure tool.

## Architecture Overview

The page structure tool uses a **hierarchical tree traversal** with **intelligent grouping**:

1. **Start at `document.body`** and recursively traverse visible children
2. **Group similar siblings** by structural signature
3. **Generate unique IDs** using path notation
4. **Mark special elements** (interactive, landmarks)
5. **Apply budget limits** (max depth, max nodes)

## Core Functions

### Content Script (`content.js`)

```javascript
// Main entry point
getPageStructure(options) → OutlineResult

// Recursive tree builder  
summarizeElement(el, depth, id, budget, options, viewportArea) → OutlineNode

// Grouping logic
summarizeChildren(parent, depth, parentId, budget, options, viewportArea) → OutlineNode[]

// CSS selector generator
generateSelector(el) → string

// Output formatter
formatAsComprehensiveText(result, options) → string
```

### Key Algorithms

#### Element Visibility
```javascript
function isElementVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight * 3) return false;
  return true;
}
```

#### Structural Signature
Groups siblings by combining:
- Tag name
- Key classes (first 3)
- Area bucket (XL/L/M/S/XS)
- Presence of: images, links, inputs

```javascript
function getSignature(el, areaBucket) {
  return [
    el.tagName.toLowerCase(),
    getRole(el) || '',
    classes.slice(0, 3).sort().join('.'),
    areaBucket,
    hasImg ? 'img' : '',
    hasLink ? 'link' : '',
    hasInput ? 'input' : ''
  ].join('|');
}
```

#### Importance Scoring
Prioritizes elements for inclusion:
```javascript
function getImportanceScore(bbox, interactive, landmark, textLen) {
  const areaScore = Math.log(1 + bbox.viewportAreaRatio * 1000);
  const interScore = interactive ? 4 : 0;
  const landScore = landmark ? 3 : 0;
  const textScore = Math.log(1 + textLen);
  return 3 * areaScore + interScore + landScore + textScore;
}
```

## Type Definitions

```typescript
interface OutlineNode {
  kind: 'node';
  id: string;                    // @root/main[1]/div[2]
  tag: string;
  role?: string;
  interactive: boolean;
  landmark: boolean;
  bbox: BBox;
  label?: string;
  textPreview?: string;
  attributes?: NodeAttributes;
  children?: OutlineNode[];
  truncated?: boolean;
}

interface RepeatedGroupNode {
  kind: 'repeated_group';
  id: string;
  signature: string;
  total: number;
  shown: number;
  omitted: number;
  examples: OutlineNode[];
}

interface OutlineOptions {
  maxDepth: number;        // Default: 8
  maxNodes: number;        // Default: 400
  maxChildrenPerGroup: number;  // Default: 6
  examplesPerGroup: number;     // Default: 3
}
```

## Element Registry

Elements are stored in a global registry for subsequent retrieval:

```javascript
window.__opendiaElementRegistry = new Map();
// Maps: id string → DOM element reference
```

This allows other tools to reference elements by ID:
```javascript
const element = window.__opendiaElementRegistry.get('@root/main[1]/div[2]');
```

## Performance Considerations

- **Budget system** prevents runaway traversal
- **Early termination** when budget exhausted
- **Signature caching** reduces redundant computation
- **Lazy text extraction** only when needed

## Known Limitations

1. **Long path IDs** - Can be unwieldy (future: logical IDs)
2. **Dimension-based grouping** - Not yet implemented
3. **Dynamic content** - Snapshot at call time only
4. **CSP restrictions** - Some pages may block execution
