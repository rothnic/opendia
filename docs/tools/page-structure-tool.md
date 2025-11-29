// Types the agent/LLM will see
interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  viewportAreaRatio: number;
}

interface BaseOutlineNode {
  kind: "node";
  id: string;
  tag: string;
  role?: string | null;
  interactive: boolean;
  landmark: boolean;
  bbox: BBox;
  label?: string;
  textPreview?: string;
  attributes?: {
    id?: string;
    classes?: string[];
    href?: string;
    type?: string;
    name?: string;
  };
  truncated?: boolean;
  children?: OutlineNode[];
}

interface RepeatedGroupNode {
  kind: "repeated_group";
  id: string;
  signature: string;
  total: number;
  shown: number;
  omitted: number;
  examples: OutlineNode[];
}

type OutlineNode = BaseOutlineNode | RepeatedGroupNode;

interface OutlineOptions {
  maxDepth: number;
  maxNodes: number;
  maxChildrenPerGroup: number;
  examplesPerGroup: number;
}

interface Budget {
  remaining: number;
}

// Entry point you can expose from page context
function buildPageOutline(
  options?: Partial<OutlineOptions>
): OutlineNode | null {
  const resolved: OutlineOptions = {
    maxDepth: 8,
    maxNodes: 400,
    maxChildrenPerGroup: 6,
    examplesPerGroup: 3,
    ...options,
  };

  const root =
    document.querySelector("main") ??
    document.body ??
    (document.documentElement as HTMLElement | null);

  if (!root) return null;

  const viewportArea = window.innerWidth * window.innerHeight || 1;
  const budget: Budget = { remaining: resolved.maxNodes };

  return summarizeElement(
    root,
    0,
    "root",
    budget,
    resolved,
    viewportArea
  );
}

/** Core element summarizer */
function summarizeElement(
  el: Element,
  depth: number,
  id: string,
  budget: Budget,
  options: OutlineOptions,
  viewportArea: number
): OutlineNode | null {
  if (budget.remaining <= 0) return null;

  const bbox = getBBox(el, viewportArea);
  const interactive = isInteractiveElement(el);
  const landmark = isLandmark(el);
  const role = getRole(el);
  const textPreview = getVisibleText(el, 160);
  const label = getElementLabel(el, textPreview);

  const attrs = collectUsefulAttributes(el);
  const baseNode: BaseOutlineNode = {
    kind: "node",
    id,
    tag: el.tagName.toLowerCase(),
    role,
    interactive,
    landmark,
    bbox,
    label,
    textPreview,
    attributes: attrs,
    children: [],
  };

  budget.remaining -= 1;
  if (budget.remaining <= 0) {
    baseNode.truncated = true;
    return baseNode;
  }

  if (depth >= options.maxDepth && !interactive && !landmark) {
    baseNode.truncated = true;
    return baseNode;
  }

  const children = summarizeChildren(
    el,
    depth,
    id,
    budget,
    options,
    viewportArea
  );

  baseNode.children = children;
  return baseNode;
}

/** Summarize children of a node, with grouping and collapsing */
function summarizeChildren(
  parent: Element,
  depth: number,
  parentId: string,
  budget: Budget,
  options: OutlineOptions,
  viewportArea: number
): OutlineNode[] {
  if (budget.remaining <= 0) return [];

  const rawChildren = Array.from(parent.children) as Element[];
  const visibleChildren = rawChildren.filter(isElementVisible);

  type ChildInfo = {
    el: Element;
    index: number;
    bbox: BBox;
    interactive: boolean;
    landmark: boolean;
    textLen: number;
    score: number;
    areaBucket: string;
  };

  const childrenInfo: ChildInfo[] = visibleChildren.map((el, index) => {
    const bbox = getBBox(el, viewportArea);
    const interactive = isInteractiveElement(el);
    const landmark = isLandmark(el);
    const text = getVisibleText(el, 240);
    const textLen = text.length;
    const areaBucket = getAreaBucket(bbox.viewportAreaRatio);
    const score = getImportanceScore(
      bbox,
      interactive,
      landmark,
      textLen
    );
    return {
      el,
      index,
      bbox,
      interactive,
      landmark,
      textLen,
      score,
      areaBucket,
    };
  });

  // Group by structural signature
  const groupsMap = new Map<
    string,
    { signature: string; members: ChildInfo[] }
  >();

  for (const child of childrenInfo) {
    const signature = getSignature(child.el, child.areaBucket);
    const group = groupsMap.get(signature);
    if (group) {
      group.members.push(child);
    } else {
      groupsMap.set(signature, { signature, members: [child] });
    }
  }

  const groups = Array.from(groupsMap.values());

  // Sort groups by max member importance
  groups.sort((a, b) => {
    const aMax = Math.max(...a.members.map((m) => m.score));
    const bMax = Math.max(...b.members.map((m) => m.score));
    return bMax - aMax;
  });

  const out: OutlineNode[] = [];

  for (let gIndex = 0; gIndex < groups.length; gIndex++) {
    if (budget.remaining <= 0) break;

    const group = groups[gIndex];
    const members = group.members.sort((a, b) => b.score - a.score);

    if (members.length <= options.maxChildrenPerGroup) {
      // Keep all children as individual nodes
      for (const m of members) {
        if (budget.remaining <= 0) break;
        const childId = makeChildId(parentId, m.el, m.index);
        const childNode = summarizeElement(
          m.el,
          depth + 1,
          childId,
          budget,
          options,
          viewportArea
        );
        if (childNode) out.push(childNode);
      }
    } else {
      // Collapse into repeated_group with examples
      const examples: OutlineNode[] = [];
      const exampleCount = Math.min(
        options.examplesPerGroup,
        members.length
      );

      for (let i = 0; i < exampleCount; i++) {
        if (budget.remaining <= 0) break;
        const m = members[i];
        const exId = makeChildId(parentId, m.el, m.index);
        const exNode = summarizeElement(
          m.el,
          depth + 1,
          exId,
          budget,
          options,
          viewportArea
        );
        if (exNode) examples.push(exNode);
      }

      const groupNode: RepeatedGroupNode = {
        kind: "repeated_group",
        id: `${parentId}/group[${gIndex + 1}]`,
        signature: group.signature,
        total: members.length,
        shown: examples.length,
        omitted: members.length - examples.length,
        examples,
      };

      budget.remaining -= 1;
      if (budget.remaining < 0) {
        // If we overshot, drop the group
        break;
      }
      out.push(groupNode);
    }
  }

  return out;
}

/** Basic visibility check */
function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  // Optional: filter way off screen things
  if (rect.bottom < 0 || rect.top > window.innerHeight * 3) return false;
  return true;
}

/** Bounding box with relative area */
function getBBox(el: Element, viewportArea: number): BBox {
  const rect = el.getBoundingClientRect();
  const area = Math.max(0, rect.width * rect.height);
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    area,
    viewportAreaRatio: viewportArea ? area / viewportArea : 0,
  };
}

/** Importance score for ordering and pruning */
function getImportanceScore(
  bbox: BBox,
  interactive: boolean,
  landmark: boolean,
  textLen: number
): number {
  const areaScore = Math.log(1 + bbox.viewportAreaRatio * 1000);
  const interScore = interactive ? 4 : 0;
  const landScore = landmark ? 3 : 0;
  const textScore = Math.log(1 + textLen);
  return 3 * areaScore + interScore + landScore + textScore;
}

/** Group area size into buckets to stabilize signatures */
function getAreaBucket(ratio: number): string {
  if (ratio > 0.5) return "XL";
  if (ratio > 0.2) return "L";
  if (ratio > 0.05) return "M";
  if (ratio > 0.01) return "S";
  return "XS";
}

/** Simple interactive detection */
function isInteractiveElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const role = getRole(el);
  const htmlEl = el as HTMLElement;
  const hasClick = typeof (htmlEl as any).onclick === "function";

  if (
    tag === "a" ||
    tag === "button" ||
    tag === "input" ||
    tag === "select" ||
    tag === "textarea" ||
    tag === "summary"
  ) {
    return true;
  }

  if (
    role === "button" ||
    role === "link" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "tab" ||
    role === "menuitem" ||
    role === "textbox" ||
    role === "combobox" ||
    role === "slider" ||
    role === "switch"
  ) {
    return true;
  }

  const tabIndex = htmlEl.tabIndex;
  if (tabIndex >= 0) return true;

  if (hasClick) return true;

  const style = window.getComputedStyle(htmlEl);
  if (style.cursor === "pointer") return true;

  return false;
}

/** Landmark detection: headers, main, nav, footer, etc */
function isLandmark(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const role = getRole(el);

  if (
    tag === "header" ||
    tag === "nav" ||
    tag === "main" ||
    tag === "aside" ||
    tag === "footer"
  ) {
    return true;
  }

  if (
    role === "banner" ||
    role === "navigation" ||
    role === "main" ||
    role === "complementary" ||
    role === "contentinfo" ||
    role === "region"
  ) {
    return true;
  }

  return false;
}

function getRole(el: Element): string | null {
  const roleAttr = el.getAttribute("role");
  return roleAttr || null;
}

/** Text preview for the node */
function getVisibleText(el: Element, maxLen: number): string {
  let text = "";
  if (el instanceof HTMLElement) {
    text = el.innerText || "";
  } else {
    text = el.textContent || "";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length > maxLen) {
    return normalized.slice(0, maxLen) + "…";
  }
  return normalized;
}

/** Prefer aria, alt, placeholder, fallback to text preview */
function getElementLabel(el: Element, textPreview: string): string | undefined {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();

  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim();

  if (el instanceof HTMLImageElement) {
    const alt = el.alt;
    if (alt && alt.trim()) return alt.trim();
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) return placeholder.trim();
  }

  return textPreview || undefined;
}

/** Only expose useful, compact attributes */
function collectUsefulAttributes(el: Element): BaseOutlineNode["attributes"] {
  const attrs: BaseOutlineNode["attributes"] = {};
  const id = el.getAttribute("id");
  if (id) attrs.id = id;

  if (el.classList && el.classList.length) {
    const classes = Array.from(el.classList).slice(0, 3);
    if (classes.length) attrs.classes = classes;
  }

  if (el instanceof HTMLAnchorElement && el.href) {
    attrs.href = simplifyUrl(el.href);
  }

  if (el instanceof HTMLInputElement) {
    if (el.type) attrs.type = el.type;
    if (el.name) attrs.name = el.name;
  }

  if (el instanceof HTMLButtonElement) {
    if (el.type) attrs.type = el.type;
    if (el.name) attrs.name = el.name;
  }

  return attrs;
}

/** Collapse long urls to something readable */
function simplifyUrl(url: string): string {
  try {
    const u = new URL(url, location.href);
    const pathParts = u.pathname.split("/").filter(Boolean);
    let pathSummary = "";
    if (pathParts.length > 2) {
      pathSummary = `/${pathParts[0]}/…/${pathParts[pathParts.length - 1]}`;
    } else if (pathParts.length > 0) {
      pathSummary = `/${pathParts.join("/")}`;
    }
    const queryHint = u.search ? " ?…" : "";
    return `${u.origin}${pathSummary}${queryHint}`;
  } catch {
    if (url.length > 80) return url.slice(0, 80) + "…";
    return url;
  }
}

/** Signature for grouping repeated sibling patterns */
function getSignature(el: Element, areaBucket: string): string {
  const tag = el.tagName.toLowerCase();
  const role = getRole(el) || "";
  const classes = el.classList
    ? Array.from(el.classList).slice(0, 3).sort().join(".")
    : "";
  const hasImg = !!el.querySelector("img,picture,svg");
  const hasLink = !!el.querySelector("a,button,[role='button']");
  const hasInput = !!el.querySelector("input,select,textarea");
  return [
    tag,
    role,
    classes,
    areaBucket,
    hasImg ? "img" : "",
    hasLink ? "link" : "",
    hasInput ? "input" : "",
  ].join("|");
}

/** Build a simple id segment for a child */
function makeChildId(
  parentId: string,
  el: Element,
  index: number
): string {
  const tag = el.tagName.toLowerCase();
  const position = index + 1;
  return `${parentId}/${tag}[${position}]`;
}

// Example usage from Playwright:
//
// const outline = await page.evaluate(() => {
//   // bring the function into the page scope or inline the definition above
//   return buildPageOutline({
//     maxDepth: 7,
//     maxNodes: 350,
//     maxChildrenPerGroup: 5,
//     examplesPerGroup: 2,
//   });
// });
