# tsayru — Privacy Policy

_Last updated: 2026-06-11_

tsayru is a developer tool. It is built so that **your data never leaves your
machine unless you explicitly send it somewhere**.

## What the extension processes

When you annotate an element, tsayru captures — **locally, on your device**:

- a CSS selector, a short HTML snippet, and computed styles of the element you clicked;
- a cropped screenshot of that element (via `chrome.tabs.captureVisibleTab`);
- framework metadata exposed by development builds (component name, source file);
- recent page errors (uncaught exceptions, `console.error` output);
- the page URL and your task text.

All of this is stored in `chrome.storage.local` in your browser profile. Nothing
is captured until you interact with the extension (toolbar icon, hotkey, or a
click in inspector mode).

## Where data can go — only on your explicit action

1. **Clipboard** — when you press "Copy".
2. **Your own Claude chat** — when you press "To Claude", the batch is inserted
   into a claude.ai / claude.com tab that you select. It is then governed by
   [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).
3. **Your local companion server** (optional) — batches are archived to
   `~/.tsayru/inbox` on your machine. The server binds to `127.0.0.1` by
   default and rejects requests from web pages.
4. **A team server you configure** (optional) — if you point the extension's
   options page at a shared server run by you or your team, batches go there,
   authenticated with the token you set.

## What we do NOT do

- No analytics, telemetry, or tracking of any kind.
- No transmission to servers operated by the extension author.
- No sale or transfer of data to third parties.
- No remote code: all code ships inside the extension package.

## Contact

Questions: open an issue at <https://github.com/salgiri/tsayru/issues>.
