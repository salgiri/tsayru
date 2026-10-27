// Design tokens shared by both shadow roots (ui-css.js, stylepanel-css.js).
// The look: a hardware tool laid over the page — a speckled matte shell, keys
// that stand up from it, one signal-blue key. Light is "chalk", dark is
// "graphite"; the OS setting picks one. Components use only these roles.

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
  --groove: rgb(255 255 255 / 0.7);
  --ink: #000;
  --on-ink: #fff;
  --text-2: #5b5b57;
  --text-3: #64645f;
  --signal: #0524fe;
  --on-signal: #fff;
  --signal-text: #0524fe;
  --signal-soft: rgb(5 36 254 / 0.1);
  --signal-glow: rgb(5 36 254 / 0.55);
  --marker: #d12eaa;
  --marker-soft: #fbdef0;
  --marker-text: #a61b86;
  --marker-solid: #a61b86;
  --on-marker: #fff;
  --caution-soft: #f6e6b4;
  --caution-text: #6b4d00;
  --disc: #f2f1ec;
  --led: #fad620;
  --scrim: rgb(20 20 18 / 0.32);
  --code-prop: #0b6380;

  --shadow-key: inset 0 1px 0 rgb(255 255 255 / 0.9), 0 1px 1px rgb(0 0 0 / 0.06),
    0 4px 10px -4px rgb(0 0 0 / 0.2);
  --shadow-press: inset 0 1px 2px rgb(0 0 0 / 0.14);
  --shadow-shell: 0 0 0 1px rgb(0 0 0 / 0.07), 0 2px 4px rgb(0 0 0 / 0.05),
    0 24px 56px -16px rgb(0 0 0 / 0.38);
  --grain-opacity: 0.32;
}

@media (prefers-color-scheme: dark) {
  :host {
    --shell: #1d1e20;
    --key: #2a2b2e;
    --key-hover: #323337;
    --well: #141517;
    --line: #37383b;
    --groove: rgb(255 255 255 / 0.04);
    --ink: #f4f3f0;
    --on-ink: #1d1e20;
    --text-2: #afb1b6;
    --text-3: #96989d;
    --signal: #1746ff;
    --signal-text: #88a9ff;
    --signal-soft: rgb(60 100 255 / 0.2);
    --signal-glow: rgb(23 70 255 / 0.7);
    --marker: #f061ba;
    --marker-soft: #4b233b;
    --marker-text: #ffa1d7;
    --marker-solid: #f061ba;
    --on-marker: #1d1e20;
    --caution-soft: #3d3214;
    --caution-text: #f5d27a;
    --disc: #f4f3f0;
    --scrim: rgb(0 0 0 / 0.5);
    --code-prop: #7dd3fc;

    --shadow-key: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 1px 1px rgb(0 0 0 / 0.4),
      0 6px 14px -6px rgb(0 0 0 / 0.7);
    --shadow-press: inset 0 1px 3px rgb(0 0 0 / 0.5);
    --shadow-shell: 0 0 0 1px rgb(255 255 255 / 0.07), 0 2px 4px rgb(0 0 0 / 0.3),
      0 28px 64px -16px rgb(0 0 0 / 0.75);
    --grain-opacity: 0.34;
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
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
svg.i .fill { fill: currentColor; stroke: none; }

/* The speckle on every shell (icons.js grain()); its own layer, so repaints
   around it never re-run the noise filter. */
.shell { position: relative; isolation: isolate; background: var(--shell); box-shadow: var(--shadow-shell); }
.grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: var(--grain-opacity);
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
