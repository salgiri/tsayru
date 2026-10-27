// Screenshot capture: full viewport via chrome.tabs.captureVisibleTab (background-side),
// then crop on canvas to the element's bounding rect with padding.
// Hides the extension's own UI before capture so it doesn't appear in the shot.

import { refs, bus, ask } from "./core.js";

// Generous context around the element (48px instead of the old 8): Claude
// understands "this button" far better when neighboring UI is visible. The
// target itself is outlined in red (below) so the extra context can't cause
// ambiguity about which element is meant.
const PADDING = 48; // CSS px around captured element
const OUTLINE_COLOR = "#ff3b30";
const MAX_WIDTH = 800; // CSS px — resize down if cropped wider than this
// JPEG instead of PNG: 3–10× smaller, which protects the chrome.storage quota
// and keeps web-chat attachments light. Screenshots of UI don't need lossless.
const JPEG_QUALITY = 0.85;

const requestFullCapture = async () => {
  const resp = await ask({ type: "TSAYRU_CAPTURE" });
  return { dataUrl: resp.dataUrl || null, error: resp.dataUrl ? null : resp.error || "no response" };
};

// Map raw chrome error strings to something the user can act on.
const captureErrorMessage = (raw) => {
  const s = String(raw || "");
  if (/activeTab|permission|not in effect|cannot access/i.test(s)) {
    return "No screenshot access. Click the tsayru toolbar icon once";
  }
  if (/MAX_CAPTURE_VISIBLE_TAB|per second/i.test(s)) {
    return "Too many screenshots at once. Try again in a second";
  }
  return "Screenshot failed. The task is saved without it";
};

// Surfaced as a toast through the in-bundle bus — previously a missing
// activeTab grant just silently dropped the screenshot.
const reportCaptureError = (raw) => bus.emit("warn", captureErrorMessage(raw));

const loadImage = (dataUrl) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

const cropToDataUrl = (img, rect) => {
  if (rect.width === 0 || rect.height === 0) return null;

  const dpr = window.devicePixelRatio || 1;

  // Element rect with padding, in device pixels, clipped to image bounds.
  // Round to integers — non-integer dpr (1.25, 1.5, 2.625) causes 1–2 px misalign otherwise.
  const sx = Math.round(Math.max(0, (rect.left - PADDING) * dpr));
  const sy = Math.round(Math.max(0, (rect.top - PADDING) * dpr));
  const sxRight = Math.round(
    Math.min((rect.left + rect.width + PADDING) * dpr, img.width),
  );
  const syBottom = Math.round(
    Math.min((rect.top + rect.height + PADDING) * dpr, img.height),
  );
  const sw = sxRight - sx;
  const sh = syBottom - sy;
  if (sw <= 0 || sh <= 0) return null; // off-screen

  // Output dimensions: scale down if cropped CSS-width exceeds MAX_WIDTH.
  const cssW = sw / dpr;
  const cssH = sh / dpr;
  const scale = Math.min(1, MAX_WIDTH / cssW);
  const outW = Math.max(1, Math.round(cssW * scale * dpr));
  const outH = Math.max(1, Math.round(cssH * scale * dpr));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  // JPEG has no alpha — fill white so transparent regions don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  // Outline the target element so the padded context can't be mistaken for it.
  const outScale = outW / sw; // device px -> output px
  const ex = (rect.left * dpr - sx) * outScale;
  const ey = (rect.top * dpr - sy) * outScale;
  const ew = rect.width * dpr * outScale;
  const eh = rect.height * dpr * outScale;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = Math.max(2, Math.round(2 * dpr * outScale));
  ctx.strokeRect(ex, ey, ew, eh);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
};

// Briefly hide our own chrome (the UI host with sidebar and highlight, the
// style editor) so the capture is clean. `visibility: hidden` is instant —
// no transition, restored synchronously. Important priority: both hosts pin
// their own styles with !important against page CSS.
const withHiddenUI = async (fn) => {
  const nodes = [refs.ui, refs.styleHost].filter(Boolean);
  const prev = nodes.map((n) => [
    n.style.getPropertyValue("visibility"),
    n.style.getPropertyPriority("visibility"),
  ]);
  for (const n of nodes) n.style.setProperty("visibility", "hidden", "important");
  // Wait one frame so the browser applies the visibility change.
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

// Capture a screenshot of `target` element. Returns a JPEG dataURL or null.
// The element's rect is sampled BEFORE we hide UI (which awaits a frame, during
// which the page may scroll or reflow), so the crop matches what was clicked.
// Capture failures are reported to the sidebar toast — previously the task
// just silently saved without a screenshot (e.g. no activeTab on *.test hosts).
export const captureElement = async (target) => {
  if (!(target instanceof Element)) return null;
  let rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  // Element partially outside the viewport would be cropped mid-element.
  // `block: "nearest"` scrolls the minimum needed to fit it, which is also
  // where the user's attention already is — acceptable side effect.
  if (
    rect.top < 0 ||
    rect.left < 0 ||
    rect.bottom > window.innerHeight ||
    rect.right > window.innerWidth
  ) {
    try {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {}
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
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
