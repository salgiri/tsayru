// Inspector mode: highlight overlay, mouse/click/keyboard handlers.
// Sidebar visibility (show/hide/toggle) — kept here because hiding the panel must turn off inspector.

import { el, state, refs } from "./core.js";
import { snapshotComputedStyles } from "./framework.js";
import { captureElement } from "./screenshot.js";
import { ensureSidebar, renderSidebar } from "./sidebar.js";
import { openModal } from "./modal.js";

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
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === state.hovered) return;
  if (isOurChrome(target)) {
    state.hovered = null;
    moveHighlight(null);
    return;
  }
  state.hovered = target;
  moveHighlight(target);
};

const onClick = async (e) => {
  if (!state.inspecting) return;
  if (e.target.closest(".tsayru-sidebar, .tsayru-modal-backdrop")) return;
  e.preventDefault();
  e.stopPropagation();
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target) return;
  if (isOurChrome(target)) return;
  // Capture visual context BEFORE any DOM mutation (modal/highlight removal).
  const computedStyles = snapshotComputedStyles(target);
  setInspecting(false);
  moveHighlight(null);
  // Screenshot in parallel with no-op delay (user perceives ~150ms before modal opens).
  // captureElement gracefully returns null on failure (rate-limit, chrome:// pages, etc.).
  const screenshot = await captureElement(target);
  openModal(target, computedStyles, screenshot);
};

const onKeyDown = (e) => {
  if (e.key === "Escape" && state.inspecting) {
    setInspecting(false);
    moveHighlight(null);
  }
};

export const initEventListeners = () => {
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
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
