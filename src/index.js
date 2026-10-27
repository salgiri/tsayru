// Entry point. Bundled by esbuild (--format=iife) → wraps everything in (() => { ... })().
//
// After an extension update, the copy injected before it can still sit in
// this isolated world: its chrome.* APIs are dead, its listeners and UI are
// not. When the toolbar icon gets no answer, the background injects us again
// (background.js); this copy then tears the stale one down and takes over.
// A live copy (a duplicate injection) is left alone.

import { isDevHost, lifetime, refs } from "./core.js";
import { initErrorCapture } from "./errors.js";
import { showSidebar, toggleSidebar } from "./inspector.js";

const onMessage = (msg) => {
  // Toolbar icon / hotkey: only toggle sidebar visibility.
  // Inspector state is controlled exclusively by the in-sidebar keys.
  if (msg?.type === "TSAYRU_TOGGLE") toggleSidebar();
};

const teardown = () => {
  lifetime.abort();
  try {
    chrome.runtime.onMessage.removeListener(onMessage);
  } catch {}
  refs.ui?.remove();
  refs.styleHost?.remove();
  document.documentElement.classList.remove("tsayru-inspecting");
};

const previous = window.__tsayru;
let alive = false;
try {
  alive = !!previous?.alive();
} catch {}

if (!alive) {
  try {
    previous?.teardown();
  } catch {}
  // Copies older than v0.18.2 have no teardown; drop their UI at least.
  for (const node of document.querySelectorAll("tsayru-ui, tsayru-style, .tsayru-sidebar, .tsayru-highlight")) {
    node.remove();
  }
  window.__tsayru = { alive: () => !!chrome.runtime?.id, teardown };

  initErrorCapture();
  chrome.runtime?.onMessage?.addListener(onMessage);
  // Dev hosts open the panel by themselves; elsewhere nothing else runs
  // until the toolbar icon (or hotkey) asks for it.
  if (isDevHost()) showSidebar();
}
