// The CSS that styles one element, grouped by interactive state — the data
// behind the style editor's CSS tab — plus the forced-state trick that shows
// a :hover/:focus look without a real pointer. Pure DOM/CSSOM, no UI.
//
// For every style rule in the readable stylesheets, each selector in its list
// is classified: the state it needs (:hover, ::before, …) is stripped, and if
// the element matches what is left, the rule styles the element in that
// state. That is how DevTools' Styles pane groups them.

export const STATES = [
  "default",
  ":hover",
  ":focus",
  ":focus-visible",
  ":active",
  "::before",
  "::after",
];

// What forcing a state turns on, for the element itself and for its
// ancestors: hovering an element hovers its parents too, focusing it makes
// them :focus-within, a focus-visible element is also :focus, and a pressed
// one is also hovered.
const FORCE_SETS = {
  ":hover": { self: ["hover"], up: ["hover"] },
  ":active": { self: ["active", "hover"], up: ["active", "hover"] },
  ":focus": { self: ["focus", "focus-within"], up: ["focus-within"] },
  ":focus-visible": {
    self: ["focus-visible", "focus", "focus-within"],
    up: ["focus-within"],
  },
};
export const FORCEABLE = Object.keys(FORCE_SETS);
export const FORCE_ATTR = "data-tsayru-force";

// ---------- Text helpers ----------

// Split on a separator at the top level only: `a, b:is(c, d), [x="1,2"]`
// → three selectors; `color: red; background: url("a;b")` → two declarations.
export const splitTopLevel = (text, sep = ",") => {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\\") i++;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
};

export const splitSelectorList = (text) => splitTopLevel(text, ",");

// Index of the `)` closing the `(` at `open`; the string's end if unbalanced.
const closingParen = (s, open) => {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return s.length;
};

const ESCAPE_RE = /\\[0-9a-fA-F]{1,6}\s?|\\[\s\S]/g;
const STRING_RE = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;
const SLOT_RE = /\uE000(\d+)\uE001/g;
const HAS_SLOT_RE = /\uE000\d+\uE001/;

// Hide what must not be read as structure before a selector is taken apart:
// escapes (Tailwind's `.hover\:bg-x`), quoted strings, and the arguments of
// :not()/:has() — a state inside those is not the element's own state.
const maskSelector = (selector) => {
  const saved = [];
  const hide = (part) => `\uE000${saved.push(part) - 1}\uE001`;
  const s = String(selector).replace(ESCAPE_RE, hide).replace(STRING_RE, hide);
  let out = "";
  let from = 0;
  const fn = /:(not|has)\(/gi;
  let m;
  while ((m = fn.exec(s))) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(s, open);
    out += s.slice(from, open + 1) + hide(s.slice(open + 1, close));
    from = close;
    fn.lastIndex = close;
  }
  out += s.slice(from);
  const restore = (text) => {
    let r = text;
    while (HAS_SLOT_RE.test(r)) r = r.replace(SLOT_RE, (_, n) => saved[+n]);
    return r;
  };
  return { masked: out, restore };
};

// ---------- Selector analysis ----------

const STATE_CLASS_RE = /:(hover|focus-visible|focus|active)(?![\w-])/gi;
const PSEUDO_ELEMENT_RE = /::?(before|after)(?![\w-])/gi;
const STATE_PRIORITY = [":focus-visible", ":focus", ":active", ":hover"];

// Which state a selector needs, and the selector without it.
// `.btn:hover::before` → { state: "::before", also: [":hover"], base: ".btn" }
export const classifySelector = (selector) => {
  const sel = String(selector || "").trim();
  const { masked, restore } = maskSelector(sel);
  const elements = [...masked.matchAll(PSEUDO_ELEMENT_RE)].map(
    (m) => `::${m[1].toLowerCase()}`,
  );
  const classes = [
    ...new Set(
      [...masked.matchAll(STATE_CLASS_RE)].map((m) => `:${m[1].toLowerCase()}`),
    ),
  ];
  // A pseudo that starts a compound (`a > :hover`) leaves nothing behind once
  // stripped; a universal keeps the compound in place (`a > *`).
  const base = masked
    .replace(/(^|[\s>+~(,])(?=::?[a-z])/gi, "$1*")
    .replace(PSEUDO_ELEMENT_RE, "")
    .replace(STATE_CLASS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  let state = "default";
  if (elements.length) state = elements[elements.length - 1];
  else if (classes.length) state = STATE_PRIORITY.find((s) => classes.includes(s));
  const also = elements.length ? classes : classes.filter((c) => c !== state);
  return { selector: sel, base: restore(base || "*"), state, also };
};

const STATE_TEST = /:(hover|focus-visible|focus|active)(?![\w-])|::?(before|after)(?![\w-])/i;

// `.x:is(:hover, :focus-visible)` applies in either state: split state
// alternatives inside :is()/:where() so each state lists the rule.
export const expandStates = (selector) => {
  const out = [];
  const walk = (sel, depth) => {
    const { masked, restore } = maskSelector(sel);
    const fn = /:(is|where|matches|-webkit-any)\(/gi;
    let m;
    while (depth < 3 && (m = fn.exec(masked))) {
      const open = m.index + m[0].length - 1;
      const close = closingParen(masked, open);
      const args = splitTopLevel(masked.slice(open + 1, close), ",");
      if (args.length > 1 && args.some((a) => STATE_TEST.test(restore(a)))) {
        for (const a of args) {
          walk(restore(`${masked.slice(0, open + 1)}${a}${masked.slice(close)}`), depth + 1);
        }
        return;
      }
    }
    out.push(sel);
  };
  walk(String(selector || ""), 0);
  return [...new Set(out)].slice(0, 16);
};

export const compareSpecificity = (x, y) =>
  x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

// Selector specificity as [ids, classes, types], close enough to order rules
// the way the cascade does. :where() counts zero; :is()/:not()/:has() count
// as their most specific argument.
export const specificity = (selector) => {
  let a = 0;
  let b = 0;
  let c = 0;
  let s = String(selector || "")
    .replace(ESCAPE_RE, "x")
    .replace(STRING_RE, '""');
  const fn = /:(where|is|not|has|matches|-webkit-any)\(/gi;
  let m;
  while ((m = fn.exec(s))) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(s, open);
    if (m[1].toLowerCase() !== "where") {
      const best = splitSelectorList(s.slice(open + 1, close))
        .map(specificity)
        .sort(compareSpecificity)
        .pop() || [0, 0, 0];
      a += best[0];
      b += best[1];
      c += best[2];
    }
    s = `${s.slice(0, m.index)} ${s.slice(close + 1)}`;
    fn.lastIndex = m.index;
  }
  s = s.replace(/\[[^\]]*\]/g, () => {
    b++;
    return " ";
  });
  a += (s.match(/#[\w-]+/g) || []).length;
  b += (s.match(/\.[\w-]+/g) || []).length;
  // Pseudo-elements count as types — legacy single-colon ones too.
  const PSEUDO_EL =
    /::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter)(?![\w-])/gi;
  c += (s.match(PSEUDO_EL) || []).length;
  s = s.replace(PSEUDO_EL, " ");
  b += (s.match(/:[\w-]+(\([^)]*\))?/g) || []).length;
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, " ").replace(/[#.][\w-]+/g, " ");
  c += (s.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length;
  return [a, b, c];
};

// A nested rule's selector is relative to its parent: `&` stands for the
// parent, and a selector without one is the parent's descendant.
export const resolveNested = (selector, parents) => {
  const sel = String(selector || "").trim();
  if (!parents || !parents.length) return sel;
  const single = parents.length === 1 ? parents[0] : null;
  if (!sel.includes("&")) return `${single || `:is(${parents.join(", ")})`} ${sel}`;
  // `&` leading a selector can take the parent verbatim; anywhere else it is
  // only equivalent wrapped in :is().
  const wrapped = `:is(${parents.join(", ")})`;
  return sel.replace(/&/g, (_, i) => (i === 0 && single ? single : wrapped));
};

// Rewrite a selector so an attribute stands in for interactive states:
// `.card:hover .badge` → `.card[data-tsayru-force~="hover"] .badge`.
export const forceSelector = (selector, names) => {
  const list = (Array.isArray(names) ? names : [names]).map((n) =>
    String(n).replace(/^:+/, "").toLowerCase(),
  );
  const { masked, restore } = maskSelector(selector);
  const re = new RegExp(`:(${list.join("|")})(?![\\w-])`, "gi");
  return restore(
    masked.replace(re, (_, n) => `[${FORCE_ATTR}~="${n.toLowerCase()}"]`),
  );
};

// `color: red; background: url("a;b") !important` → declarations in source
// order, shorthands kept (CSSOM's indexed access would expand them).
export const parseDeclarations = (cssText) =>
  splitTopLevel(cssText, ";")
    .map((decl) => {
      const colon = decl.indexOf(":");
      if (colon < 1) return null;
      const name = decl.slice(0, colon).trim();
      let value = decl.slice(colon + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
      return name ? { name, value, important } : null;
    })
    .filter(Boolean);

// ---------- Where rules come from ----------

// Where a stylesheet came from, as short as it stays recognisable.
// Vite dev serves CSS as <style data-vite-dev-id="/abs/path.css">.
export const sheetLabel = (sheet) => {
  try {
    if (sheet?.__tsayruLabel) return sheet.__tsayruLabel;
    const node = sheet?.ownerNode;
    const dev = node?.dataset?.viteDevId;
    if (dev) return shortPath(dev);
    if (sheet?.href) return shortPath(new URL(sheet.href).pathname);
    if (node?.tagName === "STYLE") return "<style>";
  } catch {}
  return "stylesheet";
};

export const shortPath = (path) => {
  const p = String(path || "").split("?")[0];
  const marker = p.search(/\/(src|client|app|styles|components|pages)\//);
  if (marker >= 0) return p.slice(marker + 1);
  return p.split("/").filter(Boolean).slice(-3).join("/");
};

const kindOf = (rule) => {
  switch (rule?.constructor?.name) {
    case "CSSStyleRule":
      return "style";
    case "CSSNestedDeclarations":
      return "decls";
    case "CSSMediaRule":
      return "media";
    case "CSSSupportsRule":
      return "supports";
    case "CSSContainerRule":
      return "container";
    case "CSSLayerBlockRule":
      return "layer";
    case "CSSLayerStatementRule":
      return "layer-names";
    case "CSSScopeRule":
      return "scope";
    case "CSSImportRule":
      return "import";
  }
  // Duck typing for CSSOM implementations without those class names.
  if (rule?.selectorText != null && rule.style) return "style";
  if (rule?.styleSheet) return "import";
  if (rule?.media && rule.cssRules) return "media";
  return "other"; // @keyframes, @font-face, @starting-style, …
};

// Visit every readable style rule under `root` (a document or a shadow
// root) with the context it sits in:
//   { sheet, conditions: ["@media …"], active, layer, layerRank, parents }
// `parents` are the resolved selectors of the enclosing rule (CSS nesting).
// Returns how many stylesheets could not be read (cross-origin).
export const walkStyleRules = (root, visit, { win = window, skipSheet } = {}) => {
  let skipped = 0;
  let anonymous = 0;
  const layerOrder = new Map();
  const noteLayer = (name) => {
    if (!layerOrder.has(name)) layerOrder.set(name, layerOrder.size);
    return layerOrder.get(name);
  };
  const subLayer = (outer, name) => (outer ? `${outer}.${name}` : name);
  const media = (text) => {
    if (!text || /^\s*all\s*$/i.test(text)) return true;
    try {
      return win.matchMedia(text).matches;
    } catch {
      return true;
    }
  };
  const supports = (text) => {
    try {
      return win.CSS?.supports ? win.CSS.supports(text) : true;
    } catch {
      return true;
    }
  };
  const within = (ctx, condition, active = true) => ({
    ...ctx,
    conditions: [...ctx.conditions, condition],
    active: ctx.active && active,
  });
  const inLayer = (ctx, name) => {
    const layer = subLayer(ctx.layer, name);
    return { ...ctx, layer, layerRank: noteLayer(layer) };
  };

  const walkList = (rules, ctx) => {
    let list;
    try {
      list = Array.from(rules || []);
    } catch {
      return;
    }
    for (const rule of list) walkRule(rule, ctx);
  };

  const walkRule = (rule, ctx) => {
    switch (kindOf(rule)) {
      case "style": {
        visit(rule, ctx);
        if (rule.cssRules?.length) {
          const parents = splitSelectorList(rule.selectorText).map((s) =>
            resolveNested(s, ctx.parents),
          );
          walkList(rule.cssRules, { ...ctx, parents });
        }
        return;
      }
      case "decls":
        if (ctx.parents) visit(rule, ctx);
        return;
      case "media":
        return walkList(
          rule.cssRules,
          within(ctx, `@media ${rule.media.mediaText}`, media(rule.media.mediaText)),
        );
      case "supports":
        return walkList(
          rule.cssRules,
          within(ctx, `@supports ${rule.conditionText}`, supports(rule.conditionText)),
        );
      case "container":
        return walkList(rule.cssRules, within(ctx, `@container ${rule.conditionText}`));
      case "scope":
        return walkList(rule.cssRules, within(ctx, "@scope"));
      case "layer":
        return walkList(
          rule.cssRules,
          inLayer(ctx, rule.name || `<anonymous ${++anonymous}>`),
        );
      case "layer-names":
        for (const name of Array.from(rule.nameList || [])) {
          noteLayer(subLayer(ctx.layer, name));
        }
        return;
      case "import": {
        let next = ctx;
        if (rule.layerName != null) {
          next = inLayer(next, rule.layerName || `<anonymous ${++anonymous}>`);
        }
        const text = rule.media?.mediaText;
        if (text) next = within(next, `@media ${text}`, media(text));
        return walkSheet(rule.styleSheet, next);
      }
    }
  };

  const walkSheet = (sheet, ctx) => {
    if (!sheet || sheet.disabled || skipSheet?.(sheet)) return;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      skipped++; // cross-origin stylesheet: unreadable by design
      return;
    }
    let next = { ...ctx, sheet: sheetLabel(sheet) };
    const text = sheet.media?.mediaText;
    if (text) next = within(next, `@media ${text}`, media(text));
    walkList(rules, next);
  };

  const sheets = [
    ...Array.from(root?.styleSheets || []),
    ...Array.from(root?.adoptedStyleSheets || []),
  ];
  for (const sheet of sheets) {
    walkSheet(sheet, {
      sheet: null,
      conditions: [],
      active: true,
      layer: null,
      layerRank: Infinity,
      parents: null,
    });
  }
  return { skipped };
};

// A rule's own selectors as authored (relative, for nested rules), minus the
// twins forceState() adds.
const ownSelectors = (rule) =>
  splitSelectorList(rule.selectorText ?? "&").filter(
    (s) => !s.includes(FORCE_ATTR),
  );

// Cascade order, winner first: unlayered beats layered (later layers beat
// earlier ones), then specificity, then source order.
const byCascade = (x, y) =>
  y.layerRank - x.layerRank ||
  compareSpecificity(y.specificity, x.specificity) ||
  y.order - x.order;

// Every rule that styles `element`, in any state, with its context, winner
// first within each state. One entry per rule and state (a selector list
// counts once, with its most specific matching selector).
//   { rule, selector, ruleSelector, state, also, sheet, conditions, active,
//     layer, layerRank, order, specificity }
export const collectRules = (element, { root, win = window, skipSheet } = {}) => {
  const scope = root || element.getRootNode?.() || document;
  const entries = [];
  let order = 0;
  const { skipped } = walkStyleRules(
    scope,
    (rule, ctx) => {
      const resolved = ownSelectors(rule).map((s) => resolveNested(s, ctx.parents));
      const ruleOrder = order++;
      const best = new Map(); // state → entry
      for (const selector of resolved) {
        const spec = specificity(selector);
        for (const variant of expandStates(selector)) {
          const c = classifySelector(variant);
          let hit = false;
          try {
            hit = element.matches(c.base);
          } catch {}
          if (!hit) continue;
          const prev = best.get(c.state);
          if (prev && compareSpecificity(prev.specificity, spec) >= 0) continue;
          best.set(c.state, {
          rule,
          selector,
          ruleSelector: resolved.join(", "),
          state: c.state,
          also: c.also,
          sheet: ctx.sheet,
          conditions: ctx.conditions,
          active: ctx.active,
          layer: ctx.layer,
          layerRank: ctx.layerRank,
          order: ruleOrder,
          specificity: spec,
          });
        }
      }
      entries.push(...best.values());
    },
    { win, skipSheet },
  );
  entries.sort(byCascade);
  return { entries, skipped };
};

// Entries grouped by state, each state's list in cascade order.
export const groupByState = (entries) => {
  const groups = Object.fromEntries(STATES.map((s) => [s, []]));
  for (const e of entries) (groups[e.state] ||= []).push(e);
  return groups;
};

// Shorthands that set a longhand. A shorthand holding var() leaves its
// longhands empty in CSSOM ("pending substitution"), so a rule that says
// `background: var(--x)` is only found through `background`.
const SHORTHANDS = [
  ["background", /^background-/],
  ["border", /^border-((top|right|bottom|left)-)?(width|style|color)$/],
  ["border-top", /^border-top-(width|style|color)$/],
  ["border-right", /^border-right-(width|style|color)$/],
  ["border-bottom", /^border-bottom-(width|style|color)$/],
  ["border-left", /^border-left-(width|style|color)$/],
  ["border-color", /^border-(top|right|bottom|left)-color$/],
  ["border-width", /^border-(top|right|bottom|left)-width$/],
  ["border-style", /^border-(top|right|bottom|left)-style$/],
  ["border-radius", /^border-(top|bottom)-(left|right)-radius$/],
  ["padding", /^padding-(top|right|bottom|left)$/],
  ["padding-inline", /^padding-(left|right)$/],
  ["padding-block", /^padding-(top|bottom)$/],
  ["margin", /^margin-(top|right|bottom|left)$/],
  ["margin-inline", /^margin-(left|right)$/],
  ["margin-block", /^margin-(top|bottom)$/],
  ["inset", /^(top|right|bottom|left)$/],
  ["font", /^(font-(style|variant|weight|stretch|size|family)|line-height)$/],
  ["gap", /^(row|column)-gap$/],
  ["flex", /^flex-(grow|shrink|basis)$/],
  ["outline", /^outline-(color|style|width)$/],
  ["text-decoration", /^text-decoration-(line|color|style|thickness)$/],
  ["transition", /^transition-/],
  ["animation", /^animation-/],
  ["overflow", /^overflow-(x|y)$/],
  ["list-style", /^list-style-/],
];

// How a declaration block sets `prop`, directly or through a shorthand:
// { value, priority, via } — or null.
export const declaredIn = (style, prop) => {
  if (!style) return null;
  const value = style.getPropertyValue(prop);
  if (value) return { value, priority: style.getPropertyPriority(prop), via: prop };
  for (const [short, covers] of SHORTHANDS) {
    if (!covers.test(prop)) continue;
    const v = style.getPropertyValue(short);
    if (v) return { value: v, priority: style.getPropertyPriority(short), via: short };
  }
  return null;
};

// The rule entry whose declaration of `prop` the element actually gets in
// its default state: !important declarations first (earlier layers win
// those), then cascade order.
export const winningEntry = (entries, prop) => {
  const has = entries.filter(
    (e) => e.state === "default" && e.active && declaredIn(e.rule.style, prop),
  );
  const important = has.filter(
    (e) => declaredIn(e.rule.style, prop).priority === "important",
  );
  if (important.length) {
    return important.sort(
      (x, y) =>
        x.layerRank - y.layerRank ||
        compareSpecificity(y.specificity, x.specificity) ||
        y.order - x.order,
    )[0];
  }
  return has[0] || null;
};

// ---------- Forced states ----------

const STATE_TOKEN_RE = /:(hover|active|focus)/i;

// Show `element` in a state without a real pointer. Every rule that needs one
// of the state's pseudo-classes gets a twin selector keyed to an attribute
// (`.a:hover` → `.a:hover, .a[data-tsayru-force~="hover"]`), and the
// attribute goes on the element (and its ancestors, for hover). It is the
// same rule in the same place in the cascade, so the forced look matches the
// real one and edits to the rule show in it at once. Rules from every
// readable sheet are twinned, not only the element's: hovering a menu item
// also shows what the menu's :hover reveals elsewhere. Returns the undo.
export const forceState = (element, state, { root, win = window } = {}) => {
  const set = FORCE_SETS[state];
  if (!set || !element) return () => {};
  const scope = root || element.getRootNode?.() || document;
  const names = [...new Set([...set.self, ...set.up])];
  const touched = [];
  walkStyleRules(
    scope,
    (rule) => {
      const text = rule.selectorText;
      if (text == null || !STATE_TOKEN_RE.test(text)) return;
      const list = splitSelectorList(text);
      const twins = [];
      for (const sel of list) {
        if (sel.includes(FORCE_ATTR)) continue;
        const twin = forceSelector(sel, names);
        if (twin !== sel) twins.push(twin);
      }
      if (!twins.length) return;
      try {
        rule.selectorText = [...list, ...twins].join(", ");
        touched.push([rule, text]);
      } catch {}
    },
    { win },
  );
  const marked = [];
  const mark = (node, words) => {
    const prev = node.getAttribute(FORCE_ATTR);
    marked.push([node, prev]);
    const all = new Set([...(prev || "").split(/\s+/).filter(Boolean), ...words]);
    node.setAttribute(FORCE_ATTR, [...all].join(" "));
  };
  mark(element, set.self);
  for (let p = element.parentElement; p; p = p.parentElement) mark(p, set.up);
  return () => {
    for (const [rule, text] of touched) {
      try {
        if (rule.selectorText !== text) rule.selectorText = text;
      } catch {}
    }
    for (const [node, prev] of marked.reverse()) {
      if (prev == null) node.removeAttribute(FORCE_ATTR);
      else node.setAttribute(FORCE_ATTR, prev);
    }
  };
};
