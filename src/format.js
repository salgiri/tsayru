// Markdown formatter for the clipboard payload.
// Pure functions that take task objects — no DOM, no state mutation.

import { state, safeHost } from "./core.js";

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
// `opts.includeScreenshots`: when true, embeds the base64 PNG inline (heavy
// but renders in claude.ai / Claude Code chat). Default false — clipboard
// stays light, server route delivers the heavy version via MCP.
const taskLines = (t, displayIndex, opts = {}) => {
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
  if (t.screenshot) {
    if (opts.includeScreenshots) {
      lines.push(`- screenshot:`);
      lines.push("");
      lines.push(`![${t.label}](${t.screenshot})`);
    } else {
      lines.push(`- screenshot: ✓ (fetch via MCP tool \`tsayru_latest_tasks\`)`);
    }
  }
  lines.push("");
  lines.push(t.text);
  return lines;
};

// Format a single task as a self-contained markdown snippet.
// Used by the per-task copy button. Includes header so Claude has context.
export const formatTask = (t, displayIndex, opts = {}) => {
  return [
    "# UI task (tsayru)",
    "",
    ...taskLines(t, displayIndex, opts),
  ].join("\n");
};

export const formatTasks = (opts = {}) => {
  const tasks = state.filterHost
    ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost)
    : state.tasks;
  if (tasks.length === 0) return "";
  const header = state.filterHost
    ? `# UI tasks (tsayru) — ${state.filterHost}`
    : "# UI tasks (tsayru)";
  const lines = [header, ""];
  tasks.forEach((t, i) => {
    lines.push(...taskLines(t, i + 1, opts));
    lines.push("");
  });
  return lines.join("\n");
};
