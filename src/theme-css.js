// Design tokens shared by both shadow roots (ui-css.js, stylepanel-css.js).
// The look: a hardware tool laid over the page — a speckled matte shell, keys
// that stand up from it, one signal-blue key. Light is "chalk", dark is
// "graphite"; the OS setting picks one. Components use only these roles.
//
// Depth stays quiet: keys get a hairline ring and a short contact shadow,
// the floating shell one soft shadow, nothing glows. In dark mode drop
// shadows vanish anyway, so keys keep only a light ring.

export const FONT_FAMILY = "tsayru Onest";

export const THEME_CSS = `
:host {
  --font: "${FONT_FAMILY}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  --shell: #e2e2df;
  --key: #f5f4f2;
  --key-hover: #fbfbf9;
  --well: #d6d6d2;
  --line: #cbcbc7;
  --field-line: #7b7a76;
  --groove: rgb(255 255 255 / 0.7);
  --ink: #000;
  --on-ink: #fff;
  --text-2: #5b5b57;
  --text-3: #64645f;
  --signal: #0524fe;
  --on-signal: #fff;
  --signal-text: #0524fe;
  --signal-soft: rgb(5 36 254 / 0.1);
  --marker: #d12eaa;
  --marker-soft: #fbdef0;
  --marker-text: #a61b86;
  --marker-solid: #a61b86;
  --on-marker: #fff;
  --danger-text: #be2323;
  --danger-soft: #ffe1de;
  --danger-solid: #d02c2a;
  --on-danger: #fff;
  --caution-soft: #f6e6b4;
  --caution-text: #6b4d00;
  --disc: #f2f1ec;
  --led: #fad620;
  --scrim: rgb(20 20 18 / 0.32);
  --code-prop: #0b6380;

  --shadow-key: 0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06),
    0 2px 4px 0 oklch(0 0 0 / 0.04);
  --shadow-key-hover: 0 0 0 1px oklch(0 0 0 / 0.08), 0 1px 2px -1px oklch(0 0 0 / 0.08),
    0 2px 4px 0 oklch(0 0 0 / 0.06);
  --shadow-shell: 0 0 0 1px oklch(0 0 0 / 0.08), 0 12px 32px -12px oklch(0 0 0 / 0.22);
  --grain-opacity: 0.3;

  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --press: 150ms ease-out;
}

@media (prefers-color-scheme: dark) {
  :host {
    --shell: #1d1e20;
    --key: #2a2b2e;
    --key-hover: #323337;
    --well: #141517;
    --line: #37383b;
    --field-line: #787a7f;
    --groove: rgb(255 255 255 / 0.04);
    --ink: #f4f3f0;
    --on-ink: #1d1e20;
    --text-2: #afb1b6;
    --text-3: #96989d;
    --signal: #1746ff;
    --signal-text: #88a9ff;
    --signal-soft: rgb(60 100 255 / 0.2);
    --marker: #f061ba;
    --marker-soft: #4b233b;
    --marker-text: #ffa1d7;
    --marker-solid: #f061ba;
    --on-marker: #1d1e20;
    --danger-text: #fb817a;
    --danger-soft: #4a2321;
    --danger-solid: #f36358;
    --on-danger: #1d1e20;
    --caution-soft: #3d3214;
    --caution-text: #f5d27a;
    --disc: #f4f3f0;
    --scrim: rgb(0 0 0 / 0.5);
    --code-prop: #7dd3fc;

    --shadow-key: 0 0 0 1px oklch(1 0 0 / 0.08);
    --shadow-key-hover: 0 0 0 1px oklch(1 0 0 / 0.13);
    --shadow-shell: 0 0 0 1px oklch(1 0 0 / 0.08), 0 12px 32px -12px oklch(0 0 0 / 0.6);
    --grain-opacity: 0.22;
  }
}

:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

button {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:disabled { cursor: default; }
:focus-visible { outline: 2.5px solid var(--signal); outline-offset: 2px; }

svg.i {
  display: block;
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
svg.i .fill { fill: currentColor; stroke: none; }

/* The speckle on every shell (icons.js grain()). */
.shell { position: relative; isolation: isolate; background: var(--shell); box-shadow: var(--shadow-shell); }
.grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: var(--grain-opacity);
}

/* Reduced motion: no movement or scale; state changes still cross-fade.
   Components swap their entrance keyframes for "fade" (ui-css.js). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-property: opacity, background-color, color, box-shadow !important;
    scale: none !important;
  }
}
@keyframes fade { from { opacity: 0; } }
`;
