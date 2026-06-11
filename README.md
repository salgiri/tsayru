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
| **React fiber detection** | In dev mode, pulls `component: SaveButton` and `file: src/components/SaveButton.tsx:23`. React ≤18 via `_debugSource`; React 19 via a `_debugStack` fallback (works with Vite-style dev servers that serve real `/src/...` module paths). Vue 2/3 supported too. |
| **Computed styles** | One-line summary: `color #2d4a3e · bg #f4f1ea · font 14px Inter 600 · pad 10px · r 6px · 320×40`. |
| **Element screenshots** | Cropped to the clicked element with 8px padding, encoded as compact JPEG. UI hidden during capture so the extension's own chrome isn't in the shot. |
| **Three delivery channels** | Clipboard (copy and paste anywhere) · Direct push to claude.ai / claude.com web tabs (text + screenshots attached as image files, auto-submit) · MCP server for any local Claude Code session. |
| **Per-host filtering** | Tabs in the sidebar split tasks across the projects you're working on. |
| **Inline editing** | Edit any task's text without losing the captured selector / screenshot. |
| **Hover preview** | Hovering a task in the sidebar re-highlights the original element on the page. |

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

**2. Click "Enable inspector".** The cursor turns into a crosshair; hovering elements highlights them.

**3. Click an element.** A small dialog opens. Type what should change (e.g., "make this button forest-green, not gray"), press **Enter**.

**4. Repeat** for as many elements as you want — after each added task the inspector re-arms automatically, so a batch session is just click → type → Enter → click. The sidebar fills up with tasks. (Esc turns the crosshair off.)

**5. Ship the batch** — choose one of three ways:

| Button | What happens |
|---|---|
| **Copy all** | Markdown of every task lands on your clipboard. Paste into any chat, editor, or doc. Lightweight (no inline image data). The batch is also saved to the local inbox (if `tsayru-server` is running) so MCP can fetch the screenshots. |
| **Copy single task** (the `⧉` icon on each row) | Same as above, but only that one task. |
| **To Claude** | Picks an open `claude.ai` or `claude.com` tab, injects the markdown, attaches the screenshots as image files, and presses Send. No keyboard step. |

You can also filter tasks by host (the tabs above the list), edit a task in place (`✎`), or clear them all at once.

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
| `tsayru_latest_tasks` | Returns the most recent batch targeted at the current project (`process.cwd()`), with global batches as fallback. |
| `tsayru_list_batches` | Lists recent batch metadata (newest first). |
| `tsayru_get_batch` | Returns a specific batch by id, rendered as markdown. |
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
│  │  · sidebar UI        │   │   lazy-injected│   │
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
│   ├── inspector.js     mousemove/click/keyboard handlers
│   ├── sidebar.js       sidebar UI, copy / clear / send
│   ├── modal.js         "task for this element" dialog
│   ├── chatpicker.js    web-chat picker for "To Claude"
│   └── format.js        markdown rendering
│
├── extension/           what Chrome loads as the extension
│   ├── manifest.json    Manifest V3
│   ├── background.js    service worker
│   ├── content.js       BUNDLED OUTPUT (do not edit by hand)
│   ├── inject.js        MAIN-world fiber probe (lazy-injected on demand)
│   ├── content.css      sidebar / modal / picker styles
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
├── test/                vitest suites (selector, format, storage)
├── package.json         root build pipeline (esbuild) + tests
└── README.md            you are here
```

---

## Development

```bash
npm run watch     # rebuild extension/content.js on every src/ change
npm test          # vitest: selector builder, formatter, server storage
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

- Annotation overlays on screenshots (arrows, highlights drawn on the captured image)
- Tags / colors for grouping a large batch by feature
- Cross-machine batch sync
- Team mode: shared MCP server so collaborators can submit into the same inbox

The big architectural decisions are settled; future work is feature-side.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Credits

Built collaboratively by [@salgiri](https://github.com/salgiri) and Claude (Opus 4.7).
