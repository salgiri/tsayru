// Inspector mode: highlight overlay, mouse/click/keyboard handlers.
// Sidebar visibility (show/hide/toggle) — kept here because hiding the panel must turn off inspector.

import { el, state, refs, bus, on, sidebarVisible, IS_MAC, restore, watchTasks } from "./core.js";
import {
  snapshotComputedStyles,
  snapshotHtml,
  snapshotEnv,
  ensureMainWorld,
  collectPageErrors,
} from "./framework.js";
import { recentContentErrors } from "./errors.js";
import { deepElementFromPoint } from "./selector.js";
import { isOurHost } from "./shadowhost.js";
import { uiLayer } from "./ui.js";
import { fontsReady } from "./fonts.js";
import { describeNode } from "./stylewidgets.js";
import { captureElement } from "./screenshot.js";
import { ensureSidebar, renderSidebar, renderDeck } from "./sidebar.js";
import { openModal, quickAddTask } from "./modal.js";
import {
  openStyleEditor,
  closeStyleEditor,
  isStyleEditorOpen,
} from "./styleeditor.js";

// ---------- Highlight overlay ----------
// What a click would pick: an outline plus a tag naming the element, inside
// the UI shadow root (viewport coordinates — the host is position: fixed).

export const ensureOverlay = () => {
  if (refs.highlight) return;
  refs.highlight = el(
    "div",
    { class: "hl" },
    el("div", { class: "hl-tag" }, el("b"), el("span")),
  );
  uiLayer().appendChild(refs.highlight);
};

// HARD INVARIANT: the highlight may only ever be visible while the sidebar is
// open. With the sidebar hidden there is no legitimate caller (inspector and
// hover-preview both live in the sidebar), so any attempt to show it then is
// a bug — coerce it to hide instead of trusting call sites.
let shown = null; // the element the highlight sits on

export const moveHighlight = (target) => {
  if (!refs.highlight) return;
  if (target && !sidebarVisible()) target = null;
  shown = target || null;
  const hl = refs.highlight;
  if (!target) {
    hl.style.display = "none";
    return;
  }
  const r = target.getBoundingClientRect();
  hl.style.display = "block";
  hl.style.transform = `translate(${r.left - 3}px, ${r.top - 3}px)`;
  hl.style.width = `${r.width + 6}px`;
  hl.style.height = `${r.height + 6}px`;
  // The tag sits above; below when there's no room; inside for huge elements.
  hl.classList.toggle("below", r.top < 40 && r.bottom < innerHeight - 40);
  hl.classList.toggle("inside", r.top < 40 && r.bottom >= innerHeight - 40);
  const [name, size] = hl.firstChild.children;
  name.textContent = describeNode(target, 2);
  size.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
};

// ---------- Inspector state ----------

// `mode`: "task" — a click opens the task dialog; "style" — a click opens the
// style editor (the sidebar's Restyle key, same as ⌘/Ctrl+click).
export const setInspecting = (on, mode = "task") => {
  state.inspecting = on;
  state.pickMode = on ? mode : "task";
  document.documentElement.classList.toggle("tsayru-inspecting", on);
  if (!on) {
    // Clear the hover target too — a stale `state.hovered` was the source of
    // "ghost" highlights: scroll/resize handlers happily re-showed it long
    // after the inspector was turned off.
    state.hovered = null;
    moveHighlight(null);
  }
  // Warm up the MAIN-world fiber probe so the first click's framework
  // detection doesn't race the lazy injection.
  if (on) ensureMainWorld();
  renderDeck();
};

// ---------- Sidebar visibility ----------
// Hiding the sidebar always turns inspector OFF (safety: no crosshair without UI).

// Opening reads the tasks fresh (another tab may have changed them) and, the
// first time, waits a moment for the UI font so the panel never re-flows in
// front of the user. Both take milliseconds; the toolbar click itself costs more.
let fontsWaited = false;
const open = async () => {
  ensureListeners();
  await Promise.all([restore(), fontsWaited || fontsReady(150)]);
  fontsWaited = true;
  ensureOverlay();
  ensureSidebar();
  renderSidebar();
  refs.sidebar.classList.remove("hidden");
  watchTasks(true);
};

// The panel ends up the way the last request asked, however the async
// opening interleaves with rapid toggles.
let wanted = false;
let opening = null;

export const showSidebar = () => {
  wanted = true;
  if (sidebarVisible()) return Promise.resolve();
  opening ||= open().finally(() => {
    opening = null;
    if (!wanted) hideSidebar();
  });
  return opening;
};

export const hideSidebar = () => {
  wanted = false;
  watchTasks(false);
  if (refs.sidebar) refs.sidebar.classList.add("hidden");
  if (state.inspecting) setInspecting(false);
  moveHighlight(null); // a hover preview lives outside the panel
  state.editingTaskId = null;
  closeStyleEditor();
};

// Toolbar icon / hotkey. The first press on a page opens the panel — it used
// to create it and hide it again in the same call, so it took two clicks.
export const toggleSidebar = () => (wanted ? hideSidebar() : showSidebar());

// The sidebar's keys — the only switches for inspector state. Each one stops
// its own mode and switches over from the other.
export const toggleInspector = () =>
  setInspecting(!(state.inspecting && state.pickMode === "task"), "task");

export const toggleStylePick = () =>
  setInspecting(!(state.inspecting && state.pickMode === "style"), "style");

// ---------- Event handlers ----------

// Our own UI: events from inside a closed shadow root arrive retargeted to its host.
const isOurChrome = (node) => isOurHost(node);

// ⌘+click on macOS, Ctrl+click elsewhere opens the style editor — only while
// the sidebar is visible, so the gesture is never taken from a page the user
// isn't working on (hide the sidebar and ⌘+click opens links again).
const styleKey = (e) =>
  (IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) &&
  !e.altKey &&
  !e.shiftKey;
const styleGesture = (e) => styleKey(e) && sidebarVisible();

// The click lands on the deepest node — usually the label span or an icon
// path inside the button the user means. Edit the control (or the whole
// svg); the panel's breadcrumbs still lead down to the exact node.
const CONTROL =
  "a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], label, summary";
const pickStyleTarget = (node) => {
  let n = node;
  if (typeof SVGElement !== "undefined" && n instanceof SVGElement && n.ownerSVGElement) {
    n = n.ownerSVGElement;
  }
  const control = n.closest?.(CONTROL);
  if (control && control !== n) {
    let depth = 0;
    for (let p = n; p && p !== control; p = p.parentElement) depth++;
    if (depth <= 3) return control;
  }
  return n;
};

// Holding the key shows what a click would pick.
let gestureHover = false;
const lastPointer = { x: -1, y: -1 };

const hoverAt = (x, y) => {
  // The sidebar auto-opens on dev hosts without the overlay; make sure it exists.
  ensureOverlay();
  const deep = deepElementFromPoint(x, y);
  const styling = !state.inspecting || state.pickMode === "style";
  const target = deep && styling ? pickStyleTarget(deep) : deep;
  if (!target || target === state.hovered) return;
  if (isOurChrome(target)) {
    state.hovered = null;
    moveHighlight(null);
    return;
  }
  state.hovered = target;
  moveHighlight(target);
};

const clearGestureHover = () => {
  if (!gestureHover) return;
  gestureHover = false;
  if (state.inspecting) return;
  state.hovered = null;
  moveHighlight(null);
};

const onMouseMove = (e) => {
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;
  if (state.inspecting) {
    hoverAt(e.clientX, e.clientY);
  } else if (styleGesture(e)) {
    gestureHover = true;
    hoverAt(e.clientX, e.clientY);
  } else {
    clearGestureHover();
  }
};

// Suppress the page's own pointer reactions while inspecting — otherwise a
// mousedown closes the very dropdown the user is trying to annotate before
// the click handler ever sees it. (Canceling pointerdown/mousedown does not
// cancel the subsequent `click`, so onClick below still fires.)
const onPointerSuppress = (e) => {
  if (!state.inspecting && !styleGesture(e)) return;
  if (isOurChrome(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
};

const onClick = async (e) => {
  if (isOurChrome(e.target)) return;
  if (styleGesture(e)) {
    e.preventDefault();
    e.stopPropagation();
    const target = deepElementFromPoint(e.clientX, e.clientY);
    if (!target || isOurChrome(target)) return;
    if (state.inspecting) setInspecting(false);
    clearGestureHover();
    openStyleEditor(pickStyleTarget(target), { deep: target });
    return;
  }
  if (!state.inspecting) return;
  e.preventDefault();
  e.stopPropagation();
  const target = deepElementFromPoint(e.clientX, e.clientY);
  if (!target) return;
  if (isOurChrome(target)) return;
  if (state.pickMode === "style") {
    // One-shot: the Restyle key picks a single element.
    setInspecting(false);
    openStyleEditor(pickStyleTarget(target), { deep: target });
    return;
  }
  // Capture textual context BEFORE any DOM mutation (modal/highlight removal).
  const ctx = {
    computedStyles: snapshotComputedStyles(target),
    html: snapshotHtml(target),
    env: snapshotEnv(),
  };
  const quick = e.altKey; // Alt+click = quick-mark, no modal
  setInspecting(false);
  moveHighlight(null);
  // Screenshot and MAIN-world error collection run concurrently.
  // captureElement gracefully returns null on failure (rate-limit, chrome:// pages, etc.).
  const [screenshot, mainErrors] = await Promise.all([
    captureElement(target),
    collectPageErrors().catch(() => []),
  ]);
  ctx.screenshot = screenshot;
  // Merge MAIN-world errors (console.error, rejections) with the content-side
  // buffer (uncaught errors since page load); dedupe by message, cap at 5.
  const seen = new Set();
  ctx.pageErrors = [...mainErrors, ...recentContentErrors()]
    .filter((er) => {
      if (!er?.message || seen.has(er.message)) return false;
      seen.add(er.message);
      return true;
    })
    .slice(0, 5);
  if (quick) {
    await quickAddTask(target, ctx);
    return;
  }
  openModal(target, ctx);
};

const onKeyDown = (e) => {
  if (e.key === "Escape" && state.inspecting) {
    setInspecting(false);
    moveHighlight(null);
  } else if (e.key === "Escape" && isStyleEditorOpen()) {
    // Focus is on the page (the panel handles its own keys): Escape closes
    // the editor first, before it reaches the page's dialogs.
    e.preventDefault();
    e.stopImmediatePropagation();
    closeStyleEditor();
  } else if (
    (e.key === "Meta" || e.key === "Control") &&
    !state.inspecting &&
    styleGesture(e) &&
    lastPointer.x >= 0
  ) {
    gestureHover = true;
    hoverAt(lastPointer.x, lastPointer.y);
  }
};

const onKeyUp = (e) => {
  if (e.key === "Meta" || e.key === "Control") clearGestureHover();
};

// Registered the first time the sidebar opens: a page where tsayru is never
// used pays nothing for it beyond loading the script.
let listening = false;
const ensureListeners = () => {
  if (listening) return;
  listening = true;
  on(document, "mousemove", onMouseMove, true);
  on(document, "pointerdown", onPointerSuppress, true);
  on(document, "mousedown", onPointerSuppress, true);
  on(document, "mouseup", onPointerSuppress, true);
  on(document, "click", onClick, true);
  on(document, "keydown", onKeyDown, true);
  on(document, "keyup", onKeyUp, true);
  on(window, "blur", clearGestureHover);
  // Keys typed while focus is in our UI never reach the document listeners
  // above (shadowhost.js stops them); ui.js hands over the ones it didn't use.
  bus.on("ui-key", (e) => (e.type === "keyup" ? onKeyUp(e) : e.type === "keydown" && onKeyDown(e)));
  // Modal emits this after a task is added — re-arm the inspector so a batch
  // session is click → type → Enter → click, without re-enabling by hand.
  // Internal bus, NOT a window event: the host page must not be able to
  // spoof a signal that turns the inspector on.
  bus.on("task-added", () => {
    if (sidebarVisible()) setInspecting(true);
  });
  // Keep the highlight glued to its element. Safe to re-show: moveHighlight
  // refuses whenever the sidebar is hidden (the old ghost-highlight bug).
  const follow = () => {
    if (shown) moveHighlight(shown.isConnected ? shown : null);
  };
  on(window, "scroll", follow, true);
  on(window, "resize", follow);
};
