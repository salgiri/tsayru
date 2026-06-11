// Smart CSS-selector builder with anchor-priority and uniqueness verification.
// No dependencies on other modules — pure DOM helpers.

// Looks like a CSS-modules / styled-components hash (e.g. "_3xK4f", "css-1d4qfvq").
// Requires at least one digit when there's no separator, so semantic words like
// "container", "dropdown", "accordion" pass through.
const looksLikeHash = (c) => {
  if (c.length < 6) return false;
  if (/^css-[a-z0-9]{4,}$/.test(c)) return true;
  if (
    /^[a-z0-9]{8,}$/i.test(c) &&
    /\d/.test(c) &&
    !/-/.test(c) &&
    !/_/.test(c)
  )
    return true;
  return false;
};

// Anchor selector that's likely to uniquely identify an element on its own.
const anchorFor = (el) => {
  for (const attr of ["data-testid", "data-test", "data-cy"]) {
    const v = el.getAttribute(attr);
    if (v) return `[${attr}="${CSS.escape(v)}"]`;
  }
  if (el.id && /^[a-zA-Z][\w:-]*$/.test(el.id)) return `#${CSS.escape(el.id)}`;
  const aria = el.getAttribute("aria-label");
  if (aria && aria.length > 0 && aria.length <= 60) {
    // Use the attribute-selector quoting form with CSS.escape — handles brackets,
    // quotes, control chars correctly. `[attr="value"]` requires escape inside the quoted value.
    return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
  }
  return null;
};

const segmentFor = (node) => {
  const anchor = anchorFor(node);
  if (anchor && (anchor.startsWith("#") || anchor.startsWith("["))) return anchor;
  let part = node.tagName.toLowerCase();
  if (anchor) {
    part = anchor; // tag[aria-label="..."]
  } else if (node.classList.length) {
    // Tailwind classes are deterministic — keep more of them so the selector
    // stays diagnostic. Earlier 3-class limit caused real-world misses where
    // multiple pages shared the leading 3 classes (e.g. flex.items-center.justify-end).
    const cls = [...node.classList]
      .filter((c) => !c.startsWith("tsayru-") && !looksLikeHash(c))
      .slice(0, 6)
      .map((c) => `.${CSS.escape(c)}`)
      .join("");
    part += cls;
  }
  const parent = node.parentElement;
  if (parent) {
    const sameTag = [...parent.children].filter(
      (c) => c.tagName === node.tagName,
    );
    if (sameTag.length > 1) {
      part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
    }
  }
  return part;
};

const isUniqueSelector = (sel, target, root = document) => {
  try {
    const m = root.querySelectorAll(sel);
    return m.length === 1 && m[0] === target;
  } catch {
    return false;
  }
};

// Core walk, scoped to one root (document or a ShadowRoot — selectors can't
// cross shadow boundaries, so each root is built independently).
const buildSelectorIn = (target, root) => {
  const directAnchor = anchorFor(target);
  if (directAnchor && isUniqueSelector(directAnchor, target, root))
    return directAnchor;

  const parts = [];
  let node = target;
  let safety = 30; // hard ceiling against runaway loops on broken DOMs
  while (node && node.nodeType === 1 && safety > 0) {
    const seg = segmentFor(node);
    parts.unshift(seg);
    const chain = parts.join(" > ");
    if (isUniqueSelector(chain, target, root)) return chain;
    if (seg.startsWith("#") || seg.startsWith("[data-")) break;
    if (
      !node.parentElement ||
      node.tagName === "BODY" ||
      node.tagName === "HTML"
    )
      break;
    node = node.parentElement;
    safety -= 1;
  }
  const final = parts.join(" > ");
  // Walked to root and still ambiguous — surface so the markdown isn't trusted blindly.
  try {
    const matches = root.querySelectorAll(final);
    if (matches.length !== 1) {
      console.warn(
        `[tsayru] non-unique selector (${matches.length} matches):`,
        final,
      );
    }
  } catch {}
  return final;
};

// Priority: data-testid → id → aria-label → tag.classes chain.
// After each step, verify uniqueness; expand context up the tree until unique,
// anchor reached, or we hit body/html.
// Shadow DOM: elements inside shadow roots get `host-selector >>> inner-selector`
// (the DevTools-style piercing notation — not standard CSS, but unambiguous
// for a human or Claude, and queryDeep() below resolves it for hover preview).
export const buildSelector = (target) => {
  if (!(target instanceof Element)) return "";
  const root = target.getRootNode();
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
    const hostSel = buildSelector(root.host);
    return `${hostSel} >>> ${buildSelectorIn(target, root)}`;
  }
  return buildSelectorIn(target, document);
};

// Resolve a selector that may contain " >>> " shadow-root hops.
export const queryDeep = (selector) => {
  try {
    const hops = String(selector).split(" >>> ");
    let scope = document;
    let found = null;
    for (const hop of hops) {
      if (!scope) return null;
      found = scope.querySelector(hop);
      if (!found) return null;
      scope = found.shadowRoot || null;
    }
    return found;
  } catch {
    return null;
  }
};

// elementFromPoint that descends into (open) shadow roots, so the inspector
// targets the real element instead of the web-component host.
export const deepElementFromPoint = (x, y) => {
  let el = document.elementFromPoint(x, y);
  let guard = 12;
  while (el && el.shadowRoot && guard-- > 0) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
};

export const shortLabel = (target) => {
  if (!target) return "";
  const text = (target.textContent || "").trim().replace(/\s+/g, " ");
  if (text.length === 0) return target.tagName.toLowerCase();
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
};
