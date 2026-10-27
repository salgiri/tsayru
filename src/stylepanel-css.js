// The style panel's CSS, adopted into its closed shadow root (page CSS can't
// reach in, and this can't leak out). Same tokens as the sidebar
// (theme-css.js); denser, because it's a DevTools-grade editor.

import { THEME_CSS } from "./theme-css.js";

export const PANEL_CSS =
  THEME_CSS +
  `
.panel {
  position: absolute;
  pointer-events: auto;
  width: 340px;
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  color: var(--ink);
  border-radius: 24px;
  font: 12px/1.4 var(--font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-synthesis: none;
  overflow: hidden;
  text-align: left;
  animation: rise 200ms cubic-bezier(0.2, 0.9, 0.3, 1.1);
}
@keyframes rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } }

/* header */
.hd { display: flex; align-items: center; gap: 6px; padding: 12px 8px 4px 16px; cursor: grab; user-select: none; }
.hd:active { cursor: grabbing; }
.hd-main { flex: 1; min-width: 0; }
.hd-title { font: 600 13px/1.35 var(--mono); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-sub { font-size: 11.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-2);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  line-height: 32px;
  padding: 0;
  flex: none;
}
.ic { display: grid; place-items: center; }
.ic svg.i { width: 18px; height: 18px; }
.ic:hover { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.ic.small { width: 24px; height: 24px; line-height: 24px; font-size: 14px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 1px 4px; padding: 0 16px 8px; font: 10.5px/1.4 var(--mono); color: var(--text-3); }
.crumb { appearance: none; border: 0; background: none; padding: 0; color: var(--text-3); cursor: pointer; font: inherit; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb:hover { color: var(--signal-text); }
.crumb.cur { color: var(--ink); font-weight: 600; cursor: default; }
.warn { margin: 0 12px 8px; padding: 8px 10px; border-radius: 12px; background: var(--caution-soft); color: var(--caution-text); font-size: 11.5px; font-weight: 550; }

/* tabs: a segmented control, like the sidebar's host filter */
.tabs { display: flex; align-items: center; gap: 2px; margin: 0 12px 8px; padding: 3px; border-radius: 13px; background: var(--well); box-shadow: var(--shadow-press); }
.tab { appearance: none; border: 0; background: none; color: var(--text-2); font-weight: 650; font-size: 12.5px; height: 28px; padding: 0 12px; border-radius: 10px; cursor: pointer; }
.tab:hover { color: var(--ink); }
.tab.on { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.count { margin-left: auto; padding-right: 8px; font-size: 11.5px; font-weight: 600; color: var(--text-3); }
.count.has { color: var(--signal-text); }

.body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 12px 10px; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; border: 2px solid var(--shell); }

/* footer */
.ft { display: flex; gap: 6px; align-items: center; padding: 10px; border-top: 1px solid var(--line); box-shadow: inset 0 1px 0 var(--groove); }
.ft .note { flex: 1; min-width: 0; height: 36px; font: 13px var(--font); padding: 0 12px; border-radius: 12px; }
.btn { appearance: none; border: 0; height: 36px; border-radius: 12px; padding: 0 12px; font-weight: 650; font-size: 12.5px; cursor: pointer; background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); white-space: nowrap; transition: transform 90ms ease; }
.btn:hover:not(:disabled) { background: var(--key-hover); }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary {
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), inset 0 -2px 0 rgb(0 0 0 / 0.16), 0 8px 16px -10px var(--signal-glow);
}
.btn.primary:hover { background: var(--signal); filter: brightness(1.08); }
.btn.primary:focus-visible { outline-color: var(--ink); }

/* inputs */
.in { width: 100%; min-width: 0; height: 26px; background: var(--well); color: var(--ink); border: 1px solid transparent; border-radius: 8px; padding: 0 7px; font: 11.5px/24px var(--mono); outline: none; box-shadow: var(--shadow-press); }
.in::placeholder { color: var(--text-3); }
.in:focus { border-color: var(--signal); background: var(--key); }
.in.changed { color: var(--signal-text); font-weight: 600; }
.in.bad, .in.bad:focus { border-color: var(--marker); }
select.in { padding: 0 3px; cursor: pointer; }

/* quick tab */
.sec { padding: 10px 0 9px; border-bottom: 1px solid var(--line); }
.sec:last-child { border-bottom: 0; }
.sec-hd { display: flex; align-items: center; justify-content: space-between; min-height: 20px; margin-bottom: 6px; font-size: 12.5px; font-weight: 700; letter-spacing: -0.005em; color: var(--ink); }
.row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 6px; margin: 5px 0; }
.lbl { color: var(--text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.lbl.changed { color: var(--signal-text); font-weight: 600; cursor: pointer; }
.lbl.changed::after { content: " ↺"; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.color { display: grid; grid-template-columns: 26px minmax(0, 1fr) 54px; gap: 6px; align-items: center; }
.alpha { position: relative; display: block; }
.alpha::after { content: "%"; position: absolute; right: 7px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; font-size: 11px; }
.alpha .in { padding-right: 18px; }
.sw { position: relative; display: block; width: 26px; height: 26px; border-radius: 8px; overflow: hidden; background: repeating-conic-gradient(#b8b8b4 0 25%, #f5f4f2 0 50%) 0 0 / 8px 8px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.14); cursor: pointer; }
.sw.small { width: 15px; height: 15px; border-radius: 4px; flex: none; }
.sw-fill { position: absolute; inset: 0; }
.sw input { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); opacity: 0; cursor: pointer; border: 0; padding: 0; }
.presets { display: flex; gap: 3px; }
.pill { appearance: none; border: 0; background: var(--key); box-shadow: var(--shadow-key); color: var(--text-2); border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 650; letter-spacing: 0; text-transform: none; cursor: pointer; }
.pill:hover { color: var(--ink); }
.layer { background: var(--key); box-shadow: var(--shadow-key); border-radius: 12px; padding: 7px; margin: 6px 0; }
.quad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.mini { display: flex; flex-direction: column; gap: 2px; }
.mini span { font-size: 10.5px; color: var(--text-3); }
.layer-ft { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; margin-top: 6px; }
.check { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 11.5px; cursor: pointer; user-select: none; }
.check input, .chk { margin: 0; accent-color: var(--signal); cursor: pointer; }
.link { appearance: none; border: 0; background: none; color: var(--signal-text); font-weight: 650; font-size: 12px; padding: 4px 0; cursor: pointer; }
.link:hover { text-decoration: underline; }

/* box model: DevTools' margin / padding / content colours */
.box { position: relative; display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; grid-template-rows: auto auto auto; gap: 4px; align-items: center; justify-items: center; padding: 18px 5px 5px; border: 1px dashed rgb(217 119 6 / 0.55); border-radius: 12px; background: rgb(217 119 6 / 0.07); }
.box.pad { width: 100%; border-color: rgb(22 163 74 / 0.55); background: rgb(22 163 74 / 0.07); }
.box-tag { position: absolute; top: 3px; left: 8px; font-size: 10px; font-weight: 600; color: var(--text-3); }
.box > .t { grid-area: 1 / 2; }
.box > .l { grid-area: 2 / 1; }
.box > .c { grid-area: 2 / 2; }
.box > .r { grid-area: 2 / 3; }
.box > .b { grid-area: 3 / 2; }
.box-in { width: 48px; text-align: center; padding: 0 2px; }
.content { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; padding: 6px 4px; border: 1px solid color-mix(in oklab, var(--signal) 45%, transparent); border-radius: 8px; background: var(--signal-soft); color: var(--text-3); }
.box-in.wide { width: 64px; }

/* css tab */
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 2px 0 8px; }
.chip { appearance: none; border: 0; background: var(--key); box-shadow: var(--shadow-key); color: var(--ink); border-radius: 999px; height: 26px; padding: 0 10px; font-size: 11.5px; font-weight: 650; cursor: pointer; }
.chip:hover { background: var(--key-hover); }
.chip.empty { color: var(--text-3); box-shadow: none; background: transparent; }
.chip.on { background: var(--signal); color: var(--on-signal); box-shadow: none; }
.chip .n { margin-left: 4px; font-weight: 500; opacity: 0.7; }
.refresh { margin-left: auto; }
.status { margin: -2px 0 8px; font-size: 11.5px; color: var(--caution-text); }
.card { background: var(--key); box-shadow: var(--shadow-key); border-radius: 14px; margin-bottom: 8px; overflow: hidden; }
.card.created { box-shadow: var(--shadow-key), inset 0 0 0 1.5px var(--signal); }
.card.inactive { opacity: 0.55; }
.card-hd { padding: 8px 10px 6px; border-bottom: 1px solid var(--line); }
.sel { font: 600 11.5px/1.35 var(--mono); color: var(--ink); word-break: break-word; }
.card.inline .sel { color: var(--text-2); }
.more { font-weight: 400; color: var(--text-3); }
.meta { margin-top: 2px; font-size: 11px; color: var(--text-3); word-break: break-word; }
.meta b { font-weight: 650; color: var(--caution-text); }
.decls { padding: 4px 6px 5px; }
.decl { position: relative; display: grid; grid-template-columns: 14px auto minmax(0, 1fr) 18px; gap: 3px; align-items: center; margin: 1px 0; }
.decl .dn { width: 112px; }
@supports (field-sizing: content) {
  .decl .dn { width: auto; field-sizing: content; min-width: 44px; max-width: 176px; }
}
.decl .in { height: 22px; line-height: 20px; padding: 0 4px; background: transparent; border-color: transparent; box-shadow: none; }
.decl .in:hover { border-color: var(--line); }
.decl .in:focus { background: var(--well); border-color: var(--signal); }
.decl .dn { color: var(--code-prop); }
.decl.changed::before { content: ""; position: absolute; left: -5px; top: 4px; bottom: 4px; width: 2px; border-radius: 2px; background: var(--signal); }
.decl.over .in { text-decoration: line-through; color: var(--text-3); }
.decl.off .in { text-decoration: line-through; color: var(--text-3); opacity: 0.8; }
.decl.add .dn { color: var(--text-2); }
.vwrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sw-slot:empty { display: none; }
.x { appearance: none; border: 0; background: none; color: var(--text-3); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; visibility: hidden; }
.decl:hover .x { visibility: visible; }
.x:hover { color: var(--marker-text); }
.muted { font-size: 11.5px; color: var(--text-3); margin: 4px 0 8px; }

/* the target's outline (a sibling of the panel, outside it) */
.outline { position: absolute; left: 0; top: 0; display: none; border: 2px dashed var(--signal); border-radius: 4px; pointer-events: none; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.4); }
.outline.preview { border-style: solid; border-color: var(--led); }
.outline-tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 5px);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--signal);
  color: var(--on-signal);
  font: 650 12px/1 var(--font);
  white-space: nowrap;
  box-shadow: 0 6px 14px -6px var(--signal-glow);
}
.outline-tag span { opacity: 0.72; font-weight: 550; font-variant-numeric: tabular-nums; }
.outline.below .outline-tag { bottom: auto; top: calc(100% + 5px); }
.outline.preview .outline-tag { background: var(--led); color: #000; box-shadow: none; }
`;
