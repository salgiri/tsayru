// Framework detection (React/Vue) via postMessage bridge to inject.js (MAIN world).
// Snapshot of computed styles is also here — both are "extract context from element" helpers.

export const detectFramework = (target) => {
  return new Promise((resolve) => {
    if (!(target instanceof Element)) return resolve(null);
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
