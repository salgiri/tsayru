// Stylesheet of the page-facing UI (ui.js): sidebar, dialogs, toasts and the
// page highlight, all inside one closed shadow root. Tokens: theme-css.js.

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

/* ---------- sidebar ---------- */

.panel {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 368px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  overflow: hidden;
  pointer-events: auto;
  transition: transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1.08), visibility 0s;
}
.panel.hidden {
  transform: translateX(calc(100% + 24px));
  visibility: hidden;
  transition: transform 200ms ease-in, visibility 0s 200ms;
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
  transition: background-color 120ms, color 120ms;
}
.round:hover { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
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
  border-radius: 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px 0 10px;
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -2px 0 rgb(0 0 0 / 0.18),
    0 10px 20px -10px var(--signal-glow);
  transition: transform 90ms ease, box-shadow 90ms ease;
}
.pick:active {
  transform: translateY(1px);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.2), inset 0 -1px 0 rgb(0 0 0 / 0.18),
    0 4px 10px -6px var(--signal-glow);
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
.pick-sub { font-size: 12.5px; font-weight: 500; opacity: 0.78; white-space: nowrap; }
.led {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--led);
  box-shadow: 0 0 0 3px rgb(250 214 32 / 0.22), 0 0 14px 2px rgb(250 214 32 / 0.85);
  animation: led 1.4s ease-in-out infinite;
}
.pick.on .disc svg.i { animation: spin 6s linear infinite; }
@keyframes led {
  50% { opacity: 0.45; box-shadow: 0 0 0 2px rgb(250 214 32 / 0.12), 0 0 6px 0 rgb(250 214 32 / 0.5); }
}
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
  font-size: 11.5px;
  font-weight: 650;
  color: var(--ink);
  transition: transform 90ms ease, background-color 120ms;
}
.square:hover:not(:disabled) { background: var(--key-hover); }
.square:active:not(:disabled) { transform: translateY(1px); box-shadow: var(--shadow-press); }
.square:disabled { opacity: 0.38; }
.deck .square { height: 68px; border-radius: 22px; }
.square.on { color: var(--signal-text); box-shadow: var(--shadow-key), inset 0 0 0 2px var(--signal); }

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
  font: 600 11.5px/1 var(--font);
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
  box-shadow: var(--shadow-press);
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
}
.seg button > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.seg button:hover { color: var(--ink); }
.seg button.on { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.n { font-variant-numeric: tabular-nums; font-weight: 500; opacity: 0.66; }
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
}
.tag svg.i { width: 14px; height: 14px; stroke-width: 2.4; }
.tag:hover { box-shadow: inset 0 0 0 1.5px var(--marker); }
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
  transition: background-color 120ms, box-shadow 120ms;
}
.task + .task::before {
  content: "";
  position: absolute;
  top: 0;
  left: 52px;
  right: 10px;
  border-top: 1px solid var(--line);
}
.task:hover,
.task:focus-within,
.task.editing { background: var(--key); box-shadow: var(--shadow-key); }
.task:hover::before,
.task:hover + .task::before,
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
.acts { display: flex; gap: 2px; margin-right: -4px; opacity: 0; transition: opacity 120ms; }
.task:hover .acts,
.task:focus-within .acts { opacity: 1; }
@media (hover: none) { .acts { opacity: 1; } }
.act {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-2);
}
.act:hover { background: var(--well); color: var(--ink); }
.act svg.i { width: 18px; height: 18px; }
.sel {
  font: 11.5px/1.35 var(--mono);
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
  padding: 12px 14px;
  border: 0;
  border-radius: 16px;
  background: var(--well);
  box-shadow: var(--shadow-press);
  color: var(--ink);
  font: 15px/1.45 var(--font);
  outline: none;
}
.field::placeholder { color: var(--text-2); }
.field:focus { box-shadow: var(--shadow-press), 0 0 0 2px var(--signal); }
.edit-ft { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.kbd-in {
  padding: 3px 6px;
  border-radius: 6px;
  background: color-mix(in oklab, currentColor 14%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  opacity: 0.8;
}

/* empty list: the three steps, in order */
.steps { list-style: none; margin: 0; padding: 4px 10px 6px; display: flex; flex-direction: column; }
.steps li { display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 12px; padding: 12px 0; }
.steps li + li { border-top: 1px solid var(--line); }
.steps .num { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.steps li:first-child .num { background: var(--signal); color: var(--on-signal); box-shadow: none; }
.steps b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 30px; }
.steps p { margin: 0; font-size: 13.5px; color: var(--text-2); }
.nothing { padding: 22px 12px; text-align: center; font-size: 14px; color: var(--text-2); }
.nothing button { display: block; margin: 6px auto 0; color: var(--signal-text); font-weight: 650; }
.nothing button:hover { text-decoration: underline; }

/* ship bar: send is the ink key, copy and clear stand beside it */
.ship { display: grid; grid-template-columns: minmax(0, 1fr) 60px 60px; gap: 8px; padding: 12px; }
.send {
  height: 64px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 0 9px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18), 0 10px 18px -10px rgb(0 0 0 / 0.55);
  transition: transform 90ms ease;
}
.send:active:not(:disabled) { transform: translateY(1px); }
.send:disabled { opacity: 0.38; }
.send .disc { width: 46px; height: 46px; background: var(--signal); color: var(--on-signal); }
.send .disc svg.i { width: 22px; height: 22px; margin: 1px 2px 0 0; }
.send-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- buttons shared by dialogs ---------- */

.btn {
  height: 52px;
  padding: 0 20px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: transform 90ms ease, background-color 120ms;
}
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn.quiet { color: var(--text-2); }
.btn.quiet:hover { color: var(--ink); background: var(--key); box-shadow: var(--shadow-key); }
.btn.primary {
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), inset 0 -2px 0 rgb(0 0 0 / 0.16),
    0 10px 18px -10px var(--signal-glow);
}
.btn.primary:focus-visible { outline-color: var(--ink); }
.btn.ink { background: var(--ink); color: var(--on-ink); }
.btn.small { height: 38px; padding: 0 14px; border-radius: 13px; font-size: 13.5px; }

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
  box-shadow: 0 16px 36px -12px rgb(0 0 0 / 0.5);
  font-size: 14.5px;
  font-weight: 600;
  pointer-events: auto;
  animation: toast 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.toast.has-act { padding-right: 8px; }
.toast .disc { width: 32px; height: 32px; background: var(--signal); color: var(--on-signal); }
.toast .disc svg.i { width: 18px; height: 18px; stroke-width: 2.6; }
.toast.warn .disc { background: var(--marker-solid); color: var(--on-marker); }
.toast-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast-act {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--on-ink) 16%, transparent);
  font-size: 13.5px;
  font-weight: 700;
  flex: none;
}
.toast-act:hover { background: color-mix(in oklab, var(--on-ink) 26%, transparent); }
@keyframes toast {
  from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.96); }
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
  animation: fade 160ms ease;
}
.dialog {
  width: min(500px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 28px;
  overflow: hidden;
  animation: rise 220ms cubic-bezier(0.2, 0.9, 0.3, 1.1);
}
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(12px) scale(0.98); } }
.dlg-hd { display: flex; align-items: center; gap: 10px; padding: 2px 0 0 6px; }
.dlg-title { flex: 1; font-size: 21px; font-weight: 700; letter-spacing: -0.025em; }
.target {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: var(--key);
  box-shadow: var(--shadow-key);
}
.target:has(.shot) { padding: 8px 8px 12px; }
.shot {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 15px;
  background: var(--well);
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
.dialog .field { min-height: 112px; font-size: 16px; padding: 14px 16px; border-radius: 20px; }
.dlg-ft { display: flex; align-items: center; gap: 8px; }
.dlg-ft .hints { padding: 0 0 0 6px; margin-right: auto; gap: 6px 12px; }

/* chat picker */
.picker { width: min(520px, 100%); }
.status { padding: 0 6px; font-size: 14px; color: var(--text-2); }
.status.warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 18px;
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
  border-radius: 22px;
  background: var(--key);
  box-shadow: var(--shadow-key);
  transition: transform 90ms ease, background-color 120ms;
}
.chat:hover { background: var(--key-hover); }
.chat:active { transform: translateY(1px); }
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

/* ---------- page highlight (what a click would pick) ---------- */

.hl {
  position: fixed;
  left: 0;
  top: 0;
  display: none;
  border: 2px solid var(--signal);
  border-radius: 6px;
  background: rgb(5 36 254 / 0.07);
  box-shadow: 0 0 0 4px rgb(5 36 254 / 0.14);
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
  box-shadow: 0 6px 14px -6px var(--signal-glow);
}
.hl-tag b { font-weight: inherit; overflow: hidden; text-overflow: ellipsis; }
.hl-tag span { opacity: 0.72; font-weight: 550; font-variant-numeric: tabular-nums; flex: none; }
.hl.below .hl-tag { bottom: auto; top: calc(100% + 6px); }
.hl.inside .hl-tag { bottom: auto; top: 4px; left: 4px; }
`;
