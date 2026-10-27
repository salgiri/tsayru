// Web-only chat picker: lists open Anthropic web-chat tabs (claude.ai +
// claude.com) and lets the user push a batch into the selected one.
//
// We deliberately do NOT show local Claude Code (VS Code / terminal) chats:
// those don't have a public push API, so the resulting "click → Cmd+V"
// flow is no better than just hitting "Copy" in the sidebar.
//
// Returns Promise<null | OnlineTab>:
//   null      — cancelled
//   OnlineTab — { kind: "online", tabId, url, title, lastAccessed }

import { el, IS_MAC } from "./core.js";
import { openDialog, dialogHeader } from "./ui.js";
import { icon } from "./icons.js";

// Re-used to detect the "old content script in a reloaded extension" footgun.
const isContextInvalidated = (err) =>
  /context invalidated|Extension context/i.test(String(err || ""));

const fetchOnlineTabs = () =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_LIST_TABS" }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          resolve({
            ok: false,
            error:
              resp?.error ||
              chrome.runtime.lastError?.message ||
              "no response",
          });
          return;
        }
        resolve({ ok: true, tabs: resp.tabs || [] });
      });
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });

// Opened through the background: the host page's CSP can't get in the way.
const openTab = (url) => {
  try {
    chrome.runtime.sendMessage({ type: "TSAYRU_OPEN_TAB", url });
  } catch {}
};

const renderItem = (entry, onPick) => {
  let urlLabel = entry.url;
  try {
    const u = new URL(entry.url);
    urlLabel = u.host + (u.pathname.length > 1 ? u.pathname : "");
  } catch {}
  return el(
    "button",
    { class: "chat", title: entry.url, onClick: () => onPick(entry) },
    el("span", { class: "disc" }, icon("chat")),
    el(
      "span",
      { class: "chat-text" },
      el("span", { class: "chat-title" }, entry.title || "Untitled chat"),
      el("span", { class: "sel" }, urlLabel),
    ),
    entry.active ? el("span", { class: "now" }, "Open now") : el("span"),
  );
};

const warning = (...children) =>
  el("div", { class: "status warn" }, icon("alert"), el("div", {}, ...children));

let open = null;

export const pickTargetChat = () =>
  new Promise((resolve) => {
    open?.finish(null);

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      dialog.close();
      if (open?.finish === finish) open = null;
      resolve(value);
    };

    const dialog = openDialog({
      className: "picker",
      label: "Send to which chat?",
      onEscape: () => finish(null),
    });
    open = { finish };

    const status = el("div", { class: "status" }, "Looking for open Claude chats…");
    const list = el("div", { class: "chats" });
    const footer = el(
      "div",
      { class: "dlg-ft" },
      el("span", { class: "hints" }),
      el("button", { class: "btn quiet", onClick: () => finish(null) }, "Cancel"),
    );
    dialog.dialog.append(dialogHeader("Send to which chat?", () => finish(null)), status, list, footer);

    fetchOnlineTabs().then((res) => {
      if (resolved) return;
      list.replaceChildren();
      if (!res.ok) {
        status.replaceWith(
          isContextInvalidated(res.error)
            ? warning(`tsayru was updated. Reload this page (${IS_MAC ? "⌘R" : "F5"}) and send again.`)
            : warning(`Couldn’t list the open tabs (${res.error}). Close this and press Send again.`),
        );
        return;
      }
      const tabs = res.tabs;
      if (tabs.length === 0) {
        status.textContent = "No Claude chat is open. Open one, then press Send again.";
        const go = (url) => () => {
          openTab(url);
          finish(null);
        };
        list.replaceWith(
          el(
            "div",
            { class: "opens" },
            el("button", { class: "btn primary", onClick: go("https://claude.ai/new") }, icon("external"), "Open claude.ai"),
            el("button", { class: "btn quiet", onClick: go("https://claude.com") }, "Open claude.com"),
          ),
        );
        return;
      }
      status.textContent =
        tabs.length === 1
          ? "One Claude chat is open. The tasks are pasted in and sent right away."
          : "Pick a chat. The tasks are pasted in and sent right away.";
      // Most recently used first — the tab the user wants is almost always
      // the one they just looked at.
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      for (const t of tabs) {
        const entry = {
          kind: "online",
          tabId: t.tabId,
          url: t.url,
          title: t.title,
          active: t.active,
          lastAccessed: t.lastAccessed,
        };
        list.appendChild(renderItem(entry, finish));
      }
      list.querySelector(".chat")?.focus();
    });
  });
