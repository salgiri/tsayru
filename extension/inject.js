(() => {
  if (window.__tsayruInjectInstalled) return;
  window.__tsayruInjectInstalled = true;

  // ---------- Page-error buffer (MAIN world) ----------
  // Sees what the content script can't: console.error calls (React dev
  // warnings live here) and unhandled promise rejections (realm-local).
  // Installed only from the moment the inspector is first used on the page.

  const pageErrors = [];
  const pushErr = (message, source) => {
    let msg = String(message || "").replace(/`/g, "'").replace(/\s+/g, " ").slice(0, 200);
    if (!msg) return;
    const last = pageErrors[pageErrors.length - 1];
    if (last && last.message === msg) {
      last.count = (last.count || 1) + 1;
      last.at = Date.now();
      return;
    }
    pageErrors.push({ message: msg, source: source || null, count: 1, at: Date.now() });
    if (pageErrors.length > 10) pageErrors.shift();
  };

  const shortSource = (filename, lineno) => {
    if (!filename) return null;
    const tail = String(filename).split("/").slice(-2).join("/");
    return lineno ? `${tail}:${lineno}` : tail;
  };

  window.addEventListener("error", (e) => {
    if (e.message) pushErr(e.message, shortSource(e.filename, e.lineno));
  });

  window.addEventListener("unhandledrejection", (e) => {
    let m = "";
    try {
      m = String((e.reason && (e.reason.message || e.reason)) || "");
    } catch {}
    pushErr(`unhandled rejection: ${m || "(no message)"}`);
  });

  // Wrap console.error to catch framework dev warnings ("Each child in a
  // list should have a unique key…"). Original behavior is preserved.
  const origConsoleError = console.error;
  console.error = function (...args) {
    try {
      const text = args
        .map((a) => {
          if (typeof a === "string") return a;
          try {
            return (a && a.message) || JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");
      pushErr(text);
    } catch {}
    return origConsoleError.apply(this, args);
  };

  const reactFiberKey = (el) =>
    Object.keys(el).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$"),
    );

  const fiberTypeName = (t) => {
    if (typeof t === "function") {
      const name = t.displayName || t.name;
      if (name && name !== "_default" && name !== "Anonymous") return name;
      return null;
    }
    if (t && typeof t === "object") {
      const inner = t.render || t.type; // forwardRef / memo wrappers
      if (typeof inner === "function") {
        const name = inner.displayName || inner.name;
        if (name) return name;
      }
      if (typeof t.displayName === "string") return t.displayName;
    }
    return null;
  };

  // Breadcrumbs: up to `max` component names walking outward from the clicked
  // element (innermost first) — "SaveButton, SettingsPage, App". Gives Claude
  // the location in the component tree, not just the leaf name.
  const reactComponentChain = (fiber, max = 5) => {
    const names = [];
    let node = fiber;
    let depth = 0;
    while (node && depth < 60 && names.length < max) {
      const name = fiberTypeName(node.type);
      if (name && names[names.length - 1] !== name) names.push(name);
      node = node.return;
      depth++;
    }
    return names;
  };

  // Walk up the fiber tree to find the closest node with a `_debugSource`.
  // The host fiber for a plain JSX element (e.g. `<header>`) often lacks one;
  // the source lives on the owner / containing component fiber further up.
  // NOTE: `_debugSource` exists only on React ≤18 dev builds with the babel
  // source plugin — React 19 removed it. See the `_debugStack` fallback below.
  const reactDebugSource = (fiber) => {
    let node = fiber;
    let depth = 0;
    while (node && depth < 30) {
      if (node._debugSource) return node._debugSource;
      node = node.return;
      depth++;
    }
    return null;
  };

  // React 19 fallback: dev builds attach `_debugStack` (an Error captured at
  // element creation). With dev servers that serve real module paths (Vite:
  // http://localhost:5173/src/components/Foo.tsx?t=...), the first app frame
  // gives us file:line:column. Bundler-served frames (bundle.js) are skipped —
  // a misleading path is worse than none.
  const parseDebugStack = (stack) => {
    for (const ln of String(stack || "").split("\n")) {
      const m = ln.match(
        /(https?:\/\/[^\s()]+?\.(?:jsx|tsx|js|ts|mjs|vue|svelte))(?:\?[^\s():]*)?:(\d+):(\d+)/,
      );
      if (!m) continue;
      try {
        const p = new URL(m[1]).pathname;
        if (p.includes("/node_modules/") || p.includes("/.vite/")) continue;
        // Accept only frames that look like app source, not bundles.
        if (!/\.(jsx|tsx|vue|svelte)$/.test(p) && !p.includes("/src/")) continue;
        return {
          fileName: p.replace(/^\//, ""),
          lineNumber: Number(m[2]),
          columnNumber: Number(m[3]),
        };
      } catch {}
    }
    return null;
  };

  const reactDebugStackSource = (fiber) => {
    let node = fiber;
    let depth = 0;
    while (node && depth < 30) {
      const st = node._debugStack;
      if (st) {
        const src = parseDebugStack(st.stack || st);
        if (src) return src;
      }
      node = node._debugOwner || node.return;
      depth++;
    }
    return null;
  };

  // Vue 3 breadcrumbs via the parent chain of component instances.
  const vueComponentChain = (instance, max = 5) => {
    const names = [];
    let c = instance;
    let depth = 0;
    while (c && depth < 30 && names.length < max) {
      const t = c.type;
      const name = (t && (t.name || t.__name)) || null;
      if (name && names[names.length - 1] !== name) names.push(name);
      c = c.parent;
      depth++;
    }
    return names;
  };

  // Svelte dev builds stamp DOM nodes with `__svelte_meta.loc` ({file, line, column}).
  const svelteMeta = (el) => {
    let node = el;
    let depth = 0;
    while (node && depth < 30) {
      if (node.__svelte_meta && node.__svelte_meta.loc) return node.__svelte_meta.loc;
      node = node.parentElement;
      depth++;
    }
    return null;
  };

  const detect = (el) => {
    if (!el) return null;

    const fiberKey = reactFiberKey(el);
    if (fiberKey) {
      const fiber = el[fiberKey];
      const ds = reactDebugSource(fiber) || reactDebugStackSource(fiber);
      const chain = reactComponentChain(fiber);
      return {
        framework: "react",
        componentName: chain[0] || null,
        componentChain: chain.length > 1 ? chain : null,
        source: ds
          ? {
              file: ds.fileName || null,
              line: ds.lineNumber || null,
              column: ds.columnNumber || null,
            }
          : null,
      };
    }

    if (el.__vueParentComponent) {
      const c = el.__vueParentComponent;
      const t = c && c.type;
      const chain = vueComponentChain(c);
      return {
        framework: "vue",
        componentName: (t && (t.name || t.__name)) || chain[0] || null,
        componentChain: chain.length > 1 ? chain : null,
        source: t && t.__file ? { file: t.__file, line: null, column: null } : null,
      };
    }

    if (el.__vue__) {
      const c = el.__vue__;
      const opts = c && c.$options;
      return {
        framework: "vue",
        componentName: (opts && (opts.name || opts._componentTag)) || null,
        componentChain: null,
        source: opts && opts.__file ? { file: opts.__file, line: null, column: null } : null,
      };
    }

    const sv = svelteMeta(el);
    if (sv && sv.file) {
      const base = String(sv.file).split("/").pop() || null;
      return {
        framework: "svelte",
        componentName: base ? base.replace(/\.svelte$/, "") : null,
        componentChain: null,
        source: { file: sv.file, line: sv.line ?? null, column: sv.column ?? null },
      };
    }

    // Angular dev mode exposes the debug API on window.ng.
    try {
      if (window.ng && typeof window.ng.getComponent === "function") {
        let node = el;
        let comp = null;
        let depth = 0;
        while (node && !comp && depth < 30) {
          comp = window.ng.getComponent(node);
          if (!comp) node = node.parentElement;
          depth++;
        }
        if (comp) {
          return {
            framework: "angular",
            componentName: comp.constructor?.name || null,
            componentChain: null,
            source: null,
          };
        }
      }
    } catch {}

    return null;
  };

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data) return;

    if (data.type === "TSAYRU_ERRORS_REQUEST") {
      const now = Date.now();
      const errors = pageErrors.slice(-5).map((er) => ({
        message: er.message,
        source: er.source,
        count: er.count || 1,
        ago: Math.round((now - er.at) / 1000),
      }));
      window.postMessage(
        { type: "TSAYRU_ERRORS_RESPONSE", requestId: data.requestId, errors },
        location.origin || "*",
      );
      return;
    }

    if (data.type !== "TSAYRU_DETECT_REQUEST") return;
    const { x, y, requestId } = data;
    let result = null;
    try {
      // Pierce open shadow roots — mirrors the content script's deep hit-test
      // so both sides agree on which element was clicked.
      let el = document.elementFromPoint(x, y);
      let guard = 12;
      while (el && el.shadowRoot && guard-- > 0) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      result = detect(el);
    } catch (err) {
      result = null;
    }
    // Restrict the response target so cross-origin iframes can't eavesdrop on
    // component names / source file paths. Same-origin pages still receive it.
    window.postMessage(
      { type: "TSAYRU_DETECT_RESPONSE", requestId, result },
      location.origin || "*",
    );
  });
})();
