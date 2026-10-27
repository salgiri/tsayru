// Style editor. ⌘+click (Ctrl+click on Windows/Linux) any element while the
// sidebar is open → a panel to restyle it live: quick controls for colour,
// border, shadow, spacing and type, and every CSS rule that styles it, state
// by state (:hover, :focus, ::before, …), editable like DevTools. Edits
// preview on the page; closing the panel saves them as a task that lists
// each change (old → new, and the rule that set the old value), so Claude can
// make the same change in the source.
//
// This module owns the session (what was touched, what it was before),
// forced states, saving, and the panel's isolated host. The panel's UI lives
// in stylepanel.js / stylequick.js / stylerules.js.

import { el, state, refs, persist, sidebarVisible } from "./core.js";
import { buildSelector, shortLabel } from "./selector.js";
import {
  detectFramework,
  snapshotComputedStyles,
  snapshotHtml,
  snapshotEnv,
} from "./framework.js";
import { captureElement } from "./screenshot.js";
import { renderSidebar, flash } from "./sidebar.js";
import {
  collectRules,
  groupByState,
  winningEntry,
  declaredIn,
  forceState,
  parseDeclarations,
} from "./cssrules.js";
import { mergeChanges } from "./stylechanges.js";
import { mountPanel } from "./stylepanel.js";
import { PANEL_CSS } from "./stylepanel-css.js";
import { createShadowHost } from "./shadowhost.js";
import { ensureFonts } from "./fonts.js";

// Properties an element inherits — their value may come from an ancestor's rule.
const INHERITED = new Set([
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-transform",
  "white-space",
]);

// Page-load values of everything any session touched: a second visit to the
// same element must still report the real "before", not the last preview.
const pageOriginals = { inline: new WeakMap(), rules: new WeakMap() };
// Rules the editor created ("+ New :hover rule"), across sessions:
// rule → { selector, state, userImportant: Set<prop> }.
const createdRules = new WeakMap();
const createdSheets = new WeakMap(); // document / shadow root → CSSStyleSheet
const ruleIds = new WeakMap();
let nextRuleId = 1;
const ruleId = (rule) => {
  if (!ruleIds.has(rule)) ruleIds.set(rule, nextRuleId++);
  return ruleIds.get(rule);
};

let session = null;
let host = null;
let lastPos = null; // where the user last dragged the panel
let queue = Promise.resolve(); // open/close run one at a time

const supports = (prop, value) => {
  try {
    return String(prop).startsWith("--") || CSS.supports(prop, value);
  } catch {
    return true;
  }
};

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);

// ---------- Session ----------

const newSession = (target, deep) => {
  const root = target.getRootNode();
  return {
    target,
    deep: deep && target.contains(deep) ? deep : target, // the node actually clicked
    root: typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root : document,
    selector: buildSelector(target),
    label: shortLabel(target),
    framework: null,
    frameworkPromise: detectFramework(target).catch(() => null),
    ctx: {
      computedStyles: snapshotComputedStyles(target),
      html: snapshotHtml(target),
      env: snapshotEnv(),
    },
    touched: new Map(), // key → { kind: "inline" | "rule", prop, rule?, meta?, start }
    created: new Set(), // created rules this session edited or made
    createdHere: new Set(), // … of which made in this session
    createdStart: new Map(), // created rule → Map(prop → value) at first touch
    disabled: new Map(), // rule → Map(prop → { value, priority }) unticked in the panel
    rules: null,
    forced: null,
    unforce: null,
    note: "",
    onChange: null,
  };
};

const changed = (s) => {
  try {
    s.onChange?.();
  } catch (err) {
    console.warn("[tsayru] style panel refresh failed:", err);
  }
};

const rulesOf = (s, refresh = false) => {
  if (!s.rules || refresh) {
    const { entries, skipped } = collectRules(s.target, { root: s.root });
    s.rules = { entries, skipped, groups: groupByState(entries) };
  }
  return s.rules;
};

const describe = (e) => ({
  selector: e.ruleSelector,
  sheet: e.sheet,
  conditions: e.conditions,
});

// Which rule gives the element its current value of `prop` — the pointer
// Claude needs to change the source instead of bolting on an override.
const originOf = (s, prop) => {
  if (declaredIn(s.target.style, prop)) return { selector: "style attribute" };
  const own = winningEntry(rulesOf(s).entries, prop);
  if (own) return describe(own);
  if (!INHERITED.has(prop)) return null;
  let node = s.target.parentElement;
  for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
    const found = winningEntry(collectRules(node, { root: s.root }).entries, prop);
    if (found) return { ...describe(found), inherited: true };
  }
  return null;
};

// ---------- Inline edits (Quick tab, element.style card) ----------

const touchInline = (s, prop) => {
  let map = pageOriginals.inline.get(s.target);
  if (!map) pageOriginals.inline.set(s.target, (map = new Map()));
  if (!map.has(prop)) {
    map.set(prop, {
      value: s.target.style.getPropertyValue(prop),
      priority: s.target.style.getPropertyPriority(prop),
      computed: getComputedStyle(s.target).getPropertyValue(prop).trim(),
      origin: originOf(s, prop),
    });
  }
  const key = `inline\u0001${prop}`;
  if (!s.touched.has(key)) {
    s.touched.set(key, {
      kind: "inline",
      prop,
      start: {
        value: s.target.style.getPropertyValue(prop),
        priority: s.target.style.getPropertyPriority(prop),
      },
    });
  }
  return map.get(prop);
};

// Previews go in as inline !important so they win whatever the page says.
const setInline = (s, prop, value) => {
  const v = String(value ?? "").trim();
  if (!v) {
    resetInline(s, prop);
    return true;
  }
  if (!supports(prop, v)) return false;
  touchInline(s, prop);
  s.target.style.setProperty(prop, v, "important");
  changed(s);
  return true;
};

// Back to what the page had.
const resetInline = (s, prop) => {
  const orig = touchInline(s, prop);
  if (orig.value) s.target.style.setProperty(prop, orig.value, orig.priority);
  else s.target.style.removeProperty(prop);
  changed(s);
};

// Drop the declaration outright — also one the page itself had inline.
const removeInline = (s, prop) => {
  touchInline(s, prop);
  s.target.style.removeProperty(prop);
  changed(s);
};

const inlineChanged = (s, prop) => {
  const orig = pageOriginals.inline.get(s.target)?.get(prop);
  return !!orig && s.target.style.getPropertyValue(prop) !== orig.value;
};

// ---------- Rule edits (CSS tab) ----------

const touchRule = (s, entry, prop) => {
  const rule = entry.rule;
  if (createdRules.has(rule)) {
    s.created.add(rule);
    if (!s.createdStart.has(rule)) {
      s.createdStart.set(
        rule,
        new Map(parseDeclarations(rule.style.cssText).map((d) => [d.name, d.value])),
      );
    }
    return;
  }
  let map = pageOriginals.rules.get(rule);
  if (!map) pageOriginals.rules.set(rule, (map = new Map()));
  if (!map.has(prop)) {
    map.set(prop, {
      value: rule.style.getPropertyValue(prop),
      priority: rule.style.getPropertyPriority(prop),
    });
  }
  const key = `rule\u0001${ruleId(rule)}\u0001${prop}`;
  if (!s.touched.has(key)) {
    s.touched.set(key, {
      kind: "rule",
      rule,
      prop,
      meta: describe(entry),
      start: {
        value: rule.style.getPropertyValue(prop),
        priority: rule.style.getPropertyPriority(prop),
      },
    });
  }
};

const setRuleProp = (s, entry, prop, value, important = false) => {
  const v = String(value ?? "").trim();
  if (!prop || !v) return false;
  if (!supports(prop, v)) return false;
  touchRule(s, entry, prop);
  const created = createdRules.get(entry.rule);
  if (created) {
    if (important) created.userImportant.add(prop);
    else created.userImportant.delete(prop);
  }
  // A created rule previews as !important: its selector is the element's
  // own path, which page rules with more classes would otherwise beat.
  entry.rule.style.setProperty(prop, v, important || created ? "important" : "");
  s.disabled.get(entry.rule)?.delete(prop);
  changed(s);
  return true;
};

const removeRuleProp = (s, entry, prop) => {
  touchRule(s, entry, prop);
  entry.rule.style.removeProperty(prop);
  s.disabled.get(entry.rule)?.delete(prop);
  changed(s);
};

// Untick: remove, but remember the declaration so ticking brings it back.
const disableRuleProp = (s, entry, prop) => {
  const style = entry.rule.style;
  const saved = { value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) };
  if (!saved.value) return;
  touchRule(s, entry, prop);
  if (!s.disabled.has(entry.rule)) s.disabled.set(entry.rule, new Map());
  s.disabled.get(entry.rule).set(prop, saved);
  style.removeProperty(prop);
  changed(s);
};

const enableRuleProp = (s, entry, prop) => {
  const saved = s.disabled.get(entry.rule)?.get(prop);
  if (!saved) return;
  touchRule(s, entry, prop);
  entry.rule.style.setProperty(prop, saved.value, saved.priority);
  s.disabled.get(entry.rule).delete(prop);
  changed(s);
};

const ruleChanged = (rule, prop) => {
  const orig = pageOriginals.rules.get(rule)?.get(prop);
  return (
    !!orig &&
    (rule.style.getPropertyValue(prop) !== orig.value ||
      rule.style.getPropertyPriority(prop) !== orig.priority)
  );
};

// The editor's own stylesheet for new rules, adopted where the element lives.
const createdSheet = (root) => {
  let sheet = createdSheets.get(root);
  if (sheet) return sheet;
  try {
    sheet = new CSSStyleSheet();
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    const style = el("style", { id: "tsayru-new-rules" });
    (root.head || root).appendChild(style);
    sheet = style.sheet;
  }
  sheet.__tsayruLabel = "new rule (tsayru)";
  createdSheets.set(root, sheet);
  return sheet;
};

const deleteRule = (rule) => {
  const sheet = rule.parentStyleSheet;
  const i = sheet ? Array.from(sheet.cssRules).indexOf(rule) : -1;
  if (i >= 0) sheet.deleteRule(i);
  createdRules.delete(rule);
};

// "+ New :hover rule for this element" — for states the page doesn't style yet.
const addRule = (s, st) => {
  const base = s.selector.split(" >>> ").pop();
  const selector = st === "default" ? base : `${base}${st}`;
  const sheet = createdSheet(s.root);
  let rule;
  try {
    rule = sheet.cssRules[sheet.insertRule(`${selector} {}`, sheet.cssRules.length)];
  } catch {
    return null;
  }
  createdRules.set(rule, { selector, state: st, userImportant: new Set() });
  s.created.add(rule);
  s.createdHere.add(rule);
  s.createdStart.set(rule, new Map());
  // A pseudo-element that isn't drawn yet needs `content` to appear at all.
  if (st === "::before" || st === "::after") {
    let content = "none";
    try {
      content = getComputedStyle(s.target, st).content;
    } catch {}
    if (/^(none|normal)?$/.test(content)) rule.style.setProperty("content", '""', "important");
  }
  s.rules = null;
  if (s.forced) force(s, s.forced); // twin the new rule too
  changed(s);
  return rule;
};

// ---------- Forced states ----------

const force = (s, st) => {
  if (s.unforce) {
    s.unforce();
    s.unforce = null;
    s.forced = null;
  }
  if (st) {
    s.unforce = forceState(s.target, st, { root: s.root });
    s.forced = st;
  }
};

// ---------- Changes ----------

const declText = (d) => (d.value ? `${d.value}${d.priority ? " !important" : ""}` : null);

// Everything this session touched, as change records. Properties put back
// where they started are included as no-ops: merging them into an earlier
// task for the same element cancels what that task said about them.
const sessionChanges = (s) => {
  const out = [];
  for (const t of s.touched.values()) {
    if (t.kind === "inline") {
      const orig = pageOriginals.inline.get(s.target)?.get(t.prop);
      if (!orig) continue;
      const cur = s.target.style.getPropertyValue(t.prop);
      out.push({
        scope: "element",
        selector: s.selector,
        property: t.prop,
        before: orig.computed || null,
        after: cur === orig.value ? orig.computed || null : cur || null,
        origin: orig.origin,
      });
    } else {
      const orig = pageOriginals.rules.get(t.rule)?.get(t.prop);
      if (!orig) continue;
      out.push({
        scope: "rule",
        ...t.meta,
        property: t.prop,
        before: declText(orig),
        after: declText({
          value: t.rule.style.getPropertyValue(t.prop),
          priority: t.rule.style.getPropertyPriority(t.prop),
        }),
      });
    }
  }
  for (const rule of s.created) {
    const meta = createdRules.get(rule);
    if (!meta) continue;
    const now = new Map(parseDeclarations(rule.style.cssText).map((d) => [d.name, d.value]));
    const names = new Set([...(s.createdStart.get(rule)?.keys() || []), ...now.keys()]);
    for (const name of names) {
      const v = now.get(name);
      out.push({
        scope: "new-rule",
        selector: meta.selector,
        state: meta.state,
        property: name,
        before: null,
        after: v == null ? null : `${v}${meta.userImportant.has(name) ? " !important" : ""}`,
      });
    }
  }
  return out;
};

// Undo this session's edits (earlier sessions' previews stay).
const revert = (s) => {
  for (const t of s.touched.values()) {
    const style = t.kind === "inline" ? s.target.style : t.rule.style;
    if (t.start.value) style.setProperty(t.prop, t.start.value, t.start.priority);
    else style.removeProperty(t.prop);
  }
  for (const rule of s.created) {
    if (s.createdHere.has(rule)) {
      deleteRule(rule);
      continue;
    }
    rule.style.cssText = "";
    for (const [name, value] of s.createdStart.get(rule) || []) {
      rule.style.setProperty(name, value, "important");
    }
  }
  s.touched.clear();
  s.created.clear();
  s.createdHere.clear();
  s.createdStart.clear();
  s.disabled.clear();
  s.rules = null;
  if (s.forced) force(s, s.forced);
  changed(s);
};

// What saving the session would do: a new task, or the open style task for
// the same element with these changes folded in (one element, one task).
// null when there is nothing to save.
const planSave = (s) => {
  const changes = sessionChanges(s);
  const note = s.note.trim();
  if (!changes.length && !note) return null;
  const existing = state.tasks.find(
    (t) =>
      Array.isArray(t.styleChanges) &&
      !t.done &&
      t.selector === s.selector &&
      t.url === location.href,
  );
  const merged = mergeChanges(existing?.styleChanges || [], changes);
  if (!existing && !merged.length && !note) return null;
  return { note, existing, merged };
};

const applySave = (s, { note, existing, merged }, { framework = null, screenshot = null } = {}) => {
  if (existing) {
    existing.styleChanges = merged;
    if (screenshot) existing.screenshot = screenshot;
    // Idempotent: a page restored from the back/forward cache saves again.
    if (note && !String(existing.text || "").split("\n").includes(note)) {
      existing.text = existing.text ? `${existing.text}\n${note}` : note;
    }
    if (!merged.length && !existing.text) state.tasks.splice(state.tasks.indexOf(existing), 1);
  } else {
    state.tasks.push({
      id: crypto.randomUUID(),
      selector: s.selector,
      label: `Style: ${s.label}`,
      text: note,
      url: location.href,
      framework: framework || null,
      computedStyles: s.ctx.computedStyles,
      screenshot: screenshot || null,
      html: s.ctx.html,
      env: s.ctx.env,
      pageErrors: null,
      styleChanges: merged,
      done: false,
      addedAt: new Date().toISOString(),
    });
  }
};

const saveSession = async (s) => {
  const plan = planSave(s);
  if (!plan) return;
  const [framework, screenshot] = await Promise.all([
    withTimeout(s.frameworkPromise, 250),
    plan.merged.length ? captureElement(s.target) : null,
  ]);
  applySave(s, plan, { framework, screenshot });
  await persist();
  renderSidebar();
  const n = plan.merged.length;
  const what = `${n} change${n === 1 ? "" : "s"}`;
  flash(plan.existing ? `Style task updated: ${what}` : `Style task saved: ${what}`, { iconName: "sliders" });
};

// Reloading with the panel open must not lose the edits: record them
// (without the screenshot — there is no time for one) as the page goes.
const onPageHide = () => {
  const s = session;
  const plan = s && planSave(s);
  if (!plan) return;
  applySave(s, plan, { framework: s.framework });
  persist();
};

// ---------- Panel host ----------

// Keys typed in the panel that no field took (shadowhost.js stops every key
// before the page sees it): Escape closes the editor.
const onPanelKey = (e) => {
  if (e.type === "keydown" && e.key === "Escape") {
    e.preventDefault();
    closeStyleEditor();
  }
};

const tagOf = (node) => {
  const id = node.id ? `#${node.id}` : "";
  const cls = [...node.classList]
    .filter((c) => !c.startsWith("tsayru-"))
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  return `${node.tagName.toLowerCase()}${id}${cls}`;
};

// Keep the outline glued to the element (or to the breadcrumb being hovered)
// through scrolling, layout shifts and the edits themselves.
const track = () => {
  if (!host) return;
  host.raf = requestAnimationFrame(track);
  const node = host.preview || session?.target;
  const box = host.outline;
  if (!node || !node.isConnected) {
    box.style.display = "none";
    host.last = "";
    if (session && node === session.target) session.onDetached?.();
    return;
  }
  const r = node.getBoundingClientRect();
  const key = `${r.left}|${r.top}|${r.width}|${r.height}|${!!host.preview}`;
  if (key === host.last) return;
  host.last = key;
  box.style.display = "block";
  box.style.transform = `translate(${r.left}px, ${r.top}px)`;
  box.style.width = `${r.width}px`;
  box.style.height = `${r.height}px`;
  box.classList.toggle("preview", !!host.preview);
  box.classList.toggle("below", r.top < 34);
  const [name, size] = box.firstChild.children;
  name.textContent = tagOf(node);
  size.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
};

const ensureHost = () => {
  if (host) return host;
  const shell = createShadowHost({
    tag: "tsayru-style",
    className: "tsayru-style-host",
    css: PANEL_CSS,
    onKey: onPanelKey,
  });
  const outline = el("div", { class: "outline" }, el("div", { class: "outline-tag" }, el("b"), el("span")));
  shell.root.appendChild(outline);
  window.addEventListener("pagehide", onPageHide);
  ensureFonts();
  refs.styleHost = shell.node;
  host = { shell, node: shell.node, root: shell.root, outline, panel: null, preview: null, raf: 0, last: "" };
  host.raf = requestAnimationFrame(track);
  return host;
};

const destroyHost = () => {
  if (!host) return;
  cancelAnimationFrame(host.raf);
  window.removeEventListener("pagehide", onPageHide);
  host.shell.destroy();
  refs.styleHost = null;
  host = null;
};

const PANEL_W = 340;
const SIDEBAR_W = 368;
const MARGIN = 12;

const clampPos = ({ left, top }) => ({
  left: Math.max(MARGIN - PANEL_W + 80, Math.min(left, innerWidth - 80)),
  top: Math.max(0, Math.min(top, innerHeight - 40)),
});

// Where the panel opens: where the user last dragged it, else on the side of
// the viewport away from the element (left of the sidebar when that's free).
const placePanel = (panel, target) => {
  let pos = lastPos;
  if (!pos) {
    const r = target.getBoundingClientRect();
    const rightSide = innerWidth - PANEL_W - MARGIN - (sidebarVisible() ? SIDEBAR_W + MARGIN : 0);
    const elementOnLeft = r.left + r.width / 2 < innerWidth / 2;
    pos = { left: elementOnLeft ? Math.max(MARGIN, rightSide) : MARGIN, top: MARGIN };
  }
  pos = clampPos(pos);
  panel.style.left = `${pos.left}px`;
  panel.style.top = `${pos.top}px`;
};

const makeApi = (s) => ({
  get target() {
    return s.target;
  },
  deep: s.deep,
  label: s.label,
  selector: s.selector,
  framework: () => s.framework,
  computed: () => getComputedStyle(s.target),
  focused: () => host?.root.activeElement || null,
  set onChange(fn) {
    s.onChange = fn;
  },
  set onFramework(fn) {
    s.onFramework = fn;
  },
  set onDetached(fn) {
    s.onDetached = fn;
  },
  // inline: Quick tab and the element.style card
  inlineDecls: () => parseDeclarations(s.target.style.cssText),
  setInline: (prop, value) => setInline(s, prop, value),
  resetInline: (prop) => resetInline(s, prop),
  removeInline: (prop) => removeInline(s, prop),
  inlineChanged: (prop) => inlineChanged(s, prop),
  // rules: CSS tab
  rules: (refresh) => rulesOf(s, refresh),
  setRuleProp: (entry, prop, value, important) => setRuleProp(s, entry, prop, value, important),
  removeRuleProp: (entry, prop) => removeRuleProp(s, entry, prop),
  disableRuleProp: (entry, prop) => disableRuleProp(s, entry, prop),
  enableRuleProp: (entry, prop) => enableRuleProp(s, entry, prop),
  disabledProps: (rule) => s.disabled.get(rule) || new Map(),
  ruleChanged,
  isCreated: (rule) => createdRules.has(rule),
  shownImportant: (rule, d) =>
    createdRules.has(rule) ? createdRules.get(rule).userImportant.has(d.name) : d.important,
  addRule: (st) => addRule(s, st),
  force: (st) => force(s, st),
  forced: () => s.forced,
  matchCount: (selector) => {
    try {
      return s.root.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  },
  // session
  changeCount: () => mergeChanges([], sessionChanges(s)).length,
  setNote: (text) => {
    s.note = String(text || "");
  },
  revert: () => revert(s),
  close: () => closeStyleEditor(),
  select: (node) => openStyleEditor(node, { deep: node.contains(s.deep) ? s.deep : node }),
  pseudoContent: (st) => {
    try {
      return getComputedStyle(s.target, st).content;
    } catch {
      return "none";
    }
  },
  preview: (node) => {
    if (host) host.preview = node || null;
  },
  moved: (pos) => {
    lastPos = clampPos(pos);
    return lastPos;
  },
});

// ---------- Open / close ----------

const finish = async (s, { save }) => {
  if (save) {
    try {
      await saveSession(s);
    } catch (err) {
      console.warn("[tsayru] saving style task failed:", err);
      flash("Couldn't save the style task", { warn: true });
    }
  }
  force(s, null);
  if (host?.panel) {
    host.panel.remove();
    host.panel = null;
    host.preview = null;
  }
  if (session === s) session = null;
};

const open = async (target, deep) => {
  if (!(target instanceof Element) || !target.isConnected) return;
  if (session?.target === target) return;
  if (session) await finish(session, { save: true });
  ensureHost();
  const s = newSession(target, deep);
  session = s;
  s.frameworkPromise.then((fw) => {
    s.framework = fw;
    s.onFramework?.(fw);
  });
  const panel = mountPanel(makeApi(s));
  host.panel = panel;
  host.root.appendChild(panel);
  placePanel(panel, target);
};

export const isStyleEditorOpen = () => !!session;

// `deep` is the node actually clicked, when `target` is the control around it.
export const openStyleEditor = (target, { deep } = {}) => {
  queue = queue
    .then(() => open(target, deep))
    .catch((err) => console.warn("[tsayru] style editor:", err));
  return queue;
};

// Closing saves by default — ⌘+clicking on through a page should never lose
// edits. `save: false` keeps the previews but drops the record.
export const closeStyleEditor = ({ save = true } = {}) => {
  queue = queue
    .then(async () => {
      if (session) await finish(session, { save });
      destroyHost();
    })
    .catch((err) => console.warn("[tsayru] style editor:", err));
  return queue;
};
