// Input widgets the style panel's tabs share. Each bound widget returns
// { node, sync(computedStyle) }: `sync` refreshes it from the page unless the
// user is typing in it. Keys reach a focused input through its `__tsayruKey`
// handler — styleeditor.js intercepts them before the page can.

import { el as h } from "./core.js";
import {
  parseColor,
  formatColor,
  toHex,
  nudge,
  stepFor,
  trimPx,
  withUnit,
} from "./stylevalues.js";

export { h };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// `a.bt-cta.bt-cta--ghost` — how the panel names an element.
export const describeNode = (node, maxClasses = 2) => {
  const id = node.id ? `#${node.id}` : "";
  const cls = [...node.classList]
    .filter((c) => !c.startsWith("tsayru-"))
    .slice(0, maxClasses)
    .map((c) => `.${c.length > 24 ? `${c.slice(0, 23)}…` : c}`)
    .join("");
  return `${node.tagName.toLowerCase()}${id}${cls}`;
};

// Colours in any notation the browser hands back; a 1px canvas resolves the
// ones the parser doesn't know (oklch(), color-mix(), named colours).
let probe = null;
export const colorOf = (value) => {
  const parsed = parseColor(value);
  if (parsed || !value) return parsed;
  try {
    if (/var\(|^(currentcolor|inherit|initial|unset|revert(-layer)?)$/i.test(value)) return null;
    if (!CSS.supports("color", value)) return null;
    probe ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probe.canvas.width = probe.canvas.height = 1;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: Math.round((a / 255) * 1000) / 1000 };
  } catch {
    return null;
  }
};

// ↑/↓ nudge the number in an input (Shift ×10, Alt ×0.1); Esc puts back what
// it held when focused; Enter commits by leaving the field.
export const bindKeys = (input, { prop, fallback = () => "", display = trimPx, apply, revert }) => {
  let start = null;
  input.addEventListener("focus", () => {
    start = input.value;
    revert?.snapshot?.();
  });
  input.__tsayruKey = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const delta = (e.key === "ArrowUp" ? 1 : -1) * stepFor(prop, e);
      const next = nudge(input.value, delta, fallback(), prop);
      if (next == null) return false;
      e.preventDefault();
      input.value = display(next);
      apply();
      return true;
    }
    if (e.key === "Escape" && start != null && input.value !== start) {
      e.preventDefault();
      input.value = start;
      if (revert) revert.run();
      else apply();
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
      return true;
    }
    return false;
  };
};

// A text input bound to one inline property: live preview while typing,
// empty = back to the page's own value. `read` is the computed property
// shown when it differs from the one written (border-top-width for
// border-width).
export const propInput = (api, prop, { read = prop, cls = "", title, display = trimPx } = {}) => {
  const input = h("input", { class: `in ${cls}`.trim(), spellcheck: "false", title: title || prop });
  const apply = () => {
    const ok = api.setInline(prop, withUnit(prop, input.value));
    input.classList.toggle("bad", !ok);
  };
  let wasChanged = false;
  input.addEventListener("input", apply);
  bindKeys(input, {
    prop,
    display,
    fallback: () => api.computed().getPropertyValue(read),
    apply,
    revert: {
      snapshot: () => {
        wasChanged = api.inlineChanged(prop);
      },
      run: () => {
        if (wasChanged) apply();
        else api.resetInline(prop);
        input.classList.remove("bad");
      },
    },
  });
  const sync = (cs) => {
    if (api.focused() === input) return;
    const own = api.inlineChanged(prop);
    input.value = display(own ? api.target.style.getPropertyValue(prop) : cs.getPropertyValue(read).trim());
    input.classList.toggle("changed", own);
    input.classList.remove("bad");
  };
  return { node: input, sync };
};

export const selectInput = (api, prop, options, { read = prop } = {}) => {
  const select = h("select", { class: "in", title: prop });
  select.addEventListener("change", () => api.setInline(prop, select.value));
  const sync = (cs) => {
    if (api.focused() === select) return;
    const v = cs.getPropertyValue(read).trim();
    const all = options.includes(v) ? options : [v, ...options];
    if (select.options.length !== all.length || [...select.options].some((o, i) => o.value !== all[i])) {
      select.replaceChildren(...all.map((o) => h("option", { value: o }, o)));
    }
    select.value = v;
    select.classList.toggle("changed", api.inlineChanged(prop));
  };
  return { node: select, sync };
};

// Swatch (opens the native picker) + colour text + alpha %. `read()` gives
// the current colour, `write(value)` applies one and says whether it took.
export const colorControl = ({ read, write, changed = () => false, typed = () => null, focused }) => {
  const fill = h("span", { class: "sw-fill" });
  const picker = h("input", { type: "color", tabindex: "-1", title: "Pick a colour" });
  const text = h("input", { class: "in", spellcheck: "false", title: "Any CSS colour: #hex, rgb(), var(--token)…" });
  const alpha = h("input", { class: "in", spellcheck: "false", title: "Opacity, %" });
  const node = h(
    "div",
    { class: "color" },
    h("span", { class: "sw" }, fill, picker),
    text,
    h("span", { class: "alpha" }, alpha),
  );
  const current = () => colorOf(read()) || { r: 0, g: 0, b: 0, a: 1 };
  const alphaNow = () => {
    const n = parseFloat(alpha.value);
    return Number.isNaN(n) ? current().a : clamp(n / 100, 0, 1);
  };
  // Picking a colour where there was none (alpha 0) means "this colour",
  // not "this colour, invisible".
  const alphaForNew = () => {
    const a = alphaNow();
    if (a > 0) return a;
    alpha.value = "100";
    return 1;
  };
  const put = (value) => {
    const ok = write(value);
    text.classList.toggle("bad", !ok);
    if (ok) fill.style.background = value;
    return ok;
  };
  picker.addEventListener("input", () => {
    const c = parseColor(picker.value);
    if (!c) return;
    text.value = picker.value;
    put(formatColor({ ...c, a: alphaForNew() }));
  });
  const applyText = () => {
    const v = text.value.trim();
    if (!v) return;
    // A bare hex keeps the alpha field; anything else goes in as typed.
    const c = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? parseColor(v) : null;
    put(c ? formatColor({ ...c, a: alphaForNew() }) : v);
  };
  text.addEventListener("input", applyText);
  const applyAlpha = () => {
    const n = parseFloat(alpha.value);
    if (Number.isNaN(n)) return;
    put(formatColor({ ...current(), a: clamp(n / 100, 0, 1) }));
  };
  alpha.addEventListener("input", applyAlpha);
  bindKeys(alpha, { prop: "alpha", fallback: () => "100", display: (v) => String(clamp(parseFloat(v), 0, 100)), apply: applyAlpha });
  bindKeys(text, { prop: "color", apply: applyText });
  const sync = () => {
    const v = String(read() || "").trim();
    const c = colorOf(v);
    fill.style.background = v;
    picker.value = c ? toHex(c) : "#000000";
    const own = typed();
    if (focused() !== text) text.value = own && !parseColor(own) ? own : c ? toHex(c) : v;
    if (focused() !== alpha) alpha.value = c ? String(Math.round(c.a * 100)) : "";
    text.classList.toggle("changed", changed());
    alpha.classList.toggle("changed", changed());
    text.classList.remove("bad");
  };
  return { node, sync };
};

// A colour control bound to one inline property of the element.
export const colorInput = (api, prop, { read = prop } = {}) => {
  const ctl = colorControl({
    read: () => api.computed().getPropertyValue(read),
    write: (value) => api.setInline(prop, value),
    changed: () => api.inlineChanged(prop),
    typed: () => (api.inlineChanged(prop) ? api.target.style.getPropertyValue(prop) : null),
    focused: () => api.focused(),
  });
  return { node: ctl.node, sync: () => ctl.sync() };
};

export const pair = (...nodes) => h("div", { class: "pair" }, ...nodes);

export const section = (title, ...children) =>
  h(
    "div",
    { class: "sec" },
    h("div", { class: "sec-hd" }, typeof title === "string" ? title : title[0], typeof title === "string" ? null : title[1]),
    ...children,
  );
