# Repeated Group Detection v2 (Domain‑Agnostic)

Goal: reliably detect repeated UI groups (nav lists, card grids, thumbnail strips, etc.) across very different DOMs, including ones with obfuscated or Tailwind-only class names.

---

## 1. Constraints & assumptions

* We **cannot** rely on semantic class names (`.card`, `.nav`, etc.).
* Some sites use:

  * Completely obfuscated classes (`.a1b2c3`)
  * Utility-heavy Tailwind classes (`flex`, `grid`, `px-4`, `md:px-6`)
* We **can** rely on:

  * DOM tree shape (tags, depth, sibling relationships)
  * Text structure (short labels vs paragraphs)
  * Presence of links/images/buttons
  * **Optionally**: rendered geometry (bounding boxes) from the browser engine
* We want:

  * Repeated **items** (cards, list entries, thumbnails)
  * Their **container** (the group / section they live in)
  * A clean abstraction (`nav_list`, `card_grid`, `thumbnail_strip`, etc.)

---

## 2. Core idea: structural + visual similarity, not class semantics

Instead of trusting class names, we:

1. Build a **feature vector** per node.
2. Use those vectors to detect similar siblings (candidate repeated items).
3. For each group of similar siblings, walk **up** the DOM to find the best shared container.
4. Label the group type (`nav_list`, `card_grid`, `crumb_trail`, etc.) based on simple, generic rules.

This lets us generalize across Amazon, Home Depot, and any other ecommerce page.

---

## 3. Node features (for grouping)

For any element `E`, compute a feature object like:

* **Tag signature**

  * `tag`: `div`, `li`, `a`, `section`, etc.
  * `is_link_container`: has a descendant `<a>` with visible text
  * `is_image_container`: has `<img>` or `background-image`

* **Class signature (obfuscated / Tailwind tolerant)**

  * `class_set`: sorted list of classes
  * `raw_class_hash`: hash of the full class set (captures exact obfuscated combos)
  * `normalized_tokens`: reduced tokens:

    * strip breakpoint prefixes (`sm:`, `md:`, `lg:`)
    * keep only layout-ish tokens: `flex`, `grid`, `inline-flex`, `items-center`, `justify-center`, etc.
  * `layout_hash`: hash of `normalized_tokens`

* **Structure signature**

  * `num_children`
  * `child_tag_histogram`: counts of child tags (`a`, `img`, `span`, `button`, etc.)
  * `num_link_descendants`
  * `num_image_descendants`
  * `text_nodes_count`
  * `text_lengths`: simple stats (min/mean/max length of text nodes under `E`)

* **Visual signature (if we can get it)**

  * `bbox`: `{x, y, width, height}` from `element.boundingBox()`
  * `rounded_width = round(width / 10) * 10`
  * `rounded_height = round(height / 10) * 10`
  * maybe a coarse `row_index` / `col_index` if we infer grid/row layout

From these we can build a compact signature key:

```text
sig(E) = (
  tag,
  child_tag_histogram bucketed,
  has_link?,
  has_image?,
  layout_hash,
  rounded_width,
  rounded_height
)
```

Obfuscated classes still work because **repeated items share the same raw_class_hash and layout_hash**, even if the tokens themselves are meaningless.

Tailwind-heavy nodes still work because the **combination** of tags, structure, and bounding box is very similar for repeated cards.

---

## 4. Detecting repeated items (bottom-up)

### 4.1 Sibling clustering

For each parent element `P`:

1. Take all child elements `C1..Cn`.
2. Compute `sig(Ci)` for each.
3. Group children by signature using a hash map or approximate clustering:

   * Strict mode: items grouped if signatures are **identical**.
   * Relaxed mode: allow small differences (e.g., width/height within tolerance, similar histograms).
4. Any cluster with `size >= MIN_GROUP_SIZE` (e.g. 3) is a **candidate repeated group**.

This finds:

* Nav link lists, where each `li` is structurally identical
* Card grids (product tiles)
* Thumbnail strips

It does not care whether classes are `a1b2c3` or `bg-white p-2 rounded-lg`.

### 4.2 Link/heading seeding (content-first pass)

In parallel, we can do a **content-first** pass:

1. Enumerate all nodes that are:

   * anchors with text
   * headings (`h1`–`h6`)
   * buttons with text
2. For each such node `N`, compute a **local signature** based on:

   * its immediate parent
   * shallow subtree under that parent
3. Look for other nodes elsewhere in the DOM with a similar local signature.

This helps when the repeated items are not direct siblings but are embedded in slightly different wrappers that still share structure.

---

## 5. Finding the right container (climb up, then step down)

Once we have a cluster of repeated items (siblings) under some parent `P`, we want the **most meaningful container**.

### 5.1 Climb-up algorithm

Given items `I1..Ik` (siblings under parent `P0`):

1. Let `container = P0`.
2. While `container.parent` exists and:

   * All `Ii` are still within `container.parent` (by DOM ancestry), and
   * `container.parent` does not introduce **new distinct item types** that would dilute the group (e.g., a completely different sibling layout),
   * and the number of **non-group** children under `container.parent` is small (e.g., a heading + our group),
   * then set `container = container.parent`.
3. When the parent starts mixing unrelated structures (e.g. another block of different cards, or a totally different section), **step back down** one level.

This implements your intuition:

> Start from the repeated items, go up until you hit a parent that also contains unrelated content, then go back down one level.

### 5.2 Heading association

While climbing up, track headings:

* If a parent has an immediate `h2/h3` (or a strong text block) **preceding** our group, associate that as the section title.
* That gives us labels like “Top Categories For You”, “Popular Categories”, “Top Cyber Monday Categories”, etc., without domain-specific logic.

Resulting abstraction:

```yaml
section:
  title: "Top Categories For You"
  kind: card_grid
  container_dom_path: ...
  items: [ ... repeated cards ... ]
```

---

## 6. Group type classification (primitive labels)

Once we have a repeated group + container, decide what it *is*.

### 6.1 `nav_list`

Heuristics:

* Group items are short (e.g. text length < 40 chars).
* Each item is or contains a single `<a>`.
* Items are in a `ul/ol` or a flex row/column with nearly identical size.
* Region text density is low except for link labels.

### 6.2 `card_grid`

Heuristics:

* Items have:

  * an image or icon
  * a title (longer text, maybe wrapping)
  * optionally subtitle, price, badge
* Items are arranged in a grid or row where widths are similar, heights may vary slightly.
* The container has display classes consistent with grid/row behavior (but we don’t rely solely on class names).

### 6.3 `thumbnail_strip`

Heuristics:

* Items are predominantly images with minimal text.
* Bounding boxes are small, square-ish.
* Usually beneath or beside a larger main image.

### 6.4 `crumb_trail`

Heuristics:

* Inline list of links separated by `/`, `>`, or similar.
* Short text labels, often wrapped in a container that suggests “breadcrumb” by class or id, but we treat that as a hint, not a requirement.

---

## 7. Rendered size & relevance ranking

To focus on the **most relevant** repeated groups:

1. For each group, compute:

   * `total_area = sum(bbox.width * bbox.height)` across items
   * `viewport_coverage = union_area / viewport_area` (approximate if needed)
   * `text_volume = sum(text_length)`
2. Score groups:

```text
score = w1 * viewport_coverage + w2 * log(total_area) + w3 * text_volume
```

3. Keep the top N groups per page as the **primary** structures, discard tiny/low-impact groups (e.g. little badge clusters).

This aligns with “most relevant repeated items based on rendered size, then work up to find the most relevant common sections.”

---

## 8. How link/heading-first fits in

We can absolutely implement your link/heading-first idea as a parallel pass:

1. **Collect key nodes:** all headings and prominent links (e.g. larger font size, main nav, product titles).
2. For each key node:

   * climb up until you hit a container that also contains other key nodes with similar signatures.
   * treat these as candidate groups and run the grouping logic again.

This is particularly useful for pages where repeated items are:

* Not nicely grouped as siblings
* Spread across multiple wrappers that share only some structural features

We can then **merge results** from:

* sibling clustering pass, and
* key-node-first pass.

---

## 9. Open questions / knobs to tune

* What should `MIN_GROUP_SIZE` be for different page types?
* How strict should structural similarity be before we relax to approximate clustering?
* How much weight do we want to give visual geometry vs DOM structure when they conflict?
* Do we want separate models / thresholds for:

  * homepage-like pages (lots of promos, carousels)
  * product pages (one main product section, supporting sections)
  * category/search result pages (many product cards)

These are tuning concerns; the core algorithm stays domain-agnostic.

---

## 10. Implementation sketch (pseudo)

```pseudo
nodes = collect_all_elements(dom)
for node in nodes:
  features[node] = compute_features(node)

candidate_groups = []

# 1) sibling-based grouping
for parent in nodes:
  children = parent.children
  clusters = group_by_signature(children, features)
  for cluster in clusters:
    if len(cluster) >= MIN_GROUP_SIZE:
      candidate_groups.append({
        "items": cluster,
        "parent": parent,
      })

# 2) key-node (link/heading) seeded grouping
key_nodes = collect_links_headings(dom)
key_groups = cluster_key_nodes_by_local_structure(key_nodes, features)
candidate_groups.extend(key_groups)

# 3) refine containers and classify
sections = []
for group in candidate_groups:
  container = climb_up_then_step_down(group.items)
  title = find_preceding_heading(container)
  kind = classify_group_kind(group.items, container, features)
  sections.append({
    "kind": kind,
    "container": container,
    "title": title,
    "items": group.items
  })

# 4) score and keep top
for s in sections:
  s.score = compute_section_score(s)

sections = sort_by_score_desc(sections)
sections = sections[0:MAX_SECTIONS]

return sections
```
