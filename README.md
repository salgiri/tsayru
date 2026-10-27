# tsayru

> A Chrome extension that lets you annotate UI elements with tasks, then ship them to Claude — with selectors, screenshots, and live source-file references — in one click.

Stop describing UI bugs in words. Click the element, type what's wrong, and tsayru hands Claude a complete brief: CSS selector, React component name, source file location, computed styles, and a cropped screenshot.

---

## Why

When you're working with Claude on a frontend project, half the conversation is spent explaining **which element** you mean — pasting selectors, describing positions, screenshotting and uploading. tsayru cuts that out:

- Click an element on the page → annotate → repeat for as many elements as you want → send the whole batch to Claude in a single message.
- For React apps in dev mode, tsayru extracts the **component name and source file:line** from the React fiber, so Claude can edit the right file immediately.
- Screenshots, computed styles (color/font/padding/dimensions), and the page URL travel with each task automatically.

---

## What you get

| Feature | Detail |
|---|---|
| **Smart selectors** | `data-testid` / `id` / `aria-label` priority; falls back to verified-unique class chains. Won't silently point at the wrong element. Pierces open shadow roots (`host >>> inner` notation). |
| **Framework detection** | In dev mode, pulls `component: SaveButton (in App › SettingsPage)` and `file: src/components/SaveButton.tsx:23`. React ≤18 via `_debugSource`, React 19 via a `_debugStack` fallback, Vue 2/3, Svelte (`__svelte_meta`), Angular (`ng.getComponent`). |
| **Rich element context** | Computed-styles summary (`color #2d4a3e · font 14px Inter 600 · 320×40`), a sanitized HTML snippet of the element, and the environment line (`1440×900 · dark · dpr 2`). |
| **Page-error capture** | Recent uncaught errors, unhandled rejections, and `console.error` output (React dev warnings included) travel with each task: `` `TypeError: x is undefined` (×3, src/App.tsx:42, 12s ago) ``. Claude sees the crash, not just the symptom. |
| **Element screenshots** | Cropped with 48px of surrounding context, the target outlined in red, encoded as compact JPEG. Elements scrolled out of view are brought in automatically. UI hidden during capture. |
| **Three delivery channels** | Clipboard (copy and paste anywhere) · Direct push to claude.ai / claude.com web tabs (text + screenshots attached as image files, auto-submit) · MCP server for any local Claude Code session. |
| **Project auto-targeting** | Batches from `localhost:<port>` are stamped with the dev server's project directory (resolved via `lsof`), so `tsayru_latest_tasks` in the matching Claude Code session picks up exactly its own tasks. |
| **Task lifecycle** | Claude marks implemented tasks via the `tsayru_mark_done` MCP tool — the sidebar strikes them through automatically. Clearing is undoable for 8 seconds. |
| **Quick-mark** | `Alt+click` an element to add it without the dialog — fill descriptions later via inline edit, or let Claude infer the change from the screenshot. |
| **Style editor** | `⌘+click` (`Ctrl+click` on Windows/Linux) any element to restyle it live — colours, border, shadow, spacing, type — or edit every CSS rule that styles it, state by state (`:hover`, `:focus`, `::before`…). The edits become a task listing each change and the rule that set the old value. |
| **Hashtag tags** | Type `#nav` or `#redesign` right in the task text — tags become filter chips in the sidebar and a `- tags:` line in the markdown. No separate tagging UI. |
| **Per-host filtering** | Tabs in the sidebar split tasks across the projects you're working on. |
| **Team mode** | Start the server with `TSAYRU_BIND=0.0.0.0 TSAYRU_TOKEN=<secret>` and teammates point their extension at it (extension options page) — one shared inbox for the whole team. |
| **Cross-machine sync** | Point `TSAYRU_INBOX` at a synced folder (iCloud/Dropbox/network mount) on both machines — batches submitted on one appear in the other's MCP. |
| **Inline editing** | Edit any task's text without losing the captured selector / screenshot. |
| **Hover preview** | Hovering a task in the sidebar re-highlights the original element on the page. |
| **Light & dark** | The UI follows your system theme: speckled "chalk" by day, "graphite" by night. It lives in closed shadow roots, so no site's CSS can bend it, and it brings its own typeface (Onest). Keyboard, screen reader, 320px windows and reduced motion are covered. |

---

## Quick start

```bash
git clone https://github.com/salgiri/tsayru.git
cd tsayru
npm install
npm run build
```

Then load it in Chrome (or any Chromium-based browser — Arc, Brave, Edge):

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked** and pick the `extension/` folder
4. Done. The tsayru icon appears in your toolbar.

> Hotkey: **`Cmd+Shift+K`** (`Ctrl+Shift+K` on Linux/Windows) toggles the sidebar.

---

## Using it

**1. Open the sidebar.** Click the toolbar icon, press the hotkey, or — on `localhost` / `127.0.0.1` / `*.test` / `*.local` hosts — it appears automatically.

**2. Press the blue "Pick an element" key.** The cursor turns into a crosshair; the element under it is outlined and named (`a#cta.site-btn 140 × 39`). Its yellow light stays on while you're picking.

**3. Click an element.** A small dialog opens. Type what should change (e.g., "make this button forest-green, not gray"), press **Enter**.

**4. Repeat** for as many elements as you want — after each added task picking re-arms automatically, so a batch session is just click → type → Enter → click. The sidebar fills up with tasks. (Esc turns the crosshair off.)

**5. Ship the batch** — choose one of three ways:

| Button | What happens |
|---|---|
| **Send to Claude** | Picks an open `claude.ai` or `claude.com` tab, injects the markdown, attaches the screenshots as image files, and presses Send. No keyboard step. |
| **Copy** | Markdown of every task in view lands on your clipboard. Paste into any chat, editor, or doc. Lightweight (no inline image data). The batch is also saved to the local inbox (if `tsayru-server` is running) so MCP can fetch the screenshots. |
| **Copy this task** (the copy icon on a row) | Same as above, but only that one task. |

You can also filter tasks by site (the segmented control above the list) or by `#tag`, edit a task in place (pencil icon; Enter saves, Esc cancels), delete one (×) or **Clear** the tasks in view — both with an undo.

### Restyling with the style editor

Instead of describing a change, make it: press **Restyle** next to the blue key and click an element — or, with the sidebar open, **`⌘+click`** (`Ctrl+click` on Windows/Linux) it straight away. Holding the key outlines what a click will pick; a click on a button's label picks the button (the breadcrumbs lead back down to the label).

- **Quick** — text and background colour (with opacity), border, radius, shadow layers with presets, margin / padding / size as a box model, gap, font size / weight / line height / letter spacing / alignment. Values preview live; `↑`/`↓` nudge numbers (`Shift` ×10, `Alt` ×0.1); a label marked `↺` resets its property.
- **CSS** — every rule that styles the element, one state at a time: Default, Hover, Focus, Focus-visible, Active, Before, After. Picking Hover/Focus/Active also shows the element in that state on the page. Edit values and names, tick declarations off and on, delete, add (`name:` jumps to the value), or start a new rule for a state the page doesn't style yet. Overridden declarations are struck through; rules shared by many elements say how many; global `*` resets are folded away.

Edits preview on the page only (a reload clears them). **Esc**, `×`, or `⌘+click` on the next element saves the edits as a task — one task per element, merged if you come back to it — with the exact changes (`padding-left: 22px → 28px — set by .bt-cta in src/kit/buttons.css`) and an optional note. **Revert** undoes the panel's edits. With the sidebar hidden, `⌘+click` belongs to the page again (open in new tab).

---

## Optional: server + MCP integration

The extension works fully without any server. But there's an optional companion in `server/` that:

- Persists every batch you send to `~/.tsayru/inbox/<batchId>/{tasks.json, tasks.md}` (audit trail).
- Exposes those batches as **Model Context Protocol** tools, so any local Claude Code session can pull them via tool calls instead of clipboard pastes.

### Run the HTTP inbox

```bash
cd server
npm install
npm start          # listens on http://127.0.0.1:7777
```

The server only binds to `127.0.0.1` — never the public interface. Default port is `7777`; override with `TSAYRU_PORT=8123 node http.js`.

On top of the loopback binding, the server rejects any request carrying a web `Origin` header — only the extension (`chrome-extension://…`) and originless local tools (curl, scripts) get through. Without this, any page open in your browser could read or wipe the inbox via `fetch("http://127.0.0.1:7777/…")`. The inbox also self-prunes to the most recent 200 batches.

### Wire up MCP for Claude Code

Add this to your Claude Code config (`~/.claude.json` or wherever you keep `mcpServers`):

```json
{
  "mcpServers": {
    "tsayru": {
      "command": "node",
      "args": ["/absolute/path/to/tsayru/server/mcp.js"]
    }
  }
}
```

Restart Claude Code. You now have four tools available:

| Tool | What it does |
|---|---|
| `tsayru_latest_tasks` | Returns the most recent batch targeted at the current project (`process.cwd()`, prefix-tolerant for monorepos), with global batches as fallback. |
| `tsayru_list_batches` | Lists recent batch metadata (newest first). |
| `tsayru_get_batch` | Returns a specific batch by id, rendered as markdown. |
| `tsayru_mark_done` | Marks tasks completed (whole batch, by ids, or by 1-based numbers). The sidebar strikes them through within ~10s. |
| `tsayru_clear_inbox` | Wipes every saved batch. |

Now in any Claude Code chat, you can say *"check tsayru for new tasks"* and Claude will pull them — including the screenshots — automatically.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Web page (localhost:5173, your-app.com, etc.)    │
│                                                   │
│  ┌──────────────────────┐   ┌────────────────┐   │
│  │  content.js          │   │  inject.js     │   │
│  │  (ISOLATED world)    │←─→│  (MAIN world,  │   │
│  │  · sidebar UI (closed│   │   lazy-injected│   │
│  │    shadow root)      │   │                │   │
│  │  · selector builder  │   │   on demand)   │   │
│  │  · modal + inspector │   │  · React fiber │   │
│  └──────┬───────────────┘   └────────────────┘   │
│         │ chrome.runtime                          │
│         ▼ .sendMessage                            │
│  ┌──────────────────────┐                         │
│  │  background.js       │  service worker         │
│  │  · captureVisibleTab │                         │
│  │  · fetch (CORS-free) │                         │
│  │  · scripting.execute │                         │
│  │    (claude.ai inject)│                         │
│  └──────┬───────────────┘                         │
└─────────┼────────────────────────────────────────┘
          │
          │ HTTP (localhost:7777)              ┌─────────────────┐
          ▼                                    │ Claude Code     │
┌─────────────────────┐    stdio (MCP)         │ session in any  │
│ tsayru-server       │←───────────────────────│ project folder  │
│ ~/.tsayru/inbox/    │                        └─────────────────┘
│ ├─ http.js (HTTP)   │
│ ├─ mcp.js  (MCP)    │
│ └─ lib/ (shared)    │
└─────────────────────┘
```

---

## Project layout

```
tsayru/
├── src/                 ESM source modules — bundled by esbuild
│   ├── index.js         entry point, re-injection guard
│   ├── core.js          shared state, helpers, persist/restore
│   ├── selector.js      smart CSS-selector builder
│   ├── framework.js     postMessage bridge to inject.js
│   ├── screenshot.js    captureVisibleTab + canvas crop
│   ├── inspector.js     mousemove/click/keyboard handlers, page highlight
│   ├── styleeditor.js   ⌘+click style editor: session, previews, saving
│   ├── stylepanel.js    style panel shell (+ stylequick / stylerules tabs,
│   │                    stylewidgets inputs, stylepanel-css theme)
│   ├── cssrules.js      which CSS rules style an element, by state; forced states
│   ├── stylevalues.js   colour / length / shadow value helpers
│   ├── stylechanges.js  style change records → markdown
│   ├── ui.js            UI shadow host: dialogs, toasts (+ ui-css styles)
│   ├── shadowhost.js    closed shadow root + event isolation (UI, style editor)
│   ├── theme-css.js     design tokens: light "chalk" / dark "graphite"
│   ├── icons.js         inline SVG icons, brand mark, shell speckle
│   ├── fonts.js         loads Onest into document.fonts
│   ├── sidebar.js       sidebar UI, copy / clear / send
│   ├── modal.js         "new task" dialog
│   ├── chatpicker.js    web-chat picker for "Send to Claude"
│   └── format.js        markdown rendering
│
├── extension/           what Chrome loads as the extension
│   ├── manifest.json    Manifest V3
│   ├── background.js    service worker
│   ├── content.js       BUNDLED OUTPUT (do not edit by hand)
│   ├── inject.js        MAIN-world fiber probe (lazy-injected on demand)
│   ├── content.css      the picking cursor (all other UI is in shadow roots)
│   ├── fonts/           Onest, latin + cyrillic (SIL OFL)
│   └── icons/           toolbar icons
│
├── server/              optional companion
│   ├── http.js          HTTP inbox server (Express, 127.0.0.1:7777)
│   ├── mcp.js           MCP server (stdio transport)
│   ├── lib/
│   │   ├── format.js    re-exports the shared renderer from src/format.js
│   │   └── storage.js   ~/.tsayru/inbox/ CRUD + retention
│   ├── package.json
│   └── README.md
│
├── test/                vitest suites (selector, format, storage, CSS rules, style values/changes)
├── package.json         root build pipeline (esbuild) + tests
└── README.md            you are here
```

---

## Development

```bash
npm run watch     # rebuild extension/content.js on every src/ change
npm test          # vitest: selector builder, formatter, server storage, style editor logic
npm run package   # build + zip extension/ into dist/tsayru-<version>.zip (store-ready)
```

After any source change: rebuild → reload the extension in `chrome://extensions` → reload pages where you want the new code. CI fails if `extension/content.js` doesn't match `src/` — always commit the rebuilt bundle together with the source.

The bundle is a single IIFE in `extension/content.js`. esbuild targets `chrome111` because the MAIN-world scripting feature is required for React fiber detection.

---

## Permissions & privacy

The extension requests the minimum permissions it needs:

| Permission | Why |
|---|---|
| `activeTab` | Capture screenshots of the tab you're inspecting (only when you click the icon or press the hotkey). On non-localhost hosts where the sidebar auto-opens, click the toolbar icon once to grant screenshot access — the sidebar will tell you if it's missing. |
| `scripting` | Inject markdown into a `claude.ai`/`claude.com` chat input when you pick that option, and lazily inject the framework-detection probe into pages where you use the inspector. |
| `storage` + `unlimitedStorage` | Persist your task list across page reloads (`chrome.storage.local`); screenshots are bulky, so the 10 MB default quota is lifted. |
| `clipboardWrite` | Copy markdown to your clipboard. |
| `host_permissions` for `127.0.0.1` / `localhost` | Talk to your local `tsayru-server` (only if you run it). |
| `host_permissions` for `claude.ai` / `claude.com` | Read open tabs and inject the chat markdown. |

**No data leaves your machine** unless you explicitly send it to a Claude chat. The optional `tsayru-server` binds to `127.0.0.1` only **and** rejects requests from web origins — other pages in your browser can't read or wipe the inbox.

---

## Browser support

Tested on Chrome, Arc, and Brave (anything Chromium ≥ 111). Not compatible with Firefox or Safari — they use different extension APIs.

---

## Roadmap

- ~~Annotation overlays on screenshots~~ — v0.14.0 (automatic red outline + context)
- ~~Tags for grouping a large batch by feature~~ — v0.16.0 (`#hashtags` in task text)
- ~~Cross-machine batch sync~~ — v0.16.0 (`TSAYRU_INBOX` on a synced folder)
- ~~Team mode: shared inbox for collaborators~~ — v0.16.0 (`TSAYRU_BIND` + `TSAYRU_TOKEN` + extension options page)
- Style editor — v0.17.0 (`⌘+click`: restyle live, edit rules by state, ship the exact changes)
- Redesign — v0.18.0 (light/dark tactile UI, Restyle key, shadow-root isolation)

The original roadmap is complete. Next milestone: Chrome Web Store release.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Credits

Built collaboratively by [@salgiri](https://github.com/salgiri) and Claude (Opus 4.7).

UI typeface: [Onest](https://github.com/simpals/onest) by The Onest Project Authors, under the SIL Open Font License 1.1 (`extension/fonts/OFL.txt`).
