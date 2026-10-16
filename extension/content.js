(() => {
  // src/stylechanges.js
  var changeKey = (c) => [c.scope, c.selector, c.state || "", (c.conditions || []).join(" "), c.property].join(
    ""
  );
  var mergeChanges = (prev = [], next = []) => {
    const map = new Map((prev || []).map((c) => [changeKey(c), { ...c }]));
    for (const c of next || []) {
      const key = changeKey(c);
      const old = map.get(key);
      map.set(key, old ? { ...c, before: old.before, origin: old.origin ?? c.origin } : { ...c });
    }
    return [...map.values()].filter((c) => (c.before ?? null) !== (c.after ?? null));
  };
  var code = (s) => `\`${String(s).replace(/`/g, "'")}\``;
  var where = (sheet, conditions) => [sheet, ...conditions || []].filter(Boolean).join(" \xB7 ");
  var groupHead = (c) => {
    if (c.scope === "element") return "this element (previewed as inline styles)";
    if (c.scope === "new-rule") {
      const state2 = c.state && c.state !== "default" ? ` ${code(c.state)}` : "";
      return `new${state2} rule for this element (${code(c.selector)})`;
    }
    const at = where(c.sheet, c.conditions);
    return `rule ${code(c.selector)}${at ? ` in ${at}` : ""}`;
  };
  var changeLine = (c) => {
    const prop = code(c.property);
    let line;
    if (c.before == null) line = `${prop}: add ${code(c.after)}`;
    else if (c.after == null) line = `${prop}: remove (was ${code(c.before)})`;
    else line = `${prop}: ${code(c.before)} \u2192 ${code(c.after)}`;
    if (c.origin?.selector) {
      const at = where(c.origin.sheet, c.origin.conditions);
      const how = c.origin.inherited ? "inherited from" : "set by";
      line += ` \u2014 ${how} ${code(c.origin.selector)}${at ? ` in ${at}` : ""}`;
    }
    return line;
  };
  var styleChangeLines = (changes) => {
    if (!Array.isArray(changes) || !changes.length) return [];
    const groups = /* @__PURE__ */ new Map();
    for (const c of changes) {
      const head = groupHead(c);
      if (!groups.has(head)) groups.set(head, []);
      groups.get(head).push(c);
    }
    const lines = ["- style changes:"];
    for (const [head, list] of groups) {
      lines.push(`  - ${head}:`);
      for (const c of list) lines.push(`    - ${changeLine(c)}`);
    }
    return lines;
  };
  var STYLE_INSTRUCTION = "Apply the style changes above in the source code. Change the rule or component that sets each value (not inline styles), and use an existing design token where one matches. A rule change applies to every element that rule styles; if the rule is a utility class (Tailwind etc.), change this element's classes instead.";

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
  var taskTags = (text) => {
    const m = String(text || "").match(/#[\p{L}\d_-]{2,24}/gu) || [];
    return [...new Set(m.map((s) => s.slice(1).toLowerCase()))];
  };
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
    const tags = taskTags(t.text);
    if (tags.length) {
      lines.push(`- tags: ${tags.map((tag) => `#${tag}`).join(" ")}`);
    }
    const styleChanges = styleChangeLines(t.styleChanges);
    lines.push(...styleChanges);
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
    if (styleChanges.length) {
      lines.push([t.text, STYLE_INSTRUCTION].filter(Boolean).join("\n\n"));
    } else {
      lines.push(
        t.text || "(no description provided \u2014 infer the needed change from the screenshot and element context)"
      );
    }
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
    let list = filterByHost(tasks, filterHost);
    if (opts.filterTag) {
      list = list.filter((t) => taskTags(t.text).includes(opts.filterTag));
    }
    if (list.length === 0) return "";
    const scope = [filterHost, opts.filterTag ? `#${opts.filterTag}` : null].filter(Boolean).join(" \xB7 ");
    const header = scope ? `# UI tasks (tsayru) \u2014 ${scope}` : "# UI tasks (tsayru)";
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
    filterHost: null,
    filterTag: null
  };
  var refs = {
    highlight: null,
    sidebar: null,
    modal: null,
    styleHost: null
    // the style editor's panel + outline (styleeditor.js)
  };
  var busHandlers = {};
  var bus = {
    on(evt, fn) {
      (busHandlers[evt] ||= []).push(fn);
    },
    emit(evt, payload) {
      for (const fn of busHandlers[evt] || []) {
        try {
          fn(payload);
        } catch {
        }
      }
    }
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
    const nodes = [refs.sidebar, refs.highlight, refs.styleHost].filter(Boolean);
    const prev = nodes.map((n) => [
      n.style.getPropertyValue("visibility"),
      n.style.getPropertyPriority("visibility")
    ]);
    for (const n of nodes) n.style.setProperty("visibility", "hidden", "important");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      return await fn();
    } finally {
      nodes.forEach((n, i) => {
        const [value, priority] = prev[i];
        if (value) n.style.setProperty("visibility", value, priority);
        else n.style.removeProperty("visibility");
      });
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
    const finish2 = (value) => {
      if (resolved) return;
      resolved = true;
      closePicker();
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish2(null);
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
          if (e.target === pickerEl) finish2(null);
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
            { class: "tsayru-modal-close", onClick: () => finish2(null) },
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
              onClick: () => finish2(null)
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
            finish2(null);
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
        list.appendChild(renderItem(entry, finish2));
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
    const tasks = visibleTasks();
    const text = formatTasks(state.tasks, state.filterHost, {
      filterTag: state.filterTag
    });
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
  var visibleTasks = () => {
    let list = filterByHost(state.tasks, state.filterHost);
    if (state.filterTag) {
      list = list.filter((t) => taskTags(t.text).includes(state.filterTag));
    }
    return list;
  };
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
        { type: "TSAYRU_SEND", path: "/tasks", body: payload, method: "POST" },
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
    const where2 = ` \u2192 ${label}`;
    postBatch(tasks, target).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
    });
    const md = formatTasks(tasks, state.filterHost, {
      filterTag: state.filterTag,
      screenshotMode: "attached"
    });
    const images = tasks.map((t) => t.screenshot).filter(Boolean);
    const inject = await pushToWebChat(target.tabId, md, images);
    if (inject.ok) {
      flash(`sent${where2} \u2713`);
      return;
    }
    console.warn("[tsayru] inject failed:", inject.error);
    if (isContextInvalidated2(inject.error)) {
      flash("reload page (Cmd+R)");
    } else if (/chat input not found/i.test(String(inject.error))) {
      flash(`inject failed: no chat input on this tab`);
    } else {
      flash(`inject failed${where2}`);
    }
  };
  var sendToServer = async () => {
    const tasks = visibleTasks();
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
        { type: "TSAYRU_SEND", path: "/tasks/done/recent", method: "GET" },
        (resp) => {
          void chrome.runtime.lastError;
          const ids = resp?.ok && Array.isArray(resp.data?.ids) ? resp.data.ids : null;
          if (!ids || ids.length === 0) return;
          const doneIds = new Set(ids);
          let changed2 = false;
          for (const t of state.tasks) {
            if (t.id && !t.done && doneIds.has(t.id)) {
              t.done = true;
              changed2 = true;
            }
          }
          if (changed2) {
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
    const removed = visibleTasks();
    if (removed.length === 0) return;
    const removedSet = new Set(removed);
    state.tasks = state.tasks.filter((t) => !removedSet.has(t));
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
      // Style-editor tasks speak through their change list; no nag for text.
      task.text || !task.styleChanges?.length ? el(
        "div",
        {
          class: "tsayru-task-text" + (task.text ? "" : " tsayru-task-text-empty")
        },
        task.text || "no description \u2014 click \u270E to add"
      ) : null,
      task.styleChanges?.length ? styleSummary(task.styleChanges) : null
    );
  };
  var styleSummary = (changes) => {
    const props = [...new Set(changes.map((c) => c.property))];
    const shown = props.slice(0, 4).join(", ") + (props.length > 4 ? ", \u2026" : "");
    return el(
      "div",
      {
        class: "tsayru-task-style",
        title: changes.map((c) => `${c.property}: ${c.before ?? "\u2014"} \u2192 ${c.after ?? "removed"}`).join("\n")
      },
      `${changes.length} style change${plural(changes.length)} \xB7 ${shown}`
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
    const hostScoped = filterByHost(state.tasks, state.filterHost);
    const allTags = [...new Set(hostScoped.flatMap((t) => taskTags(t.text)))];
    if (state.filterTag && !allTags.includes(state.filterTag)) {
      state.filterTag = null;
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
    if (allTags.length > 0) {
      const row = el("div", { class: "tsayru-tagrow" });
      for (const tag of allTags) {
        const n = hostScoped.filter((t) => taskTags(t.text).includes(tag)).length;
        const active = state.filterTag === tag;
        row.appendChild(
          el(
            "button",
            {
              class: "tsayru-tagchip" + (active ? " tsayru-tagchip-active" : ""),
              onClick: () => {
                state.filterTag = active ? null : tag;
                renderSidebar();
              }
            },
            `#${tag} \xB7 ${n}`
          )
        );
      }
      list.appendChild(row);
    }
    const filtered = visibleTasks();
    if (filtered.length === 0) {
      list.appendChild(
        el(
          "div",
          { class: "tsayru-empty" },
          state.filterHost || state.filterTag ? `No tasks for ${[state.filterHost, state.filterTag && `#${state.filterTag}`].filter(Boolean).join(" \xB7 ")}.` : "Enable the inspector and click an element to add a task."
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
    bus.emit("task-added");
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

  // src/cssrules.js
  var STATES = [
    "default",
    ":hover",
    ":focus",
    ":focus-visible",
    ":active",
    "::before",
    "::after"
  ];
  var FORCE_SETS = {
    ":hover": { self: ["hover"], up: ["hover"] },
    ":active": { self: ["active", "hover"], up: ["active", "hover"] },
    ":focus": { self: ["focus", "focus-within"], up: ["focus-within"] },
    ":focus-visible": {
      self: ["focus-visible", "focus", "focus-within"],
      up: ["focus-within"]
    }
  };
  var FORCEABLE = Object.keys(FORCE_SETS);
  var FORCE_ATTR = "data-tsayru-force";
  var splitTopLevel = (text, sep = ",") => {
    const out = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "\\") i++;
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
      else if (ch === sep && depth === 0) {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
    out.push(s.slice(start));
    return out.map((p) => p.trim()).filter(Boolean);
  };
  var splitSelectorList = (text) => splitTopLevel(text, ",");
  var closingParen = (s, open2) => {
    let depth = 0;
    for (let i = open2; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")" && --depth === 0) return i;
    }
    return s.length;
  };
  var ESCAPE_RE = /\\[0-9a-fA-F]{1,6}\s?|\\[\s\S]/g;
  var STRING_RE = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;
  var SLOT_RE = /\uE000(\d+)\uE001/g;
  var HAS_SLOT_RE = /\uE000\d+\uE001/;
  var maskSelector = (selector) => {
    const saved = [];
    const hide = (part) => `\uE000${saved.push(part) - 1}\uE001`;
    const s = String(selector).replace(ESCAPE_RE, hide).replace(STRING_RE, hide);
    let out = "";
    let from = 0;
    const fn = /:(not|has)\(/gi;
    let m;
    while (m = fn.exec(s)) {
      const open2 = m.index + m[0].length - 1;
      const close = closingParen(s, open2);
      out += s.slice(from, open2 + 1) + hide(s.slice(open2 + 1, close));
      from = close;
      fn.lastIndex = close;
    }
    out += s.slice(from);
    const restore2 = (text) => {
      let r = text;
      while (HAS_SLOT_RE.test(r)) r = r.replace(SLOT_RE, (_, n) => saved[+n]);
      return r;
    };
    return { masked: out, restore: restore2 };
  };
  var STATE_CLASS_RE = /:(hover|focus-visible|focus|active)(?![\w-])/gi;
  var PSEUDO_ELEMENT_RE = /::?(before|after)(?![\w-])/gi;
  var STATE_PRIORITY = [":focus-visible", ":focus", ":active", ":hover"];
  var classifySelector = (selector) => {
    const sel = String(selector || "").trim();
    const { masked, restore: restore2 } = maskSelector(sel);
    const elements = [...masked.matchAll(PSEUDO_ELEMENT_RE)].map(
      (m) => `::${m[1].toLowerCase()}`
    );
    const classes = [
      ...new Set(
        [...masked.matchAll(STATE_CLASS_RE)].map((m) => `:${m[1].toLowerCase()}`)
      )
    ];
    const base = masked.replace(/(^|[\s>+~(,])(?=::?[a-z])/gi, "$1*").replace(PSEUDO_ELEMENT_RE, "").replace(STATE_CLASS_RE, "").replace(/\s+/g, " ").trim();
    let state2 = "default";
    if (elements.length) state2 = elements[elements.length - 1];
    else if (classes.length) state2 = STATE_PRIORITY.find((s) => classes.includes(s));
    const also = elements.length ? classes : classes.filter((c) => c !== state2);
    return { selector: sel, base: restore2(base || "*"), state: state2, also };
  };
  var STATE_TEST = /:(hover|focus-visible|focus|active)(?![\w-])|::?(before|after)(?![\w-])/i;
  var expandStates = (selector) => {
    const out = [];
    const walk = (sel, depth) => {
      const { masked, restore: restore2 } = maskSelector(sel);
      const fn = /:(is|where|matches|-webkit-any)\(/gi;
      let m;
      while (depth < 3 && (m = fn.exec(masked))) {
        const open2 = m.index + m[0].length - 1;
        const close = closingParen(masked, open2);
        const args = splitTopLevel(masked.slice(open2 + 1, close), ",");
        if (args.length > 1 && args.some((a) => STATE_TEST.test(restore2(a)))) {
          for (const a of args) {
            walk(restore2(`${masked.slice(0, open2 + 1)}${a}${masked.slice(close)}`), depth + 1);
          }
          return;
        }
      }
      out.push(sel);
    };
    walk(String(selector || ""), 0);
    return [...new Set(out)].slice(0, 16);
  };
  var compareSpecificity = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  var specificity = (selector) => {
    let a = 0;
    let b = 0;
    let c = 0;
    let s = String(selector || "").replace(ESCAPE_RE, "x").replace(STRING_RE, '""');
    const fn = /:(where|is|not|has|matches|-webkit-any)\(/gi;
    let m;
    while (m = fn.exec(s)) {
      const open2 = m.index + m[0].length - 1;
      const close = closingParen(s, open2);
      if (m[1].toLowerCase() !== "where") {
        const best = splitSelectorList(s.slice(open2 + 1, close)).map(specificity).sort(compareSpecificity).pop() || [0, 0, 0];
        a += best[0];
        b += best[1];
        c += best[2];
      }
      s = `${s.slice(0, m.index)} ${s.slice(close + 1)}`;
      fn.lastIndex = m.index;
    }
    s = s.replace(/\[[^\]]*\]/g, () => {
      b++;
      return " ";
    });
    a += (s.match(/#[\w-]+/g) || []).length;
    b += (s.match(/\.[\w-]+/g) || []).length;
    const PSEUDO_EL = /::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter)(?![\w-])/gi;
    c += (s.match(PSEUDO_EL) || []).length;
    s = s.replace(PSEUDO_EL, " ");
    b += (s.match(/:[\w-]+(\([^)]*\))?/g) || []).length;
    s = s.replace(/:[\w-]+(\([^)]*\))?/g, " ").replace(/[#.][\w-]+/g, " ");
    c += (s.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length;
    return [a, b, c];
  };
  var resolveNested = (selector, parents) => {
    const sel = String(selector || "").trim();
    if (!parents || !parents.length) return sel;
    const single = parents.length === 1 ? parents[0] : null;
    if (!sel.includes("&")) return `${single || `:is(${parents.join(", ")})`} ${sel}`;
    const wrapped = `:is(${parents.join(", ")})`;
    return sel.replace(/&/g, (_, i) => i === 0 && single ? single : wrapped);
  };
  var forceSelector = (selector, names) => {
    const list = (Array.isArray(names) ? names : [names]).map(
      (n) => String(n).replace(/^:+/, "").toLowerCase()
    );
    const { masked, restore: restore2 } = maskSelector(selector);
    const re = new RegExp(`:(${list.join("|")})(?![\\w-])`, "gi");
    return restore2(
      masked.replace(re, (_, n) => `[${FORCE_ATTR}~="${n.toLowerCase()}"]`)
    );
  };
  var parseDeclarations = (cssText) => splitTopLevel(cssText, ";").map((decl) => {
    const colon = decl.indexOf(":");
    if (colon < 1) return null;
    const name = decl.slice(0, colon).trim();
    let value = decl.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    return name ? { name, value, important } : null;
  }).filter(Boolean);
  var sheetLabel = (sheet) => {
    try {
      if (sheet?.__tsayruLabel) return sheet.__tsayruLabel;
      const node = sheet?.ownerNode;
      const dev = node?.dataset?.viteDevId;
      if (dev) return shortPath(dev);
      if (sheet?.href) return shortPath(new URL(sheet.href).pathname);
      if (node?.tagName === "STYLE") return "<style>";
    } catch {
    }
    return "stylesheet";
  };
  var shortPath = (path) => {
    const p = String(path || "").split("?")[0];
    const marker = p.search(/\/(src|client|app|styles|components|pages)\//);
    if (marker >= 0) return p.slice(marker + 1);
    return p.split("/").filter(Boolean).slice(-3).join("/");
  };
  var kindOf = (rule) => {
    switch (rule?.constructor?.name) {
      case "CSSStyleRule":
        return "style";
      case "CSSNestedDeclarations":
        return "decls";
      case "CSSMediaRule":
        return "media";
      case "CSSSupportsRule":
        return "supports";
      case "CSSContainerRule":
        return "container";
      case "CSSLayerBlockRule":
        return "layer";
      case "CSSLayerStatementRule":
        return "layer-names";
      case "CSSScopeRule":
        return "scope";
      case "CSSImportRule":
        return "import";
    }
    if (rule?.selectorText != null && rule.style) return "style";
    if (rule?.styleSheet) return "import";
    if (rule?.media && rule.cssRules) return "media";
    return "other";
  };
  var walkStyleRules = (root, visit, { win = window, skipSheet } = {}) => {
    let skipped = 0;
    let anonymous = 0;
    const layerOrder = /* @__PURE__ */ new Map();
    const noteLayer = (name) => {
      if (!layerOrder.has(name)) layerOrder.set(name, layerOrder.size);
      return layerOrder.get(name);
    };
    const subLayer = (outer, name) => outer ? `${outer}.${name}` : name;
    const media = (text) => {
      if (!text || /^\s*all\s*$/i.test(text)) return true;
      try {
        return win.matchMedia(text).matches;
      } catch {
        return true;
      }
    };
    const supports2 = (text) => {
      try {
        return win.CSS?.supports ? win.CSS.supports(text) : true;
      } catch {
        return true;
      }
    };
    const within = (ctx, condition, active = true) => ({
      ...ctx,
      conditions: [...ctx.conditions, condition],
      active: ctx.active && active
    });
    const inLayer = (ctx, name) => {
      const layer = subLayer(ctx.layer, name);
      return { ...ctx, layer, layerRank: noteLayer(layer) };
    };
    const walkList = (rules, ctx) => {
      let list;
      try {
        list = Array.from(rules || []);
      } catch {
        return;
      }
      for (const rule of list) walkRule(rule, ctx);
    };
    const walkRule = (rule, ctx) => {
      switch (kindOf(rule)) {
        case "style": {
          visit(rule, ctx);
          if (rule.cssRules?.length) {
            const parents = splitSelectorList(rule.selectorText).map(
              (s) => resolveNested(s, ctx.parents)
            );
            walkList(rule.cssRules, { ...ctx, parents });
          }
          return;
        }
        case "decls":
          if (ctx.parents) visit(rule, ctx);
          return;
        case "media":
          return walkList(
            rule.cssRules,
            within(ctx, `@media ${rule.media.mediaText}`, media(rule.media.mediaText))
          );
        case "supports":
          return walkList(
            rule.cssRules,
            within(ctx, `@supports ${rule.conditionText}`, supports2(rule.conditionText))
          );
        case "container":
          return walkList(rule.cssRules, within(ctx, `@container ${rule.conditionText}`));
        case "scope":
          return walkList(rule.cssRules, within(ctx, "@scope"));
        case "layer":
          return walkList(
            rule.cssRules,
            inLayer(ctx, rule.name || `<anonymous ${++anonymous}>`)
          );
        case "layer-names":
          for (const name of Array.from(rule.nameList || [])) {
            noteLayer(subLayer(ctx.layer, name));
          }
          return;
        case "import": {
          let next = ctx;
          if (rule.layerName != null) {
            next = inLayer(next, rule.layerName || `<anonymous ${++anonymous}>`);
          }
          const text = rule.media?.mediaText;
          if (text) next = within(next, `@media ${text}`, media(text));
          return walkSheet(rule.styleSheet, next);
        }
      }
    };
    const walkSheet = (sheet, ctx) => {
      if (!sheet || sheet.disabled || skipSheet?.(sheet)) return;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        skipped++;
        return;
      }
      let next = { ...ctx, sheet: sheetLabel(sheet) };
      const text = sheet.media?.mediaText;
      if (text) next = within(next, `@media ${text}`, media(text));
      walkList(rules, next);
    };
    const sheets = [
      ...Array.from(root?.styleSheets || []),
      ...Array.from(root?.adoptedStyleSheets || [])
    ];
    for (const sheet of sheets) {
      walkSheet(sheet, {
        sheet: null,
        conditions: [],
        active: true,
        layer: null,
        layerRank: Infinity,
        parents: null
      });
    }
    return { skipped };
  };
  var ownSelectors = (rule) => splitSelectorList(rule.selectorText ?? "&").filter(
    (s) => !s.includes(FORCE_ATTR)
  );
  var byCascade = (x, y) => y.layerRank - x.layerRank || compareSpecificity(y.specificity, x.specificity) || y.order - x.order;
  var collectRules = (element, { root, win = window, skipSheet } = {}) => {
    const scope = root || element.getRootNode?.() || document;
    const entries = [];
    let order = 0;
    const { skipped } = walkStyleRules(
      scope,
      (rule, ctx) => {
        const resolved = ownSelectors(rule).map((s) => resolveNested(s, ctx.parents));
        const ruleOrder = order++;
        const best = /* @__PURE__ */ new Map();
        for (const selector of resolved) {
          const spec = specificity(selector);
          for (const variant of expandStates(selector)) {
            const c = classifySelector(variant);
            let hit = false;
            try {
              hit = element.matches(c.base);
            } catch {
            }
            if (!hit) continue;
            const prev = best.get(c.state);
            if (prev && compareSpecificity(prev.specificity, spec) >= 0) continue;
            best.set(c.state, {
              rule,
              selector,
              ruleSelector: resolved.join(", "),
              state: c.state,
              also: c.also,
              sheet: ctx.sheet,
              conditions: ctx.conditions,
              active: ctx.active,
              layer: ctx.layer,
              layerRank: ctx.layerRank,
              order: ruleOrder,
              specificity: spec
            });
          }
        }
        entries.push(...best.values());
      },
      { win, skipSheet }
    );
    entries.sort(byCascade);
    return { entries, skipped };
  };
  var groupByState = (entries) => {
    const groups = Object.fromEntries(STATES.map((s) => [s, []]));
    for (const e of entries) (groups[e.state] ||= []).push(e);
    return groups;
  };
  var SHORTHANDS = [
    ["background", /^background-/],
    ["border", /^border-((top|right|bottom|left)-)?(width|style|color)$/],
    ["border-top", /^border-top-(width|style|color)$/],
    ["border-right", /^border-right-(width|style|color)$/],
    ["border-bottom", /^border-bottom-(width|style|color)$/],
    ["border-left", /^border-left-(width|style|color)$/],
    ["border-color", /^border-(top|right|bottom|left)-color$/],
    ["border-width", /^border-(top|right|bottom|left)-width$/],
    ["border-style", /^border-(top|right|bottom|left)-style$/],
    ["border-radius", /^border-(top|bottom)-(left|right)-radius$/],
    ["padding", /^padding-(top|right|bottom|left)$/],
    ["padding-inline", /^padding-(left|right)$/],
    ["padding-block", /^padding-(top|bottom)$/],
    ["margin", /^margin-(top|right|bottom|left)$/],
    ["margin-inline", /^margin-(left|right)$/],
    ["margin-block", /^margin-(top|bottom)$/],
    ["inset", /^(top|right|bottom|left)$/],
    ["font", /^(font-(style|variant|weight|stretch|size|family)|line-height)$/],
    ["gap", /^(row|column)-gap$/],
    ["flex", /^flex-(grow|shrink|basis)$/],
    ["outline", /^outline-(color|style|width)$/],
    ["text-decoration", /^text-decoration-(line|color|style|thickness)$/],
    ["transition", /^transition-/],
    ["animation", /^animation-/],
    ["overflow", /^overflow-(x|y)$/],
    ["list-style", /^list-style-/]
  ];
  var declaredIn = (style, prop) => {
    if (!style) return null;
    const value = style.getPropertyValue(prop);
    if (value) return { value, priority: style.getPropertyPriority(prop), via: prop };
    for (const [short, covers] of SHORTHANDS) {
      if (!covers.test(prop)) continue;
      const v = style.getPropertyValue(short);
      if (v) return { value: v, priority: style.getPropertyPriority(short), via: short };
    }
    return null;
  };
  var winningEntry = (entries, prop) => {
    const has = entries.filter(
      (e) => e.state === "default" && e.active && declaredIn(e.rule.style, prop)
    );
    const important = has.filter(
      (e) => declaredIn(e.rule.style, prop).priority === "important"
    );
    if (important.length) {
      return important.sort(
        (x, y) => x.layerRank - y.layerRank || compareSpecificity(y.specificity, x.specificity) || y.order - x.order
      )[0];
    }
    return has[0] || null;
  };
  var STATE_TOKEN_RE = /:(hover|active|focus)/i;
  var forceState = (element, state2, { root, win = window } = {}) => {
    const set = FORCE_SETS[state2];
    if (!set || !element) return () => {
    };
    const scope = root || element.getRootNode?.() || document;
    const names = [.../* @__PURE__ */ new Set([...set.self, ...set.up])];
    const touched = [];
    walkStyleRules(
      scope,
      (rule) => {
        const text = rule.selectorText;
        if (text == null || !STATE_TOKEN_RE.test(text)) return;
        const list = splitSelectorList(text);
        const twins = [];
        for (const sel of list) {
          if (sel.includes(FORCE_ATTR)) continue;
          const twin = forceSelector(sel, names);
          if (twin !== sel) twins.push(twin);
        }
        if (!twins.length) return;
        try {
          rule.selectorText = [...list, ...twins].join(", ");
          touched.push([rule, text]);
        } catch {
        }
      },
      { win }
    );
    const marked = [];
    const mark = (node, words) => {
      const prev = node.getAttribute(FORCE_ATTR);
      marked.push([node, prev]);
      const all = /* @__PURE__ */ new Set([...(prev || "").split(/\s+/).filter(Boolean), ...words]);
      node.setAttribute(FORCE_ATTR, [...all].join(" "));
    };
    mark(element, set.self);
    for (let p = element.parentElement; p; p = p.parentElement) mark(p, set.up);
    return () => {
      for (const [rule, text] of touched) {
        try {
          if (rule.selectorText !== text) rule.selectorText = text;
        } catch {
        }
      }
      for (const [node, prev] of marked.reverse()) {
        if (prev == null) node.removeAttribute(FORCE_ATTR);
        else node.setAttribute(FORCE_ATTR, prev);
      }
    };
  };

  // src/stylevalues.js
  var round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
  var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  var NUMBER_RE = /^(-?\d*\.?\d+)([a-z%]*)$/i;
  var UNITLESS = /* @__PURE__ */ new Set([
    "opacity",
    "font-weight",
    "line-height",
    "z-index",
    "order",
    "flex-grow",
    "flex-shrink",
    "zoom",
    "orphans",
    "widows"
  ]);
  var FINE_STEP = /* @__PURE__ */ new Set(["opacity", "line-height"]);
  var withUnit = (prop, value) => {
    const v = String(value ?? "").trim();
    if (/^-?\d*\.?\d+$/.test(v) && Number(v) !== 0 && !UNITLESS.has(prop) && !String(prop).startsWith("--")) {
      return `${v}px`;
    }
    return v;
  };
  var trimPx = (value) => {
    const s = String(value ?? "").trim();
    return /^-?\d*\.?\d+px$/.test(s) ? String(round(parseFloat(s))) : s;
  };
  var stepFor = (prop, { shiftKey, altKey } = {}) => {
    const base = shiftKey ? 10 : altKey ? 0.1 : 1;
    return FINE_STEP.has(prop) ? base / 10 : base;
  };
  var nudge = (value, delta, fallback, prop) => {
    const m = String(value ?? "").trim().match(NUMBER_RE) || String(fallback ?? "").trim().match(NUMBER_RE);
    if (!m) return null;
    let n = round(parseFloat(m[1]) + delta, 3);
    if (prop === "opacity") n = clamp(n, 0, 1);
    if (prop === "font-weight") n = clamp(n, 1, 1e3);
    return `${n}${m[2]}`;
  };
  var parseColor = (value) => {
    const s = String(value ?? "").trim().toLowerCase();
    let m;
    if (m = s.match(/^#([0-9a-f]+)$/)) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      const byte = (i) => parseInt(h.slice(i, i + 2), 16);
      return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? round(byte(6) / 255, 3) : 1 };
    }
    if (m = s.match(/^rgba?\(([^)]*)\)$/)) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      if (p.length < 3) return null;
      const channel = (x) => x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x);
      const alpha = (x) => x == null ? 1 : x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x);
      return tidy({ r: channel(p[0]), g: channel(p[1]), b: channel(p[2]), a: alpha(p[3]) });
    }
    if (m = s.match(/^color\(\s*srgb\s+([^)]*)\)$/)) {
      const p = m[1].split(/[\s/]+/).filter(Boolean);
      if (p.length < 3) return null;
      const unit = (x) => x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x);
      return tidy({
        r: unit(p[0]) * 255,
        g: unit(p[1]) * 255,
        b: unit(p[2]) * 255,
        a: p[3] == null ? 1 : unit(p[3])
      });
    }
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  };
  var tidy = ({ r, g, b, a }) => [r, g, b, a].some(Number.isNaN) ? null : {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
    a: clamp(round(a, 3), 0, 1)
  };
  var toHex = ({ r, g, b }) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  var formatColor = (c) => !c ? "" : c.a >= 1 ? toHex(c) : `rgb(${c.r} ${c.g} ${c.b} / ${round(c.a, 3)})`;
  var isLength = (t) => NUMBER_RE.test(t) || /^(calc|min|max|clamp)\(/i.test(t);
  var parseShadows = (value) => {
    const v = String(value ?? "").trim();
    if (!v || v === "none") return [];
    return splitTopLevel(v, ",").map(parseShadowLayer).filter(Boolean);
  };
  var parseShadowLayer = (text) => {
    let inset = false;
    const lengths = [];
    const color = [];
    for (const token of splitTopLevel(text, " ")) {
      if (token.toLowerCase() === "inset") inset = true;
      else if (isLength(token) && lengths.length < 4) lengths.push(token);
      else color.push(token);
    }
    if (lengths.length < 2 || lengths.length > 4) return null;
    return {
      inset,
      x: lengths[0],
      y: lengths[1],
      blur: lengths[2] || "0px",
      spread: lengths[3] || "0px",
      color: color.join(" ") || "currentcolor"
    };
  };
  var formatShadows = (layers) => layers && layers.length ? layers.map(
    (l) => [
      l.inset ? "inset" : null,
      withUnit("x", l.x),
      withUnit("y", l.y),
      withUnit("blur", l.blur),
      withUnit("spread", l.spread),
      l.color
    ].filter(Boolean).join(" ")
  ).join(", ") : "none";
  var SHADOW_PRESETS = [
    ["None", "none"],
    ["S", "0 1px 2px rgb(0 0 0 / 0.08)"],
    ["M", "0 4px 12px rgb(0 0 0 / 0.12)"],
    ["L", "0 12px 32px rgb(0 0 0 / 0.16)"],
    ["Ring", "inset 0 0 0 1px rgb(0 0 0 / 0.12)"]
  ];

  // src/stylewidgets.js
  var clamp2 = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  var describeNode = (node, maxClasses = 2) => {
    const id = node.id ? `#${node.id}` : "";
    const cls = [...node.classList].filter((c) => !c.startsWith("tsayru-")).slice(0, maxClasses).map((c) => `.${c.length > 24 ? `${c.slice(0, 23)}\u2026` : c}`).join("");
    return `${node.tagName.toLowerCase()}${id}${cls}`;
  };
  var probe = null;
  var colorOf = (value) => {
    const parsed = parseColor(value);
    if (parsed || !value) return parsed;
    try {
      if (/var\(|^(currentcolor|inherit|initial|unset|revert(-layer)?)$/i.test(value)) return null;
      if (!CSS.supports("color", value)) return null;
      probe ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      probe.canvas.width = probe.canvas.height = 1;
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: Math.round(a / 255 * 1e3) / 1e3 };
    } catch {
      return null;
    }
  };
  var bindKeys = (input, { prop, fallback = () => "", display = trimPx, apply, revert: revert2 }) => {
    let start = null;
    input.addEventListener("focus", () => {
      start = input.value;
      revert2?.snapshot?.();
    });
    input.__tsayruKey = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const delta = (e.key === "ArrowUp" ? 1 : -1) * stepFor(prop, e);
        const next = nudge(input.value, delta, fallback(), prop);
        if (next == null) return false;
        e.preventDefault();
        input.value = display(next);
        apply();
        return true;
      }
      if (e.key === "Escape" && start != null && input.value !== start) {
        e.preventDefault();
        input.value = start;
        if (revert2) revert2.run();
        else apply();
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        return true;
      }
      return false;
    };
  };
  var propInput = (api, prop, { read = prop, cls = "", title, display = trimPx } = {}) => {
    const input = el("input", { class: `in ${cls}`.trim(), spellcheck: "false", title: title || prop });
    const apply = () => {
      const ok = api.setInline(prop, withUnit(prop, input.value));
      input.classList.toggle("bad", !ok);
    };
    let wasChanged = false;
    input.addEventListener("input", apply);
    bindKeys(input, {
      prop,
      display,
      fallback: () => api.computed().getPropertyValue(read),
      apply,
      revert: {
        snapshot: () => {
          wasChanged = api.inlineChanged(prop);
        },
        run: () => {
          if (wasChanged) apply();
          else api.resetInline(prop);
          input.classList.remove("bad");
        }
      }
    });
    const sync = (cs) => {
      if (api.focused() === input) return;
      const own = api.inlineChanged(prop);
      input.value = display(own ? api.target.style.getPropertyValue(prop) : cs.getPropertyValue(read).trim());
      input.classList.toggle("changed", own);
      input.classList.remove("bad");
    };
    return { node: input, sync };
  };
  var selectInput = (api, prop, options, { read = prop } = {}) => {
    const select = el("select", { class: "in", title: prop });
    select.addEventListener("change", () => api.setInline(prop, select.value));
    const sync = (cs) => {
      if (api.focused() === select) return;
      const v = cs.getPropertyValue(read).trim();
      const all = options.includes(v) ? options : [v, ...options];
      if (select.options.length !== all.length || [...select.options].some((o, i) => o.value !== all[i])) {
        select.replaceChildren(...all.map((o) => el("option", { value: o }, o)));
      }
      select.value = v;
      select.classList.toggle("changed", api.inlineChanged(prop));
    };
    return { node: select, sync };
  };
  var colorControl = ({ read, write, changed: changed2 = () => false, typed = () => null, focused }) => {
    const fill = el("span", { class: "sw-fill" });
    const picker = el("input", { type: "color", tabindex: "-1", title: "Pick a colour" });
    const text = el("input", { class: "in", spellcheck: "false", title: "Any CSS colour: #hex, rgb(), var(--token)\u2026" });
    const alpha = el("input", { class: "in", spellcheck: "false", title: "Opacity, %" });
    const node = el(
      "div",
      { class: "color" },
      el("span", { class: "sw" }, fill, picker),
      text,
      el("span", { class: "alpha" }, alpha)
    );
    const current = () => colorOf(read()) || { r: 0, g: 0, b: 0, a: 1 };
    const alphaNow = () => {
      const n = parseFloat(alpha.value);
      return Number.isNaN(n) ? current().a : clamp2(n / 100, 0, 1);
    };
    const alphaForNew = () => {
      const a = alphaNow();
      if (a > 0) return a;
      alpha.value = "100";
      return 1;
    };
    const put = (value) => {
      const ok = write(value);
      text.classList.toggle("bad", !ok);
      if (ok) fill.style.background = value;
      return ok;
    };
    picker.addEventListener("input", () => {
      const c = parseColor(picker.value);
      if (!c) return;
      text.value = picker.value;
      put(formatColor({ ...c, a: alphaForNew() }));
    });
    const applyText = () => {
      const v = text.value.trim();
      if (!v) return;
      const c = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? parseColor(v) : null;
      put(c ? formatColor({ ...c, a: alphaForNew() }) : v);
    };
    text.addEventListener("input", applyText);
    const applyAlpha = () => {
      const n = parseFloat(alpha.value);
      if (Number.isNaN(n)) return;
      put(formatColor({ ...current(), a: clamp2(n / 100, 0, 1) }));
    };
    alpha.addEventListener("input", applyAlpha);
    bindKeys(alpha, { prop: "alpha", fallback: () => "100", display: (v) => String(clamp2(parseFloat(v), 0, 100)), apply: applyAlpha });
    bindKeys(text, { prop: "color", apply: applyText });
    const sync = () => {
      const v = String(read() || "").trim();
      const c = colorOf(v);
      fill.style.background = v;
      picker.value = c ? toHex(c) : "#000000";
      const own = typed();
      if (focused() !== text) text.value = own && !parseColor(own) ? own : c ? toHex(c) : v;
      if (focused() !== alpha) alpha.value = c ? String(Math.round(c.a * 100)) : "";
      text.classList.toggle("changed", changed2());
      alpha.classList.toggle("changed", changed2());
      text.classList.remove("bad");
    };
    return { node, sync };
  };
  var colorInput = (api, prop, { read = prop } = {}) => {
    const ctl = colorControl({
      read: () => api.computed().getPropertyValue(read),
      write: (value) => api.setInline(prop, value),
      changed: () => api.inlineChanged(prop),
      typed: () => api.inlineChanged(prop) ? api.target.style.getPropertyValue(prop) : null,
      focused: () => api.focused()
    });
    return { node: ctl.node, sync: () => ctl.sync() };
  };
  var pair = (...nodes) => el("div", { class: "pair" }, ...nodes);
  var section = (title, ...children) => el(
    "div",
    { class: "sec" },
    el("div", { class: "sec-hd" }, typeof title === "string" ? title : title[0], typeof title === "string" ? null : title[1]),
    ...children
  );

  // src/stylequick.js
  var WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
  var ALIGNS = ["start", "left", "center", "right", "justify", "end"];
  var BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"];
  var shadowSection = (api, syncers) => {
    let layers = [];
    let shown = null;
    const list = el("div", { class: "layers" });
    const write = () => api.setInline("box-shadow", formatShadows(layers));
    const lengthBox = (layer, key, label) => {
      const input = el("input", { class: "in", spellcheck: "false", value: trimPx(layer[key]), title: `${label}, px` });
      const apply = () => {
        layer[key] = withUnit(key, input.value) || "0px";
        write();
      };
      input.addEventListener("input", apply);
      bindKeys(input, { prop: key, fallback: () => layer[key], apply });
      return el("label", { class: "mini" }, el("span", {}, label), input);
    };
    const layerRow = (layer, i) => {
      const color = colorControl({
        read: () => layer.color,
        write: (value) => {
          if (!CSS.supports("color", value)) return false;
          layer.color = value;
          write();
          return true;
        },
        focused: () => api.focused()
      });
      color.sync();
      const inset = el("input", { type: "checkbox" });
      inset.checked = layer.inset;
      inset.addEventListener("change", () => {
        layer.inset = inset.checked;
        write();
      });
      const remove = () => {
        layers.splice(i, 1);
        write();
        render();
      };
      return el(
        "div",
        { class: "layer" },
        el(
          "div",
          { class: "quad" },
          lengthBox(layer, "x", "X"),
          lengthBox(layer, "y", "Y"),
          lengthBox(layer, "blur", "Blur"),
          lengthBox(layer, "spread", "Spread")
        ),
        el(
          "div",
          { class: "layer-ft" },
          color.node,
          el("label", { class: "check" }, inset, "inset"),
          el("button", { class: "ic small", title: "Remove this layer", onClick: remove }, "\xD7")
        )
      );
    };
    const render = () => {
      shown = api.computed().getPropertyValue("box-shadow");
      layers = parseShadows(shown);
      list.replaceChildren(...layers.map(layerRow));
    };
    const presets = el(
      "div",
      { class: "presets" },
      ...SHADOW_PRESETS.map(
        ([label, value]) => el(
          "button",
          {
            class: "pill",
            title: value,
            onClick: () => {
              api.setInline("box-shadow", value);
              render();
            }
          },
          label
        )
      )
    );
    const add = el(
      "button",
      {
        class: "link",
        onClick: () => {
          layers.push({ inset: false, x: "0px", y: "4px", blur: "12px", spread: "0px", color: "rgb(0 0 0 / 0.12)" });
          write();
          render();
        }
      },
      "+ Layer"
    );
    syncers.push(() => {
      const active = api.focused();
      if (active && list.contains(active)) return;
      if (api.computed().getPropertyValue("box-shadow") !== shown) render();
    });
    render();
    return section(["Shadow", presets], list, add);
  };
  var boxModel = (api, bind) => {
    const side = (prop, area) => {
      const node = bind(propInput(api, prop, { cls: "box-in", title: prop }));
      node.classList.add(area);
      return node;
    };
    const whole = (v) => /^-?\d*\.?\d+px$/.test(v) ? String(Math.round(parseFloat(v))) : v;
    const size = (prop) => bind(propInput(api, prop, { cls: "box-in wide", title: prop, display: whole }));
    const content = el("div", { class: "content c" }, size("width"), el("span", { class: "times" }, "\xD7"), size("height"));
    const padding = el(
      "div",
      { class: "box pad c" },
      el("span", { class: "box-tag" }, "padding"),
      side("padding-top", "t"),
      side("padding-left", "l"),
      content,
      side("padding-right", "r"),
      side("padding-bottom", "b")
    );
    return el(
      "div",
      { class: "box" },
      el("span", { class: "box-tag" }, "margin"),
      side("margin-top", "t"),
      side("margin-left", "l"),
      padding,
      side("margin-right", "r"),
      side("margin-bottom", "b")
    );
  };
  var quickTab = (api) => {
    const syncers = [];
    const bind = (widget) => {
      syncers.push(widget.sync);
      return widget.node;
    };
    const field = (label, props, node2) => {
      const lbl = el("span", { class: "lbl", title: label }, label);
      lbl.addEventListener("click", () => {
        for (const p of props) if (api.inlineChanged(p)) api.resetInline(p);
      });
      syncers.push(() => {
        const changed2 = props.some((p) => api.inlineChanged(p));
        lbl.classList.toggle("changed", changed2);
        lbl.title = changed2 ? `${label} \u2014 click to reset` : label;
      });
      return el("div", { class: "row" }, lbl, node2);
    };
    const cs = api.computed();
    const hasImage = cs.backgroundImage && cs.backgroundImage !== "none";
    const layout = /flex|grid/.test(cs.display);
    const node = el(
      "div",
      { class: "quick" },
      section(
        "Fill",
        field("Text", ["color"], bind(colorInput(api, "color"))),
        field("Background", ["background-color"], bind(colorInput(api, "background-color"))),
        hasImage ? field("Image", ["background-image"], bind(propInput(api, "background-image", { display: (v) => v }))) : null,
        field("Opacity", ["opacity"], bind(propInput(api, "opacity")))
      ),
      section(
        "Border",
        field("Color", ["border-color"], bind(colorInput(api, "border-color", { read: "border-top-color" }))),
        field(
          "Width \xB7 style",
          ["border-width", "border-style"],
          pair(
            bind(propInput(api, "border-width", { read: "border-top-width" })),
            bind(selectInput(api, "border-style", BORDER_STYLES, { read: "border-top-style" }))
          )
        ),
        field("Radius", ["border-radius"], bind(propInput(api, "border-radius")))
      ),
      shadowSection(api, syncers),
      section(
        "Spacing",
        boxModel(api, bind),
        layout ? field("Gap", ["gap"], bind(propInput(api, "gap"))) : null
      ),
      section(
        "Text",
        field(
          "Size \xB7 weight",
          ["font-size", "font-weight"],
          pair(bind(propInput(api, "font-size")), bind(selectInput(api, "font-weight", WEIGHTS)))
        ),
        field(
          "Line \xB7 letter",
          ["line-height", "letter-spacing"],
          pair(bind(propInput(api, "line-height")), bind(propInput(api, "letter-spacing")))
        ),
        field("Align", ["text-align"], bind(selectInput(api, "text-align", ALIGNS))),
        field("Font", ["font-family"], bind(propInput(api, "font-family", { display: (v) => v })))
      )
    );
    const refresh = () => {
      const now = api.computed();
      for (const sync of syncers) sync(now);
    };
    refresh();
    return { node, refresh };
  };

  // src/stylerules.js
  var LABELS = {
    default: "Default",
    ":hover": "Hover",
    ":focus": "Focus",
    ":focus-visible": "Focus-visible",
    ":active": "Active",
    "::before": "Before",
    "::after": "After"
  };
  var lastState = "default";
  var splitImportant = (text) => {
    const s = String(text ?? "").trim();
    const important = /!\s*important\s*$/i.test(s);
    return { value: important ? s.replace(/!\s*important\s*$/i, "").trim() : s, important };
  };
  var isGlobal = (e) => /(^|[\s>+~(])\*$/.test(classifySelector(e.selector).base);
  var normName = (text) => {
    const n = String(text ?? "").trim();
    return n.startsWith("--") ? n : n.toLowerCase();
  };
  var ruleAdapter = (api, entry) => ({
    key: entry.rule,
    entry,
    created: api.isCreated(entry.rule),
    canToggle: true,
    decls: () => parseDeclarations(entry.rule.style.cssText).map((d) => ({
      ...d,
      important: api.shownImportant(entry.rule, d)
    })),
    off: () => api.disabledProps(entry.rule),
    set: (name, value, important) => api.setRuleProp(entry, name, value, important),
    remove: (name) => api.removeRuleProp(entry, name),
    disable: (name) => api.disableRuleProp(entry, name),
    enable: (name) => api.enableRuleProp(entry, name),
    changed: (name) => api.isCreated(entry.rule) || api.ruleChanged(entry.rule, name)
  });
  var inlineAdapter = (api) => ({
    key: "inline",
    inline: true,
    canToggle: false,
    // Previews are always !important; showing it would only be noise.
    decls: () => api.inlineDecls().map((d) => ({ ...d, important: false })),
    off: () => /* @__PURE__ */ new Map(),
    set: (name, value) => api.setInline(name, value),
    remove: (name) => api.removeInline(name),
    changed: (name) => api.inlineChanged(name)
  });
  var winnersOf = (entries, inline) => {
    const win = /* @__PURE__ */ new Map();
    const consider = (key, d) => {
      const prev = win.get(d.name);
      if (!prev || d.important && !prev.important) win.set(d.name, { key, important: d.important });
    };
    for (const d of inline) consider("inline", d);
    for (const e of entries) {
      if (!e.active || e.also.length) continue;
      for (const d of parseDeclarations(e.rule.style.cssText)) consider(e.rule, d);
    }
    return win;
  };
  var swatchFor = (value, onPick) => {
    if (/var\(/i.test(value)) return null;
    const c = colorOf(value);
    if (!c) return null;
    const fill = el("span", { class: "sw-fill" });
    fill.style.background = value;
    const picker = el("input", { type: "color", tabindex: "-1", title: "Pick a colour" });
    picker.value = toHex(c);
    picker.addEventListener("input", () => {
      const next = parseColor(picker.value);
      if (next) onPick(formatColor({ ...next, a: c.a }));
    });
    return el("span", { class: "sw small" }, fill, picker);
  };
  var cardHead = (api, ad) => {
    if (ad.inline) {
      return el(
        "div",
        { class: "card-hd" },
        el("div", { class: "sel" }, "element.style"),
        el("div", { class: "meta" }, "this element only \u2014 Quick edits land here")
      );
    }
    const e = ad.entry;
    const more = splitSelectorList(e.ruleSelector).length - 1;
    const count = ad.created ? 1 : api.matchCount(classifySelector(e.selector).base);
    const where2 = [
      ad.created ? "new rule \u2014 only this element" : e.sheet,
      ...e.conditions,
      e.layer ? `@layer ${e.layer}` : null,
      e.also.length ? `when ${e.also.join(" ")}` : null
    ].filter(Boolean);
    return el(
      "div",
      { class: "card-hd" },
      el(
        "div",
        { class: "sel", title: e.ruleSelector },
        e.selector,
        more > 0 ? el("span", { class: "more" }, ` +${more} more`) : null
      ),
      el(
        "div",
        { class: "meta" },
        where2.join(" \xB7 "),
        count > 1 ? el("b", { title: "Editing this rule restyles every one of them" }, ` \xB7 ${count} elements`) : null,
        e.active ? null : el("b", {}, " \xB7 not active now")
      )
    );
  };
  var rulesTab = (api) => {
    let st = lastState;
    let showGlobal = false;
    const chips = el("div", { class: "chips" });
    const status = el("div", { class: "status", hidden: true });
    const list = el("div", { class: "rules" });
    let cards = /* @__PURE__ */ new Map();
    const declRow = (ad, d, { overridden, off }) => {
      const name = d.name;
      const shown = `${d.value}${d.important ? " !important" : ""}`;
      const chk = ad.canToggle ? el("input", { type: "checkbox", class: "chk", title: off ? "Turn back on" : "Turn off" }) : el("span");
      if (ad.canToggle) chk.checked = !off;
      const nameIn = el("input", { class: "in dn", spellcheck: "false", value: name, list: "tsayru-props", title: name });
      const valueIn = el("input", { class: "in dv", spellcheck: "false", value: shown, title: shown });
      const swSlot = el("span", { class: "sw-slot" });
      const vwrap = el("div", { class: "vwrap" }, swSlot, valueIn);
      const del = el("button", { class: "x", title: "Delete" }, "\xD7");
      const row = el(
        "div",
        { class: `decl${off ? " off" : ""}${overridden ? " over" : ""}` },
        chk,
        nameIn,
        vwrap,
        del
      );
      const mark = () => row.classList.toggle("changed", !off && ad.changed(name));
      const apply = () => {
        const { value, important } = splitImportant(valueIn.value);
        if (!value) return;
        const ok = ad.set(name, value, important);
        valueIn.classList.toggle("bad", !ok);
        mark();
        drawSwatch();
      };
      const drawSwatch = () => {
        const sw = off ? null : swatchFor(splitImportant(valueIn.value).value, (picked) => {
          const { important } = splitImportant(valueIn.value);
          valueIn.value = `${picked}${important ? " !important" : ""}`;
          apply();
        });
        swSlot.replaceChildren(...sw ? [sw] : []);
      };
      drawSwatch();
      mark();
      if (off) {
        nameIn.readOnly = true;
        valueIn.readOnly = true;
      } else {
        valueIn.addEventListener("input", apply);
        valueIn.addEventListener("change", () => {
          if (valueIn.value.trim()) return;
          ad.remove(name);
          render();
        });
        bindKeys(valueIn, { prop: name, display: (v) => v, apply, revert: { run: apply } });
        nameIn.addEventListener("change", () => {
          const next = normName(nameIn.value);
          if (next === name) return;
          const { value, important } = splitImportant(valueIn.value);
          ad.remove(name);
          if (next && value) ad.set(next, value, important);
          render();
        });
        nameIn.__tsayruKey = (e) => {
          if (e.key === "Enter" || e.key === ":") {
            e.preventDefault();
            valueIn.focus();
            valueIn.select();
            return true;
          }
          if (e.key === "Escape" && nameIn.value !== name) {
            e.preventDefault();
            nameIn.value = name;
            return true;
          }
          return false;
        };
      }
      if (ad.canToggle) {
        chk.addEventListener("change", () => {
          if (chk.checked) ad.enable(name);
          else ad.disable(name);
          render();
        });
      }
      del.addEventListener("click", () => {
        ad.remove(name);
        render();
      });
      return row;
    };
    const addRow = (ad) => {
      const nameIn = el("input", { class: "in dn", placeholder: "+ property", spellcheck: "false", list: "tsayru-props" });
      const valueIn = el("input", { class: "in dv", placeholder: "value", spellcheck: "false" });
      let done = false;
      const commit = () => {
        const name = normName(nameIn.value);
        const { value, important } = splitImportant(valueIn.value);
        if (done || !name || !value) return;
        if (!ad.set(name, value, important)) {
          valueIn.classList.add("bad");
          return;
        }
        done = true;
        render({ focusAdd: ad.key });
      };
      nameIn.addEventListener("input", () => {
        const i = nameIn.value.indexOf(":");
        if (i < 1) return;
        valueIn.value = nameIn.value.slice(i + 1).replace(/;\s*$/, "").trim();
        nameIn.value = nameIn.value.slice(0, i).trim();
        valueIn.focus();
      });
      nameIn.__tsayruKey = (e) => {
        if ((e.key === "Enter" || e.key === ":") && nameIn.value.trim()) {
          e.preventDefault();
          valueIn.focus();
          return true;
        }
        return false;
      };
      valueIn.addEventListener("input", () => valueIn.classList.remove("bad"));
      valueIn.addEventListener("change", commit);
      valueIn.__tsayruKey = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          return true;
        }
        if (e.key === "Escape" && (nameIn.value || valueIn.value)) {
          e.preventDefault();
          nameIn.value = "";
          valueIn.value = "";
          nameIn.focus();
          return true;
        }
        return false;
      };
      return el("div", { class: "decl add" }, el("span"), nameIn, el("div", { class: "vwrap" }, valueIn), el("span"));
    };
    const card = (ad, winners, entry) => {
      const rows = ad.decls().map((d) => {
        const w = winners.get(d.name);
        return declRow(ad, d, { overridden: !!w && w.key !== ad.key });
      });
      for (const [name, v] of ad.off()) {
        rows.push(declRow(ad, { name, value: v.value, important: v.priority === "important" }, { off: true }));
      }
      rows.push(addRow(ad));
      const classes = [
        "card",
        ad.inline ? "inline" : "",
        ad.created ? "created" : "",
        entry && !entry.active ? "inactive" : ""
      ].filter(Boolean);
      const node = el("div", { class: classes.join(" ") }, cardHead(api, ad), el("div", { class: "decls" }, ...rows));
      cards.set(ad.key, node);
      return node;
    };
    const select = (next) => {
      st = lastState = next;
      api.force(FORCEABLE.includes(next) ? next : null);
      render();
    };
    const render = ({ focusAdd } = {}) => {
      const { groups, skipped } = api.rules();
      const inline = api.inlineDecls();
      chips.replaceChildren(
        ...STATES.map((s) => {
          const own2 = groups[s].filter((e) => !isGlobal(e) || api.isCreated(e.rule));
          const n = own2.length + (s === "default" && inline.length ? 1 : 0);
          return el(
            "button",
            {
              class: `chip${s === st ? " on" : ""}${n ? "" : " empty"}`,
              title: FORCEABLE.includes(s) ? `${s} rules \u2014 the page shows the element ${s} while this is picked` : s === "default" ? "Rules that apply now" : `${s} rules`,
              onClick: () => select(s)
            },
            LABELS[s],
            el("span", { class: "n" }, String(n))
          );
        }),
        el(
          "button",
          {
            class: "ic small refresh",
            title: "Re-read the page's stylesheets",
            onClick: () => {
              api.rules(true);
              render();
            }
          },
          "\u21BB"
        )
      );
      status.hidden = !api.forced();
      status.textContent = api.forced() ? `The page shows this element ${api.forced()} while this tab is open.` : "";
      const entries = groups[st] || [];
      const created = entries.filter((e) => api.isCreated(e.rule));
      const rest = entries.filter((e) => !api.isCreated(e.rule));
      const own = rest.filter((e) => !isGlobal(e));
      const global = rest.filter(isGlobal);
      const winners = winnersOf([...created, ...rest], st === "default" ? inline : []);
      cards = /* @__PURE__ */ new Map();
      const nodes = [];
      if (st.startsWith("::") && /^(none|normal)?$/.test(api.pseudoContent(st) || "")) {
        nodes.push(el("div", { class: "muted" }, `No ${st} box is drawn right now (its content is none).`));
      }
      if (st === "default") nodes.push(card(inlineAdapter(api), winners));
      for (const e of [...created, ...own.filter((x) => x.active), ...own.filter((x) => !x.active)]) {
        nodes.push(card(ruleAdapter(api, e), winners, e));
      }
      if (!created.length && !own.length && st !== "default") {
        nodes.push(el("div", { class: "muted" }, `No rule of its own styles this element ${st} yet.`));
      }
      if (global.length) {
        nodes.push(
          el(
            "button",
            {
              class: "link fold",
              title: "Rules whose subject is * \u2014 resets that style every element",
              onClick: () => {
                showGlobal = !showGlobal;
                render();
              }
            },
            `${showGlobal ? "\u25BE" : "\u25B8"} ${global.length} global rule${global.length === 1 ? "" : "s"} (*)`
          )
        );
        if (showGlobal) for (const e of global) nodes.push(card(ruleAdapter(api, e), winners, e));
      }
      nodes.push(
        el(
          "button",
          {
            class: "link",
            onClick: () => {
              const rule = api.addRule(st);
              if (rule) render({ focusAdd: rule });
            }
          },
          `+ New ${st === "default" ? "" : `${st} `}rule for this element`
        )
      );
      if (skipped) {
        nodes.push(
          el("div", { class: "muted" }, `${skipped} stylesheet${skipped === 1 ? "" : "s"} from another origin can't be read.`)
        );
      }
      list.replaceChildren(...nodes);
      if (focusAdd) cards.get(focusAdd)?.querySelector(".add .dn")?.focus();
    };
    if (FORCEABLE.includes(st)) api.force(st);
    render();
    return { node: el("div", { class: "css" }, chips, status, list), refresh: () => {
    } };
  };

  // src/stylepanel.js
  var lastTab = "quick";
  var SHORTHANDS2 = [
    "animation",
    "background",
    "border",
    "border-bottom",
    "border-color",
    "border-left",
    "border-radius",
    "border-right",
    "border-style",
    "border-top",
    "border-width",
    "flex",
    "flex-flow",
    "font",
    "gap",
    "grid",
    "grid-area",
    "grid-template",
    "inset",
    "margin",
    "margin-block",
    "margin-inline",
    "outline",
    "overflow",
    "padding",
    "padding-block",
    "padding-inline",
    "place-items",
    "text-decoration",
    "transition"
  ];
  var propertyNames = () => {
    let longhands = [];
    try {
      longhands = Array.from(getComputedStyle(document.documentElement));
    } catch {
    }
    return [.../* @__PURE__ */ new Set([...SHORTHANDS2, ...longhands])].filter((n) => !n.startsWith("-webkit-")).sort();
  };
  var mountPanel = (api) => {
    const target = api.target;
    let tab = null;
    let current = null;
    const sub = el("div", { class: "hd-sub" });
    const updateSub = () => {
      const fw = api.framework();
      const r = target.getBoundingClientRect();
      const parts = [
        fw?.componentName ? `<${fw.componentName}>` : null,
        fw?.source?.file ? `${fw.source.file.split("/").slice(-2).join("/")}${fw.source.line ? `:${fw.source.line}` : ""}` : null,
        `${Math.round(r.width)}\xD7${Math.round(r.height)}`
      ].filter(Boolean);
      sub.textContent = parts.join(" \xB7 ");
      sub.title = [api.label, ...parts].join("\n");
    };
    const close = el("button", { class: "ic", title: "Close and save as a task (Esc)", onClick: () => api.close() }, "\xD7");
    const header = el(
      "div",
      { class: "hd" },
      el("div", { class: "hd-main" }, el("div", { class: "hd-title", title: api.selector }, describeNode(target, 3)), sub),
      close
    );
    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const panelNode = header.parentElement;
      const start = { x: e.clientX, y: e.clientY, left: panelNode.offsetLeft, top: panelNode.offsetTop };
      header.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const pos = api.moved({ left: start.left + ev.clientX - start.x, top: start.top + ev.clientY - start.y });
        panelNode.style.left = `${pos.left}px`;
        panelNode.style.top = `${pos.top}px`;
      };
      const up = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", up);
        header.removeEventListener("pointercancel", up);
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", up);
      header.addEventListener("pointercancel", up);
    });
    const chain = [];
    for (let n = target, i = 0; n && n.nodeType === 1 && i < 5; n = n.parentElement, i++) chain.unshift(n);
    const down = [];
    for (let n = api.deep; n && n !== target; n = n.parentElement) down.unshift(n);
    chain.push(...down);
    const crumbs = el("div", { class: "crumbs" });
    chain.forEach((n, i) => {
      if (i) crumbs.append(el("span", { class: "sep" }, "\u203A"));
      const cur = n === target;
      crumbs.append(
        el(
          "button",
          {
            class: `crumb${cur ? " cur" : ""}`,
            title: cur ? api.selector : "Edit this element instead",
            onClick: () => !cur && api.select(n),
            onMouseenter: () => !cur && api.preview(n),
            onMouseleave: () => api.preview(null)
          },
          describeNode(n, 1)
        )
      );
    });
    const notice = el("div", { class: "warn", hidden: true }, "The element left the page (re-rendered?) \u2014 \u2318+click it again.");
    const count = el("span", { class: "count" });
    const tabs = {
      quick: el("button", { class: "tab", onClick: () => show("quick") }, "Quick"),
      css: el("button", { class: "tab", title: "Every rule that styles this element, by state", onClick: () => show("css") }, "CSS")
    };
    const body = el("div", { class: "body" });
    const note = el("input", { class: "in note", placeholder: "Note for Claude (optional)" });
    note.addEventListener("input", () => api.setNote(note.value));
    note.__tsayruKey = (e) => {
      if (e.key !== "Enter") return false;
      e.preventDefault();
      api.close();
      return true;
    };
    const done = el("button", { class: "btn primary", title: "Save as a task and close (Esc)", onClick: () => api.close() }, "Save task");
    const revert2 = el(
      "button",
      { class: "btn", title: "Undo this panel's edits", onClick: () => {
        api.revert();
        show(tab, true);
      } },
      "Revert"
    );
    const updateCount = () => {
      const n = api.changeCount();
      count.textContent = n ? `${n} change${n === 1 ? "" : "s"}` : "no changes";
      count.classList.toggle("has", n > 0);
      revert2.disabled = n === 0;
      done.textContent = n ? "Save task" : "Close";
    };
    const show = (name, force2 = false) => {
      if (name === tab && !force2) return;
      tab = lastTab = name;
      tabs.quick.classList.toggle("on", name === "quick");
      tabs.css.classList.toggle("on", name === "css");
      if (name === "quick") api.force(null);
      const scroll = body.scrollTop;
      current = name === "quick" ? quickTab(api) : rulesTab(api);
      body.replaceChildren(current.node);
      if (force2) body.scrollTop = scroll;
      updateCount();
    };
    const panel = el(
      "div",
      { class: "panel" },
      header,
      crumbs,
      notice,
      el("div", { class: "tabs" }, tabs.quick, tabs.css, count),
      body,
      el("div", { class: "ft" }, note, revert2, done),
      el("datalist", { id: "tsayru-props" }, ...propertyNames().map((n) => el("option", { value: n })))
    );
    api.onChange = () => {
      updateCount();
      updateSub();
      current?.refresh?.();
    };
    api.onFramework = updateSub;
    api.onDetached = () => {
      notice.hidden = false;
    };
    updateSub();
    show(lastTab);
    return panel;
  };

  // src/stylepanel-css.js
  var PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.panel {
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  position: absolute;
  pointer-events: auto;
  width: 340px;
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  overflow: hidden;
  text-align: left;
}
button { font: inherit; color: inherit; }

/* header */
.hd { display: flex; align-items: center; gap: 4px; padding: 9px 6px 4px 12px; cursor: grab; user-select: none; }
.hd:active { cursor: grabbing; }
.hd-main { flex: 1; min-width: 0; }
.hd-title { font: 600 12px/1.35 var(--mono); color: #c7d2fe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-sub { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic { appearance: none; border: 0; background: transparent; color: #94a3b8; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 26px; padding: 0; flex: none; }
.ic:hover { background: rgba(255, 255, 255, 0.07); color: #e2e8f0; }
.ic.small { width: 20px; height: 20px; line-height: 20px; font-size: 13px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 1px 3px; padding: 0 12px 7px; font: 10.5px/1.4 var(--mono); color: #475569; }
.crumb { appearance: none; border: 0; background: none; padding: 0; color: #64748b; cursor: pointer; font: inherit; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb:hover { color: #fbbf24; }
.crumb.cur { color: #c7d2fe; cursor: default; }
.warn { margin: 0 12px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(251, 191, 36, 0.12); color: #fbbf24; font-size: 11px; }

/* tabs */
.tabs { display: flex; align-items: center; gap: 2px; padding: 0 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
.tab { appearance: none; border: 0; background: none; color: #94a3b8; font-weight: 600; padding: 7px 8px 8px; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; }
.tab:hover { color: #e2e8f0; }
.tab.on { color: #e2e8f0; border-bottom-color: #6366f1; }
.count { margin-left: auto; padding-right: 4px; font-size: 11px; color: #64748b; }
.count.has { color: #a5b4fc; }

.body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 2px 12px 10px; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: #334155; border-radius: 8px; border: 2px solid #0f172a; }

/* footer */
.ft { display: flex; gap: 6px; align-items: center; padding: 8px; border-top: 1px solid rgba(255, 255, 255, 0.07); }
.ft .note { flex: 1; min-width: 0; font-family: inherit; }
.btn { appearance: none; border: 0; border-radius: 6px; padding: 6px 10px; font-weight: 600; cursor: pointer; background: #1e293b; color: #e2e8f0; white-space: nowrap; }
.btn:hover:not(:disabled) { background: #273449; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: #6366f1; color: #fff; }
.btn.primary:hover { background: #4f46e5; }

/* inputs */
.in { width: 100%; min-width: 0; height: 24px; background: #1e293b; color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; padding: 0 6px; font: 11.5px/22px var(--mono); outline: none; }
.in::placeholder { color: #475569; }
.in:focus { border-color: #6366f1; background: #111a30; }
.in.changed { color: #a5b4fc; }
.in.bad, .in.bad:focus { border-color: #f87171; }
select.in { padding: 0 2px; cursor: pointer; }

/* quick tab */
.sec { padding: 9px 0 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sec:last-child { border-bottom: 0; }
.sec-hd { display: flex; align-items: center; justify-content: space-between; min-height: 18px; margin-bottom: 5px; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #64748b; }
.row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 6px; margin: 4px 0; }
.lbl { color: #94a3b8; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.lbl.changed { color: #a5b4fc; cursor: pointer; }
.lbl.changed::after { content: " \u21BA"; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.color { display: grid; grid-template-columns: 24px minmax(0, 1fr) 52px; gap: 6px; align-items: center; }
.alpha { position: relative; display: block; }
.alpha::after { content: "%"; position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: #64748b; pointer-events: none; font-size: 11px; }
.alpha .in { padding-right: 16px; }
.sw { position: relative; display: block; width: 24px; height: 24px; border-radius: 5px; overflow: hidden; background: repeating-conic-gradient(#94a3b8 0 25%, #e2e8f0 0 50%) 0 0 / 8px 8px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); cursor: pointer; }
.sw.small { width: 14px; height: 14px; border-radius: 3px; flex: none; }
.sw-fill { position: absolute; inset: 0; }
.sw input { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); opacity: 0; cursor: pointer; border: 0; padding: 0; }
.presets { display: flex; gap: 3px; }
.pill { appearance: none; border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: #94a3b8; border-radius: 999px; padding: 1px 7px; font-size: 10.5px; font-weight: 600; letter-spacing: 0; text-transform: none; cursor: pointer; }
.pill:hover { color: #e2e8f0; border-color: rgba(255, 255, 255, 0.3); }
.layer { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 7px; padding: 6px; margin: 5px 0; }
.quad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.mini { display: flex; flex-direction: column; gap: 2px; }
.mini span { font-size: 10px; color: #64748b; }
.layer-ft { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; margin-top: 6px; }
.check { display: inline-flex; align-items: center; gap: 4px; color: #94a3b8; font-size: 11px; cursor: pointer; user-select: none; }
.check input, .chk { margin: 0; accent-color: #6366f1; cursor: pointer; }
.link { appearance: none; border: 0; background: none; color: #a5b4fc; font-weight: 600; font-size: 11.5px; padding: 4px 0; cursor: pointer; }
.link:hover { color: #c7d2fe; text-decoration: underline; }

/* box model */
.box { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr) 46px; grid-template-rows: auto auto auto; gap: 4px; align-items: center; justify-items: center; padding: 18px 5px 5px; border: 1px dashed rgba(251, 191, 36, 0.45); border-radius: 7px; background: rgba(251, 191, 36, 0.05); }
.box.pad { width: 100%; border-color: rgba(52, 211, 153, 0.5); background: rgba(52, 211, 153, 0.06); }
.box-tag { position: absolute; top: 3px; left: 7px; font-size: 9px; letter-spacing: 0.07em; text-transform: uppercase; color: #64748b; }
.box > .t { grid-area: 1 / 2; }
.box > .l { grid-area: 2 / 1; }
.box > .c { grid-area: 2 / 2; }
.box > .r { grid-area: 2 / 3; }
.box > .b { grid-area: 3 / 2; }
.box-in { width: 46px; text-align: center; padding: 0 2px; }
.content { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; padding: 6px 4px; border: 1px solid rgba(96, 165, 250, 0.45); border-radius: 4px; background: rgba(96, 165, 250, 0.08); color: #64748b; }
.box-in.wide { width: 64px; }

/* css tab */
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 9px 0 8px; }
.chip { appearance: none; border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: #cbd5e1; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
.chip:hover { border-color: rgba(255, 255, 255, 0.3); }
.chip.empty { color: #64748b; }
.chip.on { background: #6366f1; border-color: #6366f1; color: #fff; }
.chip .n { margin-left: 4px; font-weight: 500; opacity: 0.65; }
.refresh { margin-left: auto; }
.status { margin: -2px 0 8px; font-size: 11px; color: #fbbf24; }
.card { border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 7px; margin-bottom: 8px; overflow: hidden; }
.card.created { border-color: rgba(99, 102, 241, 0.55); }
.card.inactive { opacity: 0.55; }
.card-hd { padding: 6px 8px 5px; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.sel { font: 600 11.5px/1.35 var(--mono); color: #c7d2fe; word-break: break-word; }
.card.inline .sel { color: #94a3b8; }
.more { font-weight: 400; color: #64748b; }
.meta { margin-top: 2px; font-size: 10.5px; color: #64748b; word-break: break-word; }
.meta b { font-weight: 600; color: #fbbf24; }
.decls { padding: 3px 4px 4px; }
.decl { position: relative; display: grid; grid-template-columns: 14px auto minmax(0, 1fr) 18px; gap: 3px; align-items: center; margin: 1px 0; }
.decl .dn { width: 112px; }
@supports (field-sizing: content) {
  .decl .dn { width: auto; field-sizing: content; min-width: 44px; max-width: 176px; }
}
.decl .in { height: 21px; line-height: 19px; padding: 0 4px; background: transparent; border-color: transparent; }
.decl .in:hover { border-color: rgba(255, 255, 255, 0.1); }
.decl .in:focus { background: #111a30; border-color: #6366f1; }
.decl .dn { color: #7dd3fc; }
.decl.changed::before { content: ""; position: absolute; left: -4px; top: 4px; bottom: 4px; width: 2px; border-radius: 2px; background: #6366f1; }
.decl.over .in { text-decoration: line-through; color: #64748b; }
.decl.off .in { text-decoration: line-through; color: #475569; }
.decl.add .dn { color: #94a3b8; }
.vwrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sw-slot:empty { display: none; }
.x { appearance: none; border: 0; background: none; color: #64748b; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; visibility: hidden; }
.decl:hover .x { visibility: visible; }
.x:hover { color: #f87171; }
.muted { font-size: 11px; color: #64748b; margin: 4px 0 8px; }

/* the target's outline (a sibling of the panel, outside it) */
.outline { position: absolute; left: 0; top: 0; display: none; border: 1.5px dashed #818cf8; border-radius: 2px; pointer-events: none; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.3); }
.outline.preview { border-style: solid; border-color: #fbbf24; }
.outline-tag { position: absolute; left: -1.5px; bottom: 100%; margin-bottom: 3px; padding: 3px 5px; border-radius: 3px; background: #6366f1; color: #fff; font: 600 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace; white-space: nowrap; }
.outline.below .outline-tag { bottom: auto; top: 100%; margin: 3px 0 0; }
.outline.preview .outline-tag { background: #b45309; }
`;

  // src/styleeditor.js
  var INHERITED = /* @__PURE__ */ new Set([
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-align",
    "text-transform",
    "white-space"
  ]);
  var pageOriginals = { inline: /* @__PURE__ */ new WeakMap(), rules: /* @__PURE__ */ new WeakMap() };
  var createdRules = /* @__PURE__ */ new WeakMap();
  var createdSheets = /* @__PURE__ */ new WeakMap();
  var ruleIds = /* @__PURE__ */ new WeakMap();
  var nextRuleId = 1;
  var ruleId = (rule) => {
    if (!ruleIds.has(rule)) ruleIds.set(rule, nextRuleId++);
    return ruleIds.get(rule);
  };
  var session = null;
  var host = null;
  var lastPos = null;
  var queue = Promise.resolve();
  var supports = (prop, value) => {
    try {
      return String(prop).startsWith("--") || CSS.supports(prop, value);
    } catch {
      return true;
    }
  };
  var withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);
  var newSession = (target, deep) => {
    const root = target.getRootNode();
    return {
      target,
      deep: deep && target.contains(deep) ? deep : target,
      // the node actually clicked
      root: typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root : document,
      selector: buildSelector(target),
      label: shortLabel(target),
      framework: null,
      frameworkPromise: detectFramework(target).catch(() => null),
      ctx: {
        computedStyles: snapshotComputedStyles(target),
        html: snapshotHtml(target),
        env: snapshotEnv()
      },
      touched: /* @__PURE__ */ new Map(),
      // key → { kind: "inline" | "rule", prop, rule?, meta?, start }
      created: /* @__PURE__ */ new Set(),
      // created rules this session edited or made
      createdHere: /* @__PURE__ */ new Set(),
      // … of which made in this session
      createdStart: /* @__PURE__ */ new Map(),
      // created rule → Map(prop → value) at first touch
      disabled: /* @__PURE__ */ new Map(),
      // rule → Map(prop → { value, priority }) unticked in the panel
      rules: null,
      forced: null,
      unforce: null,
      note: "",
      onChange: null
    };
  };
  var changed = (s) => {
    try {
      s.onChange?.();
    } catch (err) {
      console.warn("[tsayru] style panel refresh failed:", err);
    }
  };
  var rulesOf = (s, refresh = false) => {
    if (!s.rules || refresh) {
      const { entries, skipped } = collectRules(s.target, { root: s.root });
      s.rules = { entries, skipped, groups: groupByState(entries) };
    }
    return s.rules;
  };
  var describe = (e) => ({
    selector: e.ruleSelector,
    sheet: e.sheet,
    conditions: e.conditions
  });
  var originOf = (s, prop) => {
    if (declaredIn(s.target.style, prop)) return { selector: "style attribute" };
    const own = winningEntry(rulesOf(s).entries, prop);
    if (own) return describe(own);
    if (!INHERITED.has(prop)) return null;
    let node = s.target.parentElement;
    for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
      const found = winningEntry(collectRules(node, { root: s.root }).entries, prop);
      if (found) return { ...describe(found), inherited: true };
    }
    return null;
  };
  var touchInline = (s, prop) => {
    let map = pageOriginals.inline.get(s.target);
    if (!map) pageOriginals.inline.set(s.target, map = /* @__PURE__ */ new Map());
    if (!map.has(prop)) {
      map.set(prop, {
        value: s.target.style.getPropertyValue(prop),
        priority: s.target.style.getPropertyPriority(prop),
        computed: getComputedStyle(s.target).getPropertyValue(prop).trim(),
        origin: originOf(s, prop)
      });
    }
    const key = `inline${prop}`;
    if (!s.touched.has(key)) {
      s.touched.set(key, {
        kind: "inline",
        prop,
        start: {
          value: s.target.style.getPropertyValue(prop),
          priority: s.target.style.getPropertyPriority(prop)
        }
      });
    }
    return map.get(prop);
  };
  var setInline = (s, prop, value) => {
    const v = String(value ?? "").trim();
    if (!v) {
      resetInline(s, prop);
      return true;
    }
    if (!supports(prop, v)) return false;
    touchInline(s, prop);
    s.target.style.setProperty(prop, v, "important");
    changed(s);
    return true;
  };
  var resetInline = (s, prop) => {
    const orig = touchInline(s, prop);
    if (orig.value) s.target.style.setProperty(prop, orig.value, orig.priority);
    else s.target.style.removeProperty(prop);
    changed(s);
  };
  var removeInline = (s, prop) => {
    touchInline(s, prop);
    s.target.style.removeProperty(prop);
    changed(s);
  };
  var inlineChanged = (s, prop) => {
    const orig = pageOriginals.inline.get(s.target)?.get(prop);
    return !!orig && s.target.style.getPropertyValue(prop) !== orig.value;
  };
  var touchRule = (s, entry, prop) => {
    const rule = entry.rule;
    if (createdRules.has(rule)) {
      s.created.add(rule);
      if (!s.createdStart.has(rule)) {
        s.createdStart.set(
          rule,
          new Map(parseDeclarations(rule.style.cssText).map((d) => [d.name, d.value]))
        );
      }
      return;
    }
    let map = pageOriginals.rules.get(rule);
    if (!map) pageOriginals.rules.set(rule, map = /* @__PURE__ */ new Map());
    if (!map.has(prop)) {
      map.set(prop, {
        value: rule.style.getPropertyValue(prop),
        priority: rule.style.getPropertyPriority(prop)
      });
    }
    const key = `rule${ruleId(rule)}${prop}`;
    if (!s.touched.has(key)) {
      s.touched.set(key, {
        kind: "rule",
        rule,
        prop,
        meta: describe(entry),
        start: {
          value: rule.style.getPropertyValue(prop),
          priority: rule.style.getPropertyPriority(prop)
        }
      });
    }
  };
  var setRuleProp = (s, entry, prop, value, important = false) => {
    const v = String(value ?? "").trim();
    if (!prop || !v) return false;
    if (!supports(prop, v)) return false;
    touchRule(s, entry, prop);
    const created = createdRules.get(entry.rule);
    if (created) {
      if (important) created.userImportant.add(prop);
      else created.userImportant.delete(prop);
    }
    entry.rule.style.setProperty(prop, v, important || created ? "important" : "");
    s.disabled.get(entry.rule)?.delete(prop);
    changed(s);
    return true;
  };
  var removeRuleProp = (s, entry, prop) => {
    touchRule(s, entry, prop);
    entry.rule.style.removeProperty(prop);
    s.disabled.get(entry.rule)?.delete(prop);
    changed(s);
  };
  var disableRuleProp = (s, entry, prop) => {
    const style = entry.rule.style;
    const saved = { value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) };
    if (!saved.value) return;
    touchRule(s, entry, prop);
    if (!s.disabled.has(entry.rule)) s.disabled.set(entry.rule, /* @__PURE__ */ new Map());
    s.disabled.get(entry.rule).set(prop, saved);
    style.removeProperty(prop);
    changed(s);
  };
  var enableRuleProp = (s, entry, prop) => {
    const saved = s.disabled.get(entry.rule)?.get(prop);
    if (!saved) return;
    touchRule(s, entry, prop);
    entry.rule.style.setProperty(prop, saved.value, saved.priority);
    s.disabled.get(entry.rule).delete(prop);
    changed(s);
  };
  var ruleChanged = (rule, prop) => {
    const orig = pageOriginals.rules.get(rule)?.get(prop);
    return !!orig && (rule.style.getPropertyValue(prop) !== orig.value || rule.style.getPropertyPriority(prop) !== orig.priority);
  };
  var createdSheet = (root) => {
    let sheet = createdSheets.get(root);
    if (sheet) return sheet;
    try {
      sheet = new CSSStyleSheet();
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch {
      const style = el("style", { id: "tsayru-new-rules" });
      (root.head || root).appendChild(style);
      sheet = style.sheet;
    }
    sheet.__tsayruLabel = "new rule (tsayru)";
    createdSheets.set(root, sheet);
    return sheet;
  };
  var deleteRule = (rule) => {
    const sheet = rule.parentStyleSheet;
    const i = sheet ? Array.from(sheet.cssRules).indexOf(rule) : -1;
    if (i >= 0) sheet.deleteRule(i);
    createdRules.delete(rule);
  };
  var addRule = (s, st) => {
    const base = s.selector.split(" >>> ").pop();
    const selector = st === "default" ? base : `${base}${st}`;
    const sheet = createdSheet(s.root);
    let rule;
    try {
      rule = sheet.cssRules[sheet.insertRule(`${selector} {}`, sheet.cssRules.length)];
    } catch {
      return null;
    }
    createdRules.set(rule, { selector, state: st, userImportant: /* @__PURE__ */ new Set() });
    s.created.add(rule);
    s.createdHere.add(rule);
    s.createdStart.set(rule, /* @__PURE__ */ new Map());
    if (st === "::before" || st === "::after") {
      let content = "none";
      try {
        content = getComputedStyle(s.target, st).content;
      } catch {
      }
      if (/^(none|normal)?$/.test(content)) rule.style.setProperty("content", '""', "important");
    }
    s.rules = null;
    if (s.forced) force(s, s.forced);
    changed(s);
    return rule;
  };
  var force = (s, st) => {
    if (s.unforce) {
      s.unforce();
      s.unforce = null;
      s.forced = null;
    }
    if (st) {
      s.unforce = forceState(s.target, st, { root: s.root });
      s.forced = st;
    }
  };
  var declText = (d) => d.value ? `${d.value}${d.priority ? " !important" : ""}` : null;
  var sessionChanges = (s) => {
    const out = [];
    for (const t of s.touched.values()) {
      if (t.kind === "inline") {
        const orig = pageOriginals.inline.get(s.target)?.get(t.prop);
        if (!orig) continue;
        const cur = s.target.style.getPropertyValue(t.prop);
        out.push({
          scope: "element",
          selector: s.selector,
          property: t.prop,
          before: orig.computed || null,
          after: cur === orig.value ? orig.computed || null : cur || null,
          origin: orig.origin
        });
      } else {
        const orig = pageOriginals.rules.get(t.rule)?.get(t.prop);
        if (!orig) continue;
        out.push({
          scope: "rule",
          ...t.meta,
          property: t.prop,
          before: declText(orig),
          after: declText({
            value: t.rule.style.getPropertyValue(t.prop),
            priority: t.rule.style.getPropertyPriority(t.prop)
          })
        });
      }
    }
    for (const rule of s.created) {
      const meta = createdRules.get(rule);
      if (!meta) continue;
      const now = new Map(parseDeclarations(rule.style.cssText).map((d) => [d.name, d.value]));
      const names = /* @__PURE__ */ new Set([...s.createdStart.get(rule)?.keys() || [], ...now.keys()]);
      for (const name of names) {
        const v = now.get(name);
        out.push({
          scope: "new-rule",
          selector: meta.selector,
          state: meta.state,
          property: name,
          before: null,
          after: v == null ? null : `${v}${meta.userImportant.has(name) ? " !important" : ""}`
        });
      }
    }
    return out;
  };
  var revert = (s) => {
    for (const t of s.touched.values()) {
      const style = t.kind === "inline" ? s.target.style : t.rule.style;
      if (t.start.value) style.setProperty(t.prop, t.start.value, t.start.priority);
      else style.removeProperty(t.prop);
    }
    for (const rule of s.created) {
      if (s.createdHere.has(rule)) {
        deleteRule(rule);
        continue;
      }
      rule.style.cssText = "";
      for (const [name, value] of s.createdStart.get(rule) || []) {
        rule.style.setProperty(name, value, "important");
      }
    }
    s.touched.clear();
    s.created.clear();
    s.createdHere.clear();
    s.createdStart.clear();
    s.disabled.clear();
    s.rules = null;
    if (s.forced) force(s, s.forced);
    changed(s);
  };
  var planSave = (s) => {
    const changes = sessionChanges(s);
    const note = s.note.trim();
    if (!changes.length && !note) return null;
    const existing = state.tasks.find(
      (t) => Array.isArray(t.styleChanges) && !t.done && t.selector === s.selector && t.url === location.href
    );
    const merged = mergeChanges(existing?.styleChanges || [], changes);
    if (!existing && !merged.length && !note) return null;
    return { note, existing, merged };
  };
  var applySave = (s, { note, existing, merged }, { framework = null, screenshot = null } = {}) => {
    if (existing) {
      existing.styleChanges = merged;
      if (screenshot) existing.screenshot = screenshot;
      if (note && !String(existing.text || "").split("\n").includes(note)) {
        existing.text = existing.text ? `${existing.text}
${note}` : note;
      }
      if (!merged.length && !existing.text) state.tasks.splice(state.tasks.indexOf(existing), 1);
    } else {
      state.tasks.push({
        id: crypto.randomUUID(),
        selector: s.selector,
        label: `Style: ${s.label}`,
        text: note,
        url: location.href,
        framework: framework || null,
        computedStyles: s.ctx.computedStyles,
        screenshot: screenshot || null,
        html: s.ctx.html,
        env: s.ctx.env,
        pageErrors: null,
        styleChanges: merged,
        done: false,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  };
  var saveSession = async (s) => {
    const plan = planSave(s);
    if (!plan) return;
    const [framework, screenshot] = await Promise.all([
      withTimeout(s.frameworkPromise, 250),
      plan.merged.length ? captureElement(s.target) : null
    ]);
    applySave(s, plan, { framework, screenshot });
    await persist();
    renderSidebar();
    const n = plan.merged.length;
    const what = `${n} change${n === 1 ? "" : "s"}`;
    flash(plan.existing ? `style task updated \xB7 ${what}` : `style task saved \xB7 ${what}`);
  };
  var onPageHide = () => {
    const s = session;
    const plan = s && planSave(s);
    if (!plan) return;
    applySave(s, plan, { framework: s.framework });
    persist();
  };
  var SHADOW_STOP = [
    "click",
    "dblclick",
    "auxclick",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "contextmenu",
    "wheel",
    "touchstart",
    "touchmove",
    "touchend",
    "input",
    "beforeinput",
    "paste",
    "copy",
    "cut"
  ];
  var stopHere = (e) => e.stopPropagation();
  var onWindowKey = (e) => {
    if (!host || e.target !== host.node) return;
    e.stopImmediatePropagation();
    if (e.type !== "keydown") return;
    const active = host.root.activeElement;
    if (active?.__tsayruKey?.(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeStyleEditor();
    }
  };
  var onWindowFocus = (e) => {
    if (!host) return;
    const intoPanel = e.type === "focusin" ? e.target === host.node : e.relatedTarget === host.node;
    if (intoPanel) e.stopImmediatePropagation();
  };
  var tagOf = (node) => {
    const id = node.id ? `#${node.id}` : "";
    const cls = [...node.classList].filter((c) => !c.startsWith("tsayru-")).slice(0, 2).map((c) => `.${c}`).join("");
    return `${node.tagName.toLowerCase()}${id}${cls}`;
  };
  var track = () => {
    if (!host) return;
    host.raf = requestAnimationFrame(track);
    const node = host.preview || session?.target;
    const box = host.outline;
    if (!node || !node.isConnected) {
      box.style.display = "none";
      host.last = "";
      if (session && node === session.target) session.onDetached?.();
      return;
    }
    const r = node.getBoundingClientRect();
    const key = `${r.left}|${r.top}|${r.width}|${r.height}|${!!host.preview}`;
    if (key === host.last) return;
    host.last = key;
    box.style.display = "block";
    box.style.transform = `translate(${r.left}px, ${r.top}px)`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    box.classList.toggle("preview", !!host.preview);
    box.classList.toggle("below", r.top < 22);
    box.firstChild.textContent = `${tagOf(node)} \xB7 ${Math.round(r.width)}\xD7${Math.round(r.height)}`;
  };
  var ensureHost = () => {
    if (host) return host;
    const node = document.createElement("tsayru-style");
    node.className = "tsayru-style-host";
    node.style.cssText = [
      "all: initial !important",
      "position: fixed !important",
      "inset: 0 !important",
      "z-index: 2147483647 !important",
      "pointer-events: none !important",
      "display: block !important"
    ].join(";");
    const root = node.attachShadow({ mode: "closed" });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch {
      root.appendChild(el("style", {}, PANEL_CSS));
    }
    const outline = el("div", { class: "outline" }, el("div", { class: "outline-tag" }));
    root.appendChild(outline);
    for (const type of SHADOW_STOP) root.addEventListener(type, stopHere);
    for (const type of ["keydown", "keyup", "keypress"]) {
      window.addEventListener(type, onWindowKey, true);
    }
    window.addEventListener("focusin", onWindowFocus, true);
    window.addEventListener("focusout", onWindowFocus, true);
    window.addEventListener("pagehide", onPageHide);
    document.documentElement.appendChild(node);
    refs.styleHost = node;
    host = { node, root, outline, panel: null, preview: null, raf: 0, last: "" };
    host.raf = requestAnimationFrame(track);
    return host;
  };
  var destroyHost = () => {
    if (!host) return;
    cancelAnimationFrame(host.raf);
    for (const type of ["keydown", "keyup", "keypress"]) {
      window.removeEventListener(type, onWindowKey, true);
    }
    window.removeEventListener("focusin", onWindowFocus, true);
    window.removeEventListener("focusout", onWindowFocus, true);
    window.removeEventListener("pagehide", onPageHide);
    host.node.remove();
    refs.styleHost = null;
    host = null;
  };
  var PANEL_W = 340;
  var MARGIN = 12;
  var clampPos = ({ left, top }) => ({
    left: Math.max(MARGIN - PANEL_W + 80, Math.min(left, innerWidth - 80)),
    top: Math.max(0, Math.min(top, innerHeight - 40))
  });
  var placePanel = (panel, target) => {
    let pos = lastPos;
    if (!pos) {
      const r = target.getBoundingClientRect();
      const sidebarOpen = refs.sidebar && !refs.sidebar.classList.contains("tsayru-hidden");
      const rightSide = innerWidth - PANEL_W - MARGIN - (sidebarOpen ? 320 + MARGIN : 0);
      const elementOnLeft = r.left + r.width / 2 < innerWidth / 2;
      pos = { left: elementOnLeft ? Math.max(MARGIN, rightSide) : MARGIN, top: MARGIN };
    }
    pos = clampPos(pos);
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
  };
  var makeApi = (s) => ({
    get target() {
      return s.target;
    },
    deep: s.deep,
    label: s.label,
    selector: s.selector,
    framework: () => s.framework,
    computed: () => getComputedStyle(s.target),
    focused: () => host?.root.activeElement || null,
    set onChange(fn) {
      s.onChange = fn;
    },
    set onFramework(fn) {
      s.onFramework = fn;
    },
    set onDetached(fn) {
      s.onDetached = fn;
    },
    // inline: Quick tab and the element.style card
    inlineDecls: () => parseDeclarations(s.target.style.cssText),
    setInline: (prop, value) => setInline(s, prop, value),
    resetInline: (prop) => resetInline(s, prop),
    removeInline: (prop) => removeInline(s, prop),
    inlineChanged: (prop) => inlineChanged(s, prop),
    // rules: CSS tab
    rules: (refresh) => rulesOf(s, refresh),
    setRuleProp: (entry, prop, value, important) => setRuleProp(s, entry, prop, value, important),
    removeRuleProp: (entry, prop) => removeRuleProp(s, entry, prop),
    disableRuleProp: (entry, prop) => disableRuleProp(s, entry, prop),
    enableRuleProp: (entry, prop) => enableRuleProp(s, entry, prop),
    disabledProps: (rule) => s.disabled.get(rule) || /* @__PURE__ */ new Map(),
    ruleChanged,
    isCreated: (rule) => createdRules.has(rule),
    shownImportant: (rule, d) => createdRules.has(rule) ? createdRules.get(rule).userImportant.has(d.name) : d.important,
    addRule: (st) => addRule(s, st),
    force: (st) => force(s, st),
    forced: () => s.forced,
    matchCount: (selector) => {
      try {
        return s.root.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    },
    // session
    changeCount: () => mergeChanges([], sessionChanges(s)).length,
    setNote: (text) => {
      s.note = String(text || "");
    },
    revert: () => revert(s),
    close: () => closeStyleEditor(),
    select: (node) => openStyleEditor(node, { deep: node.contains(s.deep) ? s.deep : node }),
    pseudoContent: (st) => {
      try {
        return getComputedStyle(s.target, st).content;
      } catch {
        return "none";
      }
    },
    preview: (node) => {
      if (host) host.preview = node || null;
    },
    moved: (pos) => {
      lastPos = clampPos(pos);
      return lastPos;
    }
  });
  var finish = async (s, { save }) => {
    if (save) {
      try {
        await saveSession(s);
      } catch (err) {
        console.warn("[tsayru] saving style task failed:", err);
        flash("couldn't save the style task");
      }
    }
    force(s, null);
    if (host?.panel) {
      host.panel.remove();
      host.panel = null;
      host.preview = null;
    }
    if (session === s) session = null;
  };
  var open = async (target, deep) => {
    if (!(target instanceof Element) || !target.isConnected) return;
    if (session?.target === target) return;
    if (session) await finish(session, { save: true });
    ensureHost();
    const s = newSession(target, deep);
    session = s;
    s.frameworkPromise.then((fw) => {
      s.framework = fw;
      s.onFramework?.(fw);
    });
    const panel = mountPanel(makeApi(s));
    host.panel = panel;
    host.root.appendChild(panel);
    placePanel(panel, target);
  };
  var isStyleEditorOpen = () => !!session;
  var openStyleEditor = (target, { deep } = {}) => {
    queue = queue.then(() => open(target, deep)).catch((err) => console.warn("[tsayru] style editor:", err));
    return queue;
  };
  var closeStyleEditor = ({ save = true } = {}) => {
    queue = queue.then(async () => {
      if (session) await finish(session, { save });
      destroyHost();
    }).catch((err) => console.warn("[tsayru] style editor:", err));
    return queue;
  };

  // src/inspector.js
  var ensureOverlay = () => {
    if (refs.highlight) return;
    refs.highlight = el("div", { class: "tsayru-highlight" });
    document.documentElement.appendChild(refs.highlight);
  };
  var sidebarVisible = () => !!refs.sidebar && !refs.sidebar.classList.contains("tsayru-hidden");
  var moveHighlight = (target) => {
    if (!refs.highlight) return;
    if (target && !sidebarVisible()) target = null;
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
    if (!on) {
      state.hovered = null;
      moveHighlight(null);
    }
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
    closeStyleEditor();
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
  var isOurChrome = (node) => !!(node && node.closest && node.closest(
    ".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight, .tsayru-style-host"
  ));
  var IS_MAC = /mac|iphone|ipad/i.test(
    navigator.userAgentData?.platform || navigator.platform || ""
  );
  var styleKey = (e) => (IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;
  var styleGesture = (e) => styleKey(e) && sidebarVisible();
  var CONTROL = "a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], label, summary";
  var pickStyleTarget = (node) => {
    let n = node;
    if (typeof SVGElement !== "undefined" && n instanceof SVGElement && n.ownerSVGElement) {
      n = n.ownerSVGElement;
    }
    const control = n.closest?.(CONTROL);
    if (control && control !== n) {
      let depth = 0;
      for (let p = n; p && p !== control; p = p.parentElement) depth++;
      if (depth <= 3) return control;
    }
    return n;
  };
  var gestureHover = false;
  var lastPointer = { x: -1, y: -1 };
  var hoverAt = (x, y) => {
    ensureOverlay();
    const deep = deepElementFromPoint(x, y);
    const target = deep && !state.inspecting ? pickStyleTarget(deep) : deep;
    if (!target || target === state.hovered) return;
    if (isOurChrome(target)) {
      state.hovered = null;
      moveHighlight(null);
      return;
    }
    state.hovered = target;
    moveHighlight(target);
  };
  var clearGestureHover = () => {
    if (!gestureHover) return;
    gestureHover = false;
    if (state.inspecting) return;
    state.hovered = null;
    moveHighlight(null);
  };
  var onMouseMove = (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
    if (state.inspecting) {
      hoverAt(e.clientX, e.clientY);
    } else if (styleGesture(e)) {
      gestureHover = true;
      hoverAt(e.clientX, e.clientY);
    } else {
      clearGestureHover();
    }
  };
  var onPointerSuppress = (e) => {
    if (!state.inspecting && !styleGesture(e)) return;
    if (isOurChrome(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  var onClick = async (e) => {
    if (isOurChrome(e.target)) return;
    if (styleGesture(e)) {
      e.preventDefault();
      e.stopPropagation();
      const target2 = deepElementFromPoint(e.clientX, e.clientY);
      if (!target2 || isOurChrome(target2)) return;
      if (state.inspecting) setInspecting(false);
      clearGestureHover();
      openStyleEditor(pickStyleTarget(target2), { deep: target2 });
      return;
    }
    if (!state.inspecting) return;
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
    } else if (e.key === "Escape" && isStyleEditorOpen()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeStyleEditor();
    } else if ((e.key === "Meta" || e.key === "Control") && !state.inspecting && styleGesture(e) && lastPointer.x >= 0) {
      gestureHover = true;
      hoverAt(lastPointer.x, lastPointer.y);
    }
  };
  var onKeyUp = (e) => {
    if (e.key === "Meta" || e.key === "Control") clearGestureHover();
  };
  var initEventListeners = () => {
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("pointerdown", onPointerSuppress, true);
    document.addEventListener("mousedown", onPointerSuppress, true);
    document.addEventListener("mouseup", onPointerSuppress, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", clearGestureHover);
    bus.on("task-added", () => {
      if (sidebarVisible()) setInspecting(true);
    });
    window.addEventListener(
      "scroll",
      () => {
        if (state.inspecting && state.hovered) moveHighlight(state.hovered);
      },
      true
    );
    window.addEventListener("resize", () => {
      if (state.inspecting && state.hovered) moveHighlight(state.hovered);
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
