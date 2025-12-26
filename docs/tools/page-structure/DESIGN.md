# Page Structure Design & Future Work

> Design decisions, lessons learned, and planned improvements.

## Design Philosophy

### Current Approach: Top-Down Tree Traversal

**How it works:**
1. Start at `document.body`, traverse all visible children
2. Group similar siblings by structural signature
3. Generate path-based IDs (`@root/main[1]/div[2]`)
4. Include truncated text from descendants
5. Apply budget limits (max depth, max nodes)

**Strengths:**
- Comprehensive - captures entire visible DOM
- Deterministic IDs
- Works for any page structure

**Weaknesses:**
- Verbose for complex pages (1000+ lines on Amazon)
- Path-based IDs are unwieldy
- Misses visually obvious patterns that don't share classes
- Text from descendants creates clutter

### Future Direction: Hybrid Strategy

Combine bottom-up card detection with top-down context:

**Phase 1: Anchor-Up Card Detection**
- Start from actionable elements (links, buttons, inputs)
- Walk up to find minimal container
- Group by dimensions (width/height within ±10px)

**Phase 2: Section Detection**  
- From repeated containers, find parent sections
- Associate nearby headings as section labels

**Phase 3: Clean Output**
- Logical IDs: `S1`, `S1.C2`, `S1.C2.I3`
- Skeletal ancestry (tag+class only, no full text)
- On-demand HTML retrieval

**Expected Improvements:**
- Amazon: <50 lines (vs 1000+)
- IDs: <10 chars (vs ~40)
- Agent references: 1-2 queries instead of full scan

## Planned Improvements

### Short-term (v1.x)

- [ ] **Logical IDs** - Short IDs like `S1.C2` instead of paths
- [ ] **Sibling Grouping** - Collapse repeated sections
- [ ] **Section Types** - Detect `card-grid`, `carousel`, `nav`
- [ ] **Layout Noise Filtering** - Remove `<hr>`, `<br>`, spacers
- [ ] **Visual Ordering** - Sort by Y coordinate

### Medium-term (v2.0)

- [ ] **Dimension-based Grouping** - Group by rendered size
- [ ] **Heading Association** - Find section labels
- [ ] **Schema Detection** - Infer image/title/price/CTA
- [ ] **Retrieval API** - Get HTML by logical ID

### Long-term

- [ ] **Dynamic Content** - Handle infinite scroll, SPA navigation
- [ ] **ML-based Naming** - Semantic section labels
- [ ] **Cross-page Stability** - Consistent IDs across sessions

## Research References

### AgentOccam & Observation Alignment
- Focus on compact, semantically aligned representations
- Merge static text with interactive elements
- Use markdown-like output for agent consumption

### DOM Pruning Approaches
- Filter by visibility and interactivity
- Collapse irrelevant containers
- Leverage accessibility tree (ARIA roles)

### Key Takeaways
1. Start from semantic/interactive nodes, not raw layout
2. Aggressively prune layout noise
3. Model repeated patterns explicitly, not just as trees

## Configuration Tuning

| Parameter | Current | Consideration |
|-----------|---------|---------------|
| Dimension tolerance | N/A | ±5px or ±10px? |
| Min card size | N/A | 100x100 too strict? |
| Group threshold | 6 siblings | 3 might capture more patterns |
| Max depth | 8 | Sufficient for most pages |
| Max nodes | 400 | May need increase for e-commerce |

## Performance Notes

- Bounding box measurement is expensive at scale
- Need to balance completeness vs. speed
- Target: <500ms analysis time
- Consider sampling for very large DOMs
