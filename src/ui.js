// The page-facing UI — sidebar, dialogs, toasts and the page highlight —
// lives in one closed shadow root (shadowhost.js), styled by ui-css.js.

import { el, refs, bus } from "./core.js";
import { createShadowHost, isOurHost } from "./shadowhost.js";
import { UI_CSS } from "./ui-css.js";
import { ensureFonts } from "./fonts.js";
import { icon, grain } from "./icons.js";

let host = null;
let layer = null; // the .ui wrapper every piece goes into
let live = null; // polite live region: toasts are read out from here
const dialogs = []; // open dialogs, topmost last

// Keys typed inside the UI that no focused field took: Escape closes the top
// dialog; everything else goes to the inspector (Escape stops picking, ⌘
// held shows what a click would restyle).
const onKey = (e) => {
  if (e.type === "keydown" && e.key === "Escape" && dialogs.length) {
    e.preventDefault();
    dialogs[dialogs.length - 1].onEscape();
    return;
  }
  bus.emit("ui-key", e);
};

// Escape pressed while focus is still on the page closes an open dialog too,
// before the page's own handlers see it.
const onPageEscape = (e) => {
  if (e.key !== "Escape" || !dialogs.length || isOurHost(e.target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  dialogs[dialogs.length - 1].onEscape();
};

export const uiLayer = () => {
  if (layer) return layer;
  host = createShadowHost({
    tag: "tsayru-ui",
    className: "tsayru-ui-host",
    css: UI_CSS,
    onKey,
  });
  // Rendered empty first, so screen readers pick up every later update.
  live = el("div", { class: "sr", role: "status", "aria-live": "polite" });
  layer = el("div", { class: "ui" }, live);
  host.root.appendChild(layer);
  refs.ui = host.node;
  ensureFonts();
  return layer;
};

// A dialog on a scrim. `onEscape` runs for Escape and for a click on the
// scrim; the caller decides whether that closes it. While it's open the
// sidebar behind is inert, and closing hands focus back to where it was.
export const openDialog = ({ className = "", label, onEscape }) => {
  uiLayer();
  const returnTo = host.root.activeElement;
  const dialog = el("div", {
    class: `dialog shell${className ? ` ${className}` : ""}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": label,
  });
  dialog.appendChild(grain());
  const scrim = el(
    "div",
    {
      class: "scrim",
      onClick: (e) => {
        if (e.target === scrim) onEscape();
      },
    },
    dialog,
  );
  const entry = { onEscape };
  dialogs.push(entry);
  if (dialogs.length === 1) window.addEventListener("keydown", onPageEscape, true);
  if (refs.sidebar) refs.sidebar.inert = true;
  layer.appendChild(scrim);
  return {
    scrim,
    dialog,
    close() {
      scrim.remove();
      const i = dialogs.indexOf(entry);
      if (i >= 0) dialogs.splice(i, 1);
      if (!dialogs.length) {
        window.removeEventListener("keydown", onPageEscape, true);
        if (refs.sidebar) refs.sidebar.inert = false;
        if (returnTo?.isConnected) returnTo.focus();
      }
    },
  };
};

// The round × in a dialog's header.
export const dialogHeader = (title, onClose) =>
  el(
    "div",
    { class: "dlg-hd" },
    el("div", { class: "dlg-title" }, title),
    el("button", { class: "round", title: "Close (Esc)", "aria-label": "Close", onClick: onClose }, icon("close")),
  );

// One toast at a time, bottom centre. `tone`: "warn" (marker-pink alert) for
// problems, "danger" (red) for removals; an `action` adds a button and keeps
// the toast up longer. Pointer or focus on the toast holds it.
let current = null;
export const toast = (message, { tone, warn = false, iconName, action, ttl } = {}) => {
  uiLayer();
  current?.dismiss();
  if (warn) tone = "warn";
  const node = el(
    "div",
    { class: `toast${tone ? ` ${tone}` : ""}${action ? " has-act" : ""}`, "aria-hidden": "true" },
    el("span", { class: "disc" }, icon(iconName || (tone === "warn" ? "alert" : "check"))),
    el("span", { class: "toast-msg" }, message),
  );
  const life = ttl ?? (action ? 8000 : tone === "warn" ? 6000 : 2000);
  let timer = 0;
  const hold = () => clearTimeout(timer);
  const release = () => {
    clearTimeout(timer);
    timer = setTimeout(() => self.dismiss(), life);
  };
  const self = {
    dismiss() {
      clearTimeout(timer);
      node.remove();
      if (current === self) current = null;
    },
  };
  if (action) {
    // The live region below can't hold a button; the toast itself stays
    // reachable for the action (and is no longer hidden from readers).
    node.removeAttribute("aria-hidden");
    node.appendChild(
      el(
        "button",
        {
          class: "toast-act",
          onClick: () => {
            self.dismiss();
            action.run();
          },
        },
        action.label,
      ),
    );
  }
  for (const [type, fn] of [["pointerenter", hold], ["pointerleave", release], ["focusin", hold], ["focusout", release]]) {
    node.addEventListener(type, fn);
  }
  current = self;
  layer.appendChild(node);
  live.textContent = message;
  release();
  return self;
};

// Keycap hints: [["⌥ click", "Quick add"], …]
export const hints = (pairs) =>
  el(
    "div",
    { class: "hints" },
    ...pairs.map(([keys, what]) =>
      el("span", { class: "hint" }, el("span", { class: "kbd" }, keys), what),
    ),
  );
