// The style panel's CSS, adopted into its closed shadow root (page CSS can't
// reach in, and this can't leak out). Same dark theme as the sidebar.

export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.panel {
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  position: absolute;
  pointer-events: auto;
  width: 340px;
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  overflow: hidden;
  text-align: left;
}
button { font: inherit; color: inherit; }

/* header */
.hd { display: flex; align-items: center; gap: 4px; padding: 9px 6px 4px 12px; cursor: grab; user-select: none; }
.hd:active { cursor: grabbing; }
.hd-main { flex: 1; min-width: 0; }
.hd-title { font: 600 12px/1.35 var(--mono); color: #c7d2fe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-sub { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic { appearance: none; border: 0; background: transparent; color: #94a3b8; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 26px; padding: 0; flex: none; }
.ic:hover { background: rgba(255, 255, 255, 0.07); color: #e2e8f0; }
.ic.small { width: 20px; height: 20px; line-height: 20px; font-size: 13px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 1px 3px; padding: 0 12px 7px; font: 10.5px/1.4 var(--mono); color: #475569; }
.crumb { appearance: none; border: 0; background: none; padding: 0; color: #64748b; cursor: pointer; font: inherit; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb:hover { color: #fbbf24; }
.crumb.cur { color: #c7d2fe; cursor: default; }
.warn { margin: 0 12px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(251, 191, 36, 0.12); color: #fbbf24; font-size: 11px; }

/* tabs */
.tabs { display: flex; align-items: center; gap: 2px; padding: 0 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
.tab { appearance: none; border: 0; background: none; color: #94a3b8; font-weight: 600; padding: 7px 8px 8px; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; }
.tab:hover { color: #e2e8f0; }
.tab.on { color: #e2e8f0; border-bottom-color: #6366f1; }
.count { margin-left: auto; padding-right: 4px; font-size: 11px; color: #64748b; }
.count.has { color: #a5b4fc; }

.body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 2px 12px 10px; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: #334155; border-radius: 8px; border: 2px solid #0f172a; }

/* footer */
.ft { display: flex; gap: 6px; align-items: center; padding: 8px; border-top: 1px solid rgba(255, 255, 255, 0.07); }
.ft .note { flex: 1; min-width: 0; font-family: inherit; }
.btn { appearance: none; border: 0; border-radius: 6px; padding: 6px 10px; font-weight: 600; cursor: pointer; background: #1e293b; color: #e2e8f0; white-space: nowrap; }
.btn:hover:not(:disabled) { background: #273449; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: #6366f1; color: #fff; }
.btn.primary:hover { background: #4f46e5; }

/* inputs */
.in { width: 100%; min-width: 0; height: 24px; background: #1e293b; color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; padding: 0 6px; font: 11.5px/22px var(--mono); outline: none; }
.in::placeholder { color: #475569; }
.in:focus { border-color: #6366f1; background: #111a30; }
.in.changed { color: #a5b4fc; }
.in.bad, .in.bad:focus { border-color: #f87171; }
select.in { padding: 0 2px; cursor: pointer; }

/* quick tab */
.sec { padding: 9px 0 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sec:last-child { border-bottom: 0; }
.sec-hd { display: flex; align-items: center; justify-content: space-between; min-height: 18px; margin-bottom: 5px; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #64748b; }
.row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 6px; margin: 4px 0; }
.lbl { color: #94a3b8; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.lbl.changed { color: #a5b4fc; cursor: pointer; }
.lbl.changed::after { content: " ↺"; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.color { display: grid; grid-template-columns: 24px minmax(0, 1fr) 52px; gap: 6px; align-items: center; }
.alpha { position: relative; display: block; }
.alpha::after { content: "%"; position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: #64748b; pointer-events: none; font-size: 11px; }
.alpha .in { padding-right: 16px; }
.sw { position: relative; display: block; width: 24px; height: 24px; border-radius: 5px; overflow: hidden; background: repeating-conic-gradient(#94a3b8 0 25%, #e2e8f0 0 50%) 0 0 / 8px 8px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); cursor: pointer; }
.sw.small { width: 14px; height: 14px; border-radius: 3px; flex: none; }
.sw-fill { position: absolute; inset: 0; }
.sw input { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); opacity: 0; cursor: pointer; border: 0; padding: 0; }
.presets { display: flex; gap: 3px; }
.pill { appearance: none; border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: #94a3b8; border-radius: 999px; padding: 1px 7px; font-size: 10.5px; font-weight: 600; letter-spacing: 0; text-transform: none; cursor: pointer; }
.pill:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.3); }
.layer { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 7px; padding: 6px; margin: 5px 0; }
.quad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.mini { display: flex; flex-direction: column; gap: 2px; }
.mini span { font-size: 10px; color: #64748b; }
.layer-ft { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; margin-top: 6px; }
.check { display: inline-flex; align-items: center; gap: 4px; color: #94a3b8; font-size: 11px; cursor: pointer; user-select: none; }
.check input, .chk { margin: 0; accent-color: #6366f1; cursor: pointer; }
.link { appearance: none; border: 0; background: none; color: #a5b4fc; font-weight: 600; font-size: 11.5px; padding: 4px 0; cursor: pointer; }
.link:hover { color: #c7d2fe; text-decoration: underline; }

/* box model */
.box { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr) 46px; grid-template-rows: auto auto auto; gap: 4px; align-items: center; justify-items: center; padding: 18px 5px 5px; border: 1px dashed rgba(251, 191, 36, 0.45); border-radius: 7px; background: rgba(251, 191, 36, 0.05); }
.box.pad { width: 100%; border-color: rgba(52, 211, 153, 0.5); background: rgba(52, 211, 153, 0.06); }
.box-tag { position: absolute; top: 3px; left: 7px; font-size: 9px; letter-spacing: 0.07em; text-transform: uppercase; color: #64748b; }
.box > .t { grid-area: 1 / 2; }
.box > .l { grid-area: 2 / 1; }
.box > .c { grid-area: 2 / 2; }
.box > .r { grid-area: 2 / 3; }
.box > .b { grid-area: 3 / 2; }
.box-in { width: 46px; text-align: center; padding: 0 2px; }
.content { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; padding: 6px 4px; border: 1px solid rgba(96, 165, 250, 0.45); border-radius: 4px; background: rgba(96, 165, 250, 0.08); color: #64748b; }
.box-in.wide { width: 64px; }

/* css tab */
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 9px 0 8px; }
.chip { appearance: none; border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: #cbd5e1; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
.chip:hover { border-color: rgba(255, 255, 255, 0.3); }
.chip.empty { color: #64748b; }
.chip.on { background: #6366f1; border-color: #6366f1; color: #fff; }
.chip .n { margin-left: 4px; font-weight: 500; opacity: 0.65; }
.refresh { margin-left: auto; }
.status { margin: -2px 0 8px; font-size: 11px; color: #fbbf24; }
.card { border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 7px; margin-bottom: 8px; overflow: hidden; }
.card.created { border-color: rgba(99, 102, 241, 0.55); }
.card.inactive { opacity: 0.55; }
.card-hd { padding: 6px 8px 5px; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sel { font: 600 11.5px/1.35 var(--mono); color: #c7d2fe; word-break: break-word; }
.card.inline .sel { color: #94a3b8; }
.more { font-weight: 400; color: #64748b; }
.meta { margin-top: 2px; font-size: 10.5px; color: #64748b; word-break: break-word; }
.meta b { font-weight: 600; color: #fbbf24; }
.decls { padding: 3px 4px 4px; }
.decl { position: relative; display: grid; grid-template-columns: 14px auto minmax(0, 1fr) 18px; gap: 3px; align-items: center; margin: 1px 0; }
.decl .dn { width: 112px; }
@supports (field-sizing: content) {
  .decl .dn { width: auto; field-sizing: content; min-width: 44px; max-width: 176px; }
}
.decl .in { height: 21px; line-height: 19px; padding: 0 4px; background: transparent; border-color: transparent; }
.decl .in:hover { border-color: rgba(255, 255, 255, 0.1); }
.decl .in:focus { background: #111a30; border-color: #6366f1; }
.decl .dn { color: #7dd3fc; }
.decl.changed::before { content: ""; position: absolute; left: -4px; top: 4px; bottom: 4px; width: 2px; border-radius: 2px; background: #6366f1; }
.decl.over .in { text-decoration: line-through; color: #64748b; }
.decl.off .in { text-decoration: line-through; color: #475569; }
.decl.add .dn { color: #94a3b8; }
.vwrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sw-slot:empty { display: none; }
.x { appearance: none; border: 0; background: none; color: #64748b; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; visibility: hidden; }
.decl:hover .x { visibility: visible; }
.x:hover { color: #f87171; }
.muted { font-size: 11px; color: #64748b; margin: 4px 0 8px; }

/* the target's outline (a sibling of the panel, outside it) */
.outline { position: absolute; left: 0; top: 0; display: none; border: 1.5px dashed #818cf8; border-radius: 2px; pointer-events: none; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.3); }
.outline.preview { border-style: solid; border-color: #fbbf24; }
.outline-tag { position: absolute; left: -1.5px; bottom: 100%; margin-bottom: 3px; padding: 3px 5px; border-radius: 3px; background: #6366f1; color: #fff; font: 600 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace; white-space: nowrap; }
.outline.below .outline-tag { bottom: auto; top: 100%; margin: 3px 0 0; }
.outline.preview .outline-tag { background: #b45309; }
`;
