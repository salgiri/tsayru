// Shared state, mutable DOM refs, and tiny helpers that don't depend on other modules.

export const STORAGE_KEY = "tsayru_tasks";
const REV_KEY = "tsayru_rev"; // who wrote the tasks last: "<writer>:<n>"

export const state = {
  inspecting: false,
  pickMode: "task", // what an inspector click does: "task" (modal) or "style" (style editor)
  hovered: null,
  tasks: [],
  editingTaskId: null,
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

// Every listener this copy of the content script adds goes through `on`, so
// one abort removes them all — a fresh copy injected after an extension
// update takes over from a stale one this way (index.js).
export const lifetime = new AbortController();
export const on = (target, type, fn, capture = false) =>
  target.addEventListener(type, fn, { capture, signal: lifetime.signal });

// Tiny internal event bus. Unlike window CustomEvents, page scripts cannot
// dispatch into it — state-changing signals (e.g. "task-added" re-arming the
// inspector) and UI messages ("warn") must not be spoofable by the host page.
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

// A message to the background, as a promise that never rejects:
// the response, or { ok: false, error } when there is none.
export const ask = (msg) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        const error = chrome.runtime.lastError?.message;
        resolve(resp ?? { ok: false, error: error || "no response" });
      });
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });

// crypto.randomUUID exists only in secure contexts — on a plain http:// site
// it is undefined (and threw there). getRandomValues works everywhere.
export const uid = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// The "old content script after an extension reload" footgun.
export const isContextInvalidated = (err) =>
  /context invalidated|Extension context/i.test(String(err || ""));

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

// Each write is tagged with this tab's writer id, so the change listener
// below can tell other tabs' writes from our own echo.
const writer = uid();
let writes = 0;

// chrome.storage.local has a 10MB quota (lifted by unlimitedStorage, but
// screenshots still add up). Failures surface as a toast through the bus.
export const persist = async () => {
  try {
    await chrome.storage?.local?.set({
      [STORAGE_KEY]: state.tasks,
      [REV_KEY]: `${writer}:${++writes}`,
    });
    return true;
  } catch (err) {
    const msg = err?.message || String(err);
    const quota = /quota/i.test(msg) || msg.includes("QUOTA_BYTES");
    console.warn("[tsayru] persist failed:", msg);
    bus.emit(
      "warn",
      quota
        ? "Storage is full. Delete old tasks to save new ones"
        : "Couldn’t save tasks. Reload the page and try again",
    );
    return false;
  }
};

// Tasks are read when the sidebar opens — not on every page load — and kept
// in step with other tabs while it stays open (watchTasks), so a stale list
// never overwrites what another tab saved.
// Tasks from before v0.14 have no id; the UI keys everything by it.
const withIds = (list) => {
  const tasks = Array.isArray(list) ? list : [];
  for (const t of tasks) t.id ||= uid();
  return tasks;
};

export const restore = async () => {
  try {
    const data = await chrome.storage?.local?.get(STORAGE_KEY);
    state.tasks = withIds(data?.[STORAGE_KEY]);
  } catch {}
};

const onStorageChange = (changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  if (String(changes[REV_KEY]?.newValue || "").startsWith(`${writer}:`)) return;
  state.tasks = withIds(changes[STORAGE_KEY].newValue);
  bus.emit("tasks-changed");
};

export const watchTasks = (enabled) => {
  try {
    if (enabled) chrome.storage.onChanged.addListener(onStorageChange);
    else chrome.storage.onChanged.removeListener(onStorageChange);
  } catch {}
};
