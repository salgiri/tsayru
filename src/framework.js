// Framework detection (React/Vue) via postMessage bridge to inject.js (MAIN world).
// Snapshot of computed styles is also here — both are "extract context from element" helpers.

// inject.js is no longer a static <all_urls> content script (fingerprinting +
// footprint on every site). Ask the background to inject it on demand; the
// IIFE guard inside inject.js makes repeat injections harmless. Memoized —
// one round-trip per page. If injection fails (no activeTab / host permission
// on this page), detection below just times out and resolves null.
let mainWorldReady = null;
export const ensureMainWorld = () => {
  if (!mainWorldReady) {
    mainWorldReady = new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "TSAYRU_INJECT_MAIN" }, (resp) => {
          void chrome.runtime.lastError; // swallow — detect degrades gracefully
          resolve(!!resp?.ok);
        });
      } catch {
        resolve(false);
      }
    });
  }
  return mainWorldReady;
};

export const detectFramework = async (target) => {
  if (!(target instanceof Element)) return null;
  await ensureMainWorld();
  return new Promise((resolve) => {
    const r = target.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 8);
    const y = r.top + Math.min(r.height / 2, 8);
    const requestId =
      Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);

    const onResp = (e) => {
      if (e.source !== window) return;
      const data = e.data;
      if (
        !data ||
        data.type !== "TSAYRU_DETECT_RESPONSE" ||
        data.requestId !== requestId
      )
        return;
      window.removeEventListener("message", onResp);
      clearTimeout(timer);
      resolve(data.result || null);
    };

    window.addEventListener("message", onResp);
    // Same-origin only: keeps cross-origin iframes out of our message channel.
    window.postMessage(
      { type: "TSAYRU_DETECT_REQUEST", x, y, requestId },
      location.origin || "*",
    );

    const timer = setTimeout(() => {
      window.removeEventListener("message", onResp);
      resolve(null);
    }, 200);
  });
};

// Pull the MAIN-world page-error buffer (console.error, unhandled rejections,
// uncaught errors) via the same postMessage bridge as detectFramework.
// Resolves [] when inject.js isn't reachable.
export const collectPageErrors = async () => {
  await ensureMainWorld();
  return new Promise((resolve) => {
    const requestId =
      Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
    const onResp = (e) => {
      if (e.source !== window) return;
      const data = e.data;
      if (
        !data ||
        data.type !== "TSAYRU_ERRORS_RESPONSE" ||
        data.requestId !== requestId
      )
        return;
      window.removeEventListener("message", onResp);
      clearTimeout(timer);
      resolve(Array.isArray(data.errors) ? data.errors : []);
    };
    window.addEventListener("message", onResp);
    window.postMessage(
      { type: "TSAYRU_ERRORS_REQUEST", requestId },
      location.origin || "*",
    );
    const timer = setTimeout(() => {
      window.removeEventListener("message", onResp);
      resolve([]);
    }, 150);
  });
};

// Sanitized outerHTML snippet (≤ maxLen chars): whitespace collapsed, bulky
// data-URLs stubbed out, backticks neutralized so it can sit inside a
// markdown code span. Gives Claude the element's real structure.
export const snapshotHtml = (target, maxLen = 300) => {
  if (!(target instanceof Element)) return null;
  try {
    let html = target.outerHTML.replace(/\s+/g, " ").trim();
    html = html.replace(/(src|href|srcset)="data:[^"]{40,}"/g, '$1="data:…"');
    html = html.replace(/`/g, "'");
    if (html.length > maxLen) html = html.slice(0, maxLen - 1) + "…";
    return html;
  } catch {
    return null;
  }
};

// Page environment at capture time — viewport, color scheme, pixel ratio.
// One markdown line, but it's the difference between "button broken" and
// "button broken at 375px in dark mode".
export const snapshotEnv = () => {
  try {
    return {
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      dpr: window.devicePixelRatio || 1,
      scheme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    };
  } catch {
    return null;
  }
};

// Snapshot the visually meaningful computed styles. Defaults are filtered out at format time.
export const snapshotComputedStyles = (target) => {
  if (!(target instanceof Element)) return null;
  try {
    const cs = getComputedStyle(target);
    const r = target.getBoundingClientRect();
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      padding: cs.padding,
      margin: cs.margin,
      borderRadius: cs.borderRadius,
      border:
        cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
      width: Math.round(r.width),
      height: Math.round(r.height),
      display: cs.display,
    };
  } catch {
    return null;
  }
};
