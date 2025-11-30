# Page Structure Analysis – Current vs Proposed

## 1. Purpose and Constraints

**Goal:** Give an LLM a bird's-eye view of a page that:

* Highlights high-value, actionable regions (cards, grids, carousels, nav, filters, CTAs)
* Compresses repeated patterns into a small number of examples plus counts
* Uses concise, stable IDs that are easy for an agent to reference
* Keeps enough structural context to understand "where" something is on the page
* Avoids noisy details (full descendant text, long path IDs, layout-only wrappers)

The Amazon example shows the failure modes of the current design: lots of deep div chains, repeated boilerplate, hard-to-skim IDs, and no obvious sense of the major sections or card grids.

---

## 2. Current Tree-Traversal Strategy – Critical Assessment

### 2.1 What It Does Well

* Walks the **visible DOM**, skipping invisible elements by CSS and zero-area bounding boxes.
* Groups siblings using a structural signature (tag + classes + area bucket + content hints) and creates **repeated_group** nodes when there are many similar children.
* Attaches **path-based IDs** that are deterministic and can be used to locate nodes later.
* Marks **interactive** elements and **landmarks** so they are identifiable.
* Enforces a **budget** (max depth, max nodes) to avoid infinite-size outputs.

### 2.2 Where It Breaks Down (Seen in the Amazon Output)

1. **Top-down from `<body>` guarantees noise first.** You traverse a massive hierarchy of layout divs before reaching the semantically meaningful stuff. Wrapper divs dominate the tree.

2. **Deep, unreadable IDs.** Paths like `@root/div[1]/div[4]/div[2]/div[1]/div[9]/div[1]/div[2]/div[1]/div[1]/a[1]/div[2]` are:

   * Visually overwhelming for humans
   * Hard for an LLM to remember/use in natural language
   * Still fragile if the page layout changes even slightly

3. **Descendant text is overwhelming.** Each line includes truncated innerText from all descendants:

   * The same phrases repeat many times ("Up to 40% off", "Cyber Monday Deal")
   * It blurs the distinction between section/heading text and leaf-node text
   * It makes the tree effectively unreadable at page scale

4. **Grouping is too shallow and too brittle.**

   * Structural signatures based primarily on tag/classes miss visually similar cards that differ in class noise.
   * Groups are created only at the immediate-child layer; deeper repeated structures inside wrappers are not surfaced as first-class groups.

5. **No clear notion of "sections".**

   * The Amazon output is a long, flat sequence of nested divs with no obvious label like:

     * "S1: Top Cyber Monday categories – card carousel"
     * "S2: Up to 30% off tech & gaming – hero card"
   * As a result, agents have no intuitive high-level map.

6. **No explicit layout awareness.**

   * Bounding boxes are used for scoring but not as a core grouping signal.
   * Card grids, rows, and carousels are not explicitly recognized as such.

Net effect: the current tree is technically correct and exhaustive, but not cognitively aligned with how humans or agents want to reason about the page.

---

## 3. Proposed Anchor-Up + Dimension Strategy – Assessment

### 3.1 Strengths

* **Agent-first starting point.** Begins from actionable elements (links, buttons, inputs), which are exactly what agents care about for web tasks.

* **Bottom-up container detection.** For each actionable element, the algorithm climbs to a minimal container that "owns" that element (and not lots of unrelated anchors). This tends to produce card containers, list items, rows, etc.

* **Dimension-based grouping.** Containers are grouped by width/height (with a tolerance) and minimum size, which:

  * Recognizes visually consistent elements (cards in a grid, tiles in a carousel)
  * Is robust even when classes differ or are noisy

* **Concise IDs.** A registry like `S1`, `S1.I3` is much easier for agents to reference, and decouples logical IDs from DOM depth.

* **Skeletal ancestry.** Instead of printing full descendant text, it records a short path of tag+class+id ancestors, which gives spatial context without clutter.

* **Fits repeated-pattern reality.** Pages like Amazon are dominated by card grids and repeated offers; this strategy makes those patterns first-class.

### 3.2 Weaknesses / Gaps

* **Non-actionable but important content.** Some crucial context (headlines, section blurbs, prices) might not be directly on actionable elements and can be missed if we only start from anchors/inputs.

* **Breakpoint sensitivity.** Dimension matching depends on the render state (viewport size, zoom, responsive layout). Cards that are identical in structure might not be identical in width at all breakpoints.

* **Performance cost.** Measuring bounding boxes and grouping by dimensions for many elements can be expensive if done naively.

* **Nested patterns.** Cards within carousels, cards within subsections inside a larger card, etc, need careful handling so they aren't double counted or mis-grouped.

* **Threshold tuning.** Margins (±5px, ±10px), min size (100x100), and group size thresholds all need tuning and may vary by site type.

Conclusion: the anchor-up + dimensions approach solves many of the usability problems of the current tree, but needs to be combined with explicit handling for headings/sections and careful performance and robustness work.

---

## 4. Lessons from Related Research

Summarizing relevant ideas from agent-focused web research:

### 4.1 AgentOccam & Observation Alignment

* Focus on **observation alignment**: convert the rich page state into a compact, semantically aligned representation.
* Merge static text with associated interactive elements so the agent always sees **"this button" + "this label" + "this context"** together.
* Use markdown or structured text that resembles how humans would describe the UI.

### 4.2 DOM Pruning for Web Agents (Prune-style Approaches)

* Run a pruning script in-page that:

  * Filters by **visibility** and **interactivity**.
  * Collapses irrelevant containers and keeps only a tree of actionable and semantically relevant nodes.
* Emphasize the **accessibility tree** and ARIA roles to get a more semantic structure (landmarks, regions, list items, etc.).

### 4.3 Length- and Region-Based Chunking

* Compute **size/length metrics per node** (text length, HTML length, area) and use them to:

  * Identify "regions of interest" (big areas, dense text, or high interaction density).
  * Control how deep to traverse based on region importance.

Key takeaways:

* Start from semantic and interactive nodes, not raw layout.
* Aggressively prune layout noise.
* Explicitly model repeated patterns and regions, not just trees.

---

## 5. Hybrid Strategy – Recommended Direction

A pure top-down tree is too noisy. A pure anchor-up layout detector risks missing contextual content. A hybrid, multi-phase approach is the right tool for what you want.

### 5.1 Design Principles

1. **Section-first view of the page.** The primary unit should be sections like "Top Cyber Monday categories", "Up to 30% off tech & gaming", "Epic deals on Amazon Devices", not raw div chains.

2. **Card/grid patterns as first-class citizens.** Card grids, rows, and carousels should appear in the outline as named groups with counts and examples.

3. **Concise, logical IDs.** IDs should be short (`S1`, `S1.C3`, `N1.L2`) and decoupled from DOM depth.

4. **Context > completeness.** The outline should give enough context to know where something lives and what it roughly is, but detailed HTML comes via a separate retrieval call.

5. **Actionable-centric but heading-aware.** Start from actionable elements *and* headings/landmarks to avoid losing key context.

### 5.2 Proposed Multi-Phase Pipeline

#### Phase 1: Node Scanning & Feature Extraction

For all visible elements:

* Compute:

  * Bounding box (`x`, `y`, `w`, `h`, `area`, `area_ratio`)
  * Role, tag, classes, id
  * `interactive` flag (anchors, buttons, inputs, ARIA roles, tabindex, etc.)
  * `heading` flag (h1–h3 primarily; optionally h4–h6)
  * Short `label` from aria/title/alt/nearby text

This is similar to the current code, but do **not** generate the full tree yet.

#### Phase 2: Card / Container Detection (Bottom-Up)

From each **actionable element** and **heading**:

1. **Find minimal container** that "owns" that element:

   * Walk up until:

     * We reach a container that includes the element and maybe a small set of closely related controls, but not dozens of other unrelated anchors.
   * Apply constraints:

     * Min size thresholds (to avoid tiny wrappers)
     * Exclude pure layout wrappers with no text and no meaningful attributes.

2. Build a **container signature** combining:

   * Dimension bucket (`w`, `h` with tolerance)
   * Small set of class hints (e.g., `.card`, `.tile`, `.asin`)
   * Presence of sub-elements (image, price, rating, CTA)

3. Group containers by this signature.

   * Groups that exceed a size threshold become **candidate card grids or lists**.

Result: a set of repeated containers (cards) with dimension- and class-based similarity, each linked back to the underlying DOM node.

#### Phase 3: Section Detection (Mid-Up)

1. For each repeated container group, walk up to find a **parent section** that:

   * Contains at least `k` containers from the group
   * Contains a heading or label nearby (h1–h3, or a div with bold text, or an ARIA landmark)

2. That parent becomes a **section root**:

   * Assign a section ID (`S1`, `S2`, ...)
   * Attach a section label from its heading / aria / visible text (e.g., "Up to 30% off tech & gaming").

3. Do a similar pass for **non-repeated but semantically important sections**:

   * Large hero areas (big area_ratio, heading + CTA)
   * Major nav/filters blocks (landmarks + many interactive children).

Result: a top-level map of page sections, each with a type and a list of card groups or controls.

#### Phase 4: Context Skeleton (Selective Top-Down)

For each section root:

* Build a **skeletal ancestry path**:

  * Sequence of `tag`, `id`, key classes from `body` → parent wrappers → section element.
  * Max 4–5 steps, skipping pure layout-only divs.

* Build a **card schema** for repeated groups inside the section:

  * Identify selectors or relative paths for image, title, price, CTA.
  * Use the first few cards as examples.

This gives:

* A compact sense of "where" the section sits (page hierarchy and roles)
* An abstract schema for its repeated elements

#### Phase 5: Outline Representation

Instead of a giant tree, the outline is a small JSON/structured object:

* `sections` (S1, S2, ...) with:

  * `label` (heading text)
  * `type` (card-grid, hero, nav, sidebar, etc.)
  * `context_path` (skeletal ancestry)
  * `card_groups` with counts and example items
  * `other_controls` (filters, nav buttons) as a compact list

* `elements` mapping IDs to concise descriptors, for when agents need details.

Example shape (not exact syntax):

```json
{
  "sections": {
    "S1": {
      "type": "card-grid",
      "label": "Top Cyber Monday categories",
      "context_path": [
        "body#a-page",
        "div#pageContent",
        "div#gw-layout",
        "div#main-content"
      ],
      "card_groups": [
        {
          "id": "S1.G1",
          "signature": "card-280x360",
          "count": 4,
          "example_items": ["S1.G1.I1", "S1.G1.I2"]
        }
      ]
    },
    "S2": {
      "type": "hero",
      "label": "Up to 30% off tech & gaming",
      "context_path": ["body#a-page", "div#pageContent", "div#gw-layout"],
      "card_groups": [],
      "other_controls": ["S2.CTA1"]
    }
  }
}
```

Detailed HTML is never embedded here; instead, agents call a retrieval API with IDs like `S1.G1.I2` to get that card's HTML plus local context.

---

## 6. Concrete Changes to the Current Implementation

### 6.1 IDs and Identity Model

* Replace path-based IDs in the outline with **logical IDs**:

  * Sections: `S1`, `S2`, ...
  * Card groups: `S1.G1`, `S1.G2`, ...
  * Cards/items: `S1.G1.I1` etc.

* Maintain a mapping from logical IDs to DOM selectors/path internally (not exposed to the LLM) so retrieval can still resolve elements by path.

### 6.2 Output Shape

* Stop emitting the full tree with every node.
* Emit a **section-centric outline** with:

  * Section label + type + context path
  * For each repeated group: count + 1–3 example items
  * A short list of standalone important elements (e.g., main search bar, major filter block) with IDs.

### 6.3 Text Handling

* Do **not** include full descendant text in the outline.
* For each entity (section, card, control) include only:

  * `label` (heading, aria, alt, short text)
  * Optional `text_preview` (truncated combined text from immediate children, not all descendants).

### 6.4 Grouping Logic

* Augment structural signatures with **dimension and class-based grouping**:

  * Use dimension buckets with tolerance as a primary signal.
  * Use class hints (`card`, `tile`, `product`, etc.) as secondary signals.
  * Use current structural signature as a fallback where dimensions alone are ambiguous.

* Elevate groups that:

  * Have at least N siblings (e.g., N ≥ 3)
  * Have sufficient size (min width/height)
  * Contain actionable children (links/CTAs).

### 6.5 Section Detection

* Implement the **anchor-up + heading** logic:

  * From actionable and heading nodes, search upwards to find suitable containers.
  * From repeated containers, search upwards again for section parents with headings.

* Mark these section parents as section roots and exclude their internal wrapper-only nodes from separate listing.

---

## 7. Agent Interaction Model

Two primary tools (conceptually):

1. **`get_page_outline()`**

   * Returns the compact section-based outline with logical IDs, labels, types, counts, schemas, and context paths.
   * Used at the start of an interaction to build a mental map of the page.

2. **`get_elements_html(ids: string[], max_depth?: number)`**

   * Given IDs like `S1.G1.I1` or `S2.CTA1`, returns:

     * Local HTML for that element and a small neighborhood up/down the tree.
     * Optional snippet of visible text and key attributes.
   * Used when the agent decides it needs details about specific cards or controls.

This separation is the key: the outline provides the "birds-eye" view and ID space, while retrieval gives deep detail only for what the agent has already decided is important.

---

## 8. Open Questions and Tuning Knobs

* **Dimension tolerance:** per-pixel (±5/10px) vs percentage-based difference.
* **Min card size:** what sizes define a "real" card vs tiny control groups.
* **Section vs card detection order:** whether to detect cards first then sections, or the reverse, for certain layouts.
* **Dynamic content:** how to refresh or merge outlines when the page updates (infinite scroll, SPA navigation).
* **Performance:** how many elements we can realistically scan with full bounding boxes on a typical page before it becomes too heavy.

---

## 9. Summary

* The current tree traversal strategy is exhaustive but misaligned with how humans and agents want to understand a page. The Amazon example shows that clearly.
* The proposed anchor-up + dimension approach moves in the right direction by focusing on actionable elements and visual groups, but needs heading/section awareness and some robustness work.
* A hybrid approach using:

  * bottom-up container and card detection,
  * mid-up section detection with headings,
  * selective top-down context skeletons,
  * concise IDs and a clean outline format,
    gets you the "birds-eye" view you're after.
* The next steps are implementing the hybrid pipeline, switching to a section-based outline, and keeping full HTML behind a retrieval API keyed by logical IDs.
