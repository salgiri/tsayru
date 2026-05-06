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

  const detect = (el) => {
    if (!el) return null;

    const fiberKey = reactFiberKey(el);
    if (fiberKey) {
      const fiber = el[fiberKey];
      const ds = reactDebugSource(fiber);
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
      const el = document.elementFromPoint(x, y);
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
