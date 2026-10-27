// Shared state, mutable DOM refs, and tiny helpers that don't depend on other modules.

export const STORAGE_KEY = "tsayru_tasks";

export const state = {
  inspecting: false,
  pickMode: "task", // what an inspector click does: "task" (modal) or "style" (style editor)
  hovered: null,
  tasks: [],
  editingTaskIndex: null,
  filterHost: null,
  filterTag: null,
};

// Mutable DOM references shared across modules.
// Imports get a live reference to this object — mutating its properties is observable everywhere.
export const refs = {
  ui: null, // the host of everything below (ui.js) — sidebar, dialogs, toasts, highlight
  highlight: null,
  sidebar: null,
  modal: null,
  styleHost: null, // the style editor's panel + outline (styleeditor.js)
};

export const sidebarVisible = () =>
  !!refs.sidebar && !refs.sidebar.classList.contains("hidden");

export const IS_MAC = /mac|iphone|ipad/i.test(
  navigator.userAgentData?.platform || navigator.platform || "",
);

// Tiny internal event bus. Unlike window CustomEvents, page scripts cannot
// dispatch into it — state-changing signals (e.g. "task-added" re-arming the
// inspector) must not be spoofable by the host page.
const busHandlers = {};
export const bus = {
  on(evt, fn) {
    (busHandlers[evt] ||= []).push(fn);
  },
  emit(evt, payload) {
    for (const fn of busHandlers[evt] || []) {
      try {
        fn(payload);
      } catch {}
    }
  },
};

export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
};

// safeHost lives in format.js (the pure shared module); re-export for UI modules.
export { safeHost } from "./format.js";

// Pluralizer: returns the plural form for `n`. Defaults are English (s).
export const plural = (n, singular = "", many = "s") =>
  n === 1 ? singular : many;

export const isDevHost = () => {
  const h = location.hostname;
  if (!h) return location.protocol === "file:";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    h.endsWith(".test")
  );
};

// chrome.storage.local has a 10MB quota. Screenshots push toward it fast.
// We surface failures to the UI through a CustomEvent so callers don't need
// to import the toast helper (avoids a cycle with sidebar.js).
export const persist = async () => {
  try {
    await chrome.storage?.local?.set({ [STORAGE_KEY]: state.tasks });
    return true;
  } catch (err) {
    const msg = err?.message || String(err);
    const quota =
      /quota/i.test(msg) || msg.includes("QUOTA_BYTES");
    console.warn("[tsayru] persist failed:", msg);
    window.dispatchEvent(
      new CustomEvent("tsayru-persist-error", {
        detail: {
          message: quota
            ? "Storage is full. Delete old tasks to save new ones"
            : "Couldn’t save tasks. Reload the page and try again",
        },
      }),
    );
    return false;
  }
};

export const restore = async () => {
  try {
    const data = await chrome.storage?.local?.get(STORAGE_KEY);
    if (data && Array.isArray(data[STORAGE_KEY])) {
      state.tasks = data[STORAGE_KEY];
    }
  } catch {}
};
