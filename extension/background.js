chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TSAYRU_TOGGLE" });
  } catch (err) {
    console.warn("[tsayru] toggle failed:", err);
  }
});

// Only the local tsayru-server may be fetched on behalf of content scripts.
// Defense-in-depth: the only sender today is our own content script, but a
// future bug should not turn this handler into an open proxy with the
// extension's host permissions.
const isAllowedServerUrl = (url) => {
  try {
    const u = new URL(url);
    return (
      u.protocol === "http:" &&
      (u.hostname === "127.0.0.1" || u.hostname === "localhost")
    );
  } catch {
    return false;
  }
};

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
    if (!isAllowedServerUrl(url)) {
      sendResponse({
        ok: false,
        error: "blocked: only the local tsayru-server may be called",
      });
      return true;
    }
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

  // Lazily inject inject.js (React/Vue fiber probe) into the sender tab's
  // MAIN world. Replaces the old static <all_urls> MAIN-world content script:
  // the probe now lands only on pages where the inspector is actually used,
  // instead of leaving a fingerprintable global on every site the user visits.
  // Needs activeTab (icon click / hotkey) or a host permission (localhost) —
  // on other pages this fails and framework detection gracefully times out.
  if (msg?.type === "TSAYRU_INJECT_MAIN") {
    const tabId = sender?.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tab" });
      return true;
    }
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        files: ["inject.js"],
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      );
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

  // Push markdown (+ screenshot files) into a specific claude.ai tab — find
  // chat input, insert text, attach images, submit. Uses
  // chrome.scripting.executeScript so we don't ship a persistent claude.ai
  // content-script. Best-effort: claude.ai DOM may change.
  if (msg?.type === "TSAYRU_PUSH_CLAUDE_AI") {
    const { tabId, content, images } = msg;
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
          args: [content, Array.isArray(images) ? images : []],
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
// Async: executeScript awaits the returned promise.
async function injectIntoClaudeAi(text, images) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Find the chat input. claude.ai uses a contenteditable ProseMirror
    // editor, but pages can host several contenteditables (artifact editors,
    // rename fields). Score visible candidates instead of grabbing the first.
    const findEditor = () => {
      const candidates = [
        ...document.querySelectorAll('div[contenteditable="true"], textarea'),
      ].filter((n) => n.offsetParent !== null);
      if (candidates.length === 0) return null;
      const score = (n) => {
        let s = 0;
        if (n.getAttribute("role") === "textbox") s += 2;
        if (n.closest('[data-testid="chat-input"], [data-testid*="composer"]'))
          s += 3;
        const scope =
          n.closest("form, fieldset") ||
          n.parentElement?.parentElement ||
          n.parentElement;
        if (
          scope &&
          scope.querySelector(
            'button[aria-label*="send" i], button[type="submit"], button[data-testid="send-button"]',
          )
        )
          s += 2;
        const aria = (n.getAttribute("aria-label") || "").toLowerCase();
        if (aria.includes("prompt") || aria.includes("write")) s += 2;
        return s;
      };
      candidates.sort((a, b) => score(b) - score(a));
      return candidates[0];
    };

    const editor = findEditor();
    if (!editor) return { ok: false, error: "chat input not found" };
    editor.focus();

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      // Use the native setter so React-controlled inputs see the change.
      const proto =
        editor.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(editor, text);
      else editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable: replace selection with text via execCommand. Outdated
      // but ProseMirror reacts to the `beforeinput` it generates and updates
      // its model — the most reliable insert path.
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const ok = document.execCommand("insertText", false, text);
      if (!ok) {
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

    // Verify the text actually registered before doing anything irreversible —
    // submitting an empty composer used to be possible when ProseMirror
    // ignored the insert.
    await sleep(100);
    const registered = (editor.value ?? editor.textContent ?? "").trim();
    if (registered.length === 0) {
      return { ok: false, error: "text did not register in the editor" };
    }

    // Attach screenshots as pasted files. claude.ai accepts image paste in
    // the composer; a synthetic ClipboardEvent with a DataTransfer carrying
    // File objects triggers the same upload path. Far more reliable than
    // megabyte base64 markdown, which ProseMirror chokes on and the chat
    // doesn't render anyway.
    let attached = 0;
    for (const dataUrl of images) {
      try {
        const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/i.exec(dataUrl);
        if (!m) continue;
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ext = m[1].split("/")[1].replace("jpeg", "jpg");
        const file = new File([bytes], `tsayru-${attached + 1}.${ext}`, {
          type: m[1],
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
        attached += 1;
        await sleep(150);
      } catch {
        // skip broken image, keep the rest
      }
    }
    // Give uploads a moment to register before looking for the send button.
    if (attached > 0) await sleep(600);

    const findSendButton = () => {
      const sendCandidates = [
        'button[aria-label="Send Message"]',
        'button[aria-label*="send" i]',
        'button[data-testid="send-button"]',
        'button[type="submit"]',
      ];
      for (const sel of sendCandidates) {
        const b = document.querySelector(sel);
        if (b) return b;
      }
      return null;
    };

    // Wait for an enabled send button — uploads briefly disable it.
    for (let i = 0; i < 20; i++) {
      const btn = findSendButton();
      if (
        btn &&
        !btn.disabled &&
        btn.getAttribute("aria-disabled") !== "true"
      ) {
        btn.click();
        return { ok: true, submitted: true, attached };
      }
      await sleep(200);
    }

    // Fallback: simulate Enter.
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    return { ok: true, submitted: "via-enter", attached };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
