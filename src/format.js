// Markdown formatter for task payloads.
// Pure functions — no DOM, no extension APIs, no module-level state — so the
// same module serves the extension bundle AND the Node server
// (server/lib/format.js re-exports from here; the renderers must never fork).

export const safeHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

// Convert "rgb(0, 0, 0)" / "rgba(0, 0, 0, 1)" to "#000000". Returns input unchanged on miss.
const rgbToHex = (s) => {
  const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
  if (!m) return s;
  const [, r, g, b, a] = m;
  if (a !== undefined && parseFloat(a) === 0) return "transparent";
  const hex = (n) =>
    Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  if (a !== undefined && parseFloat(a) < 1) {
    return `${base} (α ${parseFloat(a).toFixed(2)})`;
  }
  return base;
};

// Build a compact one-line styles summary, dropping defaults.
const formatComputedStyles = (cs) => {
  if (!cs) return null;
  const parts = [];
  const fg = rgbToHex(cs.color);
  if (fg && fg !== "#000000") parts.push(`color ${fg}`);
  const bg = rgbToHex(cs.backgroundColor);
  if (bg && bg !== "transparent") parts.push(`bg ${bg}`);
  const fontFam = (cs.fontFamily || "")
    .split(",")[0]
    .trim()
    .replace(/['"]/g, "");
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
    parts.push(`${cs.width}×${cs.height}`);
  }
  return parts.length ? parts.join(" · ") : null;
};

export const filterByHost = (tasks, filterHost) =>
  filterHost
    ? (tasks || []).filter((t) => safeHost(t.url) === filterHost)
    : tasks || [];

// Render a single task as markdown lines (no header, no trailing blank).
// `displayIndex` is 1-based — what shows up in `## N. <label>`.
//
// opts.screenshotMode controls how a captured screenshot is referenced:
//   "inline"   — embed the base64 image as a markdown image (heavy; server/MCP route)
//   "attached" — "attached image #N" note (web-chat push ships files separately)
//   "note"     — plain "captured" note (default; clipboard stays light)
const taskLines = (t, displayIndex, opts = {}) => {
  const mode = opts.screenshotMode || "note";
  const lines = [`## ${displayIndex}. ${t.label}`];
  lines.push(`- selector: \`${t.selector}\``);
  const fw = t.framework;
  if (fw && fw.componentName) {
    lines.push(`- component: \`${fw.componentName}\``);
  }
  if (fw && fw.source && fw.source.file) {
    const loc = fw.source.line
      ? `${fw.source.file}:${fw.source.line}`
      : fw.source.file;
    lines.push(`- file: \`${loc}\``);
  }
  if (fw && fw.framework && !fw.componentName && !fw.source) {
    lines.push(`- framework: ${fw.framework}`);
  }
  const styles = formatComputedStyles(t.computedStyles);
  if (styles) {
    lines.push(`- styles: ${styles}`);
  }
  lines.push(`- url: ${t.url}`);
  if (t.screenshot && mode === "attached") {
    lines.push(`- screenshot: attached image #${opts.attachmentNum || displayIndex}`);
  } else if (t.screenshot && mode === "note") {
    lines.push(`- screenshot: ✓ captured (image data omitted from clipboard copy)`);
  }
  lines.push("");
  lines.push(t.text);
  if (t.screenshot && mode === "inline") {
    lines.push("");
    lines.push(`![${t.label}](${t.screenshot})`);
  }
  return lines;
};

// Format a single task as a self-contained markdown snippet.
// Used by the per-task copy button. Includes header so Claude has context.
export const formatTask = (t, displayIndex, opts = {}) => {
  return [
    "# UI task (tsayru)",
    "",
    ...taskLines(t, displayIndex, { attachmentNum: 1, ...opts }),
  ].join("\n");
};

// Format a task list. `filterHost` narrows by page host and suffixes the header.
export const formatTasks = (tasks, filterHost, opts = {}) => {
  const list = filterByHost(tasks, filterHost);
  if (list.length === 0) return "";
  const header = filterHost
    ? `# UI tasks (tsayru) — ${filterHost}`
    : "# UI tasks (tsayru)";
  const lines = [header, ""];
  let attachmentNum = 0;
  list.forEach((t, i) => {
    if (t.screenshot) attachmentNum += 1;
    lines.push(...taskLines(t, i + 1, { ...opts, attachmentNum }));
    lines.push("");
  });
  return lines.join("\n");
};
