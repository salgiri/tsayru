// Shared state, mutable DOM refs, and tiny helpers that don't depend on other modules.

export const STORAGE_KEY = "tsayru_tasks";

export const state = {
  inspecting: false,
  hovered: null,
  tasks: [],
  editingTaskIndex: null,
  filterHost: null,
};

// Mutable DOM references shared across modules.
// Imports get a live reference to this object — mutating its properties is observable everywhere.
export const refs = {
  highlight: null,
  sidebar: null,
  modal: null,
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

export const safeHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export const plural = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "а";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "и";
  return "";
};

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
        detail: { message: quota ? "нет места — удали старые задачи" : "ошибка сохранения" },
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
