// Stylesheet of the page-facing UI (ui.js): sidebar, dialogs, toasts and the
// page highlight, all inside one closed shadow root. Tokens: theme-css.js.
// Radii nest concentrically: shell 32 → keys 20 at a 12px inset; dialog 32 →
// footer buttons 16 at a 16px inset.

import { THEME_CSS } from "./theme-css.js";

export const UI_CSS =
  THEME_CSS +
  `
.ui {
  font: 14px/1.4 var(--font);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-synthesis: none;
  text-align: left;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---------- sidebar ---------- */

.panel {
  container: panel / inline-size;
  position: fixed;
  top: 12px;
  right: 12px;
  width: 368px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  border-radius: 32px;
  overflow: hidden;
  pointer-events: auto;
  transition: transform 300ms var(--ease-out), opacity 200ms ease-out, visibility 0s;
}
.panel.hidden {
  transform: translateX(calc(100% + 24px));
  opacity: 0;
  visibility: hidden;
  transition: transform 180ms ease-out, opacity 180ms ease-out, visibility 0s 180ms;
}

.hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 4px 16px;
}
.mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  overflow: hidden;
  flex: none;
  background: var(--signal);
}
.mark svg { display: block; width: 100%; height: 100%; }
.word {
  font-size: 21px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.04em;
  padding-bottom: 2px;
}
.tally {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.round {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  color: var(--text-2);
  transition: background-color 150ms ease-out, color 150ms ease-out, scale var(--press);
}
.round svg.i { width: 20px; height: 20px; }

/* the pick row: one loud key, one quiet one */
.deck {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 68px;
  gap: 8px;
  padding: 10px 12px 0;
}
.pick {
  position: relative;
  height: 68px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px 0 10px;
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22);
  transition: scale var(--press);
}
.pick:focus-visible { outline-color: var(--ink); }
.disc {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--disc);
  color: #000;
}
.disc svg.i { width: 24px; height: 24px; }
.pick-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pick-title {
  font-size: 18px;
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-sub { font-size: 12.5px; font-weight: 500; opacity: 0.8; white-space: nowrap; }
.led {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--led);
  box-shadow: 0 0 0 3px rgb(250 214 32 / 0.22), 0 0 8px 1px rgb(250 214 32 / 0.7);
  animation: led 1.4s ease-in-out infinite;
}
.pick.on .disc svg.i { animation: spin 6s linear infinite; }
@keyframes led { 50% { opacity: 0.45; } }
@keyframes spin { to { transform: rotate(360deg); } }

.square {
  height: 64px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--key);
  box-shadow: var(--shadow-key);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink);
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out, scale var(--press);
}
.square:disabled { opacity: 0.38; }
.deck .square { height: 68px; }
.square.on { color: var(--signal-text); box-shadow: inset 0 0 0 2px var(--signal); }
.square.danger { color: var(--danger-text); }

.hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 12px 18px 14px;
  font-size: 12.5px;
  color: var(--text-2);
}
.hint { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.kbd {
  display: inline-flex;
  align-items: center;
  height: 22px;
  min-width: 22px;
  padding: 0 7px;
  border-radius: 7px;
  background: var(--key);
  box-shadow: var(--shadow-key);
  color: var(--ink);
  font: 600 12px/1 var(--font);
  white-space: nowrap;
}

.groove {
  height: 2px;
  margin: 0 16px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--groove);
  flex: none;
}

/* filters: hosts as a segmented control, #tags as marker chips */
.filters { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 4px; }
.seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 15px;
  background: var(--well);
  overflow-x: auto;
  scrollbar-width: none;
}
.seg::-webkit-scrollbar { display: none; }
.seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
  flex: none;
  max-width: 190px;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.seg button > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.seg button.on { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.n { font-variant-numeric: tabular-nums; font-weight: 500; opacity: 0.7; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 2px; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  background: var(--marker-soft);
  box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--marker) 55%, transparent);
  color: var(--marker-text);
  font-size: 13px;
  font-weight: 600;
  transition: box-shadow 150ms ease-out, background-color 150ms ease-out;
}
.tag svg.i { width: 14px; height: 14px; stroke-width: 2.4; }
.tag.on { background: var(--marker-solid); color: var(--on-marker); box-shadow: none; }

/* task list: flat rows on the shell; the one under the pointer stands up */
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 8px 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.task {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  column-gap: 12px;
  padding: 12px 10px;
  border-radius: 20px;
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.task + .task::before {
  content: "";
  position: absolute;
  top: 0;
  left: 52px;
  right: 10px;
  border-top: 1px solid var(--line);
}
.task:focus-within,
.task.editing { background: var(--key); box-shadow: var(--shadow-key); }
.task:focus-within::before,
.task:focus-within + .task::before,
.task.editing::before,
.task.editing + .task::before { border-color: transparent; }
.num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.num svg.i { width: 16px; height: 16px; stroke-width: 2.6; }
.body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.row1 { display: flex; align-items: center; gap: 4px; min-height: 30px; }
.label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acts { display: flex; gap: 2px; margin-right: -4px; opacity: 0; transition: opacity 150ms ease-out; }
.task:focus-within .acts { opacity: 1; }
@media (hover: none) { .acts { opacity: 1; } }
.act {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.act svg.i { width: 18px; height: 18px; }
.sel {
  font: 12px/1.35 var(--mono);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.text {
  margin-top: 3px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.text.empty { color: var(--text-3); }
.styled {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px 0 7px;
  border-radius: 999px;
  background: var(--signal-soft);
  color: var(--signal-text);
  font-weight: 650;
  white-space: nowrap;
  flex: none;
}
.chip svg.i { width: 14px; height: 14px; stroke-width: 2.4; }
.props { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task.done .num { background: var(--well); color: var(--text-2); }
.task.done .label,
.task.done .text { color: var(--text-3); }
.task.done .text { text-decoration: line-through; text-decoration-thickness: 1.5px; }

.edit { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.field {
  display: block;
  width: 100%;
  min-height: 84px;
  resize: vertical;
  margin: 0;
  padding: 11px 13px;
  border: 1px solid var(--field-line);
  border-radius: 14px;
  background: var(--well);
  color: var(--ink);
  font: 15px/1.45 var(--font);
  outline: none;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.field::placeholder { color: var(--text-2); }
.field:focus { border-color: var(--signal); box-shadow: 0 0 0 1px var(--signal); }
.edit-ft { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.kbd-in {
  padding: 3px 6px;
  border-radius: 6px;
  background: color-mix(in oklab, currentColor 14%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  opacity: 0.85;
}

/* empty list: the three steps, in order */
.steps { list-style: none; margin: 0; padding: 4px 10px 6px; display: flex; flex-direction: column; }
.steps li { display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 12px; padding: 12px 0; }
.steps li + li { border-top: 1px solid var(--line); }
.steps .num { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.steps li:first-child .num { background: var(--signal); color: var(--on-signal); box-shadow: none; }
.steps b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 30px; }
.steps p { margin: 0; font-size: 13.5px; color: var(--text-2); text-wrap: pretty; }
.nothing { padding: 22px 12px; text-align: center; font-size: 14px; color: var(--text-2); }
.nothing button { display: block; margin: 6px auto 0; color: var(--signal-text); font-weight: 650; }

/* ship bar: send is the ink key, copy and clear stand beside it */
.ship { display: grid; grid-template-columns: minmax(0, 1fr) 60px 60px; gap: 8px; padding: 12px; }
.send {
  height: 64px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 0 9px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16);
  transition: scale var(--press);
}
.send:disabled { opacity: 0.38; }
.send .disc { width: 46px; height: 46px; background: var(--signal); color: var(--on-signal); }
.send .disc svg.i { width: 22px; height: 22px; margin: 1px 2px 0 0; }
.send-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* A narrow window (or 200% zoom): drop decoration before text gets cut. */
@container panel (max-width: 330px) {
  .ship { grid-template-columns: minmax(0, 1fr) 52px 52px; }
  .send .disc { display: none; }
  .send { padding: 0 12px; font-size: 15px; }
  .hints { display: none; }
  .pick { gap: 10px; padding: 0 12px 0 8px; }
  .pick .disc { width: 40px; height: 40px; }
  .pick-title { font-size: 16px; }
}

/* ---------- buttons shared by dialogs ---------- */

.btn {
  height: 52px;
  padding: 0 20px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: background-color 150ms ease-out, color 150ms ease-out, scale var(--press);
}
.btn.quiet { color: var(--text-2); }
.btn.primary {
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22);
}
.btn.primary:focus-visible { outline-color: var(--ink); }
.btn.ink { background: var(--ink); color: var(--on-ink); }
.btn.small { height: 38px; padding: 0 14px; border-radius: 12px; font-size: 13.5px; }

/* Press: every key gives way a little, the instant it's pressed. */
:is(.round, .pick, .square, .send, .btn, .toast-act):not(:disabled):active { scale: 0.96; }

/* ---------- toast ---------- */

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 32px);
  min-height: 48px;
  padding: 8px 18px 8px 8px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.35);
  font-size: 14.5px;
  font-weight: 600;
  pointer-events: auto;
  animation: toast-in 240ms var(--ease-out);
}
.toast.has-act { padding-right: 8px; }
.toast .disc { width: 32px; height: 32px; background: var(--signal); color: var(--on-signal); }
.toast .disc svg.i { width: 18px; height: 18px; stroke-width: 2.6; }
.toast.warn .disc { background: var(--marker-solid); color: var(--on-marker); }
.toast.danger .disc { background: var(--danger-solid); color: var(--on-danger); }
.toast-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast-act {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--on-ink) 16%, transparent);
  font-size: 13.5px;
  font-weight: 700;
  flex: none;
  transition: background-color 150ms ease-out, scale var(--press);
}
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); filter: blur(4px); }
}

/* ---------- dialogs ---------- */

.scrim {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--scrim);
  pointer-events: auto;
  animation: fade 160ms ease-out;
}
.dialog {
  width: min(500px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 32px;
  overflow: hidden;
  animation: dialog-in 240ms var(--ease-out);
}
@keyframes dialog-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } }
.dlg-hd { display: flex; align-items: center; gap: 10px; padding: 2px 0 0 6px; }
.dlg-title { flex: 1; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; text-wrap: balance; }
.target {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  background: var(--key);
  box-shadow: var(--shadow-key);
}
.target:has(.shot) { padding: 8px 8px 12px; }
.shot {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 12px;
  background: var(--well);
  outline: 1px solid oklch(0 0 0 / 0.1);
  outline-offset: -1px;
}
.target-meta { display: flex; flex-direction: column; gap: 2px; padding: 0 6px; min-width: 0; }
.target-meta b {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.target-meta .sel { white-space: normal; word-break: break-all; }
.dialog .field { min-height: 112px; font-size: 16px; padding: 13px 15px; border-radius: 16px; }
.dlg-ft { display: flex; align-items: center; gap: 8px; }
.dlg-ft .hints { padding: 0 0 0 6px; margin-right: auto; gap: 6px 12px; }

/* chat picker */
.picker { width: min(520px, 100%); }
.status { padding: 0 6px; font-size: 14px; color: var(--text-2); text-wrap: pretty; }
.status.warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--caution-soft);
  color: var(--caution-text);
  font-weight: 550;
}
.status.warn svg.i { width: 20px; height: 20px; margin-top: 1px; }
.chats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: 52vh;
  margin: 0 -4px;
  padding: 2px 4px 6px;
}
.chat {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  width: 100%;
  padding: 10px 14px 10px 10px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: var(--key);
  box-shadow: var(--shadow-key);
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.chat:active { background: var(--well); }
.chat .disc { width: 44px; height: 44px; background: var(--ink); color: var(--on-ink); }
.chat .disc svg.i { width: 20px; height: 20px; }
.chat-text { min-width: 0; }
.chat-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat .sel { display: block; }
.now {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--signal-text);
  white-space: nowrap;
}
.now::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 3px var(--signal-soft);
}
.opens { display: flex; flex-wrap: wrap; gap: 8px; }

/* ---------- hover, only where a pointer can hover ---------- */

@media (hover: hover) {
  .round:hover { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
  .square:hover:not(:disabled) { background: var(--key-hover); box-shadow: var(--shadow-key-hover); }
  .square.danger:hover:not(:disabled) { background: var(--danger-soft); }
  .seg button:hover { color: var(--ink); }
  .tag:hover { box-shadow: inset 0 0 0 1.5px var(--marker); }
  .task:hover { background: var(--key); box-shadow: var(--shadow-key); }
  .task:hover::before,
  .task:hover + .task::before { border-color: transparent; }
  .task:hover .acts { opacity: 1; }
  .act:hover { background: var(--well); color: var(--ink); }
  .act.danger:hover { background: var(--danger-soft); color: var(--danger-text); }
  .nothing button:hover { text-decoration: underline; }
  .btn.quiet:hover { color: var(--ink); background: var(--key); box-shadow: var(--shadow-key); }
  .btn.primary:hover { background: color-mix(in oklab, var(--signal) 90%, white); }
  .toast-act:hover { background: color-mix(in oklab, var(--on-ink) 26%, transparent); }
  .chat:hover { background: var(--key-hover); box-shadow: var(--shadow-key-hover); }
}

/* ---------- page highlight (what a click would pick) ---------- */

.hl {
  position: fixed;
  left: 0;
  top: 0;
  display: none;
  border: 2px solid var(--signal);
  border-radius: 6px;
  background: rgb(5 36 254 / 0.06);
  box-shadow: 0 0 0 3px rgb(5 36 254 / 0.12);
  pointer-events: none;
}
.hl-tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 6px);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 16px));
  height: 26px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--signal);
  color: var(--on-signal);
  font: 650 12.5px/1 var(--font);
  white-space: nowrap;
}
.hl-tag b { font-weight: inherit; overflow: hidden; text-overflow: ellipsis; }
.hl-tag span { opacity: 0.75; font-weight: 550; font-variant-numeric: tabular-nums; flex: none; }
.hl.below .hl-tag { bottom: auto; top: calc(100% + 6px); }
.hl.inside .hl-tag { bottom: auto; top: 4px; left: 4px; }

@media (prefers-color-scheme: dark) {
  .shot { outline-color: oklch(1 0 0 / 0.1); }
}

/* Reduced motion: entrances fade in place, nothing pulses or spins. */
@media (prefers-reduced-motion: reduce) {
  .dialog,
  .toast { animation-name: fade; }
  .led,
  .pick.on .disc svg.i { animation: none; }
  .panel.hidden { transform: none; }
}
`;
