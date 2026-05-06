// Screenshot capture: full viewport via chrome.tabs.captureVisibleTab (background-side),
// then crop on canvas to the element's bounding rect with padding.
// Hides the extension's own UI before capture so it doesn't appear in the shot.

import { refs } from "./core.js";

const PADDING = 8; // CSS px around captured element
const MAX_WIDTH = 800; // CSS px — resize down if cropped wider than this

const requestFullCapture = () =>
  new Promise((resolve) => {
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
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL("image/png");
};

// Briefly hide our own chrome (sidebar, highlight) so the capture is clean.
// `style.visibility = "hidden"` is instant — no transition, restored synchronously.
const withHiddenUI = async (fn) => {
  const sidebar = refs.sidebar;
  const highlight = refs.highlight;
  const prevSidebar = sidebar ? sidebar.style.visibility : null;
  const prevHighlight = highlight ? highlight.style.visibility : null;
  if (sidebar) sidebar.style.visibility = "hidden";
  if (highlight) highlight.style.visibility = "hidden";
  // Wait one frame so the browser applies the visibility change.
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

// Capture a screenshot of `target` element. Returns a PNG dataURL or null.
// The element's rect is sampled BEFORE we hide UI (which awaits a frame, during
// which the page may scroll or reflow), so the crop matches what was clicked.
export const captureElement = async (target) => {
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
