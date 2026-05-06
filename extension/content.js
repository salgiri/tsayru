(() => {
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
  var safeHost = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };
  var plural = (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "\u0430";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "\u0438";
    return "";
  };
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
          detail: { message: quota ? "\u043D\u0435\u0442 \u043C\u0435\u0441\u0442\u0430 \u2014 \u0443\u0434\u0430\u043B\u0438 \u0441\u0442\u0430\u0440\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" : "\u043E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F" }
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

  // src/framework.js
  var detectFramework = (target) => {
    return new Promise((resolve) => {
      if (!(target instanceof Element)) return resolve(null);
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

  // src/screenshot.js
  var PADDING = 8;
  var MAX_WIDTH = 800;
  var requestFullCapture = () => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_CAPTURE" }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.dataUrl) {
          resolve(null);
          return;
        }
        resolve(resp.dataUrl);
      });
    } catch {
      resolve(null);
    }
  });
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
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    return canvas.toDataURL("image/png");
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
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return withHiddenUI(async () => {
      const dataUrl = await requestFullCapture();
      if (!dataUrl) return null;
      const img = await loadImage(dataUrl);
      if (!img) return null;
      return cropToDataUrl(img, rect);
    });
  };

  // src/format.js
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
  var taskLines = (t, displayIndex, opts = {}) => {
    const lines = [`## ${displayIndex}. ${t.label}`];
    lines.push(`- \u0441\u0435\u043B\u0435\u043A\u0442\u043E\u0440: \`${t.selector}\``);
    const fw = t.framework;
    if (fw && fw.componentName) {
      lines.push(`- \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442: \`${fw.componentName}\``);
    }
    if (fw && fw.source && fw.source.file) {
      const loc = fw.source.line ? `${fw.source.file}:${fw.source.line}` : fw.source.file;
      lines.push(`- \u0444\u0430\u0439\u043B: \`${loc}\``);
    }
    if (fw && fw.framework && !fw.componentName && !fw.source) {
      lines.push(`- \u0444\u0440\u0435\u0439\u043C\u0432\u043E\u0440\u043A: ${fw.framework}`);
    }
    const styles = formatComputedStyles(t.computedStyles);
    if (styles) {
      lines.push(`- \u0441\u0442\u0438\u043B\u0438: ${styles}`);
    }
    lines.push(`- url: ${t.url}`);
    if (t.screenshot) {
      if (opts.includeScreenshots) {
        lines.push(`- \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442:`);
        lines.push("");
        lines.push(`![${t.label}](${t.screenshot})`);
      } else {
        lines.push(`- \u0441\u043A\u0440\u0438\u043D\u0448\u043E\u0442: \u2713 (\u043F\u043E\u043B\u0443\u0447\u0438 \u0447\u0435\u0440\u0435\u0437 MCP \`tsayru_latest_tasks\`)`);
      }
    }
    lines.push("");
    lines.push(t.text);
    return lines;
  };
  var formatTask = (t, displayIndex, opts = {}) => {
    return [
      "# UI-\u0437\u0430\u0434\u0430\u0447\u0430 (tsayru)",
      "",
      ...taskLines(t, displayIndex, opts)
    ].join("\n");
  };
  var formatTasks = (opts = {}) => {
    const tasks = state.filterHost ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost) : state.tasks;
    if (tasks.length === 0) return "";
    const header = state.filterHost ? `# UI-\u0437\u0430\u0434\u0430\u0447\u0438 (tsayru) \u2014 ${state.filterHost}` : "# UI-\u0437\u0430\u0434\u0430\u0447\u0438 (tsayru)";
    const lines = [header, ""];
    tasks.forEach((t, i) => {
      lines.push(...taskLines(t, i + 1, opts));
      lines.push("");
    });
    return lines.join("\n");
  };

  // src/chatpicker.js
  var isContextInvalidated = (err) => /context invalidated|Extension context/i.test(String(err || ""));
  var fetchOnlineTabs = () => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_LIST_TABS" }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          resolve({
            ok: false,
            error: resp?.error || chrome.runtime.lastError?.message || "\u043D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430"
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
          entry.title || "\u0411\u0435\u0437 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0430"
        ),
        entry.active ? el("span", { class: "tsayru-picker-item-meta" }, "\u0430\u043A\u0442\u0438\u0432\u043D\u0430\u044F") : null
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
      "\u0418\u0449\u0443 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 web-\u0447\u0430\u0442\u044B Claude\u2026"
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
            "\u0412 \u043A\u0430\u043A\u043E\u0439 web-\u0447\u0430\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C?"
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
            "\u041E\u0442\u043C\u0435\u043D\u0430"
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
          status.innerHTML = "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u0431\u044B\u043B\u043E \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E \u2014 \u043E\u0431\u043D\u043E\u0432\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 (<kbd>Cmd+R</kbd> / <kbd>F5</kbd>).";
          status.classList.add("tsayru-picker-status--warn");
        } else {
          status.textContent = `\u041E\u0448\u0438\u0431\u043A\u0430: ${res.error}`;
        }
        return;
      }
      const tabs = res.tabs;
      if (tabs.length === 0) {
        status.innerHTML = '\u041D\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0432\u043A\u043B\u0430\u0434\u043E\u043A claude.ai \u0438\u043B\u0438 claude.com. \u041E\u0442\u043A\u0440\u043E\u0439 <a class="tsayru-picker-link" href="https://claude.ai/new" target="_blank">claude.ai/new</a> \u0438\u043B\u0438 <a class="tsayru-picker-link" href="https://claude.com" target="_blank">claude.com</a> \u0432 \u043D\u043E\u0432\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u0438 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 picker.';
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
      status.textContent = `\u041D\u0430\u0439\u0434\u0435\u043D\u043E ${tabs.length} web-\u0447\u0430\u0442${tabs.length === 1 ? "" : "\u043E\u0432"}:`;
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
  window.addEventListener("tsayru-persist-error", (e) => {
    flash(e?.detail?.message || "\u043E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F");
  });
  var writeClipboard = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch (err) {
      console.warn("[tsayru] clipboard write failed:", err);
      flash("\u043E\u0448\u0438\u0431\u043A\u0430 \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F");
    }
  };
  var copyAll = async () => {
    const text = formatTasks();
    if (!text) {
      flash("\u043D\u0435\u0447\u0435\u0433\u043E \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C");
      return;
    }
    await writeClipboard(text, "\u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E");
  };
  var copyOne = async (task, displayIndex) => {
    await writeClipboard(formatTask(task, displayIndex), "\u0437\u0430\u0434\u0430\u0447\u0430 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430");
  };
  var SERVER_URL = "http://127.0.0.1:7777/tasks";
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
              error: resp?.error || chrome.runtime.lastError?.message || "\u043D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430"
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
  var pushToWebChat = (tabId, content) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_PUSH_CLAUDE_AI", tabId, content },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error: resp?.error || chrome.runtime.lastError?.message || "\u043D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430"
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
    const label = target?.title || "web-\u0447\u0430\u0442";
    const where = ` \u2192 ${label}`;
    postBatch(tasks, target).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
    });
    const fullMd = formatTasks({ includeScreenshots: true });
    const inject = await pushToWebChat(target.tabId, fullMd);
    if (inject.ok) {
      flash(`\u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E${where} \u2713`);
      return;
    }
    console.warn("[tsayru] inject failed:", inject.error);
    if (isContextInvalidated2(inject.error)) {
      flash("\u043E\u0431\u043D\u043E\u0432\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 (Cmd+R)");
    } else if (/chat input not found/i.test(String(inject.error))) {
      flash(`\u0438\u043D\u0436\u0435\u043A\u0442 \u043D\u0435 \u0443\u0434\u0430\u043B\u0441\u044F: \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u043D\u0435\u0442 \u0447\u0430\u0442-\u0438\u043D\u043F\u0443\u0442\u0430`);
    } else {
      flash(`\u0438\u043D\u0436\u0435\u043A\u0442 \u043D\u0435 \u0443\u0434\u0430\u043B\u0441\u044F${where}`);
    }
  };
  var sendToServer = async () => {
    const tasks = state.filterHost ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost) : state.tasks;
    if (tasks.length === 0) {
      flash("\u043D\u0435\u0447\u0435\u0433\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C");
      return;
    }
    const target = await pickTargetChat();
    if (target === null) return;
    sendBatch(tasks, target);
  };
  var onTaskHover = (selector) => {
    if (state.inspecting) return;
    if (!selector) return;
    ensureOverlay();
    let target = null;
    try {
      target = document.querySelector(selector);
    } catch {
      target = null;
    }
    moveHighlight(target);
  };
  var onTaskLeave = () => {
    if (state.inspecting) return;
    moveHighlight(null);
  };
  var clearTasks = () => {
    if (state.tasks.length === 0) return;
    const fh = state.filterHost;
    const target = fh ? state.tasks.filter((t) => safeHost(t.url) === fh) : state.tasks;
    if (target.length === 0) return;
    const msg = fh ? `\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C ${target.length} \u0437\u0430\u0434\u0430\u0447 \u0434\u043B\u044F ${fh}?` : "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438?";
    if (!confirm(msg)) return;
    if (fh) {
      state.tasks = state.tasks.filter((t) => safeHost(t.url) !== fh);
    } else {
      state.tasks = [];
    }
    state.editingTaskIndex = null;
    persist();
    renderSidebar();
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
              title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C (Enter)",
              onClick: save
            },
            "\u2713"
          ),
          el(
            "button",
            {
              class: "tsayru-task-cancel",
              title: "\u041E\u0442\u043C\u0435\u043D\u0430 (Esc)",
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
        class: "tsayru-task",
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
            title: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u0443 \u0437\u0430\u0434\u0430\u0447\u0443",
            onClick: () => copyOne(task, displayNum)
          },
          "\u29C9"
        ),
        el(
          "button",
          {
            class: "tsayru-task-edit",
            title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
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
            title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
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
      el("div", { class: "tsayru-task-text" }, task.text)
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
      tabs.appendChild(mkTab("\u0412\u0441\u0435", null, state.tasks.length));
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
          state.filterHost ? `\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447 \u0434\u043B\u044F ${state.filterHost}.` : "\u0412\u043A\u043B\u044E\u0447\u0438 \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440 \u0438 \u043A\u043B\u0438\u043A\u043D\u0438 \u043F\u043E \u0431\u043B\u043E\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443."
        )
      );
    } else {
      filtered.forEach((task, fi) => {
        const idx = state.tasks.indexOf(task);
        list.appendChild(renderTask(task, idx, fi + 1));
      });
    }
    const counter = refs.sidebar.querySelector(".tsayru-counter");
    counter.textContent = state.tasks.length ? `${state.tasks.length} \u0437\u0430\u0434\u0430\u0447${plural(state.tasks.length)}` : "\u043F\u0443\u0441\u0442\u043E";
    const inspectBtn = refs.sidebar.querySelector(".tsayru-inspect-btn");
    inspectBtn.classList.toggle("tsayru-active", state.inspecting);
    inspectBtn.textContent = state.inspecting ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440" : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440";
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
        el("div", { class: "tsayru-counter" }, "\u043F\u0443\u0441\u0442\u043E"),
        el(
          "button",
          {
            class: "tsayru-close",
            title: "\u0421\u043A\u0440\u044B\u0442\u044C (\u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442 \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440)",
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
          "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440"
        ),
        el(
          "button",
          { class: "tsayru-copy-btn", onClick: copyAll },
          "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0441\u0451"
        ),
        el(
          "button",
          {
            class: "tsayru-send-btn",
            title: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u0447\u043A\u0443 \u0432 \u043E\u0442\u043A\u0440\u044B\u0442\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 claude.ai / claude.com (auto-submit)",
            onClick: sendToServer
          },
          "\u0412 Claude.ai"
        ),
        el(
          "button",
          { class: "tsayru-clear-btn", onClick: clearTasks },
          "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C"
        )
      ),
      el("div", { class: "tsayru-list" })
    );
    document.documentElement.appendChild(refs.sidebar);
    renderSidebar();
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
  var isUniqueSelector = (sel, target) => {
    try {
      const m = document.querySelectorAll(sel);
      return m.length === 1 && m[0] === target;
    } catch {
      return false;
    }
  };
  var buildSelector = (target) => {
    if (!(target instanceof Element)) return "";
    const directAnchor = anchorFor(target);
    if (directAnchor && isUniqueSelector(directAnchor, target)) return directAnchor;
    const parts = [];
    let node = target;
    let safety = 30;
    while (node && node.nodeType === 1 && safety > 0) {
      const seg = segmentFor(node);
      parts.unshift(seg);
      const chain = parts.join(" > ");
      if (isUniqueSelector(chain, target)) return chain;
      if (seg.startsWith("#") || seg.startsWith("[data-")) break;
      if (!node.parentElement || node.tagName === "BODY" || node.tagName === "HTML")
        break;
      node = node.parentElement;
      safety -= 1;
    }
    const final = parts.join(" > ");
    try {
      const matches = document.querySelectorAll(final);
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
  var shortLabel = (target) => {
    if (!target) return "";
    const text = (target.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length === 0) return target.tagName.toLowerCase();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };

  // src/modal.js
  var closeModal = () => {
    if (refs.modal) {
      refs.modal.remove();
      refs.modal = null;
    }
  };
  var submitTask = async (selector, label, frameworkPromise, computedStyles, screenshot) => {
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
    const framework = await Promise.race([
      frameworkPromise || Promise.resolve(null),
      new Promise((resolve) => setTimeout(() => resolve(null), 250))
    ]);
    state.tasks.push({
      selector,
      label,
      text,
      url: location.href,
      framework: framework || null,
      computedStyles: computedStyles || null,
      screenshot: screenshot || null,
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await persist();
    renderSidebar();
    closeModal();
  };
  var openModal = (target, computedStyles, screenshot) => {
    closeModal();
    const selector = buildSelector(target);
    const label = shortLabel(target);
    const frameworkPromise = detectFramework(target).catch(() => null);
    refs.modal = el(
      "div",
      {
        class: "tsayru-modal-backdrop",
        onClick: (e) => {
          if (e.target === refs.modal) closeModal();
        }
      },
      el(
        "div",
        { class: "tsayru-modal" },
        el(
          "div",
          { class: "tsayru-modal-head" },
          el("div", { class: "tsayru-modal-title" }, "\u0417\u0430\u0434\u0430\u0447\u0430 \u0434\u043B\u044F \u0431\u043B\u043E\u043A\u0430"),
          el(
            "button",
            { class: "tsayru-modal-close", onClick: closeModal },
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
          placeholder: "\u0427\u0442\u043E \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u0432 \u044D\u0442\u043E\u043C \u0431\u043B\u043E\u043A\u0435? (Enter \u2014 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C, Shift+Enter \u2014 \u043F\u0435\u0440\u0435\u043D\u043E\u0441)",
          rows: 4
        }),
        el(
          "div",
          { class: "tsayru-modal-footer" },
          el(
            "button",
            { class: "tsayru-modal-cancel", onClick: closeModal },
            "\u041E\u0442\u043C\u0435\u043D\u0430"
          ),
          el(
            "button",
            {
              class: "tsayru-modal-submit",
              onClick: () => submitTask(selector, label, frameworkPromise, computedStyles, screenshot)
            },
            "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C (Enter)"
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
        submitTask(selector, label, frameworkPromise, computedStyles, screenshot);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
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
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === state.hovered) return;
    if (isOurChrome(target)) {
      state.hovered = null;
      moveHighlight(null);
      return;
    }
    state.hovered = target;
    moveHighlight(target);
  };
  var onClick = async (e) => {
    if (!state.inspecting) return;
    if (e.target.closest(".tsayru-sidebar, .tsayru-modal-backdrop")) return;
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target) return;
    if (isOurChrome(target)) return;
    const computedStyles = snapshotComputedStyles(target);
    setInspecting(false);
    moveHighlight(null);
    const screenshot = await captureElement(target);
    openModal(target, computedStyles, screenshot);
  };
  var onKeyDown = (e) => {
    if (e.key === "Escape" && state.inspecting) {
      setInspecting(false);
      moveHighlight(null);
    }
  };
  var initEventListeners = () => {
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
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
