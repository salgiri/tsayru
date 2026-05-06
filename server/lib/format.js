// Markdown formatter for stored task batches.
// Server-side port of /src/format.js — same field labels and structure.
// Pure functions, no DOM dependency, no module-level state.

const safeHost = (url) => {
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

// Render a single task as markdown lines (no header, no trailing blank).
// `displayIndex` is 1-based — what shows up in `## N. <label>`.
const taskLines = (t, displayIndex) => {
  const lines = [`## ${displayIndex}. ${t.label}`];
  lines.push(`- селектор: \`${t.selector}\``);
  const fw = t.framework;
  if (fw && fw.componentName) {
    lines.push(`- компонент: \`${fw.componentName}\``);
  }
  if (fw && fw.source && fw.source.file) {
    const loc = fw.source.line
      ? `${fw.source.file}:${fw.source.line}`
      : fw.source.file;
    lines.push(`- файл: \`${loc}\``);
  }
  if (fw && fw.framework && !fw.componentName && !fw.source) {
    lines.push(`- фреймворк: ${fw.framework}`);
  }
  const styles = formatComputedStyles(t.computedStyles);
  if (styles) {
    lines.push(`- стили: ${styles}`);
  }
  lines.push(`- url: ${t.url}`);
  lines.push("");
  lines.push(t.text);
  if (t.screenshot) {
    lines.push("");
    lines.push(`![${t.label}](${t.screenshot})`);
  }
  return lines;
};

// Format a list of tasks as markdown. `filterHost` mirrors the extension's
// per-host filter; if set, only tasks on that host are included and the
// header is suffixed with the host name.
export const formatTasks = (tasks, filterHost) => {
  const list = filterHost
    ? (tasks || []).filter((t) => safeHost(t.url) === filterHost)
    : tasks || [];
  if (list.length === 0) return "";
  const header = filterHost
    ? `# UI-задачи (tsayru) — ${filterHost}`
    : "# UI-задачи (tsayru)";
  const lines = [header, ""];
  list.forEach((t, i) => {
    lines.push(...taskLines(t, i + 1));
    lines.push("");
  });
  return lines.join("\n");
};

// Convenience wrapper for callers that already have a stored batch envelope
// `{ batchId, host, filterHost, tasks, addedAt }`.
export const formatBatch = (batch) =>
  formatTasks(batch.tasks, batch.filterHost || null);
