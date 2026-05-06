chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TSAYRU_TOGGLE" });
  } catch (err) {
    console.warn("[tsayru] toggle failed:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Capture the visible viewport on behalf of the content script.
  // activeTab permission covers this for the tab the user is interacting with.
  if (msg?.type === "TSAYRU_CAPTURE") {
    const windowId = sender?.tab?.windowId;
    if (windowId == null) {
      sendResponse({ dataUrl: null, error: "no window" });
      return true;
    }
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          dataUrl: null,
          error: chrome.runtime.lastError.message || "capture failed",
        });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async
  }

  // HTTP request to the local tsayru-server. Routed through background to
  // bypass page CSP. host_permissions allow localhost. Supports GET (no body)
  // and POST/DELETE (JSON body).
  if (msg?.type === "TSAYRU_SEND") {
    const { url, body, method = "POST" } = msg;
    const init = { method };
    if (body !== undefined && body !== null) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    fetch(url, init)
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) {
          sendResponse({ ok: false, error: `HTTP ${r.status}: ${text}` });
          return;
        }
        try {
          sendResponse({ ok: true, data: JSON.parse(text) });
        } catch {
          sendResponse({ ok: true, data: text });
        }
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  // Enumerate open Anthropic web-chat tabs: claude.ai (consumer chat) and
  // claude.com (newer surface, also hosts Claude Code web). Both are React
  // apps with the same chat-input shape — same inject script works on both.
  if (msg?.type === "TSAYRU_LIST_TABS") {
    chrome.tabs.query(
      { url: ["https://claude.ai/*", "https://claude.com/*"] },
      (tabs) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        const out = (tabs || []).map((t) => ({
          tabId: t.id,
          url: t.url || "",
          title: t.title || "",
          active: !!t.active,
          windowId: t.windowId,
          lastAccessed: t.lastAccessed || null,
        }));
        sendResponse({ ok: true, tabs: out });
      },
    );
    return true; // async
  }

  // Open a URL in a new browser tab (used by picker's empty-state links).
  if (msg?.type === "TSAYRU_OPEN_TAB") {
    const { url } = msg;
    if (typeof url === "string" && url.startsWith("https://")) {
      chrome.tabs.create({ url }, (tab) => {
        sendResponse({ ok: !!tab, tabId: tab?.id || null });
      });
      return true;
    }
    sendResponse({ ok: false, error: "url required" });
    return true;
  }

  // Push markdown into a specific claude.ai tab — find chat input, insert text,
  // submit. Uses chrome.scripting.executeScript so we don't ship a persistent
  // claude.ai content-script. Best-effort: claude.ai DOM may change.
  if (msg?.type === "TSAYRU_PUSH_CLAUDE_AI") {
    const { tabId, content } = msg;
    if (!tabId || typeof content !== "string") {
      sendResponse({ ok: false, error: "tabId+content required" });
      return true;
    }
    (async () => {
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (err) {
        // not fatal — script can still run on background tab
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: injectIntoClaudeAi,
          args: [content],
        });
        const r = results?.[0]?.result;
        if (!r || !r.ok) {
          sendResponse({
            ok: false,
            error: r?.error || "no result from inject script",
          });
          return;
        }
        sendResponse({ ok: true, ...r });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // async
  }

  return false;
});

// Runs in the claude.ai tab's MAIN world via chrome.scripting.executeScript.
// Must be self-contained (no closures over outer vars) — args are passed in.
function injectIntoClaudeAi(text) {
  try {
    // Find the chat input. claude.ai uses a contenteditable ProseMirror editor.
    const candidates = [
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '[data-testid="chat-input"] [contenteditable="true"]',
      'textarea',
    ];
    let editor = null;
    for (const sel of candidates) {
      const found = document.querySelector(sel);
      if (found) {
        editor = found;
        break;
      }
    }
    if (!editor) return { ok: false, error: "chat input not found" };

    editor.focus();

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable: replace selection with text via execCommand. Outdated
      // but ProseMirror reacts to `beforeinput` it generates and updates state.
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // execCommand is deprecated but still works for contenteditable inserts
      // and is the most reliable way to make ProseMirror update its model.
      const ok = document.execCommand("insertText", false, text);
      if (!ok) {
        // Fallback: dispatch a synthetic InputEvent with data
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true,
          }),
        );
        editor.textContent = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    // Find submit button. claude.ai has multiple shapes; try several.
    const sendCandidates = [
      'button[aria-label="Send Message"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'button[data-testid="send-button"]',
    ];
    let sendBtn = null;
    for (const sel of sendCandidates) {
      const b = document.querySelector(sel);
      if (b && !b.disabled) {
        sendBtn = b;
        break;
      }
    }

    if (sendBtn) {
      // Defer so the model state catches up with the text we inserted.
      setTimeout(() => sendBtn.click(), 50);
      return { ok: true, submitted: true };
    }

    // Fallback: simulate Enter
    setTimeout(() => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    }, 50);
    return { ok: true, submitted: "via-enter" };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
