// Web-only chat picker: lists open Anthropic web-chat tabs (claude.ai +
// claude.com) and lets the user push a batch into the selected one.
//
// We deliberately do NOT show local Claude Code (VS Code / terminal) chats:
// those don't have a public push API, so the resulting "click → Cmd+V"
// flow is no better than just hitting "Copy all" from the sidebar.
//
// Returns Promise<null | OnlineTab>:
//   null      — cancelled
//   OnlineTab — { kind: "online", tabId, url, title, lastAccessed }

import { el } from "./core.js";

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

const openClaudeAi = () => {
  try {
    chrome.runtime.sendMessage({
      type: "TSAYRU_OPEN_TAB",
      url: "https://claude.ai/new",
    });
  } catch {}
};

let pickerEl = null;

const closePicker = () => {
  if (pickerEl) {
    pickerEl.remove();
    pickerEl = null;
  }
};

const renderItem = (entry, onPick) => {
  let urlLabel = entry.url;
  try {
    const u = new URL(entry.url);
    urlLabel = u.host + (u.pathname.length > 1 ? u.pathname : "");
  } catch {}
  return el(
    "button",
    {
      class: "tsayru-picker-item tsayru-picker-item--online",
      title: entry.url,
      onClick: () => onPick(entry),
    },
    el(
      "div",
      { class: "tsayru-picker-item-head" },
      el("span", { class: "tsayru-picker-item-kind" }, "🌐"),
      el(
        "span",
        { class: "tsayru-picker-item-label" },
        entry.title || "Untitled",
      ),
      entry.active
        ? el("span", { class: "tsayru-picker-item-meta" }, "active")
        : null,
    ),
    el("div", { class: "tsayru-picker-item-path" }, urlLabel),
  );
};

export const pickTargetChat = () =>
  new Promise((resolve) => {
    closePicker();

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      closePicker();
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    };

    const list = el("div", { class: "tsayru-picker-list" });
    const status = el(
      "div",
      { class: "tsayru-picker-status" },
      "Looking for open Claude web chats…",
    );

    pickerEl = el(
      "div",
      {
        class: "tsayru-modal-backdrop",
        onClick: (e) => {
          if (e.target === pickerEl) finish(null);
        },
      },
      el(
        "div",
        { class: "tsayru-modal tsayru-picker-modal" },
        el(
          "div",
          { class: "tsayru-modal-head" },
          el(
            "div",
            { class: "tsayru-modal-title" },
            "Send to which web chat?",
          ),
          el(
            "button",
            { class: "tsayru-modal-close", onClick: () => finish(null) },
            "×",
          ),
        ),
        status,
        list,
        el(
          "div",
          { class: "tsayru-picker-footer" },
          el(
            "button",
            {
              class: "tsayru-modal-cancel",
              onClick: () => finish(null),
            },
            "Cancel",
          ),
        ),
      ),
    );

    document.documentElement.appendChild(pickerEl);
    window.addEventListener("keydown", onKey, true);

    fetchOnlineTabs().then((res) => {
      if (resolved) return;
      list.innerHTML = "";
      if (!res.ok) {
        if (isContextInvalidated(res.error)) {
          status.innerHTML =
            "Extension was reloaded — refresh the page " +
            "(<kbd>Cmd+R</kbd> / <kbd>F5</kbd>).";
          status.classList.add("tsayru-picker-status--warn");
        } else {
          status.textContent = `Error: ${res.error}`;
        }
        return;
      }
      const tabs = res.tabs;
      if (tabs.length === 0) {
        status.innerHTML =
          "No open claude.ai or claude.com tabs. Open " +
          "<a class=\"tsayru-picker-link\" href=\"https://claude.ai/new\" target=\"_blank\">claude.ai/new</a> " +
          "or <a class=\"tsayru-picker-link\" href=\"https://claude.com\" target=\"_blank\">claude.com</a> in a new tab and reopen the picker.";
        // Wire the link opens via background to avoid CSP issues on the host page.
        for (const a of status.querySelectorAll("a")) {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            try {
              chrome.runtime.sendMessage({
                type: "TSAYRU_OPEN_TAB",
                url: a.href,
              });
            } catch {}
            finish(null);
          });
        }
        return;
      }
      status.textContent = `Found ${tabs.length} web chat${tabs.length === 1 ? "" : "s"}:`;
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
    });
  });
