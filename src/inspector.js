// Inspector mode: highlight overlay, mouse/click/keyboard handlers.
// Sidebar visibility (show/hide/toggle) — kept here because hiding the panel must turn off inspector.

import { el, state, refs, bus } from "./core.js";
import {
  snapshotComputedStyles,
  snapshotHtml,
  snapshotEnv,
  ensureMainWorld,
  collectPageErrors,
} from "./framework.js";
import { recentContentErrors } from "./errors.js";
import { deepElementFromPoint } from "./selector.js";
import { captureElement } from "./screenshot.js";
import { ensureSidebar, renderSidebar } from "./sidebar.js";
import { openModal, quickAddTask } from "./modal.js";
import {
  openStyleEditor,
  closeStyleEditor,
  isStyleEditorOpen,
} from "./styleeditor.js";

// ---------- Highlight overlay ----------

export const ensureOverlay = () => {
  if (refs.highlight) return;
  refs.highlight = el("div", { class: "tsayru-highlight" });
  document.documentElement.appendChild(refs.highlight);
};

// HARD INVARIANT: the highlight may only ever be visible while the sidebar is
// open. With the sidebar hidden there is no legitimate caller (inspector and
// hover-preview both live in the sidebar), so any attempt to show it then is
// a bug — coerce it to hide instead of trusting call sites.
const sidebarVisible = () =>
  !!refs.sidebar && !refs.sidebar.classList.contains("tsayru-hidden");

export const moveHighlight = (target) => {
  if (!refs.highlight) return;
  if (target && !sidebarVisible()) target = null;
  if (!target) {
    refs.highlight.style.display = "none";
    return;
  }
  const r = target.getBoundingClientRect();
  refs.highlight.style.display = "block";
  refs.highlight.style.transform = `translate(${r.left + window.scrollX}px, ${r.top + window.scrollY}px)`;
  refs.highlight.style.width = `${r.width}px`;
  refs.highlight.style.height = `${r.height}px`;
};

// ---------- Inspector state ----------

export const setInspecting = (on) => {
  state.inspecting = on;
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
  renderSidebar();
};

// ---------- Sidebar visibility ----------
// Hiding the sidebar always turns inspector OFF (safety: no crosshair without UI).

export const showSidebar = () => {
  ensureOverlay();
  ensureSidebar();
  refs.sidebar.classList.remove("tsayru-hidden");
};

export const hideSidebar = () => {
  if (refs.sidebar) refs.sidebar.classList.add("tsayru-hidden");
  if (state.inspecting) setInspecting(false);
  state.editingTaskIndex = null;
  closeStyleEditor();
};

export const toggleSidebar = () => {
  ensureOverlay();
  ensureSidebar();
  if (refs.sidebar.classList.contains("tsayru-hidden")) {
    showSidebar();
  } else {
    hideSidebar();
  }
};

// Inspector toggle — used ONLY by the in-sidebar button. Source of truth for inspector state.
export const toggleInspector = () => {
  showSidebar();
  setInspecting(!state.inspecting);
};

// ---------- Event handlers ----------

const isOurChrome = (node) =>
  !!(
    node &&
    node.closest &&
    node.closest(
      ".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight, .tsayru-style-host",
    )
  );

// ⌘+click on macOS, Ctrl+click elsewhere opens the style editor — only while
// the sidebar is visible, so the gesture is never taken from a page the user
// isn't working on (hide the sidebar and ⌘+click opens links again).
const IS_MAC = /mac|iphone|ipad/i.test(
  navigator.userAgentData?.platform || navigator.platform || "",
);
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
  const target = deep && !state.inspecting ? pickStyleTarget(deep) : deep;
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

export const initEventListeners = () => {
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("pointerdown", onPointerSuppress, true);
  document.addEventListener("mousedown", onPointerSuppress, true);
  document.addEventListener("mouseup", onPointerSuppress, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", clearGestureHover);
  // Modal emits this after a task is added — re-arm the inspector so a batch
  // session is click → type → Enter → click, without re-enabling by hand.
  // Internal bus, NOT a window event: the host page must not be able to
  // spoof a signal that turns the inspector on.
  bus.on("task-added", () => {
    if (sidebarVisible()) setInspecting(true);
  });
  // Keep the highlight glued to its element while actively inspecting.
  // Guarded on `state.inspecting` — these used to fire on a stale hover
  // target and resurrect the highlight while the extension was collapsed.
  window.addEventListener(
    "scroll",
    () => {
      if (state.inspecting && state.hovered) moveHighlight(state.hovered);
    },
    true,
  );
  window.addEventListener("resize", () => {
    if (state.inspecting && state.hovered) moveHighlight(state.hovered);
  });
};
