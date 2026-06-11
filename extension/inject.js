(() => {
  if (window.__tsayruInjectInstalled) return;
  window.__tsayruInjectInstalled = true;

  const reactFiberKey = (el) =>
    Object.keys(el).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$"),
    );

  const reactComponentName = (fiber) => {
    let node = fiber;
    let depth = 0;
    while (node && depth < 30) {
      const t = node.type;
      if (typeof t === "function") {
        const name = t.displayName || t.name;
        if (name && name !== "_default" && name !== "Anonymous") return name;
      } else if (t && typeof t === "object") {
        const inner = t.render || t.type;
        if (typeof inner === "function") {
          const name = inner.displayName || inner.name;
          if (name) return name;
        }
        if (typeof t.displayName === "string") return t.displayName;
      }
      node = node.return;
      depth++;
    }
    return null;
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

  const detect = (el) => {
    if (!el) return null;

    const fiberKey = reactFiberKey(el);
    if (fiberKey) {
      const fiber = el[fiberKey];
      const ds = reactDebugSource(fiber) || reactDebugStackSource(fiber);
      const componentName = reactComponentName(fiber);
      return {
        framework: "react",
        componentName,
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
      return {
        framework: "vue",
        componentName: (t && (t.name || t.__name)) || null,
        source: t && t.__file ? { file: t.__file, line: null, column: null } : null,
      };
    }

    if (el.__vue__) {
      const c = el.__vue__;
      const opts = c && c.$options;
      return {
        framework: "vue",
        componentName: (opts && (opts.name || opts._componentTag)) || null,
        source: opts && opts.__file ? { file: opts.__file, line: null, column: null } : null,
      };
    }

    return null;
  };

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.type !== "TSAYRU_DETECT_REQUEST") return;
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
