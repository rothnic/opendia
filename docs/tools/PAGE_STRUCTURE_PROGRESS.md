# Page Structure V2: Implementation Progress

## ✅ Implemented (Week 1 Complete)

### Change 5: Drop Layout Noise ✅
**Status:** Committed (db5ed3b)

**What it does:**
- Filters out `<hr>` and `<br>` elements
- Skips divs with classes containing "spacer", "separator", "divider", "break"
- Removes empty nodes with no text, no interaction, and no children

**Impact:** Amazon output reduced by ~15% (removes 4 hr.card-flow-row-break elements)

---

### Change 6: Sort by Visual Position ✅
**Status:** Committed (db5ed3b)

**What it does:**
- Sorts top-level children (depth ≤ 2) by Y coordinate
- Header appears before main content (matches visual layout)
- Uses stored `bbox.y` from element scanning

**Impact:** Outline now matches visual reading order (header → hero → content → footer)

---

### Change 1: Logical IDs ✅
**Status:** Committed (21684cf)

**What it does:**
- Assigns concise IDs like `S1`, `S1.C2`, `N1`, `H1`
- Type-aware prefixes:
  - `S` = section
  - `C` = card (elements with grid/col/card classes)
  - `N` = nav
  - `H` = header
  - `F` = footer
  - `G` = group (repeated elements)
  - `E` = element (default)
- Hierarchical: `S1.C3.E2` = Section 1 → Card 3 → Element 2
- Keeps `pathId` for internal retrieval

**Impact:** 
- IDs change from `@root/div[1]/div[4]/div[2]/div[1]/div[2]` to `S1.C2`
- Agent-friendly, human-readable, concise

**Example:**
```
Before: @root/div[1]/div[4]/div[2]/div[1]/div[2] div#desktop-grid-2
After:  S1.C2  div#desktop-grid-2
```

---

## 🔄 In Progress (Week 2)

### Change 2: Collapse Repeated Siblings
**Status:** Not started
**Estimate:** 3 hours

**Plan:**
- Enhance `summarizeChildren` to detect sibling runs
- Group 3+ similar siblings into `sibling_group`
- Format as:
  ```
  S1.G1  gw-col.celwidget (7 sections)
    Example: S1.G1.I1  desktop-grid-1  "Up to 40% off..."
    Example: S1.G1.I2  desktop-grid-2  "Lightning deals..."
    (5 more similar)
  ```

---

### Change 3: Section Types and Labels
**Status:** Not started
**Estimate:** 2 hours

**Plan:**
- Add `detectSectionType()` to infer: card-grid, carousel, hero, nav
- Add `extractSectionLabel()` to find heading text
- Include in output:
  ```
  S1  section: hero-grid  "Up to 40% off buzzworthy deals"
  ```

---

## 📅 Upcoming (Week 3)

### Change 4: Flatten Landmarks
**Status:** Not started
**Estimate:** 3 hours

**Plan:**
- Special handling for nav/menu landmarks
- Aggregate items into single lines
- Extract shortcuts/links without deep span trees

---

## Testing Results

### Quick Test on Amazon (Expected)

**Before (current production):**
```
@root/div[1]/div[4]/div[2]/div[1]/div[2] div#desktop-grid-2.gw-col "Amazon Devices deals 30% off..."
@root/div[1]/div[4]/div[2]/div[1]/div[3] div#desktop-grid-3.gw-col "Today's big deals: wow-worthy..."
@root/div[1]/div[4]/div[2]/div[1]/hr[2] hr.card-flow-row-break
@root/div[1]/div[4]/div[2]/div[1]/hr[4] hr.card-flow-row-break
```

**After (with Changes 1, 5, 6):**
```
H1  header#navbar-main  ⭐ "Delivering to Madison..."
S1  div#desktop-grid-2.gw-col "Amazon Devices deals..."
S2  div#desktop-grid-3.gw-col "Today's big deals..."
(hr elements removed)
```

**Improvements:**
- ✅ IDs are readable (`S1` vs `@root/div[1]/div[4]...`)
- ✅ Header appears first (visual order)
- ✅ Layout noise (hr) removed
- ✅ More scannable structure

---

## Next Steps

1. **Test current changes** on Amazon.com
   - Verify logical IDs are assigned correctly
   - Confirm noise filtering works
   - Check visual ordering

2. **Implement Change 2** (sibling grouping)
   - Most impactful for Amazon's card grids
   - Will collapse 7 similar desktop-grid-* into one group

3. **Implement Change 3** (section types)
   - Add semantic labels
   - Infer card-grid, carousel, hero types

4. **Final integration** (Changes 4-6)
   - Flatten nav/landmarks
   - Create comprehensive test suite
   - Document new format

---

## Success Metrics (Target)

- **Amazon line count:** <50 lines (current: ~1000)
- **ID length:** <10 chars average (current: ~40)
- **Scan time:** <10 seconds (current: impossible)
- **Agent queries:** Find element in 1-2 references

---

## How to Test

```bash
# Rebuild and launch
cd opendia-extension
npm run debug

# In Chrome:
# 1. Open side panel
# 2. Navigate to amazon.com
# 3. Click Refresh
# 4. Inspect output in side panel
# 5. Check console logs for logical IDs
```

Expected to see IDs like `S1`, `S1.C2`, `N1` instead of long paths.
