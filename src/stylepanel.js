// The style editor's panel: header, breadcrumbs, tabs and footer around the
// Quick tab (stylequick.js) and the CSS tab (stylerules.js). It lives in the
// editor's closed shadow root (styleeditor.js).

import { h, describeNode } from "./stylewidgets.js";
import { quickTab } from "./stylequick.js";
import { rulesTab } from "./stylerules.js";
import { icon, grain } from "./icons.js";

// The tab carries over to the next element, like the CSS tab's state.
let lastTab = "quick";

// Shorthands people type; the longhands come from the browser itself.
const SHORTHANDS = [
  "animation",
  "background",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "flex",
  "flex-flow",
  "font",
  "gap",
  "grid",
  "grid-area",
  "grid-template",
  "inset",
  "margin",
  "margin-block",
  "margin-inline",
  "outline",
  "overflow",
  "padding",
  "padding-block",
  "padding-inline",
  "place-items",
  "text-decoration",
  "transition",
];

const propertyNames = () => {
  let longhands = [];
  try {
    longhands = Array.from(getComputedStyle(document.documentElement));
  } catch {}
  return [...new Set([...SHORTHANDS, ...longhands])]
    .filter((n) => !n.startsWith("-webkit-"))
    .sort();
};

export const mountPanel = (api) => {
  const target = api.target;
  let tab = null;
  let current = null;

  const sub = h("div", { class: "hd-sub" });
  const updateSub = () => {
    const fw = api.framework();
    const r = target.getBoundingClientRect();
    const parts = [
      fw?.componentName ? `<${fw.componentName}>` : null,
      fw?.source?.file ? `${fw.source.file.split("/").slice(-2).join("/")}${fw.source.line ? `:${fw.source.line}` : ""}` : null,
      `${Math.round(r.width)}×${Math.round(r.height)}`,
    ].filter(Boolean);
    sub.textContent = parts.join(" · ");
    sub.title = [api.label, ...parts].join("\n");
  };

  const close = h(
    "button",
    { class: "ic", title: "Close and save as a task (Esc)", "aria-label": "Close", onClick: () => api.close() },
    icon("close"),
  );
  const header = h(
    "div",
    { class: "hd" },
    h("div", { class: "hd-main" }, h("div", { class: "hd-title", title: api.selector }, describeNode(target, 3)), sub),
    close,
  );

  // Drag the panel by its header.
  header.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const panelNode = header.parentElement;
    const start = { x: e.clientX, y: e.clientY, left: panelNode.offsetLeft, top: panelNode.offsetTop };
    header.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const pos = api.moved({ left: start.left + ev.clientX - start.x, top: start.top + ev.clientY - start.y });
      panelNode.style.left = `${pos.left}px`;
      panelNode.style.top = `${pos.top}px`;
    };
    const up = () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", up);
      header.removeEventListener("pointercancel", up);
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", up);
    header.addEventListener("pointercancel", up);
  });

  // Breadcrumbs: up to four ancestors, the element, then the way down to the
  // node actually clicked — hover outlines one, click edits it.
  const chain = [];
  for (let n = target, i = 0; n && n.nodeType === 1 && i < 5; n = n.parentElement, i++) chain.unshift(n);
  const down = [];
  for (let n = api.deep; n && n !== target; n = n.parentElement) down.unshift(n);
  chain.push(...down);
  const crumbs = h("div", { class: "crumbs" });
  chain.forEach((n, i) => {
    if (i) crumbs.append(h("span", { class: "sep" }, "›"));
    const cur = n === target;
    crumbs.append(
      h(
        "button",
        {
          class: `crumb${cur ? " cur" : ""}`,
          title: cur ? api.selector : "Edit this element instead",
          onClick: () => !cur && api.select(n),
          onMouseenter: () => !cur && api.preview(n),
          onMouseleave: () => api.preview(null),
        },
        describeNode(n, 1),
      ),
    );
  });

  const notice = h("div", { class: "warn", hidden: true }, "The element left the page (re-rendered?) — ⌘+click it again.");

  const count = h("span", { class: "count" });
  const tabs = {
    quick: h("button", { class: "tab", onClick: () => show("quick") }, "Quick"),
    css: h("button", { class: "tab", title: "Every rule that styles this element, by state", onClick: () => show("css") }, "CSS"),
  };
  const body = h("div", { class: "body" });

  const note = h("input", { class: "in note", placeholder: "Note for Claude (optional)" });
  note.addEventListener("input", () => api.setNote(note.value));
  note.__tsayruKey = (e) => {
    if (e.key !== "Enter") return false;
    e.preventDefault();
    api.close();
    return true;
  };
  const done = h("button", { class: "btn primary", title: "Save as a task and close (Esc)", onClick: () => api.close() }, "Save task");
  const revert = h(
    "button",
    { class: "btn", title: "Undo this panel's edits", onClick: () => { api.revert(); show(tab, true); } },
    "Revert",
  );

  const updateCount = () => {
    const n = api.changeCount();
    count.textContent = n ? `${n} change${n === 1 ? "" : "s"}` : "no changes";
    count.classList.toggle("has", n > 0);
    revert.disabled = n === 0;
    done.textContent = n ? "Save task" : "Close";
    done.classList.toggle("primary", n > 0); // blue only when there's something to save
  };

  const show = (name, force = false) => {
    if (name === tab && !force) return;
    tab = lastTab = name;
    tabs.quick.classList.toggle("on", name === "quick");
    tabs.css.classList.toggle("on", name === "css");
    if (name === "quick") api.force(null);
    const scroll = body.scrollTop;
    current = name === "quick" ? quickTab(api) : rulesTab(api);
    body.replaceChildren(current.node);
    if (force) body.scrollTop = scroll;
    updateCount();
  };

  const panel = h(
    "div",
    { class: "panel shell" },
    grain(),
    header,
    crumbs,
    notice,
    h("div", { class: "tabs" }, tabs.quick, tabs.css, count),
    body,
    h("div", { class: "ft" }, note, revert, done),
    h("datalist", { id: "tsayru-props" }, ...propertyNames().map((n) => h("option", { value: n }))),
  );

  api.onChange = () => {
    updateCount();
    updateSub();
    current?.refresh?.();
  };
  api.onFramework = updateSub;
  api.onDetached = () => {
    notice.hidden = false;
  };
  updateSub();
  show(lastTab);
  return panel;
};
