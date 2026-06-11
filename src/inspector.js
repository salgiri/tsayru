// Inspector mode: highlight overlay, mouse/click/keyboard handlers.
// Sidebar visibility (show/hide/toggle) — kept here because hiding the panel must turn off inspector.

import { el, state, refs } from "./core.js";
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

// ---------- Highlight overlay ----------

export const ensureOverlay = () => {
  if (refs.highlight) return;
  refs.highlight = el("div", { class: "tsayru-highlight" });
  document.documentElement.appendChild(refs.highlight);
};

export const moveHighlight = (target) => {
  if (!refs.highlight) return;
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
  if (!on) moveHighlight(null);
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
    node.closest(".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight")
  );

const onMouseMove = (e) => {
  if (!state.inspecting) return;
  const target = deepElementFromPoint(e.clientX, e.clientY);
  if (!target || target === state.hovered) return;
  if (isOurChrome(target)) {
    state.hovered = null;
    moveHighlight(null);
    return;
  }
  state.hovered = target;
  moveHighlight(target);
};

// Suppress the page's own pointer reactions while inspecting — otherwise a
// mousedown closes the very dropdown the user is trying to annotate before
// the click handler ever sees it. (Canceling pointerdown/mousedown does not
// cancel the subsequent `click`, so onClick below still fires.)
const onPointerSuppress = (e) => {
  if (!state.inspecting) return;
  if (isOurChrome(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
};

const onClick = async (e) => {
  if (!state.inspecting) return;
  if (e.target.closest(".tsayru-sidebar, .tsayru-modal-backdrop")) return;
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
  }
};

export const initEventListeners = () => {
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("pointerdown", onPointerSuppress, true);
  document.addEventListener("mousedown", onPointerSuppress, true);
  document.addEventListener("mouseup", onPointerSuppress, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  // Modal dispatches this after a task is added — re-arm the inspector so a
  // batch session is click → type → Enter → click, without re-enabling by hand.
  // (CustomEvent instead of a direct import to avoid a modal↔inspector cycle.)
  window.addEventListener("tsayru-task-added", () => setInspecting(true));
  window.addEventListener(
    "scroll",
    () => {
      if (state.hovered) moveHighlight(state.hovered);
    },
    true,
  );
  window.addEventListener("resize", () => {
    if (state.hovered) moveHighlight(state.hovered);
  });
};
