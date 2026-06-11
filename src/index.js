// Entry point. Bundled by esbuild (--format=iife) → wraps everything in (() => { ... })().
// Re-injection guard prevents duplicate listeners when the extension is reloaded.

import { isDevHost, restore } from "./core.js";
import { initErrorCapture } from "./errors.js";
import { initEventListeners, toggleSidebar } from "./inspector.js";
import { ensureSidebar } from "./sidebar.js";

if (window.__tsayruInjected) {
  // Already initialized in this page — do nothing.
} else {
  window.__tsayruInjected = true;

  initEventListeners();
  initErrorCapture();

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === "TSAYRU_TOGGLE") {
      // Toolbar icon / hotkey: only toggle sidebar visibility.
      // Inspector state is controlled exclusively by the in-sidebar button.
      toggleSidebar();
    }
  });

  restore().then(() => {
    if (isDevHost()) ensureSidebar();
  });
}
