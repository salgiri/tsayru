// The page-facing UI — sidebar, dialogs, toasts and the page highlight —
// lives in one closed shadow root (shadowhost.js), styled by ui-css.js.

import { el, refs, bus } from "./core.js";
import { createShadowHost, isOurHost } from "./shadowhost.js";
import { UI_CSS } from "./ui-css.js";
import { ensureFonts } from "./fonts.js";
import { icon, grain } from "./icons.js";

let layer = null; // the .ui wrapper every piece goes into
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
  const host = createShadowHost({
    tag: "tsayru-ui",
    className: "tsayru-ui-host",
    css: UI_CSS,
    onKey,
  });
  layer = el("div", { class: "ui" });
  host.root.appendChild(layer);
  refs.ui = host.node;
  ensureFonts();
  return layer;
};

// A dialog on a scrim. `onEscape` runs for Escape and for a click on the
// scrim; the caller decides whether that closes it.
export const openDialog = ({ className = "", label, onEscape }) => {
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
  uiLayer().appendChild(scrim);
  return {
    scrim,
    dialog,
    close() {
      scrim.remove();
      const i = dialogs.indexOf(entry);
      if (i >= 0) dialogs.splice(i, 1);
      if (!dialogs.length) window.removeEventListener("keydown", onPageEscape, true);
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

// One toast at a time, bottom centre. `warn` swaps the blue check for a
// marker-pink alert; an `action` adds a button and keeps it up longer.
let current = null;
export const toast = (message, { warn = false, iconName, action, ttl } = {}) => {
  current?.dismiss();
  const node = el(
    "div",
    {
      class: `toast${warn ? " warn" : ""}${action ? " has-act" : ""}`,
      role: "status",
      "aria-live": "polite",
    },
    el("span", { class: "disc" }, icon(iconName || (warn ? "alert" : "check"))),
    el("span", { class: "toast-msg" }, message),
  );
  let timer = 0;
  const self = {
    dismiss() {
      clearTimeout(timer);
      node.remove();
      if (current === self) current = null;
    },
  };
  if (action) {
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
  timer = setTimeout(() => self.dismiss(), ttl ?? (action ? 8000 : warn ? 3200 : 1800));
  current = self;
  uiLayer().appendChild(node);
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
