// Value helpers for the style editor: lengths, colours, shadows. Pure.

import { splitTopLevel } from "./cssrules.js";

const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const NUMBER_RE = /^(-?\d*\.?\d+)([a-z%]*)$/i;

// Properties where a bare number is a valid value on its own.
const UNITLESS = new Set([
  "opacity",
  "font-weight",
  "line-height",
  "z-index",
  "order",
  "flex-grow",
  "flex-shrink",
  "zoom",
  "orphans",
  "widows",
]);

// Small-range properties step by tenths.
const FINE_STEP = new Set(["opacity", "line-height"]);

// `24` → `24px` where a bare number would be invalid; anything else as typed.
export const withUnit = (prop, value) => {
  const v = String(value ?? "").trim();
  if (
    /^-?\d*\.?\d+$/.test(v) &&
    Number(v) !== 0 &&
    !UNITLESS.has(prop) &&
    !String(prop).startsWith("--")
  ) {
    return `${v}px`;
  }
  return v;
};

// `22px` → `22`, `22.504px` → `22.5`; anything else unchanged.
export const trimPx = (value) => {
  const s = String(value ?? "").trim();
  return /^-?\d*\.?\d+px$/.test(s) ? String(round(parseFloat(s))) : s;
};

// The step ArrowUp/ArrowDown apply: DevTools' 1 / Shift 10 / Alt 0.1, a
// tenth of that for opacity and line-height.
export const stepFor = (prop, { shiftKey, altKey } = {}) => {
  const base = shiftKey ? 10 : altKey ? 0.1 : 1;
  return FINE_STEP.has(prop) ? base / 10 : base;
};

// `22px` + 1 → `23px`. A value with no number (`auto`, `normal`) nudges from
// `fallback` (the computed value). Returns null when neither has a number.
export const nudge = (value, delta, fallback, prop) => {
  const m =
    String(value ?? "").trim().match(NUMBER_RE) ||
    String(fallback ?? "").trim().match(NUMBER_RE);
  if (!m) return null;
  let n = round(parseFloat(m[1]) + delta, 3);
  if (prop === "opacity") n = clamp(n, 0, 1);
  if (prop === "font-weight") n = clamp(n, 1, 1000);
  return `${n}${m[2]}`;
};

// ---------- Colours ----------

// Parse the colours getComputedStyle and CSSOM hand back: #rgb[a] and
// #rrggbb[aa], rgb()/rgba() in comma or space syntax, color(srgb …),
// `transparent`. Returns { r, g, b, a } or null.
export const parseColor = (value) => {
  const s = String(value ?? "").trim().toLowerCase();
  let m;
  if ((m = s.match(/^#([0-9a-f]+)$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const byte = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? round(byte(6) / 255, 3) : 1 };
  }
  if ((m = s.match(/^rgba?\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const channel = (x) => (x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x));
    const alpha = (x) =>
      x == null ? 1 : x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x);
    return tidy({ r: channel(p[0]), g: channel(p[1]), b: channel(p[2]), a: alpha(p[3]) });
  }
  if ((m = s.match(/^color\(\s*srgb\s+([^)]*)\)$/))) {
    const p = m[1].split(/[\s/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const unit = (x) => (x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x));
    return tidy({
      r: unit(p[0]) * 255,
      g: unit(p[1]) * 255,
      b: unit(p[2]) * 255,
      a: p[3] == null ? 1 : unit(p[3]),
    });
  }
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  return null;
};

const tidy = ({ r, g, b, a }) =>
  [r, g, b, a].some(Number.isNaN)
    ? null
    : {
        r: clamp(Math.round(r), 0, 255),
        g: clamp(Math.round(g), 0, 255),
        b: clamp(Math.round(b), 0, 255),
        a: clamp(round(a, 3), 0, 1),
      };

export const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

// How the editor writes a colour back: hex when opaque, rgb() with alpha
// otherwise.
export const formatColor = (c) =>
  !c ? "" : c.a >= 1 ? toHex(c) : `rgb(${c.r} ${c.g} ${c.b} / ${round(c.a, 3)})`;

// ---------- Shadows ----------

// var() could be either; in a shadow it is far more often the colour.
const isLength = (t) => NUMBER_RE.test(t) || /^(calc|min|max|clamp)\(/i.test(t);

// `rgba(0, 0, 0, 0.1) 0px 4px 12px 0px, … inset` → layers. Computed values
// put the colour first, authored ones usually last; both parse.
export const parseShadows = (value) => {
  const v = String(value ?? "").trim();
  if (!v || v === "none") return [];
  return splitTopLevel(v, ",").map(parseShadowLayer).filter(Boolean);
};

const parseShadowLayer = (text) => {
  let inset = false;
  const lengths = [];
  const color = [];
  for (const token of splitTopLevel(text, " ")) {
    if (token.toLowerCase() === "inset") inset = true;
    else if (isLength(token) && lengths.length < 4) lengths.push(token);
    else color.push(token);
  }
  if (lengths.length < 2 || lengths.length > 4) return null;
  return {
    inset,
    x: lengths[0],
    y: lengths[1],
    blur: lengths[2] || "0px",
    spread: lengths[3] || "0px",
    color: color.join(" ") || "currentcolor",
  };
};

export const formatShadows = (layers) =>
  layers && layers.length
    ? layers
        .map((l) =>
          [
            l.inset ? "inset" : null,
            withUnit("x", l.x),
            withUnit("y", l.y),
            withUnit("blur", l.blur),
            withUnit("spread", l.spread),
            l.color,
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(", ")
    : "none";

// One-click shadows for the quick panel.
export const SHADOW_PRESETS = [
  ["None", "none"],
  ["S", "0 1px 2px rgb(0 0 0 / 0.08)"],
  ["M", "0 4px 12px rgb(0 0 0 / 0.12)"],
  ["L", "0 12px 32px rgb(0 0 0 / 0.16)"],
  ["Ring", "inset 0 0 0 1px rgb(0 0 0 / 0.12)"],
];
