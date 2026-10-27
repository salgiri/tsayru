// A custom element with a closed shadow root — the home of every piece of
// tsayru UI on the page (sidebar & dialogs in ui.js, the style editor in
// styleeditor.js). Page CSS can't reach in, page scripts and the inspector's
// deep hit-testing can't look in, and events from inside never reach the page.

import { el } from "./core.js";

// Events from inside stop at the shadow root: the page never sees them
// (outside-click handlers would close the very dialog being annotated,
// scroll locks would swallow our wheel).
const SHADOW_STOP = [
  "click",
  "dblclick",
  "auxclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "contextmenu",
  "wheel",
  "touchstart",
  "touchmove",
  "touchend",
  "input",
  "beforeinput",
  "paste",
  "copy",
  "cut",
];
const stopHere = (e) => e.stopPropagation();

// `onKey(e)` gets every key event typed inside that the focused element's
// `__tsayruKey` handler didn't take.
export const createShadowHost = ({ tag, className, css, onKey }) => {
  const node = document.createElement(tag);
  node.className = className;
  node.style.cssText = [
    "all: initial !important",
    "position: fixed !important",
    "inset: 0 !important",
    "z-index: 2147483647 !important",
    "pointer-events: none !important",
    "display: block !important",
  ].join(";");
  const root = node.attachShadow({ mode: "closed" });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.appendChild(el("style", {}, css));
  }
  for (const type of SHADOW_STOP) root.addEventListener(type, stopHere);

  // Keys typed inside are handled here, at the very top of the capture
  // phase, and go no further: page shortcuts and dialog Escape handlers
  // (often capture listeners on document) never see them. Default actions
  // (typing, Tab, Enter on a button) still happen. Element listeners inside
  // don't fire either — focused inputs take keys through `__tsayruKey`.
  const onWindowKey = (e) => {
    if (e.target !== node) return;
    e.stopImmediatePropagation();
    if (e.type === "keydown" && root.activeElement?.__tsayruKey?.(e)) return;
    onKey?.(e);
  };

  // Focus moving in must not look like focus leaving a modal: focus traps
  // (Radix FocusScope and the like) would pull it straight back. Only that
  // direction is hidden; focus going back to the page is the page's.
  const onWindowFocus = (e) => {
    const into = e.type === "focusin" ? e.target === node : e.relatedTarget === node;
    if (into) e.stopImmediatePropagation();
  };

  for (const type of ["keydown", "keyup", "keypress"]) {
    window.addEventListener(type, onWindowKey, true);
  }
  window.addEventListener("focusin", onWindowFocus, true);
  window.addEventListener("focusout", onWindowFocus, true);
  document.documentElement.appendChild(node);

  return {
    node,
    root,
    destroy() {
      for (const type of ["keydown", "keyup", "keypress"]) {
        window.removeEventListener(type, onWindowKey, true);
      }
      window.removeEventListener("focusin", onWindowFocus, true);
      window.removeEventListener("focusout", onWindowFocus, true);
      node.remove();
    },
  };
};

// Any tsayru host (sidebar or style editor) — events from inside either are
// retargeted to it.
export const isOurHost = (node) =>
  !!node?.closest?.(".tsayru-ui-host, .tsayru-style-host");
