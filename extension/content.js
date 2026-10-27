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
    pickMode: "task",
    // what an inspector click does: "task" (modal) or "style" (style editor)
    hovered: null,
    tasks: [],
    editingTaskIndex: null,
    filterHost: null,
    filterTag: null
  };
  var refs = {
    ui: null,
    // the host of everything below (ui.js) — sidebar, dialogs, toasts, highlight
    highlight: null,
    sidebar: null,
    modal: null,
    styleHost: null
    // the style editor's panel + outline (styleeditor.js)
  };
  var sidebarVisible = () => !!refs.sidebar && !refs.sidebar.classList.contains("hidden");
  var IS_MAC = /mac|iphone|ipad/i.test(
    navigator.userAgentData?.platform || navigator.platform || ""
  );
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
            message: quota ? "Storage is full. Delete old tasks to save new ones" : "Couldn\u2019t save tasks. Reload the page and try again"
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

  // src/shadowhost.js
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
  var createShadowHost = ({ tag, className, css, onKey: onKey2 }) => {
    const node = document.createElement(tag);
    node.className = className;
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
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch {
      root.appendChild(el("style", {}, css));
    }
    for (const type of SHADOW_STOP) root.addEventListener(type, stopHere);
    const onWindowKey = (e) => {
      if (e.target !== node) return;
      e.stopImmediatePropagation();
      if (e.type === "keydown" && root.activeElement?.__tsayruKey?.(e)) return;
      onKey2?.(e);
    };
    const onWindowFocus = (e) => {
      const into = e.type === "focusin" ? e.target === node : e.relatedTarget === node;
      if (into) e.stopImmediatePropagation();
    };
    for (const type of ["keydown", "keyup", "keypress"]) {
      window.addEventListener(type, onWindowKey, true);
    }
    window.addEventListener("focusin", onWindowFocus, true);
    window.addEventListener("focusout", onWindowFocus, true);
    document.documentElement.appendChild(node);
    return {
      node,
      root,
      destroy() {
        for (const type of ["keydown", "keyup", "keypress"]) {
          window.removeEventListener(type, onWindowKey, true);
        }
        window.removeEventListener("focusin", onWindowFocus, true);
        window.removeEventListener("focusout", onWindowFocus, true);
        node.remove();
      }
    };
  };
  var isOurHost = (node) => !!node?.closest?.(".tsayru-ui-host, .tsayru-style-host");

  // src/theme-css.js
  var FONT_FAMILY = "tsayru Onest";
  var THEME_CSS = `
:host {
  --font: "${FONT_FAMILY}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  --shell: #e2e2df;
  --key: #f5f4f2;
  --key-hover: #fbfbf9;
  --well: #d6d6d2;
  --line: #cbcbc7;
  --field-line: #7b7a76;
  --groove: rgb(255 255 255 / 0.7);
  --ink: #000;
  --on-ink: #fff;
  --text-2: #5b5b57;
  --text-3: #64645f;
  --signal: #0524fe;
  --on-signal: #fff;
  --signal-text: #0524fe;
  --signal-soft: rgb(5 36 254 / 0.1);
  --marker: #d12eaa;
  --marker-soft: #fbdef0;
  --marker-text: #a61b86;
  --marker-solid: #a61b86;
  --on-marker: #fff;
  --danger-text: #be2323;
  --danger-soft: #ffe1de;
  --danger-solid: #d02c2a;
  --on-danger: #fff;
  --caution-soft: #f6e6b4;
  --caution-text: #6b4d00;
  --disc: #f2f1ec;
  --led: #fad620;
  --scrim: rgb(20 20 18 / 0.32);
  --code-prop: #0b6380;

  --shadow-key: 0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06),
    0 2px 4px 0 oklch(0 0 0 / 0.04);
  --shadow-key-hover: 0 0 0 1px oklch(0 0 0 / 0.08), 0 1px 2px -1px oklch(0 0 0 / 0.08),
    0 2px 4px 0 oklch(0 0 0 / 0.06);
  --shadow-shell: 0 0 0 1px oklch(0 0 0 / 0.08), 0 12px 32px -12px oklch(0 0 0 / 0.22);
  --grain-opacity: 0.3;

  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --press: 150ms ease-out;
}

@media (prefers-color-scheme: dark) {
  :host {
    --shell: #1d1e20;
    --key: #2a2b2e;
    --key-hover: #323337;
    --well: #141517;
    --line: #37383b;
    --field-line: #787a7f;
    --groove: rgb(255 255 255 / 0.04);
    --ink: #f4f3f0;
    --on-ink: #1d1e20;
    --text-2: #afb1b6;
    --text-3: #96989d;
    --signal: #1746ff;
    --signal-text: #88a9ff;
    --signal-soft: rgb(60 100 255 / 0.2);
    --marker: #f061ba;
    --marker-soft: #4b233b;
    --marker-text: #ffa1d7;
    --marker-solid: #f061ba;
    --on-marker: #1d1e20;
    --danger-text: #fb817a;
    --danger-soft: #4a2321;
    --danger-solid: #f36358;
    --on-danger: #1d1e20;
    --caution-soft: #3d3214;
    --caution-text: #f5d27a;
    --disc: #f4f3f0;
    --scrim: rgb(0 0 0 / 0.5);
    --code-prop: #7dd3fc;

    --shadow-key: 0 0 0 1px oklch(1 0 0 / 0.08);
    --shadow-key-hover: 0 0 0 1px oklch(1 0 0 / 0.13);
    --shadow-shell: 0 0 0 1px oklch(1 0 0 / 0.08), 0 12px 32px -12px oklch(0 0 0 / 0.6);
    --grain-opacity: 0.22;
  }
}

:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

button {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:disabled { cursor: default; }
:focus-visible { outline: 2.5px solid var(--signal); outline-offset: 2px; }

svg.i {
  display: block;
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
svg.i .fill { fill: currentColor; stroke: none; }

/* The speckle on every shell (icons.js grain()). */
.shell { position: relative; isolation: isolate; background: var(--shell); box-shadow: var(--shadow-shell); }
.grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: var(--grain-opacity);
}

/* Reduced motion: no movement or scale; state changes still cross-fade.
   Components swap their entrance keyframes for "fade" (ui-css.js). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-property: opacity, background-color, color, box-shadow !important;
    scale: none !important;
  }
}
@keyframes fade { from { opacity: 0; } }
`;

  // src/ui-css.js
  var UI_CSS = THEME_CSS + `
.ui {
  font: 14px/1.4 var(--font);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-synthesis: none;
  text-align: left;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---------- sidebar ---------- */

.panel {
  container: panel / inline-size;
  position: fixed;
  top: 12px;
  right: 12px;
  width: 368px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  border-radius: 32px;
  overflow: hidden;
  pointer-events: auto;
  transition: transform 300ms var(--ease-out), opacity 200ms ease-out, visibility 0s;
}
.panel.hidden {
  transform: translateX(calc(100% + 24px));
  opacity: 0;
  visibility: hidden;
  transition: transform 180ms ease-out, opacity 180ms ease-out, visibility 0s 180ms;
}

.hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 4px 16px;
}
.mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  overflow: hidden;
  flex: none;
  background: var(--signal);
}
.mark svg { display: block; width: 100%; height: 100%; }
.word {
  font-size: 21px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.04em;
  padding-bottom: 2px;
}
.tally {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.round {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  color: var(--text-2);
  transition: background-color 150ms ease-out, color 150ms ease-out, scale var(--press);
}
.round svg.i { width: 20px; height: 20px; }

/* the pick row: one loud key, one quiet one */
.deck {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 68px;
  gap: 8px;
  padding: 10px 12px 0;
}
.pick {
  position: relative;
  height: 68px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px 0 10px;
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22);
  transition: scale var(--press);
}
.pick:focus-visible { outline-color: var(--ink); }
.disc {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--disc);
  color: #000;
}
.disc svg.i { width: 24px; height: 24px; }
.pick-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pick-title {
  font-size: 18px;
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-sub { font-size: 12.5px; font-weight: 500; opacity: 0.8; white-space: nowrap; }
.led {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--led);
  box-shadow: 0 0 0 3px rgb(250 214 32 / 0.22), 0 0 8px 1px rgb(250 214 32 / 0.7);
  animation: led 1.4s ease-in-out infinite;
}
.pick.on .disc svg.i { animation: spin 6s linear infinite; }
@keyframes led { 50% { opacity: 0.45; } }
@keyframes spin { to { transform: rotate(360deg); } }

.square {
  height: 64px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--key);
  box-shadow: var(--shadow-key);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink);
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out, scale var(--press);
}
.square:disabled { opacity: 0.38; }
.deck .square { height: 68px; }
.square.on { color: var(--signal-text); box-shadow: inset 0 0 0 2px var(--signal); }
.square.danger { color: var(--danger-text); }

.hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 12px 18px 14px;
  font-size: 12.5px;
  color: var(--text-2);
}
.hint { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.kbd {
  display: inline-flex;
  align-items: center;
  height: 22px;
  min-width: 22px;
  padding: 0 7px;
  border-radius: 7px;
  background: var(--key);
  box-shadow: var(--shadow-key);
  color: var(--ink);
  font: 600 12px/1 var(--font);
  white-space: nowrap;
}

.groove {
  height: 2px;
  margin: 0 16px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--groove);
  flex: none;
}

/* filters: hosts as a segmented control, #tags as marker chips */
.filters { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 4px; }
.seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 15px;
  background: var(--well);
  overflow-x: auto;
  scrollbar-width: none;
}
.seg::-webkit-scrollbar { display: none; }
.seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
  flex: none;
  max-width: 190px;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.seg button > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.seg button.on { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.n { font-variant-numeric: tabular-nums; font-weight: 500; opacity: 0.7; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 2px; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  background: var(--marker-soft);
  box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--marker) 55%, transparent);
  color: var(--marker-text);
  font-size: 13px;
  font-weight: 600;
  transition: box-shadow 150ms ease-out, background-color 150ms ease-out;
}
.tag svg.i { width: 14px; height: 14px; stroke-width: 2.4; }
.tag.on { background: var(--marker-solid); color: var(--on-marker); box-shadow: none; }

/* task list: flat rows on the shell; the one under the pointer stands up */
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 8px 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.task {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  column-gap: 12px;
  padding: 12px 10px;
  border-radius: 20px;
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.task + .task::before {
  content: "";
  position: absolute;
  top: 0;
  left: 52px;
  right: 10px;
  border-top: 1px solid var(--line);
}
.task:focus-within,
.task.editing { background: var(--key); box-shadow: var(--shadow-key); }
.task:focus-within::before,
.task:focus-within + .task::before,
.task.editing::before,
.task.editing + .task::before { border-color: transparent; }
.num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.num svg.i { width: 16px; height: 16px; stroke-width: 2.6; }
.body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.row1 { display: flex; align-items: center; gap: 4px; min-height: 30px; }
.label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acts { display: flex; gap: 2px; margin-right: -4px; opacity: 0; transition: opacity 150ms ease-out; }
.task:focus-within .acts { opacity: 1; }
@media (hover: none) { .acts { opacity: 1; } }
.act {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.act svg.i { width: 18px; height: 18px; }
.sel {
  font: 12px/1.35 var(--mono);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.text {
  margin-top: 3px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.text.empty { color: var(--text-3); }
.styled {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px 0 7px;
  border-radius: 999px;
  background: var(--signal-soft);
  color: var(--signal-text);
  font-weight: 650;
  white-space: nowrap;
  flex: none;
}
.chip svg.i { width: 14px; height: 14px; stroke-width: 2.4; }
.props { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task.done .num { background: var(--well); color: var(--text-2); }
.task.done .label,
.task.done .text { color: var(--text-3); }
.task.done .text { text-decoration: line-through; text-decoration-thickness: 1.5px; }

.edit { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.field {
  display: block;
  width: 100%;
  min-height: 84px;
  resize: vertical;
  margin: 0;
  padding: 11px 13px;
  border: 1px solid var(--field-line);
  border-radius: 14px;
  background: var(--well);
  color: var(--ink);
  font: 15px/1.45 var(--font);
  outline: none;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.field::placeholder { color: var(--text-2); }
.field:focus { border-color: var(--signal); box-shadow: 0 0 0 1px var(--signal); }
.edit-ft { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.kbd-in {
  padding: 3px 6px;
  border-radius: 6px;
  background: color-mix(in oklab, currentColor 14%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  opacity: 0.85;
}

/* empty list: the three steps, in order */
.steps { list-style: none; margin: 0; padding: 4px 10px 6px; display: flex; flex-direction: column; }
.steps li { display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 12px; padding: 12px 0; }
.steps li + li { border-top: 1px solid var(--line); }
.steps .num { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.steps li:first-child .num { background: var(--signal); color: var(--on-signal); box-shadow: none; }
.steps b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 30px; }
.steps p { margin: 0; font-size: 13.5px; color: var(--text-2); text-wrap: pretty; }
.nothing { padding: 22px 12px; text-align: center; font-size: 14px; color: var(--text-2); }
.nothing button { display: block; margin: 6px auto 0; color: var(--signal-text); font-weight: 650; }

/* ship bar: send is the ink key, copy and clear stand beside it */
.ship { display: grid; grid-template-columns: minmax(0, 1fr) 60px 60px; gap: 8px; padding: 12px; }
.send {
  height: 64px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 0 9px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16);
  transition: scale var(--press);
}
.send:disabled { opacity: 0.38; }
.send .disc { width: 46px; height: 46px; background: var(--signal); color: var(--on-signal); }
.send .disc svg.i { width: 22px; height: 22px; margin: 1px 2px 0 0; }
.send-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* A narrow window (or 200% zoom): drop decoration before text gets cut. */
@container panel (max-width: 330px) {
  .ship { grid-template-columns: minmax(0, 1fr) 52px 52px; }
  .send .disc { display: none; }
  .send { padding: 0 12px; font-size: 15px; }
  .hints { display: none; }
  .pick { gap: 10px; padding: 0 12px 0 8px; }
  .pick .disc { width: 40px; height: 40px; }
  .pick-title { font-size: 16px; }
}

/* ---------- buttons shared by dialogs ---------- */

.btn {
  height: 52px;
  padding: 0 20px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: background-color 150ms ease-out, color 150ms ease-out, scale var(--press);
}
.btn.quiet { color: var(--text-2); }
.btn.primary {
  background: var(--signal);
  color: var(--on-signal);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22);
}
.btn.primary:focus-visible { outline-color: var(--ink); }
.btn.ink { background: var(--ink); color: var(--on-ink); }
.btn.small { height: 38px; padding: 0 14px; border-radius: 12px; font-size: 13.5px; }

/* Press: every key gives way a little, the instant it's pressed. */
:is(.round, .pick, .square, .send, .btn, .toast-act):not(:disabled):active { scale: 0.96; }

/* ---------- toast ---------- */

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 32px);
  min-height: 48px;
  padding: 8px 18px 8px 8px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.35);
  font-size: 14.5px;
  font-weight: 600;
  pointer-events: auto;
  animation: toast-in 240ms var(--ease-out);
}
.toast.has-act { padding-right: 8px; }
.toast .disc { width: 32px; height: 32px; background: var(--signal); color: var(--on-signal); }
.toast .disc svg.i { width: 18px; height: 18px; stroke-width: 2.6; }
.toast.warn .disc { background: var(--marker-solid); color: var(--on-marker); }
.toast.danger .disc { background: var(--danger-solid); color: var(--on-danger); }
.toast-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast-act {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--on-ink) 16%, transparent);
  font-size: 13.5px;
  font-weight: 700;
  flex: none;
  transition: background-color 150ms ease-out, scale var(--press);
}
@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); filter: blur(4px); }
}

/* ---------- dialogs ---------- */

.scrim {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--scrim);
  pointer-events: auto;
  animation: fade 160ms ease-out;
}
.dialog {
  width: min(500px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 32px;
  overflow: hidden;
  animation: dialog-in 240ms var(--ease-out);
}
@keyframes dialog-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } }
.dlg-hd { display: flex; align-items: center; gap: 10px; padding: 2px 0 0 6px; }
.dlg-title { flex: 1; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; text-wrap: balance; }
.target {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  background: var(--key);
  box-shadow: var(--shadow-key);
}
.target:has(.shot) { padding: 8px 8px 12px; }
.shot {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 12px;
  background: var(--well);
  outline: 1px solid oklch(0 0 0 / 0.1);
  outline-offset: -1px;
}
.target-meta { display: flex; flex-direction: column; gap: 2px; padding: 0 6px; min-width: 0; }
.target-meta b {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.target-meta .sel { white-space: normal; word-break: break-all; }
.dialog .field { min-height: 112px; font-size: 16px; padding: 13px 15px; border-radius: 16px; }
.dlg-ft { display: flex; align-items: center; gap: 8px; }
.dlg-ft .hints { padding: 0 0 0 6px; margin-right: auto; gap: 6px 12px; }

/* chat picker */
.picker { width: min(520px, 100%); }
.status { padding: 0 6px; font-size: 14px; color: var(--text-2); text-wrap: pretty; }
.status.warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--caution-soft);
  color: var(--caution-text);
  font-weight: 550;
}
.status.warn svg.i { width: 20px; height: 20px; margin-top: 1px; }
.chats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: 52vh;
  margin: 0 -4px;
  padding: 2px 4px 6px;
}
.chat {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  width: 100%;
  padding: 10px 14px 10px 10px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: var(--key);
  box-shadow: var(--shadow-key);
  transition: background-color 150ms ease-out, box-shadow 150ms ease-out;
}
.chat:active { background: var(--well); }
.chat .disc { width: 44px; height: 44px; background: var(--ink); color: var(--on-ink); }
.chat .disc svg.i { width: 20px; height: 20px; }
.chat-text { min-width: 0; }
.chat-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat .sel { display: block; }
.now {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--signal-text);
  white-space: nowrap;
}
.now::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 3px var(--signal-soft);
}
.opens { display: flex; flex-wrap: wrap; gap: 8px; }

/* ---------- hover, only where a pointer can hover ---------- */

@media (hover: hover) {
  .round:hover { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
  .square:hover:not(:disabled) { background: var(--key-hover); box-shadow: var(--shadow-key-hover); }
  .square.danger:hover:not(:disabled) { background: var(--danger-soft); }
  .seg button:hover { color: var(--ink); }
  .tag:hover { box-shadow: inset 0 0 0 1.5px var(--marker); }
  .task:hover { background: var(--key); box-shadow: var(--shadow-key); }
  .task:hover::before,
  .task:hover + .task::before { border-color: transparent; }
  .task:hover .acts { opacity: 1; }
  .act:hover { background: var(--well); color: var(--ink); }
  .act.danger:hover { background: var(--danger-soft); color: var(--danger-text); }
  .nothing button:hover { text-decoration: underline; }
  .btn.quiet:hover { color: var(--ink); background: var(--key); box-shadow: var(--shadow-key); }
  .btn.primary:hover { background: color-mix(in oklab, var(--signal) 90%, white); }
  .toast-act:hover { background: color-mix(in oklab, var(--on-ink) 26%, transparent); }
  .chat:hover { background: var(--key-hover); box-shadow: var(--shadow-key-hover); }
}

/* ---------- page highlight (what a click would pick) ---------- */

.hl {
  position: fixed;
  left: 0;
  top: 0;
  display: none;
  border: 2px solid var(--signal);
  border-radius: 6px;
  background: rgb(5 36 254 / 0.06);
  box-shadow: 0 0 0 3px rgb(5 36 254 / 0.12);
  pointer-events: none;
}
.hl-tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 6px);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 16px));
  height: 26px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--signal);
  color: var(--on-signal);
  font: 650 12.5px/1 var(--font);
  white-space: nowrap;
}
.hl-tag b { font-weight: inherit; overflow: hidden; text-overflow: ellipsis; }
.hl-tag span { opacity: 0.75; font-weight: 550; font-variant-numeric: tabular-nums; flex: none; }
.hl.below .hl-tag { bottom: auto; top: calc(100% + 6px); }
.hl.inside .hl-tag { bottom: auto; top: 4px; left: 4px; }

@media (prefers-color-scheme: dark) {
  .shot { outline-color: oklch(1 0 0 / 0.1); }
}

/* Reduced motion: entrances fade in place, nothing pulses or spins. */
@media (prefers-reduced-motion: reduce) {
  .dialog,
  .toast { animation-name: fade; }
  .led,
  .pick.on .disc svg.i { animation: none; }
  .panel.hidden { transform: none; }
}
`;

  // src/fonts.js
  var FACES = [
    {
      file: "onest-latin.woff2",
      unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
    },
    {
      file: "onest-cyrillic.woff2",
      unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"
    }
  ];
  var readFont = (file) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_FONT", file }, (resp) => {
        void chrome.runtime.lastError;
        resolve(resp?.ok ? resp.data : null);
      });
    } catch {
      resolve(null);
    }
  });
  var toBytes = (base64) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  var loading = null;
  var ensureFonts = () => loading ||= Promise.all(
    FACES.map(async ({ file, unicodeRange }) => {
      const data = await readFont(file);
      if (!data) return;
      const face = new FontFace(FONT_FAMILY, toBytes(data), {
        weight: "100 900",
        unicodeRange
      });
      document.fonts.add(face);
      await face.load();
    })
  ).catch((err) => console.warn("[tsayru] UI font failed to load:", err));

  // src/icons.js
  var NS = "http://www.w3.org/2000/svg";
  var svg = (attrs, children = []) => {
    const node = document.createElementNS(NS, attrs.tag || "svg");
    for (const [k, v] of Object.entries(attrs)) if (k !== "tag") node.setAttribute(k, v);
    for (const c of children) node.appendChild(c);
    return node;
  };
  var path = (d) => svg({ tag: "path", d });
  var circle = (cx, cy, r, fill) => svg({ tag: "circle", cx, cy, r, ...fill ? { class: "fill" } : {} });
  var rect = (x, y, width, height, rx) => svg({ tag: "rect", x, y, width, height, rx });
  var ICONS = {
    target: () => [circle(12, 12, 7.5), circle(12, 12, 2.6, true), path("M12 1.5V5M12 19v3.5M1.5 12H5M19 12h3.5")],
    sliders: () => [path("M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"), circle(15, 7, 2.5), circle(9, 17, 2.5)],
    send: () => [path("M21 3 10.5 13.5"), path("M21 3 14.5 21l-4-7.5L3 9.5z")],
    copy: () => [
      rect(8.5, 8.5, 12, 12, 3),
      path("M15.5 8.5v-2a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2")
    ],
    trash: () => [
      path("M4 6.5h16"),
      path("M9.5 6.5v-2A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5v2"),
      path("m6 6.5.9 12.6a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 6.5")
    ],
    hide: () => [path("m9.5 6 6 6-6 6")],
    close: () => [path("m6.5 6.5 11 11M17.5 6.5l-11 11")],
    edit: () => [path("m4 20 1-4.5L15.8 4.7a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19z"), path("m13.5 7 3.5 3.5")],
    check: () => [path("m5 12.5 4.5 4.5L19 7")],
    chat: () => [
      path("M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5z")
    ],
    hash: () => [path("M5 9h14M5 15h14M10 4 8 20M16 4l-2 16")],
    alert: () => [
      path("M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
      path("M12 9.5v4"),
      path("M12 17h.01")
    ],
    external: () => [path("M14 4h6v6M20 4l-9 9"), path("M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4")]
  };
  var icon = (name) => svg({ class: "i", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, ICONS[name]());
  var NEEDLE = "M1157 -71.5 543.6 537.9 535.5 546c-67.5 67.5-67.5 176.9 0 244.4l8.1 8.1-81.5 81.5-8.1-8.1c-67.5-67.5-176.9-67.5-244.4 0l-8.1 8.1-81.5-81.5 8.1-8.1c67.5-67.5 67.5-176.9 0-244.4l-8.1-8.1 81.5-81.5 8.1 8.1c67.5 67.5 176.9 67.5 244.4 0l8.1-8.1L1075.5 -153z";
  var brandMark = () => svg({ viewBox: "0 0 1000 1000", "aria-hidden": "true", focusable: "false" }, [
    svg({ tag: "path", d: NEEDLE, fill: "#fad620" })
  ]);
  var grainId = 0;
  var grain = () => {
    const id = `tsayru-grain-${++grainId}`;
    const matrix = (values, result) => svg({ tag: "feColorMatrix", in: "n", type: "matrix", values, result });
    return svg({ class: "grain", "aria-hidden": "true", focusable: "false" }, [
      svg({ tag: "filter", id, x: "0", y: "0", width: "100%", height: "100%" }, [
        svg({
          tag: "feTurbulence",
          type: "fractalNoise",
          baseFrequency: "0.95",
          numOctaves: "1",
          seed: "4",
          stitchTiles: "stitch",
          result: "n"
        }),
        matrix("0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  14 0 0 0 -9.1", "hi"),
        matrix("0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -14 0 0 4.6", "lo"),
        svg({ tag: "feMerge" }, [svg({ tag: "feMergeNode", in: "lo" }), svg({ tag: "feMergeNode", in: "hi" })])
      ]),
      svg({ tag: "rect", width: "100%", height: "100%", filter: `url(#${id})` })
    ]);
  };

  // src/ui.js
  var host = null;
  var layer = null;
  var live = null;
  var dialogs = [];
  var onKey = (e) => {
    if (e.type === "keydown" && e.key === "Escape" && dialogs.length) {
      e.preventDefault();
      dialogs[dialogs.length - 1].onEscape();
      return;
    }
    bus.emit("ui-key", e);
  };
  var onPageEscape = (e) => {
    if (e.key !== "Escape" || !dialogs.length || isOurHost(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    dialogs[dialogs.length - 1].onEscape();
  };
  var uiLayer = () => {
    if (layer) return layer;
    host = createShadowHost({
      tag: "tsayru-ui",
      className: "tsayru-ui-host",
      css: UI_CSS,
      onKey
    });
    live = el("div", { class: "sr", role: "status", "aria-live": "polite" });
    layer = el("div", { class: "ui" }, live);
    host.root.appendChild(layer);
    refs.ui = host.node;
    ensureFonts();
    return layer;
  };
  var openDialog = ({ className = "", label, onEscape }) => {
    uiLayer();
    const returnTo = host.root.activeElement;
    const dialog2 = el("div", {
      class: `dialog shell${className ? ` ${className}` : ""}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": label
    });
    dialog2.appendChild(grain());
    const scrim = el(
      "div",
      {
        class: "scrim",
        onClick: (e) => {
          if (e.target === scrim) onEscape();
        }
      },
      dialog2
    );
    const entry = { onEscape };
    dialogs.push(entry);
    if (dialogs.length === 1) window.addEventListener("keydown", onPageEscape, true);
    if (refs.sidebar) refs.sidebar.inert = true;
    layer.appendChild(scrim);
    return {
      scrim,
      dialog: dialog2,
      close() {
        scrim.remove();
        const i = dialogs.indexOf(entry);
        if (i >= 0) dialogs.splice(i, 1);
        if (!dialogs.length) {
          window.removeEventListener("keydown", onPageEscape, true);
          if (refs.sidebar) refs.sidebar.inert = false;
          if (returnTo?.isConnected) returnTo.focus();
        }
      }
    };
  };
  var dialogHeader = (title, onClose) => el(
    "div",
    { class: "dlg-hd" },
    el("div", { class: "dlg-title" }, title),
    el("button", { class: "round", title: "Close (Esc)", "aria-label": "Close", onClick: onClose }, icon("close"))
  );
  var current = null;
  var toast = (message, { tone, warn: warn2 = false, iconName, action, ttl } = {}) => {
    uiLayer();
    current?.dismiss();
    if (warn2) tone = "warn";
    const node = el(
      "div",
      { class: `toast${tone ? ` ${tone}` : ""}${action ? " has-act" : ""}`, "aria-hidden": "true" },
      el("span", { class: "disc" }, icon(iconName || (tone === "warn" ? "alert" : "check"))),
      el("span", { class: "toast-msg" }, message)
    );
    const life = ttl ?? (action ? 8e3 : tone === "warn" ? 6e3 : 2e3);
    let timer = 0;
    const hold = () => clearTimeout(timer);
    const release = () => {
      clearTimeout(timer);
      timer = setTimeout(() => self.dismiss(), life);
    };
    const self = {
      dismiss() {
        clearTimeout(timer);
        node.remove();
        if (current === self) current = null;
      }
    };
    if (action) {
      node.removeAttribute("aria-hidden");
      node.appendChild(
        el(
          "button",
          {
            class: "toast-act",
            onClick: () => {
              self.dismiss();
              action.run();
            }
          },
          action.label
        )
      );
    }
    for (const [type, fn] of [["pointerenter", hold], ["pointerleave", release], ["focusin", hold], ["focusout", release]]) {
      node.addEventListener(type, fn);
    }
    current = self;
    layer.appendChild(node);
    live.textContent = message;
    release();
    return self;
  };
  var hints = (pairs) => el(
    "div",
    { class: "hints" },
    ...pairs.map(
      ([keys, what]) => el("span", { class: "hint" }, el("span", { class: "kbd" }, keys), what)
    )
  );

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
  var closingParen = (s, open3) => {
    let depth = 0;
    for (let i = open3; i < s.length; i++) {
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
      const open3 = m.index + m[0].length - 1;
      const close = closingParen(s, open3);
      out += s.slice(from, open3 + 1) + hide(s.slice(open3 + 1, close));
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
        const open3 = m.index + m[0].length - 1;
        const close = closingParen(masked, open3);
        const args = splitTopLevel(masked.slice(open3 + 1, close), ",");
        if (args.length > 1 && args.some((a) => STATE_TEST.test(restore2(a)))) {
          for (const a of args) {
            walk(restore2(`${masked.slice(0, open3 + 1)}${a}${masked.slice(close)}`), depth + 1);
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
      const open3 = m.index + m[0].length - 1;
      const close = closingParen(s, open3);
      if (m[1].toLowerCase() !== "where") {
        const best = splitSelectorList(s.slice(open3 + 1, close)).map(specificity).sort(compareSpecificity).pop() || [0, 0, 0];
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
  var shortPath = (path2) => {
    const p = String(path2 || "").split("?")[0];
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
      const layer2 = subLayer(ctx.layer, name);
      return { ...ctx, layer: layer2, layerRank: noteLayer(layer2) };
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
    const current2 = () => colorOf(read()) || { r: 0, g: 0, b: 0, a: 1 };
    const alphaNow = () => {
      const n = parseFloat(alpha.value);
      return Number.isNaN(n) ? current2().a : clamp2(n / 100, 0, 1);
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
      put(formatColor({ ...current2(), a: clamp2(n / 100, 0, 1) }));
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
      return "No screenshot access. Click the tsayru toolbar icon once";
    }
    if (/MAX_CAPTURE_VISIBLE_TAB|per second/i.test(s)) {
      return "Too many screenshots at once. Try again in a second";
    }
    return "Screenshot failed. The task is saved without it";
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
  var cropToDataUrl = (img, rect2) => {
    if (rect2.width === 0 || rect2.height === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(Math.max(0, (rect2.left - PADDING) * dpr));
    const sy = Math.round(Math.max(0, (rect2.top - PADDING) * dpr));
    const sxRight = Math.round(
      Math.min((rect2.left + rect2.width + PADDING) * dpr, img.width)
    );
    const syBottom = Math.round(
      Math.min((rect2.top + rect2.height + PADDING) * dpr, img.height)
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
    const ex = (rect2.left * dpr - sx) * outScale;
    const ey = (rect2.top * dpr - sy) * outScale;
    const ew = rect2.width * dpr * outScale;
    const eh = rect2.height * dpr * outScale;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr * outScale));
    ctx.strokeRect(ex, ey, ew, eh);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  };
  var withHiddenUI = async (fn) => {
    const nodes = [refs.ui, refs.styleHost].filter(Boolean);
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
    let rect2 = target.getBoundingClientRect();
    if (rect2.width === 0 || rect2.height === 0) return null;
    if (rect2.top < 0 || rect2.left < 0 || rect2.bottom > window.innerHeight || rect2.right > window.innerWidth) {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
      }
      await new Promise(
        (r) => requestAnimationFrame(() => requestAnimationFrame(r))
      );
      rect2 = target.getBoundingClientRect();
    }
    return withHiddenUI(async () => {
      const { dataUrl, error } = await requestFullCapture();
      if (!dataUrl) {
        reportCaptureError(error);
        return null;
      }
      const img = await loadImage(dataUrl);
      if (!img) return null;
      return cropToDataUrl(img, rect2);
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
  var openTab = (url) => {
    try {
      chrome.runtime.sendMessage({ type: "TSAYRU_OPEN_TAB", url });
    } catch {
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
      { class: "chat", title: entry.url, onClick: () => onPick(entry) },
      el("span", { class: "disc" }, icon("chat")),
      el(
        "span",
        { class: "chat-text" },
        el("span", { class: "chat-title" }, entry.title || "Untitled chat"),
        el("span", { class: "sel" }, urlLabel)
      ),
      entry.active ? el("span", { class: "now" }, "Open now") : el("span")
    );
  };
  var warning = (...children) => el("div", { class: "status warn" }, icon("alert"), el("div", {}, ...children));
  var open = null;
  var pickTargetChat = () => new Promise((resolve) => {
    open?.finish(null);
    let resolved = false;
    const finish2 = (value) => {
      if (resolved) return;
      resolved = true;
      dialog2.close();
      if (open?.finish === finish2) open = null;
      resolve(value);
    };
    const dialog2 = openDialog({
      className: "picker",
      label: "Send to which chat?",
      onEscape: () => finish2(null)
    });
    open = { finish: finish2 };
    const status = el("div", { class: "status" }, "Looking for open Claude chats\u2026");
    const list = el("div", { class: "chats" });
    const footer = el(
      "div",
      { class: "dlg-ft" },
      el("span", { class: "hints" }),
      el("button", { class: "btn quiet", onClick: () => finish2(null) }, "Cancel")
    );
    dialog2.dialog.append(dialogHeader("Send to which chat?", () => finish2(null)), status, list, footer);
    fetchOnlineTabs().then((res) => {
      if (resolved) return;
      list.replaceChildren();
      if (!res.ok) {
        status.replaceWith(
          isContextInvalidated(res.error) ? warning(`tsayru was updated. Reload this page (${IS_MAC ? "\u2318R" : "F5"}) and send again.`) : warning(`Couldn\u2019t list the open tabs (${res.error}). Close this and press Send again.`)
        );
        return;
      }
      const tabs = res.tabs;
      if (tabs.length === 0) {
        status.textContent = "No Claude chat is open. Open one, then press Send again.";
        const go = (url) => () => {
          openTab(url);
          finish2(null);
        };
        list.replaceWith(
          el(
            "div",
            { class: "opens" },
            el("button", { class: "btn primary", onClick: go("https://claude.ai/new") }, icon("external"), "Open claude.ai"),
            el("button", { class: "btn quiet", onClick: go("https://claude.com") }, "Open claude.com")
          )
        );
        return;
      }
      status.textContent = tabs.length === 1 ? "One Claude chat is open. The tasks are pasted in and sent right away." : "Pick a chat. The tasks are pasted in and sent right away.";
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
      list.querySelector(".chat")?.focus();
    });
  });

  // src/sidebar.js
  var flash = (msg, opts) => toast(msg, opts);
  var warn = (msg) => toast(msg, { tone: "warn" });
  window.addEventListener("tsayru-persist-error", (e) => {
    warn(e?.detail?.message || "Couldn\u2019t save tasks");
  });
  window.addEventListener("tsayru-capture-error", (e) => {
    warn(e?.detail?.message || "Screenshot failed");
  });
  var writeClipboard = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg, { iconName: "copy" });
    } catch (err) {
      console.warn("[tsayru] clipboard write failed:", err);
      warn("Couldn\u2019t copy to the clipboard. Try again");
    }
  };
  var copyAll = async () => {
    const tasks = visibleTasks();
    const text = formatTasks(state.tasks, state.filterHost, {
      filterTag: state.filterTag
    });
    if (!text) {
      warn("Nothing to copy yet");
      return;
    }
    await writeClipboard(text, `Copied ${tasks.length} task${plural(tasks.length)}`);
    postBatch(tasks, null).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save skipped:", p.error);
    });
  };
  var copyOne = async (task, displayIndex) => {
    await writeClipboard(formatTask(task, displayIndex), "Task copied");
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
    const label = target?.title || "the chat";
    postBatch(tasks, target).then((p) => {
      if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
    });
    const md = formatTasks(tasks, state.filterHost, {
      filterTag: state.filterTag,
      screenshotMode: "attached"
    });
    const images = tasks.map((t) => t.screenshot).filter(Boolean);
    flash(`Sending to ${label}\u2026`, { iconName: "send", ttl: 2e4 });
    const inject = await pushToWebChat(target.tabId, md, images);
    if (inject.ok) {
      flash(`Sent to ${label}`, { iconName: "send" });
      return;
    }
    console.warn("[tsayru] inject failed:", inject.error);
    if (isContextInvalidated2(inject.error)) {
      warn(`tsayru was updated. Reload this page (${IS_MAC ? "\u2318R" : "F5"}) and send again`);
    } else if (/chat input not found/i.test(String(inject.error))) {
      warn("No chat input on that tab. Open a chat there and try again");
    } else {
      warn(`Couldn\u2019t send to ${label}. Open that chat and try again`);
    }
  };
  var sendToServer = async () => {
    const tasks = visibleTasks();
    if (tasks.length === 0) {
      warn("Nothing to send yet");
      return;
    }
    const target = await pickTargetChat();
    if (target === null) return;
    sendBatch(tasks, target);
  };
  var pollDoneStatus = () => {
    if (!refs.sidebar || refs.sidebar.classList.contains("hidden")) return;
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
    toast(`Cleared ${removed.length} task${plural(removed.length)}`, {
      tone: "danger",
      iconName: "trash",
      action: {
        label: "Undo",
        run: () => {
          state.tasks.push(...removed);
          persist();
          renderSidebar();
        }
      }
    });
  };
  var actButton = (name, label, onClick2, extra = "") => el("button", { class: `act${extra}`, title: label, "aria-label": label, onClick: onClick2 }, icon(name));
  var editDraft = null;
  var editTask = (idx) => {
    state.editingTaskIndex = idx;
    editDraft = null;
    renderSidebar();
  };
  var deleteTask = (idx) => {
    const [removed] = state.tasks.splice(idx, 1);
    if (state.editingTaskIndex === idx) state.editingTaskIndex = null;
    else if (state.editingTaskIndex !== null && state.editingTaskIndex > idx) {
      state.editingTaskIndex -= 1;
    }
    persist();
    renderSidebar();
    toast("Task deleted", {
      tone: "danger",
      iconName: "trash",
      action: {
        label: "Undo",
        run: () => {
          state.tasks.splice(Math.min(idx, state.tasks.length), 0, removed);
          persist();
          renderSidebar();
        }
      }
    });
  };
  var renderEditor = (task, idx) => {
    const ta = el("textarea", {
      class: "field",
      rows: 3,
      "aria-label": "Task text",
      placeholder: "What should change here?"
    });
    ta.value = editDraft ?? task.text;
    ta.addEventListener("input", () => {
      editDraft = ta.value;
    });
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
      editDraft = null;
      persist();
      renderSidebar();
    };
    const cancel = () => {
      state.editingTaskIndex = null;
      editDraft = null;
      renderSidebar();
    };
    ta.__tsayruKey = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        save();
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return true;
      }
      return false;
    };
    return el(
      "div",
      { class: "edit" },
      ta,
      el(
        "div",
        { class: "edit-ft" },
        el("button", { class: "btn quiet small", onClick: cancel }, "Cancel", el("span", { class: "kbd-in" }, "Esc")),
        el("button", { class: "btn ink small", onClick: save }, "Save", el("span", { class: "kbd-in" }, "\u21B5"))
      )
    );
  };
  var renderTask = (task, idx, displayNum) => {
    const editing = state.editingTaskIndex === idx;
    const styleTask = !!task.styleChanges?.length;
    return el(
      "div",
      {
        class: "task" + (task.done ? " done" : "") + (editing ? " editing" : ""),
        onMouseEnter: () => onTaskHover(task.selector),
        onMouseLeave: onTaskLeave
      },
      el(
        "div",
        { class: "num", title: task.done ? "Done \u2014 Claude marked it" : null },
        task.done ? icon("check") : String(displayNum)
      ),
      el(
        "div",
        { class: "body" },
        el(
          "div",
          { class: "row1" },
          el("span", { class: "label", title: task.label }, task.label),
          editing ? null : el(
            "div",
            { class: "acts" },
            actButton("copy", "Copy this task", () => copyOne(task, displayNum)),
            actButton("edit", "Edit task", () => editTask(idx)),
            actButton("close", "Delete task", () => deleteTask(idx), " danger")
          )
        ),
        el("div", { class: "sel", title: task.selector }, task.selector),
        editing ? renderEditor(task, idx) : (
          // Style-editor tasks speak through their change list; no nag for text.
          task.text || !styleTask ? el("div", { class: "text" + (task.text ? "" : " empty") }, task.text || "No note yet") : null
        ),
        styleTask && !editing ? styleSummary(task.styleChanges) : null
      )
    );
  };
  var styleSummary = (changes) => {
    const props = [...new Set(changes.map((c) => c.property))];
    return el(
      "div",
      {
        class: "styled",
        title: changes.map((c) => `${c.property}: ${c.before ?? "\u2014"} \u2192 ${c.after ?? "removed"}`).join("\n")
      },
      el("span", { class: "chip" }, icon("sliders"), `${changes.length} style change${plural(changes.length)}`),
      el("span", { class: "props" }, props.join(", "))
    );
  };
  var renderFilters = (hosts, hostScoped, allTags) => {
    const box = refs.sidebar.querySelector(".filters");
    box.replaceChildren();
    if (hosts.length > 1) {
      const seg = el("div", { class: "seg", role: "tablist", "aria-label": "Sites" });
      const mkTab = (label, value, count) => el(
        "button",
        {
          class: state.filterHost === value ? "on" : "",
          role: "tab",
          "aria-selected": String(state.filterHost === value),
          title: label,
          onClick: () => {
            state.filterHost = value;
            renderSidebar();
          }
        },
        el("span", {}, label),
        el("span", { class: "n" }, String(count))
      );
      seg.appendChild(mkTab("All", null, state.tasks.length));
      for (const h of hosts) {
        seg.appendChild(mkTab(h, h, state.tasks.filter((t) => safeHost(t.url) === h).length));
      }
      box.appendChild(seg);
    }
    if (allTags.length > 0) {
      const row = el("div", { class: "tags" });
      for (const tag of allTags) {
        const n = hostScoped.filter((t) => taskTags(t.text).includes(tag)).length;
        const active = state.filterTag === tag;
        row.appendChild(
          el(
            "button",
            {
              class: "tag" + (active ? " on" : ""),
              "aria-pressed": String(active),
              title: active ? "Show all tags" : `Only tasks tagged #${tag}`,
              onClick: () => {
                state.filterTag = active ? null : tag;
                renderSidebar();
              }
            },
            icon("hash"),
            tag,
            el("span", { class: "n" }, String(n))
          )
        );
      }
      box.appendChild(row);
    }
    box.hidden = !box.childElementCount;
  };
  var STEPS = [
    ["Pick an element", "Press the blue key and click anything."],
    ["Say what should change", "Plain words are enough. Enter adds the task."],
    ["Send to Claude", "Screenshots and source files go along."]
  ];
  var renderEmpty = (list) => {
    if (state.filterHost || state.filterTag) {
      list.appendChild(
        el(
          "div",
          { class: "nothing" },
          "No tasks match this filter.",
          el(
            "button",
            {
              onClick: () => {
                state.filterHost = null;
                state.filterTag = null;
                renderSidebar();
              }
            },
            "Show all tasks"
          )
        )
      );
      return;
    }
    list.appendChild(
      el(
        "ol",
        { class: "steps" },
        ...STEPS.map(
          ([title, line], i) => el(
            "li",
            {},
            el("span", { class: "num" }, String(i + 1)),
            el("div", {}, el("b", {}, title), el("p", {}, line))
          )
        )
      )
    );
  };
  var renderDeck = () => {
    const picking = state.inspecting;
    const styling = picking && state.pickMode === "style";
    const pick = refs.sidebar.querySelector(".pick");
    pick.classList.toggle("on", picking);
    pick.setAttribute("aria-pressed", String(picking));
    pick.querySelector(".disc").replaceChildren(icon(styling ? "sliders" : "target"));
    pick.querySelector(".pick-title").textContent = !picking ? "Pick an element" : styling ? "Click to restyle" : "Click any element";
    pick.querySelector(".pick-sub").hidden = !picking;
    pick.querySelector(".led").hidden = !picking;
    const restyle = refs.sidebar.querySelector(".deck .square");
    restyle.classList.toggle("on", styling);
    restyle.setAttribute("aria-pressed", String(styling));
  };
  var renderSidebar = () => {
    if (!refs.sidebar) return;
    const list = refs.sidebar.querySelector(".list");
    list.replaceChildren();
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
    renderFilters(hosts, hostScoped, allTags);
    const filtered = visibleTasks();
    if (filtered.length === 0) {
      renderEmpty(list);
    } else {
      filtered.forEach((task, fi) => {
        const idx = state.tasks.indexOf(task);
        list.appendChild(renderTask(task, idx, fi + 1));
      });
    }
    const n = state.tasks.length;
    refs.sidebar.querySelector(".tally").textContent = n ? `${n} task${plural(n)}` : "No tasks";
    for (const b of refs.sidebar.querySelectorAll(".ship button")) {
      b.disabled = filtered.length === 0;
    }
    renderDeck();
  };
  var ensureSidebar = () => {
    if (refs.sidebar) return;
    const quick = IS_MAC ? "\u2325 click" : "Alt click";
    const restyleKeys = IS_MAC ? "\u2318 click" : "Ctrl click";
    refs.sidebar = el(
      "div",
      { class: "panel shell", role: "complementary", "aria-label": "tsayru" },
      grain(),
      el(
        "div",
        { class: "hd" },
        el("div", { class: "mark" }, brandMark()),
        el("div", { class: "word" }, "tsayru"),
        el("div", { class: "tally" }, "No tasks"),
        el(
          "button",
          {
            class: "round",
            title: "Hide the panel (turns picking off)",
            "aria-label": "Hide the panel",
            onClick: () => hideSidebar()
          },
          icon("hide")
        )
      ),
      el(
        "div",
        { class: "deck" },
        el(
          "button",
          {
            class: "pick",
            title: "Click an element on the page to add a task about it",
            onClick: () => toggleInspector()
          },
          el("span", { class: "disc" }, icon("target")),
          el(
            "span",
            { class: "pick-label" },
            el("span", { class: "pick-title" }, "Pick an element"),
            el("span", { class: "pick-sub", hidden: true }, "Esc to stop")
          ),
          el("span", { class: "led", hidden: true })
        ),
        el(
          "button",
          {
            class: "square",
            title: `Click an element to restyle it (or ${restyleKeys} it any time)`,
            onClick: () => toggleStylePick()
          },
          icon("sliders"),
          "Restyle"
        )
      ),
      hints([
        [quick, "Quick add"],
        [restyleKeys, "Restyle"]
      ]),
      el("div", { class: "groove" }),
      el("div", { class: "filters", hidden: true }),
      el("div", { class: "list" }),
      el("div", { class: "groove" }),
      el(
        "div",
        { class: "ship" },
        el(
          "button",
          {
            class: "send",
            title: "Paste the tasks into an open Claude chat and send them",
            onClick: sendToServer
          },
          el("span", { class: "disc" }, icon("send")),
          el("span", { class: "send-label" }, "Send to Claude")
        ),
        el(
          "button",
          { class: "square", title: "Copy the tasks as Markdown", onClick: copyAll },
          icon("copy"),
          "Copy"
        ),
        el(
          "button",
          { class: "square danger", title: "Clear the tasks in view (you can undo)", onClick: clearTasks },
          icon("trash"),
          "Clear"
        )
      )
    );
    uiLayer().appendChild(refs.sidebar);
    ensureDonePolling();
    renderSidebar();
  };

  // src/modal.js
  var dialog = null;
  var closeModal = () => {
    if (dialog) {
      dialog.close();
      dialog = null;
      refs.modal = null;
    }
  };
  var requestClose = () => {
    const ta = refs.modal?.querySelector(".field");
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
    const ta = refs.modal.querySelector(".field");
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
    const submit = () => submitTask(selector, label, frameworkPromise, ctx);
    dialog = openDialog({ label: "New task", onEscape: requestClose });
    refs.modal = dialog.scrim;
    const ta = el("textarea", {
      class: "field",
      placeholder: "What should change here?",
      "aria-label": "What should change here?",
      rows: 4
    });
    ta.__tsayruKey = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
        return true;
      }
      return false;
    };
    dialog.dialog.append(
      dialogHeader("New task", requestClose),
      el(
        "div",
        { class: "target" },
        ctx.screenshot ? el("img", { class: "shot", src: ctx.screenshot, alt: "" }) : null,
        el(
          "div",
          { class: "target-meta" },
          el("b", { title: label }, label),
          el("span", { class: "sel" }, selector)
        )
      ),
      ta,
      el(
        "div",
        { class: "dlg-ft" },
        hints([["Enter", "add"], [IS_MAC ? "\u21E7 Enter" : "Shift Enter", "new line"]]),
        el("button", { class: "btn quiet", onClick: requestClose }, "Cancel"),
        el("button", { class: "btn primary", onClick: submit }, "Add task")
      )
    );
    ta.focus();
  };

  // src/stylequick.js
  var WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
  var ALIGNS = ["start", "left", "center", "right", "justify", "end"];
  var BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"];
  var shadowSection = (api, syncers) => {
    let layers = [];
    let shown2 = null;
    const list = el("div", { class: "layers" });
    const write = () => api.setInline("box-shadow", formatShadows(layers));
    const lengthBox = (layer2, key, label) => {
      const input = el("input", { class: "in", spellcheck: "false", value: trimPx(layer2[key]), title: `${label}, px` });
      const apply = () => {
        layer2[key] = withUnit(key, input.value) || "0px";
        write();
      };
      input.addEventListener("input", apply);
      bindKeys(input, { prop: key, fallback: () => layer2[key], apply });
      return el("label", { class: "mini" }, el("span", {}, label), input);
    };
    const layerRow = (layer2, i) => {
      const color = colorControl({
        read: () => layer2.color,
        write: (value) => {
          if (!CSS.supports("color", value)) return false;
          layer2.color = value;
          write();
          return true;
        },
        focused: () => api.focused()
      });
      color.sync();
      const inset = el("input", { type: "checkbox" });
      inset.checked = layer2.inset;
      inset.addEventListener("change", () => {
        layer2.inset = inset.checked;
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
          lengthBox(layer2, "x", "X"),
          lengthBox(layer2, "y", "Y"),
          lengthBox(layer2, "blur", "Blur"),
          lengthBox(layer2, "spread", "Spread")
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
      shown2 = api.computed().getPropertyValue("box-shadow");
      layers = parseShadows(shown2);
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
      if (api.computed().getPropertyValue("box-shadow") !== shown2) render();
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
      const shown2 = `${d.value}${d.important ? " !important" : ""}`;
      const chk = ad.canToggle ? el("input", { type: "checkbox", class: "chk", title: off ? "Turn back on" : "Turn off" }) : el("span");
      if (ad.canToggle) chk.checked = !off;
      const nameIn = el("input", { class: "in dn", spellcheck: "false", value: name, list: "tsayru-props", title: name });
      const valueIn = el("input", { class: "in dv", spellcheck: "false", value: shown2, title: shown2 });
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
    let current2 = null;
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
    const close = el(
      "button",
      { class: "ic", title: "Close and save as a task (Esc)", "aria-label": "Close", onClick: () => api.close() },
      icon("close")
    );
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
      done.classList.toggle("primary", n > 0);
    };
    const show = (name, force2 = false) => {
      if (name === tab && !force2) return;
      tab = lastTab = name;
      tabs.quick.classList.toggle("on", name === "quick");
      tabs.css.classList.toggle("on", name === "css");
      if (name === "quick") api.force(null);
      const scroll = body.scrollTop;
      current2 = name === "quick" ? quickTab(api) : rulesTab(api);
      body.replaceChildren(current2.node);
      if (force2) body.scrollTop = scroll;
      updateCount();
    };
    const panel = el(
      "div",
      { class: "panel shell" },
      grain(),
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
      current2?.refresh?.();
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
  var PANEL_CSS = THEME_CSS + `
.panel {
  position: absolute;
  pointer-events: auto;
  width: 340px;
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  color: var(--ink);
  border-radius: 24px;
  font: 12px/1.4 var(--font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-synthesis: none;
  overflow: hidden;
  text-align: left;
  animation: panel-in 220ms var(--ease-out);
}
@keyframes panel-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }

/* header */
.hd { display: flex; align-items: center; gap: 6px; padding: 12px 8px 4px 16px; cursor: grab; user-select: none; }
.hd:active { cursor: grabbing; }
.hd-main { flex: 1; min-width: 0; }
.hd-title { font: 600 13px/1.35 var(--mono); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-sub { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-2);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 18px;
  line-height: 32px;
  padding: 0;
  flex: none;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.ic svg.i { width: 18px; height: 18px; }
.ic.small { width: 24px; height: 24px; line-height: 24px; font-size: 14px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 1px 4px; padding: 0 16px 8px; font: 11px/1.4 var(--mono); color: var(--text-3); }
.crumb { appearance: none; border: 0; background: none; padding: 0; color: var(--text-3); cursor: pointer; font: inherit; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb.cur { color: var(--ink); font-weight: 600; cursor: default; }
.warn { margin: 0 12px 8px; padding: 8px 10px; border-radius: 12px; background: var(--caution-soft); color: var(--caution-text); font-size: 12px; font-weight: 550; }

/* tabs: a segmented control, like the sidebar's host filter */
.tabs { display: flex; align-items: center; gap: 2px; margin: 0 12px 8px; padding: 3px; border-radius: 13px; background: var(--well); }
.tab { appearance: none; border: 0; background: none; color: var(--text-2); font-weight: 650; font-size: 12.5px; height: 28px; padding: 0 12px; border-radius: 10px; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out; }
.tab.on { background: var(--key); color: var(--ink); box-shadow: var(--shadow-key); }
.count { margin-left: auto; padding-right: 8px; font-size: 12px; font-weight: 600; color: var(--text-3); font-variant-numeric: tabular-nums; }
.count.has { color: var(--signal-text); }

.body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 12px 10px; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; border: 2px solid var(--shell); }

/* footer */
.ft { display: flex; gap: 6px; align-items: center; padding: 10px; border-top: 1px solid var(--line); box-shadow: inset 0 1px 0 var(--groove); }
.ft .note { flex: 1; min-width: 0; height: 36px; font: 13px var(--font); padding: 0 12px; border-radius: 12px; }
.btn { appearance: none; height: 36px; border-radius: 12px; padding: 0 12px; font-weight: 650; font-size: 12.5px; cursor: pointer; background: var(--key); color: var(--ink); border: 1px solid transparent; box-shadow: var(--shadow-key); white-space: nowrap; transition: background-color 150ms ease-out, box-shadow 150ms ease-out, scale var(--press); }
.btn:not(:disabled):active { scale: 0.96; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: var(--signal); color: var(--on-signal); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22); }
.btn.primary:focus-visible { outline-color: var(--ink); }

/* inputs: a well with a boundary you can see (3:1 against the shell) */
.in { width: 100%; min-width: 0; height: 26px; background: var(--well); color: var(--ink); border: 1px solid var(--field-line); border-radius: 8px; padding: 0 7px; font: 12px/24px var(--mono); outline: none; transition: border-color 150ms ease-out, background-color 150ms ease-out; }
.in::placeholder { color: var(--text-2); }
.in:focus { border-color: var(--signal); background: var(--key); box-shadow: 0 0 0 1px var(--signal); }
.in.changed { color: var(--signal-text); font-weight: 600; }
.in.bad, .in.bad:focus { border-color: var(--danger-text); box-shadow: 0 0 0 1px var(--danger-text); }
select.in { padding: 0 3px; cursor: pointer; }

/* quick tab */
.sec { padding: 10px 0 9px; border-bottom: 1px solid var(--line); }
.sec:last-child { border-bottom: 0; }
.sec-hd { display: flex; align-items: center; justify-content: space-between; min-height: 20px; margin-bottom: 6px; font-size: 12.5px; font-weight: 700; color: var(--ink); }
.row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 6px; margin: 5px 0; }
.lbl { color: var(--text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.lbl.changed { color: var(--signal-text); font-weight: 600; cursor: pointer; }
.lbl.changed::after { content: " \u21BA"; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.color { display: grid; grid-template-columns: 26px minmax(0, 1fr) 54px; gap: 6px; align-items: center; }
.alpha { position: relative; display: block; }
.alpha::after { content: "%"; position: absolute; right: 7px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; font-size: 11px; }
.alpha .in { padding-right: 18px; }
.sw { position: relative; display: block; width: 26px; height: 26px; border-radius: 8px; overflow: hidden; background: repeating-conic-gradient(#b8b8b4 0 25%, #f5f4f2 0 50%) 0 0 / 8px 8px; box-shadow: inset 0 0 0 1px var(--field-line); cursor: pointer; }
.sw.small { width: 15px; height: 15px; border-radius: 4px; flex: none; }
.sw-fill { position: absolute; inset: 0; }
.sw input { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); opacity: 0; cursor: pointer; border: 0; padding: 0; }
.presets { display: flex; gap: 3px; }
.pill { appearance: none; border: 1px solid transparent; background: var(--key); box-shadow: var(--shadow-key); color: var(--text-2); border-radius: 999px; padding: 1px 8px; font-size: 11.5px; font-weight: 650; cursor: pointer; transition: color 150ms ease-out; }
.layer { background: var(--key); box-shadow: var(--shadow-key); border-radius: 12px; padding: 7px; margin: 6px 0; }
.quad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.mini { display: flex; flex-direction: column; gap: 2px; }
.mini span { font-size: 11px; color: var(--text-3); }
.layer-ft { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; margin-top: 6px; }
.check { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 12px; cursor: pointer; user-select: none; }
.check input, .chk { margin: 0; accent-color: var(--signal); cursor: pointer; }
.link { appearance: none; border: 0; background: none; color: var(--signal-text); font-weight: 650; font-size: 12px; padding: 4px 0; cursor: pointer; }

/* box model: DevTools' margin / padding / content colours */
.box { position: relative; display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; grid-template-rows: auto auto auto; gap: 4px; align-items: center; justify-items: center; padding: 18px 5px 5px; border: 1px dashed rgb(217 119 6 / 0.55); border-radius: 12px; background: rgb(217 119 6 / 0.07); }
.box.pad { width: 100%; border-color: rgb(22 163 74 / 0.55); background: rgb(22 163 74 / 0.07); }
.box-tag { position: absolute; top: 3px; left: 8px; font-size: 11px; font-weight: 600; color: var(--text-3); }
.box > .t { grid-area: 1 / 2; }
.box > .l { grid-area: 2 / 1; }
.box > .c { grid-area: 2 / 2; }
.box > .r { grid-area: 2 / 3; }
.box > .b { grid-area: 3 / 2; }
.box-in { width: 48px; text-align: center; padding: 0 2px; }
.content { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; padding: 6px 4px; border: 1px solid color-mix(in oklab, var(--signal) 45%, transparent); border-radius: 8px; background: var(--signal-soft); color: var(--text-3); }
.box-in.wide { width: 64px; }

/* css tab */
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 2px 0 8px; }
.chip { appearance: none; border: 1px solid transparent; background: var(--key); box-shadow: var(--shadow-key); color: var(--ink); border-radius: 999px; height: 26px; padding: 0 10px; font-size: 12px; font-weight: 650; cursor: pointer; transition: background-color 150ms ease-out; }
.chip.empty { color: var(--text-3); box-shadow: none; background: transparent; }
.chip.on { background: var(--signal); color: var(--on-signal); box-shadow: none; }
.chip .n { margin-left: 4px; font-weight: 500; opacity: 0.7; }
.refresh { margin-left: auto; }
.status { margin: -2px 0 8px; font-size: 12px; color: var(--caution-text); }
.card { background: var(--key); box-shadow: var(--shadow-key); border-radius: 14px; margin-bottom: 8px; overflow: hidden; }
.card.created { box-shadow: inset 0 0 0 1.5px var(--signal); }
.card.inactive { opacity: 0.55; }
.card-hd { padding: 8px 10px 6px; border-bottom: 1px solid var(--line); }
.sel { font: 600 12px/1.35 var(--mono); color: var(--ink); word-break: break-word; }
.card.inline .sel { color: var(--text-2); }
.more { font-weight: 400; color: var(--text-3); }
.meta { margin-top: 2px; font-size: 11.5px; color: var(--text-3); word-break: break-word; }
.meta b { font-weight: 650; color: var(--caution-text); }
.decls { padding: 4px 6px 5px; }
.decl { position: relative; display: grid; grid-template-columns: 14px auto minmax(0, 1fr) 18px; gap: 3px; align-items: center; margin: 1px 0; }
.decl .dn { width: 112px; }
@supports (field-sizing: content) {
  .decl .dn { width: auto; field-sizing: content; min-width: 44px; max-width: 176px; }
}
/* Declarations read like code; their fields appear on hover and focus. */
.decl .in { height: 22px; line-height: 20px; padding: 0 4px; background: transparent; border-color: transparent; }
.decl .in:focus { background: var(--well); border-color: var(--signal); box-shadow: 0 0 0 1px var(--signal); }
.decl .dn { color: var(--code-prop); }
.decl.changed::before { content: ""; position: absolute; left: -5px; top: 4px; bottom: 4px; width: 2px; border-radius: 2px; background: var(--signal); }
.decl.over .in { text-decoration: line-through; color: var(--text-3); }
.decl.off .in { text-decoration: line-through; color: var(--text-3); opacity: 0.8; }
.decl.add .dn { color: var(--text-2); }
.vwrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sw-slot:empty { display: none; }
.x { appearance: none; border: 0; background: none; color: var(--text-3); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; visibility: hidden; }
.decl:focus-within .x { visibility: visible; }
@media (hover: none) { .x { visibility: visible; } }
.muted { font-size: 12px; color: var(--text-3); margin: 4px 0 8px; }

@media (hover: hover) {
  .ic:hover { background: var(--key); color: var(--ink); }
  .crumb:hover { color: var(--signal-text); }
  .tab:hover { color: var(--ink); }
  .btn:hover:not(:disabled) { background: var(--key-hover); box-shadow: var(--shadow-key-hover); }
  .btn.primary:hover:not(:disabled) { background: color-mix(in oklab, var(--signal) 90%, white); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22); }
  .pill:hover { color: var(--ink); }
  .link:hover { text-decoration: underline; }
  .chip:hover:not(.on) { background: var(--key-hover); }
  .decl .in:hover:not(:focus) { border-color: var(--line); }
  .decl:hover .x { visibility: visible; }
  .x:hover { color: var(--danger-text); }
}

/* the target's outline (a sibling of the panel, outside it) */
.outline { position: absolute; left: 0; top: 0; display: none; border: 2px dashed var(--signal); border-radius: 4px; pointer-events: none; }
.outline.preview { border-style: solid; border-color: var(--led); }
.outline-tag {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 5px);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--signal);
  color: var(--on-signal);
  font: 650 12px/1 var(--font);
  white-space: nowrap;
}
.outline-tag span { opacity: 0.75; font-weight: 550; font-variant-numeric: tabular-nums; }
.outline.below .outline-tag { bottom: auto; top: calc(100% + 5px); }
.outline.preview .outline-tag { background: var(--led); color: #000; }

@media (prefers-reduced-motion: reduce) {
  .panel { animation-name: fade; }
}
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
  var host2 = null;
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
    flash(plan.existing ? `Style task updated: ${what}` : `Style task saved: ${what}`, { iconName: "sliders" });
  };
  var onPageHide = () => {
    const s = session;
    const plan = s && planSave(s);
    if (!plan) return;
    applySave(s, plan, { framework: s.framework });
    persist();
  };
  var onPanelKey = (e) => {
    if (e.type === "keydown" && e.key === "Escape") {
      e.preventDefault();
      closeStyleEditor();
    }
  };
  var tagOf = (node) => {
    const id = node.id ? `#${node.id}` : "";
    const cls = [...node.classList].filter((c) => !c.startsWith("tsayru-")).slice(0, 2).map((c) => `.${c}`).join("");
    return `${node.tagName.toLowerCase()}${id}${cls}`;
  };
  var track = () => {
    if (!host2) return;
    host2.raf = requestAnimationFrame(track);
    const node = host2.preview || session?.target;
    const box = host2.outline;
    if (!node || !node.isConnected) {
      box.style.display = "none";
      host2.last = "";
      if (session && node === session.target) session.onDetached?.();
      return;
    }
    const r = node.getBoundingClientRect();
    const key = `${r.left}|${r.top}|${r.width}|${r.height}|${!!host2.preview}`;
    if (key === host2.last) return;
    host2.last = key;
    box.style.display = "block";
    box.style.transform = `translate(${r.left}px, ${r.top}px)`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    box.classList.toggle("preview", !!host2.preview);
    box.classList.toggle("below", r.top < 34);
    const [name, size] = box.firstChild.children;
    name.textContent = tagOf(node);
    size.textContent = `${Math.round(r.width)} \xD7 ${Math.round(r.height)}`;
  };
  var ensureHost = () => {
    if (host2) return host2;
    const shell = createShadowHost({
      tag: "tsayru-style",
      className: "tsayru-style-host",
      css: PANEL_CSS,
      onKey: onPanelKey
    });
    const outline = el("div", { class: "outline" }, el("div", { class: "outline-tag" }, el("b"), el("span")));
    shell.root.appendChild(outline);
    window.addEventListener("pagehide", onPageHide);
    ensureFonts();
    refs.styleHost = shell.node;
    host2 = { shell, node: shell.node, root: shell.root, outline, panel: null, preview: null, raf: 0, last: "" };
    host2.raf = requestAnimationFrame(track);
    return host2;
  };
  var destroyHost = () => {
    if (!host2) return;
    cancelAnimationFrame(host2.raf);
    window.removeEventListener("pagehide", onPageHide);
    host2.shell.destroy();
    refs.styleHost = null;
    host2 = null;
  };
  var PANEL_W = 340;
  var SIDEBAR_W = 368;
  var MARGIN = 12;
  var clampPos = ({ left, top }) => ({
    left: Math.max(MARGIN - PANEL_W + 80, Math.min(left, innerWidth - 80)),
    top: Math.max(0, Math.min(top, innerHeight - 40))
  });
  var placePanel = (panel, target) => {
    let pos = lastPos;
    if (!pos) {
      const r = target.getBoundingClientRect();
      const rightSide = innerWidth - PANEL_W - MARGIN - (sidebarVisible() ? SIDEBAR_W + MARGIN : 0);
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
    focused: () => host2?.root.activeElement || null,
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
      if (host2) host2.preview = node || null;
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
        flash("Couldn\u2019t save the style task. Close the editor again to retry", { tone: "warn" });
      }
    }
    force(s, null);
    if (host2?.panel) {
      host2.panel.remove();
      host2.panel = null;
      host2.preview = null;
    }
    if (session === s) session = null;
  };
  var open2 = async (target, deep) => {
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
    host2.panel = panel;
    host2.root.appendChild(panel);
    placePanel(panel, target);
  };
  var isStyleEditorOpen = () => !!session;
  var openStyleEditor = (target, { deep } = {}) => {
    queue = queue.then(() => open2(target, deep)).catch((err) => console.warn("[tsayru] style editor:", err));
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
    refs.highlight = el(
      "div",
      { class: "hl" },
      el("div", { class: "hl-tag" }, el("b"), el("span"))
    );
    uiLayer().appendChild(refs.highlight);
  };
  var shown = null;
  var moveHighlight = (target) => {
    if (!refs.highlight) return;
    if (target && !sidebarVisible()) target = null;
    shown = target || null;
    const hl = refs.highlight;
    if (!target) {
      hl.style.display = "none";
      return;
    }
    const r = target.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.transform = `translate(${r.left - 3}px, ${r.top - 3}px)`;
    hl.style.width = `${r.width + 6}px`;
    hl.style.height = `${r.height + 6}px`;
    hl.classList.toggle("below", r.top < 40 && r.bottom < innerHeight - 40);
    hl.classList.toggle("inside", r.top < 40 && r.bottom >= innerHeight - 40);
    const [name, size] = hl.firstChild.children;
    name.textContent = describeNode(target, 2);
    size.textContent = `${Math.round(r.width)} \xD7 ${Math.round(r.height)}`;
  };
  var setInspecting = (on, mode = "task") => {
    state.inspecting = on;
    state.pickMode = on ? mode : "task";
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
    refs.sidebar.classList.remove("hidden");
  };
  var hideSidebar = () => {
    if (refs.sidebar) refs.sidebar.classList.add("hidden");
    if (state.inspecting) setInspecting(false);
    moveHighlight(null);
    state.editingTaskIndex = null;
    closeStyleEditor();
  };
  var toggleSidebar = () => {
    ensureOverlay();
    ensureSidebar();
    if (refs.sidebar.classList.contains("hidden")) {
      showSidebar();
    } else {
      hideSidebar();
    }
  };
  var toggleInspector = () => {
    showSidebar();
    setInspecting(!(state.inspecting && state.pickMode === "task"), "task");
  };
  var toggleStylePick = () => {
    showSidebar();
    setInspecting(!(state.inspecting && state.pickMode === "style"), "style");
  };
  var isOurChrome = (node) => isOurHost(node);
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
    const styling = !state.inspecting || state.pickMode === "style";
    const target = deep && styling ? pickStyleTarget(deep) : deep;
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
    if (state.pickMode === "style") {
      setInspecting(false);
      openStyleEditor(pickStyleTarget(target), { deep: target });
      return;
    }
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
    bus.on("ui-key", (e) => e.type === "keyup" ? onKeyUp(e) : e.type === "keydown" && onKeyDown(e));
    bus.on("task-added", () => {
      if (sidebarVisible()) setInspecting(true);
    });
    const follow = () => {
      if (shown) moveHighlight(shown.isConnected ? shown : null);
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
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
