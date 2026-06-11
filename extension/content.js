(() => {
  // src/format.js
  var safeHost = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };
  var rgbToHex = (s) => {
    const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (!m) return s;
    const [, r, g, b, a] = m;
    if (a !== void 0 && parseFloat(a) === 0) return "transparent";
    const hex = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
    const base = `#${hex(r)}${hex(g)}${hex(b)}`;
    if (a !== void 0 && parseFloat(a) < 1) {
      return `${base} (\u03B1 ${parseFloat(a).toFixed(2)})`;
    }
    return base;
  };
  var formatComputedStyles = (cs) => {
    if (!cs) return null;
    const parts = [];
    const fg = rgbToHex(cs.color);
    if (fg && fg !== "#000000") parts.push(`color ${fg}`);
    const bg = rgbToHex(cs.backgroundColor);
    if (bg && bg !== "transparent") parts.push(`bg ${bg}`);
    const fontFam = (cs.fontFamily || "").split(",")[0].trim().replace(/['"]/g, "");
    const fontParts = [];
    if (cs.fontSize) fontParts.push(cs.fontSize);
    if (fontFam) fontParts.push(fontFam);
    if (cs.fontWeight && cs.fontWeight !== "400") fontParts.push(cs.fontWeight);
    if (fontParts.length) parts.push(`font ${fontParts.join(" ")}`);
    if (cs.padding && cs.padding !== "0px") parts.push(`pad ${cs.padding}`);
    if (cs.borderRadius && cs.borderRadius !== "0px")
      parts.push(`r ${cs.borderRadius}`);
    if (cs.border && !/^0px/.test(cs.border) && !/none/.test(cs.border)) {
      parts.push(`border ${cs.border}`);
    }
    if (cs.width != null && cs.height != null) {
      parts.push(`${cs.width}\xD7${cs.height}`);
    }
    return parts.length ? parts.join(" \xB7 ") : null;
  };
  var filterByHost = (tasks, filterHost) => filterHost ? (tasks || []).filter((t) => safeHost(t.url) === filterHost) : tasks || [];
  var taskLines = (t, displayIndex, opts = {}) => {
    const mode = opts.screenshotMode || "note";
    const check = t.done ? "\u2705 " : "";
    const lines = [`## ${displayIndex}. ${check}${t.label}`];
    lines.push(`- selector: \`${t.selector}\``);
    const fw = t.framework;
    if (fw && fw.componentName) {
      const chain = Array.isArray(fw.componentChain) ? fw.componentChain : null;
      const crumbs = chain && chain.length > 1 ? ` (in ${chain.slice(1).reverse().join(" \u203A ")})` : "";
      lines.push(`- component: \`${fw.componentName}\`${crumbs}`);
    }
    if (fw && fw.source && fw.source.file) {
      const loc = fw.source.line ? `${fw.source.file}:${fw.source.line}` : fw.source.file;
      lines.push(`- file: \`${loc}\``);
    }
    if (fw && fw.framework && !fw.componentName && !fw.source) {
      lines.push(`- framework: ${fw.framework}`);
    }
    const styles = formatComputedStyles(t.computedStyles);
    if (styles) {
      lines.push(`- styles: ${styles}`);
    }
    if (t.html) {
      lines.push(`- html: \`${t.html}\``);
    }
    if (t.env && t.env.viewport) {
      const envParts = [t.env.viewport];
      if (t.env.scheme) envParts.push(t.env.scheme);
      if (t.env.dpr && t.env.dpr !== 1) envParts.push(`dpr ${t.env.dpr}`);
      lines.push(`- env: ${envParts.join(" \xB7 ")}`);
    }
    lines.push(`- url: ${t.url}`);
    if (Array.isArray(t.pageErrors) && t.pageErrors.length) {
      lines.push(`- recent page errors:`);
      for (const er of t.pageErrors.slice(0, 5)) {
        const meta = [
          er.count > 1 ? `\xD7${er.count}` : null,
          er.source || null,
          er.ago != null ? `${er.ago}s ago` : null
        ].filter(Boolean).join(", ");
        lines.push(`  - \`${er.message}\`${meta ? ` (${meta})` : ""}`);
      }
    }
    if (t.screenshot && mode === "attached") {
      lines.push(`- screenshot: attached image #${opts.attachmentNum || displayIndex}`);
    } else if (t.screenshot && mode === "note") {
      lines.push(`- screenshot: \u2713 captured (image data omitted from clipboard copy)`);
    }
    lines.push("");
    lines.push(
      t.text || "(no description provided \u2014 infer the needed change from the screenshot and element context)"
    );
    if (t.screenshot && mode === "inline") {
      lines.push("");
      lines.push(`![${t.label}](${t.screenshot})`);
    }
    return lines;
  };
  var formatTask = (t, displayIndex, opts = {}) => {
    return [
      "# UI task (tsayru)",
      "",
      ...taskLines(t, displayIndex, { attachmentNum: 1, ...opts })
    ].join("\n");
  };
  var formatTasks = (tasks, filterHost, opts = {}) => {
    const list = filterByHost(tasks, filterHost);
    if (list.length === 0) return "";
    const header = filterHost ? `# UI tasks (tsayru) \u2014 ${filterHost}` : "# UI tasks (tsayru)";
    const lines = [header, ""];
    let attachmentNum = 0;
    list.forEach((t, i) => {
      if (t.screenshot) attachmentNum += 1;
      lines.push(...taskLines(t, i + 1, { ...opts, attachmentNum }));
      lines.push("");
    });
    return lines.join("\n");
  };

  // src/core.js
  var STORAGE_KEY = "tsayru_tasks";
  var state = {
    inspecting: false,
    hovered: null,
    tasks: [],
    editingTaskIndex: null,
    filterHost: null
  };
  var refs = {
    highlight: null,
    sidebar: null,
    modal: null
  };
  var el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };
  var plural = (n, singular = "", many = "s") => n === 1 ? singular : many;
  var isDevHost = () => {
    const h = location.hostname;
    if (!h) return location.protocol === "file:";
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".localhost") || h.endsWith(".test");
  };
  var persist = async () => {
    try {
      await chrome.storage?.local?.set({ [STORAGE_KEY]: state.tasks });
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      const quota = /quota/i.test(msg) || msg.includes("QUOTA_BYTES");
      console.warn("[tsayru] persist failed:", msg);
      window.dispatchEvent(
        new CustomEvent("tsayru-persist-error", {
          detail: {
            message: quota ? "out of storage \u2014 delete old tasks" : "save error"
          }
        })
      );
      return false;
    }
  };
  var restore = async () => {
    try {
      const data = await chrome.storage?.local?.get(STORAGE_KEY);
      if (data && Array.isArray(data[STORAGE_KEY])) {
        state.tasks = data[STORAGE_KEY];
      }
    } catch {
    }
  };

  // src/errors.js
  var MAX_ERRORS = 10;
  var buffer = [];
  var shortSource = (filename, lineno) => {
    if (!filename) return null;
    const tail = String(filename).split("/").slice(-2).join("/");
    return lineno ? `${tail}:${lineno}` : tail;
  };
  var push = (message, source) => {
    const msg = String(message || "").replace(/`/g, "'").slice(0, 200);
    if (!msg) return;
    const last = buffer[buffer.length - 1];
    if (last && last.message === msg) {
      last.count = (last.count || 1) + 1;
      last.at = Date.now();
      return;
    }
    buffer.push({ message: msg, source: source || null, count: 1, at: Date.now() });
    if (buffer.length > MAX_ERRORS) buffer.shift();
  };
  var initErrorCapture = () => {
    window.addEventListener("error", (e) => {
      if (!e.message) return;
      push(e.message, shortSource(e.filename, e.lineno));
    });
  };
  var recentContentErrors = (limit = 5) => {
    const now = Date.now();
    return buffer.slice(-limit).map((e) => ({
      message: e.message,
      source: e.source,
      count: e.count || 1,
      ago: Math.round((now - e.at) / 1e3)
    }));
  };

  // src/framework.js
  var mainWorldReady = null;
  var ensureMainWorld = () => {
    if (!mainWorldReady) {
      mainWorldReady = new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "TSAYRU_INJECT_MAIN" }, (resp) => {
            void chrome.runtime.lastError;
            resolve(!!resp?.ok);
          });
        } catch {
          resolve(false);
        }
      });
    }
    return mainWorldReady;
  };
  var detectFramework = async (target) => {
    if (!(target instanceof Element)) return null;
    await ensureMainWorld();
    return new Promise((resolve) => {
      const r = target.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 8);
      const y = r.top + Math.min(r.height / 2, 8);
      const requestId = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
      const onResp = (e) => {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.type !== "TSAYRU_DETECT_RESPONSE" || data.requestId !== requestId)
          return;
        window.removeEventListener("message", onResp);
        clearTimeout(timer);
        resolve(data.result || null);
      };
      window.addEventListener("message", onResp);
      window.postMessage(
        { type: "TSAYRU_DETECT_REQUEST", x, y, requestId },
        location.origin || "*"
      );
      const timer = setTimeout(() => {
        window.removeEventListener("message", onResp);
        resolve(null);
      }, 200);
    });
  };
  var collectPageErrors = async () => {
    await ensureMainWorld();
    return new Promise((resolve) => {
      const requestId = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
      const onResp = (e) => {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.type !== "TSAYRU_ERRORS_RESPONSE" || data.requestId !== requestId)
          return;
        window.removeEventListener("message", onResp);
        clearTimeout(timer);
        resolve(Array.isArray(data.errors) ? data.errors : []);
      };
      window.addEventListener("message", onResp);
      window.postMessage(
        { type: "TSAYRU_ERRORS_REQUEST", requestId },
        location.origin || "*"
      );
      const timer = setTimeout(() => {
        window.removeEventListener("message", onResp);
        resolve([]);
      }, 150);
    });
  };
  var snapshotHtml = (target, maxLen = 300) => {
    if (!(target instanceof Element)) return null;
    try {
      let html = target.outerHTML.replace(/\s+/g, " ").trim();
      html = html.replace(/(src|href|srcset)="data:[^"]{40,}"/g, '$1="data:\u2026"');
      html = html.replace(/`/g, "'");
      if (html.length > maxLen) html = html.slice(0, maxLen - 1) + "\u2026";
      return html;
    } catch {
      return null;
    }
  };
  var snapshotEnv = () => {
    try {
      return {
        viewport: `${window.innerWidth}\xD7${window.innerHeight}`,
        dpr: window.devicePixelRatio || 1,
        scheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      };
    } catch {
      return null;
    }
  };
  var snapshotComputedStyles = (target) => {
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
        border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
        width: Math.round(r.width),
        height: Math.round(r.height),
        display: cs.display
      };
    } catch {
      return null;
    }
  };

  // src/selector.js
  var looksLikeHash = (c) => {
    if (c.length < 6) return false;
    if (/^css-[a-z0-9]{4,}$/.test(c)) return true;
    if (/^[a-z0-9]{8,}$/i.test(c) && /\d/.test(c) && !/-/.test(c) && !/_/.test(c))
      return true;
    return false;
  };
  var anchorFor = (el2) => {
    for (const attr of ["data-testid", "data-test", "data-cy"]) {
      const v = el2.getAttribute(attr);
      if (v) return `[${attr}="${CSS.escape(v)}"]`;
    }
    if (el2.id && /^[a-zA-Z][\w:-]*$/.test(el2.id)) return `#${CSS.escape(el2.id)}`;
    const aria = el2.getAttribute("aria-label");
    if (aria && aria.length > 0 && aria.length <= 60) {
      return `${el2.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
    }
    return null;
  };
  var segmentFor = (node) => {
    const anchor = anchorFor(node);
    if (anchor && (anchor.startsWith("#") || anchor.startsWith("["))) return anchor;
    let part = node.tagName.toLowerCase();
    if (anchor) {
      part = anchor;
    } else if (node.classList.length) {
      const cls = [...node.classList].filter((c) => !c.startsWith("tsayru-") && !looksLikeHash(c)).slice(0, 6).map((c) => `.${CSS.escape(c)}`).join("");
      part += cls;
    }
    const parent = node.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter(
        (c) => c.tagName === node.tagName
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    return part;
  };
  var isUniqueSelector = (sel, target, root = document) => {
    try {
      const m = root.querySelectorAll(sel);
      return m.length === 1 && m[0] === target;
    } catch {
      return false;
    }
  };
  var buildSelectorIn = (target, root) => {
    const directAnchor = anchorFor(target);
    if (directAnchor && isUniqueSelector(directAnchor, target, root))
      return directAnchor;
    const parts = [];
    let node = target;
    let safety = 30;
    while (node && node.nodeType === 1 && safety > 0) {
      const seg = segmentFor(node);
      parts.unshift(seg);
      const chain = parts.join(" > ");
      if (isUniqueSelector(chain, target, root)) return chain;
      if (seg.startsWith("#") || seg.startsWith("[data-")) break;
      if (!node.parentElement || node.tagName === "BODY" || node.tagName === "HTML")
        break;
      node = node.parentElement;
      safety -= 1;
    }
    const final = parts.join(" > ");
    try {
      const matches = root.querySelectorAll(final);
      if (matches.length !== 1) {
        console.warn(
          `[tsayru] non-unique selector (${matches.length} matches):`,
          final
        );
      }
    } catch {
    }
    return final;
  };
  var buildSelector = (target) => {
    if (!(target instanceof Element)) return "";
    const root = target.getRootNode();
    if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
      const hostSel = buildSelector(root.host);
      return `${hostSel} >>> ${buildSelectorIn(target, root)}`;
    }
    return buildSelectorIn(target, document);
  };
  var queryDeep = (selector) => {
    try {
      const hops = String(selector).split(" >>> ");
      let scope = document;
      let found = null;
      for (const hop of hops) {
        if (!scope) return null;
        found = scope.querySelector(hop);
        if (!found) return null;
        scope = found.shadowRoot || null;
      }
      return found;
    } catch {
      return null;
    }
  };
  var deepElementFromPoint = (x, y) => {
    let el2 = document.elementFromPoint(x, y);
    let guard = 12;
    while (el2 && el2.shadowRoot && guard-- > 0) {
      const inner = el2.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el2) break;
      el2 = inner;
    }
    return el2;
  };
  var shortLabel = (target) => {
    if (!target) return "";
    const text = (target.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length === 0) return target.tagName.toLowerCase();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };

  // src/screenshot.js
  var PADDING = 48;
  var OUTLINE_COLOR = "#ff3b30";
  var MAX_WIDTH = 800;
  var JPEG_QUALITY = 0.85;
  var requestFullCapture = () => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_CAPTURE" }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ dataUrl: null, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({
          dataUrl: resp?.dataUrl || null,
          error: resp?.dataUrl ? null : resp?.error || "no response"
        });
      });
    } catch (err) {
      resolve({ dataUrl: null, error: String(err) });
    }
  });
  var captureErrorMessage = (raw) => {
    const s = String(raw || "");
    if (/activeTab|permission|not in effect|cannot access/i.test(s)) {
      return "no screenshot access \u2014 click the tsayru toolbar icon once";
    }
    if (/MAX_CAPTURE_VISIBLE_TAB|per second/i.test(s)) {
      return "screenshot rate limit \u2014 try again in a second";
    }
    return "screenshot failed";
  };
  var reportCaptureError = (raw) => {
    window.dispatchEvent(
      new CustomEvent("tsayru-capture-error", {
        detail: { message: captureErrorMessage(raw) }
      })
    );
  };
  var loadImage = (dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
  var cropToDataUrl = (img, rect) => {
    if (rect.width === 0 || rect.height === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(Math.max(0, (rect.left - PADDING) * dpr));
    const sy = Math.round(Math.max(0, (rect.top - PADDING) * dpr));
    const sxRight = Math.round(
      Math.min((rect.left + rect.width + PADDING) * dpr, img.width)
    );
    const syBottom = Math.round(
      Math.min((rect.top + rect.height + PADDING) * dpr, img.height)
    );
    const sw = sxRight - sx;
    const sh = syBottom - sy;
    if (sw <= 0 || sh <= 0) return null;
    const cssW = sw / dpr;
    const cssH = sh / dpr;
    const scale = Math.min(1, MAX_WIDTH / cssW);
    const outW = Math.max(1, Math.round(cssW * scale * dpr));
    const outH = Math.max(1, Math.round(cssH * scale * dpr));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const outScale = outW / sw;
    const ex = (rect.left * dpr - sx) * outScale;
    const ey = (rect.top * dpr - sy) * outScale;
    const ew = rect.width * dpr * outScale;
    const eh = rect.height * dpr * outScale;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr * outScale));
    ctx.strokeRect(ex, ey, ew, eh);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  };
  var withHiddenUI = async (fn) => {
    const sidebar = refs.sidebar;
    const highlight = refs.highlight;
    const prevSidebar = sidebar ? sidebar.style.visibility : null;
    const prevHighlight = highlight ? highlight.style.visibility : null;
    if (sidebar) sidebar.style.visibility = "hidden";
    if (highlight) highlight.style.visibility = "hidden";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      return await fn();
    } finally {
      if (sidebar) {
        if (prevSidebar) sidebar.style.visibility = prevSidebar;
        else sidebar.style.removeProperty("visibility");
      }
      if (highlight) {
        if (prevHighlight) highlight.style.visibility = prevHighlight;
        else highlight.style.removeProperty("visibility");
      }
    }
  };
  var captureElement = async (target) => {
    if (!(target instanceof Element)) return null;
    let rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
      }
      await new Promise(
        (r) => requestAnimationFrame(() => requestAnimationFrame(r))
      );
      rect = target.getBoundingClientRect();
    }
    return withHiddenUI(async () => {
      const { dataUrl, error } = await requestFullCapture();
      if (!dataUrl) {
        reportCaptureError(error);
        return null;
      }
      const img = await loadImage(dataUrl);
      if (!img) return null;
      return cropToDataUrl(img, rect);
    });
  };

  // src/chatpicker.js
  var isContextInvalidated = (err) => /context invalidated|Extension context/i.test(String(err || ""));
  var fetchOnlineTabs = () => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_LIST_TABS" }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          resolve({
            ok: false,
            error: resp?.error || chrome.runtime.lastError?.message || "no response"
          });
          return;
        }
        resolve({ ok: true, tabs: resp.tabs || [] });
      });
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
  var pickerEl = null;
  var closePicker = () => {
    if (pickerEl) {
      pickerEl.remove();
      pickerEl = null;
    }
  };
  var renderItem = (entry, onPick) => {
    let urlLabel = entry.url;
    try {
      const u = new URL(entry.url);
      urlLabel = u.host + (u.pathname.length > 1 ? u.pathname : "");
    } catch {
    }
    return el(
      "button",
      {
        class: "tsayru-picker-item tsayru-picker-item--online",
        title: entry.url,
        onClick: () => onPick(entry)
      },
      el(
        "div",
        { class: "tsayru-picker-item-head" },
        el("span", { class: "tsayru-picker-item-kind" }, "\u{1F310}"),
        el(
          "span",
          { class: "tsayru-picker-item-label" },
          entry.title || "Untitled"
        ),
        entry.active ? el("span", { class: "tsayru-picker-item-meta" }, "active") : null
      ),
      el("div", { class: "tsayru-picker-item-path" }, urlLabel)
    );
  };
  var pickTargetChat = () => new Promise((resolve) => {
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
      "Looking for open Claude web chats\u2026"
    );
    pickerEl = el(
      "div",
      {
        class: "tsayru-modal-backdrop",
        onClick: (e) => {
          if (e.target === pickerEl) finish(null);
        }
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
            "Send to which web chat?"
          ),
          el(
            "button",
            { class: "tsayru-modal-close", onClick: () => finish(null) },
            "\xD7"
          )
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
              onClick: () => finish(null)
            },
            "Cancel"
          )
        )
      )
    );
    document.documentElement.appendChild(pickerEl);
    window.addEventListener("keydown", onKey, true);
    fetchOnlineTabs().then((res) => {
      if (resolved) return;
      list.innerHTML = "";
      if (!res.ok) {
        if (isContextInvalidated(res.error)) {
          status.innerHTML = "Extension was reloaded \u2014 refresh the page (<kbd>Cmd+R</kbd> / <kbd>F5</kbd>).";
          status.classList.add("tsayru-picker-status--warn");
        } else {
          status.textContent = `Error: ${res.error}`;
        }
        return;
      }
      const tabs = res.tabs;
      if (tabs.length === 0) {
        status.innerHTML = 'No open claude.ai or claude.com tabs. Open <a class="tsayru-picker-link" href="https://claude.ai/new" target="_blank">claude.ai/new</a> or <a class="tsayru-picker-link" href="https://claude.com" target="_blank">claude.com</a> in a new tab and reopen the picker.';
        for (const a of status.querySelectorAll("a")) {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            try {
              chrome.runtime.sendMessage({
                type: "TSAYRU_OPEN_TAB",
                url: a.href
              });
            } catch {
            }
            finish(null);
          });
        }
        return;
      }
      status.textContent = `Found ${tabs.length} web chat${tabs.length === 1 ? "" : "s"}:`;
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      for (const t of tabs) {
        const entry = {
          kind: "online",
          tabId: t.tabId,
          url: t.url,
          title: t.title,
          active: t.active,
          lastAccessed: t.lastAccessed
        };
        list.appendChild(renderItem(entry, finish));
      }
    });
  });

  // src/sidebar.js
  var flash = (msg) => {
    const tip = el("div", { class: "tsayru-flash" }, msg);
    document.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 1400);
  };
  var flashAction = (msg, actionLabel, onAction, ttl = 8e3) => {
    const btn = el(
      "button",
      {
        class: "tsayru-flash-btn",
        onClick: () => {
          tip.remove();
          onAction();
        }
      },
      actionLabel
    );
    const tip = el("div", { class: "tsayru-flash tsayru-flash-action" }, msg, btn);
    document.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), ttl);
  };
  window.addEventListener("tsayru-persist-error", (e) => {
    flash(e?.detail?.message || "save error");
  });
  window.addEventListener("tsayru-capture-error", (e) => {
    flash(e?.detail?.message || "screenshot failed");
  });
  var writeClipboard = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch (err) {
      console.warn("[tsayru] clipboard write failed:", err);
      flash("clipboard error");
    }
  };
  var copyAll = async () => {
    const tasks = filterByHost(state.tasks, state.filterHost);
    const text = formatTasks(state.tasks, state.filterHost);
    if (!text) {
      flash("nothing to copy");
      return;
    }
    await writeClipboard(text, "copied");
    postBatch(tasks, null).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save skipped:", p.error);
    });
  };
  var copyOne = async (task, displayIndex) => {
    await writeClipboard(formatTask(task, displayIndex), "task copied");
  };
  var SERVER_BASE = "http://127.0.0.1:7777";
  var SERVER_URL = `${SERVER_BASE}/tasks`;
  var isContextInvalidated2 = (err) => /context invalidated|Extension context/i.test(String(err || ""));
  var postBatch = (tasks, target) => new Promise((resolve) => {
    const payload = {
      tasks,
      host: location.host,
      filterHost: state.filterHost || null,
      targetTabUrl: target?.url || null,
      targetTabTitle: target?.title || null,
      sentAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_SEND", url: SERVER_URL, body: payload, method: "POST" },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error: resp?.error || chrome.runtime.lastError?.message || "no response"
            });
            return;
          }
          resolve({ ok: true, batchId: resp.data?.batchId });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
  var pushToWebChat = (tabId, content, images) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_PUSH_CLAUDE_AI", tabId, content, images },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error: resp?.error || chrome.runtime.lastError?.message || "no response"
            });
            return;
          }
          resolve({ ok: true, ...resp });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
  var sendBatch = async (tasks, target) => {
    const label = target?.title || "web chat";
    const where = ` \u2192 ${label}`;
    postBatch(tasks, target).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
    });
    const md = formatTasks(tasks, state.filterHost, { screenshotMode: "attached" });
    const images = tasks.map((t) => t.screenshot).filter(Boolean);
    const inject = await pushToWebChat(target.tabId, md, images);
    if (inject.ok) {
      flash(`sent${where} \u2713`);
      return;
    }
    console.warn("[tsayru] inject failed:", inject.error);
    if (isContextInvalidated2(inject.error)) {
      flash("reload page (Cmd+R)");
    } else if (/chat input not found/i.test(String(inject.error))) {
      flash(`inject failed: no chat input on this tab`);
    } else {
      flash(`inject failed${where}`);
    }
  };
  var sendToServer = async () => {
    const tasks = state.filterHost ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost) : state.tasks;
    if (tasks.length === 0) {
      flash("nothing to send");
      return;
    }
    const target = await pickTargetChat();
    if (target === null) return;
    sendBatch(tasks, target);
  };
  var pollDoneStatus = () => {
    if (!refs.sidebar || refs.sidebar.classList.contains("tsayru-hidden")) return;
    if (!state.tasks.some((t) => t.id && !t.done)) return;
    try {
      chrome.runtime.sendMessage(
        {
          type: "TSAYRU_SEND",
          url: `${SERVER_BASE}/tasks/done/recent`,
          method: "GET"
        },
        (resp) => {
          void chrome.runtime.lastError;
          const ids = resp?.ok && Array.isArray(resp.data?.ids) ? resp.data.ids : null;
          if (!ids || ids.length === 0) return;
          const doneIds = new Set(ids);
          let changed = false;
          for (const t of state.tasks) {
            if (t.id && !t.done && doneIds.has(t.id)) {
              t.done = true;
              changed = true;
            }
          }
          if (changed) {
            persist();
            renderSidebar();
          }
        }
      );
    } catch {
    }
  };
  var donePollTimer = null;
  var ensureDonePolling = () => {
    if (donePollTimer) return;
    donePollTimer = setInterval(pollDoneStatus, 1e4);
  };
  var onTaskHover = (selector) => {
    if (state.inspecting) return;
    if (!selector) return;
    ensureOverlay();
    moveHighlight(queryDeep(selector));
  };
  var onTaskLeave = () => {
    if (state.inspecting) return;
    moveHighlight(null);
  };
  var clearTasks = () => {
    if (state.tasks.length === 0) return;
    const fh = state.filterHost;
    const removed = fh ? state.tasks.filter((t) => safeHost(t.url) === fh) : state.tasks.slice();
    if (removed.length === 0) return;
    if (fh) {
      state.tasks = state.tasks.filter((t) => safeHost(t.url) !== fh);
    } else {
      state.tasks = [];
    }
    state.editingTaskIndex = null;
    persist();
    renderSidebar();
    flashAction(
      `cleared ${removed.length} task${plural(removed.length)}`,
      "undo",
      () => {
        state.tasks.push(...removed);
        persist();
        renderSidebar();
      }
    );
  };
  var renderTask = (task, idx, displayNum) => {
    if (state.editingTaskIndex === idx) {
      const ta = el("textarea", { class: "tsayru-task-edit-input", rows: 3 });
      ta.value = task.text;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 0);
      const save = () => {
        const v = ta.value.trim();
        if (!v) {
          ta.focus();
          return;
        }
        state.tasks[idx].text = v;
        state.editingTaskIndex = null;
        persist();
        renderSidebar();
      };
      const cancel = () => {
        state.editingTaskIndex = null;
        renderSidebar();
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      });
      return el(
        "div",
        { class: "tsayru-task tsayru-task-editing" },
        el(
          "div",
          { class: "tsayru-task-head" },
          el("span", { class: "tsayru-task-num" }, `#${displayNum}`),
          el("span", { class: "tsayru-task-label" }, task.label),
          el(
            "button",
            {
              class: "tsayru-task-save",
              title: "Save (Enter)",
              onClick: save
            },
            "\u2713"
          ),
          el(
            "button",
            {
              class: "tsayru-task-cancel",
              title: "Cancel (Esc)",
              onClick: cancel
            },
            "\u21A9"
          )
        ),
        el("div", { class: "tsayru-task-sel" }, task.selector),
        ta
      );
    }
    return el(
      "div",
      {
        class: "tsayru-task" + (task.done ? " tsayru-task-done" : ""),
        onMouseEnter: () => onTaskHover(task.selector),
        onMouseLeave: onTaskLeave
      },
      el(
        "div",
        { class: "tsayru-task-head" },
        el("span", { class: "tsayru-task-num" }, `#${displayNum}`),
        el("span", { class: "tsayru-task-label" }, task.label),
        el(
          "button",
          {
            class: "tsayru-task-copy",
            title: "Copy this task",
            onClick: () => copyOne(task, displayNum)
          },
          "\u29C9"
        ),
        el(
          "button",
          {
            class: "tsayru-task-edit",
            title: "Edit",
            onClick: () => {
              state.editingTaskIndex = idx;
              renderSidebar();
            }
          },
          "\u270E"
        ),
        el(
          "button",
          {
            class: "tsayru-task-del",
            title: "Delete",
            onClick: () => {
              state.tasks.splice(idx, 1);
              if (state.editingTaskIndex === idx) state.editingTaskIndex = null;
              else if (state.editingTaskIndex !== null && state.editingTaskIndex > idx) {
                state.editingTaskIndex -= 1;
              }
              persist();
              renderSidebar();
            }
          },
          "\xD7"
        )
      ),
      el("div", { class: "tsayru-task-sel" }, task.selector),
      el(
        "div",
        {
          class: "tsayru-task-text" + (task.text ? "" : " tsayru-task-text-empty")
        },
        task.text || "no description \u2014 click \u270E to add"
      )
    );
  };
  var renderSidebar = () => {
    if (!refs.sidebar) return;
    const list = refs.sidebar.querySelector(".tsayru-list");
    list.innerHTML = "";
    const hosts = [
      ...new Set(state.tasks.map((t) => safeHost(t.url)).filter(Boolean))
    ];
    if (state.filterHost && !hosts.includes(state.filterHost)) {
      state.filterHost = null;
    }
    if (hosts.length > 1) {
      const tabs = el("div", { class: "tsayru-tabs" });
      const mkTab = (label, value, count) => {
        const active = state.filterHost === value;
        return el(
          "button",
          {
            class: "tsayru-tab" + (active ? " tsayru-tab-active" : ""),
            onClick: () => {
              state.filterHost = value;
              renderSidebar();
            }
          },
          `${label} \xB7 ${count}`
        );
      };
      tabs.appendChild(mkTab("All", null, state.tasks.length));
      for (const h of hosts) {
        const n = state.tasks.filter((t) => safeHost(t.url) === h).length;
        tabs.appendChild(mkTab(h, h, n));
      }
      list.appendChild(tabs);
    }
    const filtered = state.filterHost ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost) : state.tasks;
    if (filtered.length === 0) {
      list.appendChild(
        el(
          "div",
          { class: "tsayru-empty" },
          state.filterHost ? `No tasks for ${state.filterHost}.` : "Enable the inspector and click an element to add a task."
        )
      );
    } else {
      filtered.forEach((task, fi) => {
        const idx = state.tasks.indexOf(task);
        list.appendChild(renderTask(task, idx, fi + 1));
      });
    }
    const counter = refs.sidebar.querySelector(".tsayru-counter");
    counter.textContent = state.tasks.length ? `${state.tasks.length} task${plural(state.tasks.length)}` : "empty";
    const inspectBtn = refs.sidebar.querySelector(".tsayru-inspect-btn");
    inspectBtn.classList.toggle("tsayru-active", state.inspecting);
    inspectBtn.textContent = state.inspecting ? "Disable inspector" : "Enable inspector";
  };
  var ensureSidebar = () => {
    if (refs.sidebar) return;
    refs.sidebar = el(
      "div",
      { class: "tsayru-sidebar" },
      el(
        "div",
        { class: "tsayru-header" },
        el("div", { class: "tsayru-title" }, "tsayru"),
        el("div", { class: "tsayru-counter" }, "empty"),
        el(
          "button",
          {
            class: "tsayru-close",
            title: "Hide (turns inspector off)",
            onClick: () => hideSidebar()
          },
          "\u2014"
        )
      ),
      el(
        "div",
        { class: "tsayru-controls" },
        el(
          "button",
          {
            class: "tsayru-inspect-btn",
            onClick: () => toggleInspector()
          },
          "Enable inspector"
        ),
        el(
          "button",
          { class: "tsayru-copy-btn", onClick: copyAll },
          "Copy all"
        ),
        el(
          "button",
          {
            class: "tsayru-send-btn",
            title: "Send batch to an open claude.ai / claude.com tab (auto-submit)",
            onClick: sendToServer
          },
          "To Claude"
        ),
        el(
          "button",
          { class: "tsayru-clear-btn", onClick: clearTasks },
          "Clear"
        )
      ),
      el("div", { class: "tsayru-list" })
    );
    document.documentElement.appendChild(refs.sidebar);
    ensureDonePolling();
    renderSidebar();
  };

  // src/modal.js
  var closeModal = () => {
    if (refs.modal) {
      refs.modal.remove();
      refs.modal = null;
    }
  };
  var requestClose = () => {
    const ta = refs.modal?.querySelector(".tsayru-modal-input");
    if (ta && ta.value.trim() && !confirm("Discard this task draft?")) return;
    closeModal();
  };
  var addTask = async (selector, label, text, frameworkPromise, ctx) => {
    const framework = await Promise.race([
      frameworkPromise || Promise.resolve(null),
      new Promise((resolve) => setTimeout(() => resolve(null), 250))
    ]);
    state.tasks.push({
      // Stable id — the done-status sync from the server matches on it.
      id: crypto.randomUUID(),
      selector,
      label,
      text,
      url: location.href,
      framework: framework || null,
      computedStyles: ctx?.computedStyles || null,
      screenshot: ctx?.screenshot || null,
      html: ctx?.html || null,
      env: ctx?.env || null,
      pageErrors: ctx?.pageErrors?.length ? ctx.pageErrors : null,
      done: false,
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await persist();
    renderSidebar();
    window.dispatchEvent(new CustomEvent("tsayru-task-added"));
  };
  var quickAddTask = async (target, ctx) => {
    const selector = buildSelector(target);
    const label = shortLabel(target);
    const frameworkPromise = detectFramework(target).catch(() => null);
    await addTask(selector, label, "", frameworkPromise, ctx);
  };
  var submitTask = async (selector, label, frameworkPromise, ctx) => {
    if (!refs.modal) return;
    if (refs.modal.__submitting) return;
    refs.modal.__submitting = true;
    const ta = refs.modal.querySelector(".tsayru-modal-input");
    const text = ta.value.trim();
    if (!text) {
      refs.modal.__submitting = false;
      ta.focus();
      return;
    }
    await addTask(selector, label, text, frameworkPromise, ctx);
    closeModal();
  };
  var openModal = (target, ctx = {}) => {
    closeModal();
    const selector = buildSelector(target);
    const label = shortLabel(target);
    const frameworkPromise = detectFramework(target).catch(() => null);
    const screenshot = ctx.screenshot || null;
    refs.modal = el(
      "div",
      {
        class: "tsayru-modal-backdrop",
        onClick: (e) => {
          if (e.target === refs.modal) requestClose();
        }
      },
      el(
        "div",
        { class: "tsayru-modal" },
        el(
          "div",
          { class: "tsayru-modal-head" },
          el("div", { class: "tsayru-modal-title" }, "Task for this element"),
          el(
            "button",
            { class: "tsayru-modal-close", onClick: requestClose },
            "\xD7"
          )
        ),
        el(
          "div",
          { class: "tsayru-modal-meta" },
          el("div", { class: "tsayru-modal-label" }, label),
          el("div", { class: "tsayru-modal-sel" }, selector),
          screenshot ? el("img", { class: "tsayru-modal-thumb", src: screenshot, alt: "" }) : null
        ),
        el("textarea", {
          class: "tsayru-modal-input",
          placeholder: "What should change here? (Enter to add, Shift+Enter for newline)",
          rows: 4
        }),
        el(
          "div",
          { class: "tsayru-modal-footer" },
          el(
            "button",
            { class: "tsayru-modal-cancel", onClick: requestClose },
            "Cancel"
          ),
          el(
            "button",
            {
              class: "tsayru-modal-submit",
              onClick: () => submitTask(selector, label, frameworkPromise, ctx)
            },
            "Add (Enter)"
          )
        )
      )
    );
    document.documentElement.appendChild(refs.modal);
    const ta = refs.modal.querySelector(".tsayru-modal-input");
    ta.focus();
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitTask(selector, label, frameworkPromise, ctx);
      } else if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    });
  };

  // src/inspector.js
  var ensureOverlay = () => {
    if (refs.highlight) return;
    refs.highlight = el("div", { class: "tsayru-highlight" });
    document.documentElement.appendChild(refs.highlight);
  };
  var moveHighlight = (target) => {
    if (!refs.highlight) return;
    if (!target) {
      refs.highlight.style.display = "none";
      return;
    }
    const r = target.getBoundingClientRect();
    refs.highlight.style.display = "block";
    refs.highlight.style.transform = `translate(${r.left + window.scrollX}px, ${r.top + window.scrollY}px)`;
    refs.highlight.style.width = `${r.width}px`;
    refs.highlight.style.height = `${r.height}px`;
  };
  var setInspecting = (on) => {
    state.inspecting = on;
    document.documentElement.classList.toggle("tsayru-inspecting", on);
    if (!on) moveHighlight(null);
    if (on) ensureMainWorld();
    renderSidebar();
  };
  var showSidebar = () => {
    ensureOverlay();
    ensureSidebar();
    refs.sidebar.classList.remove("tsayru-hidden");
  };
  var hideSidebar = () => {
    if (refs.sidebar) refs.sidebar.classList.add("tsayru-hidden");
    if (state.inspecting) setInspecting(false);
    state.editingTaskIndex = null;
  };
  var toggleSidebar = () => {
    ensureOverlay();
    ensureSidebar();
    if (refs.sidebar.classList.contains("tsayru-hidden")) {
      showSidebar();
    } else {
      hideSidebar();
    }
  };
  var toggleInspector = () => {
    showSidebar();
    setInspecting(!state.inspecting);
  };
  var isOurChrome = (node) => !!(node && node.closest && node.closest(".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight"));
  var onMouseMove = (e) => {
    if (!state.inspecting) return;
    const target = deepElementFromPoint(e.clientX, e.clientY);
    if (!target || target === state.hovered) return;
    if (isOurChrome(target)) {
      state.hovered = null;
      moveHighlight(null);
      return;
    }
    state.hovered = target;
    moveHighlight(target);
  };
  var onPointerSuppress = (e) => {
    if (!state.inspecting) return;
    if (isOurChrome(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  var onClick = async (e) => {
    if (!state.inspecting) return;
    if (e.target.closest(".tsayru-sidebar, .tsayru-modal-backdrop")) return;
    e.preventDefault();
    e.stopPropagation();
    const target = deepElementFromPoint(e.clientX, e.clientY);
    if (!target) return;
    if (isOurChrome(target)) return;
    const ctx = {
      computedStyles: snapshotComputedStyles(target),
      html: snapshotHtml(target),
      env: snapshotEnv()
    };
    const quick = e.altKey;
    setInspecting(false);
    moveHighlight(null);
    const [screenshot, mainErrors] = await Promise.all([
      captureElement(target),
      collectPageErrors().catch(() => [])
    ]);
    ctx.screenshot = screenshot;
    const seen = /* @__PURE__ */ new Set();
    ctx.pageErrors = [...mainErrors, ...recentContentErrors()].filter((er) => {
      if (!er?.message || seen.has(er.message)) return false;
      seen.add(er.message);
      return true;
    }).slice(0, 5);
    if (quick) {
      await quickAddTask(target, ctx);
      return;
    }
    openModal(target, ctx);
  };
  var onKeyDown = (e) => {
    if (e.key === "Escape" && state.inspecting) {
      setInspecting(false);
      moveHighlight(null);
    }
  };
  var initEventListeners = () => {
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("pointerdown", onPointerSuppress, true);
    document.addEventListener("mousedown", onPointerSuppress, true);
    document.addEventListener("mouseup", onPointerSuppress, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("tsayru-task-added", () => setInspecting(true));
    window.addEventListener(
      "scroll",
      () => {
        if (state.hovered) moveHighlight(state.hovered);
      },
      true
    );
    window.addEventListener("resize", () => {
      if (state.hovered) moveHighlight(state.hovered);
    });
  };

  // src/index.js
  if (window.__tsayruInjected) {
  } else {
    window.__tsayruInjected = true;
    initEventListeners();
    initErrorCapture();
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg?.type === "TSAYRU_TOGGLE") {
        toggleSidebar();
      }
    });
    restore().then(() => {
      if (isDevHost()) ensureSidebar();
    });
  }
})();
