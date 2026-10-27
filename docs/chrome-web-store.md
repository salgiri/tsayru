# Chrome Web Store submission checklist

Everything paste-ready for the dashboard. Upload artifact: `npm run package`
→ `dist/tsayru-<version>.zip`.

## 1. Store listing

- **Title:** tsayru
- **Summary (≤132 chars):**
  > Click any element, type a task — Claude gets the selector, component, source file, styles, screenshot and page errors.
- **Category:** Developer Tools · **Language:** English
- **Store icon:** `extension/icons/icon128.png`
- **Description:**
  > tsayru turns UI feedback into one click. Enable the inspector, click an element, describe the change — and ship the whole batch to Claude with everything it needs: a verified-unique CSS selector, React/Vue/Svelte/Angular component name and source file:line (dev mode), computed styles, an outlined screenshot, recent page errors, and the page URL.
  >
  > Deliver via clipboard, direct push into a claude.ai tab (auto-submit, screenshots attached as images), or the bundled MCP server for Claude Code — which can even mark tasks done so they're struck through in your sidebar.
  >
  > Organize with #hashtags typed right in the task text, filter by host, work in team mode with a shared inbox. No data leaves your machine unless you explicitly send it.
- **Screenshots (1–5, 1280×800):** suggested shot list
  1. Inspector highlighting an element on a dev app, sidebar open with tasks.
  2. Task modal with outlined screenshot preview + selector/component meta.
  3. A claude.ai chat that just received a batch (text + attached screenshots).
  4. Sidebar with #tag chips and a done (struck-through) task.

## 2. Privacy tab

- **Single purpose:**
  > tsayru lets developers annotate UI elements on pages they are working on and send those annotations (selector, component, styles, screenshot, task text) to Claude AI as a task brief.
- **Permission justifications:**
  - `activeTab` — Captures a screenshot of the visible tab when the user clicks an element in inspector mode. Granted only by explicit user gesture (toolbar click / hotkey).
  - `scripting` — (1) Injects the framework-detection probe into the page's MAIN world when the user enables the inspector, to read React/Vue/Svelte dev metadata; (2) inserts the user's task text into the chat composer of claude.ai/claude.com when the user explicitly presses "Send to Claude".
  - `storage` / `unlimitedStorage` — Persists the user's task list locally (chrome.storage.local). Screenshots are stored as data URLs, hence the lifted quota. Also stores optional inbox-server settings.
  - `clipboardWrite` — The "Copy" buttons place generated markdown on the clipboard.
  - Host `http://127.0.0.1/*`, `http://localhost/*` — Talks to the optional local companion server that archives task batches for the Claude Code (MCP) integration. Loopback only.
  - Host `https://claude.ai/*`, `https://claude.com/*` — Lists the user's open Claude tabs and delivers the task batch into the chat input when the user picks that delivery channel.
  - Content script on `<all_urls>` — The annotation inspector must work on whatever site the user is developing, including staging/production domains that cannot be known in advance. The UI appears only after explicit user action (toolbar icon / hotkey), except on localhost-class dev hosts where the sidebar opens automatically. No page data is read or transmitted without user action.
- **Remote code:** No.
- **Data usage:** no data is collected or transmitted to the developer; all
  captures stay on the user's device unless the user explicitly sends them to
  their own Claude chat or their own/team server. Declare "no data collected";
  privacy policy provided anyway.
- **Privacy policy URL:** `https://github.com/salgiri/tsayru/blob/main/PRIVACY.md`

## 3. Distribution

- Free · all regions · visibility: start **Unlisted** (lighter scrutiny, shareable link), flip to **Public** later from the same listing.

## 4. Review expectations

- `<all_urls>` + `scripting` ⇒ in-depth review: typically a few days, can be 2–3 weeks.
- Keep listing claims exactly matching functionality; screenshots must show the real UI.
- Every re-upload requires a higher `version` in manifest.json (bump all three: manifest, root package.json, server package.json).

## 5. Update cycle (after first publish)

1. Bump versions → `npm test` → `npm run package`.
2. Dashboard → item → Package → Upload new package → Submit for review.
3. Users receive the update automatically after approval.
