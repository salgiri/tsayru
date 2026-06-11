// Content-side (ISOLATED world) page-error buffer.
//
// Uncaught exceptions fire a real `error` DOM event on window, which crosses
// content-script world boundaries — so this catches them from document_idle
// onward without touching the page. What it CANNOT see: `console.error` calls
// and unhandled promise rejections (both are realm-local). Those are captured
// by inject.js in the MAIN world once the inspector is used; the two buffers
// are merged at task-creation time (inspector.js).

const MAX_ERRORS = 10;
const buffer = [];

const shortSource = (filename, lineno) => {
  if (!filename) return null;
  const tail = String(filename).split("/").slice(-2).join("/");
  return lineno ? `${tail}:${lineno}` : tail;
};

const push = (message, source) => {
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

export const initErrorCapture = () => {
  window.addEventListener("error", (e) => {
    // Resource load failures (img 404 etc.) have no message — too noisy.
    if (!e.message) return;
    push(e.message, shortSource(e.filename, e.lineno));
  });
};

export const recentContentErrors = (limit = 5) => {
  const now = Date.now();
  return buffer.slice(-limit).map((e) => ({
    message: e.message,
    source: e.source,
    count: e.count || 1,
    ago: Math.round((now - e.at) / 1000),
  }));
};
