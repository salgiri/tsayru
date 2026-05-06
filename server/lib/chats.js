// Enumerate recent Claude Code SESSIONS (one per `.jsonl` file under
// `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`).
//
// We expose individual sessions (not just project folders) because users
// often have several chats open in the same project — they want to pick
// "Start Yalla server" vs "Fix Chrome extension" specifically, not just
// "Yalla project".

import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude", "projects");

// Folder names encode `/`, ` `, `.` as `-`. Best-effort decode for display
// when we can't recover the canonical cwd from transcript content.
const decodeFolderName = (name) =>
  name.startsWith("-") ? "/" + name.slice(1).replace(/-/g, "/") : name;

// Read up to ~150 lines of a jsonl looking for: cwd, the latest `aiTitle`
// (Claude Code's auto-generated chat title — same one VS Code's session
// picker shows — appears on `type: "ai-title"` records and may be updated
// multiple times), and the first user message as fallback.
const readSessionMeta = (filePath) =>
  new Promise((resolve) => {
    let cwd = null;
    let aiTitle = null;
    let firstUserMsg = null;
    let count = 0;
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream });
    const finish = () => {
      rl.close();
      stream.destroy();
      resolve({ cwd, aiTitle, firstUserMsg });
    };
    rl.on("line", (line) => {
      count += 1;
      try {
        const d = JSON.parse(line);
        if (!cwd && typeof d.cwd === "string" && d.cwd.length > 0) cwd = d.cwd;
        // ai-title records can repeat as Claude refines the summary —
        // overwrite each time so we end up with the latest version.
        if (d.type === "ai-title" && typeof d.aiTitle === "string") {
          aiTitle = d.aiTitle;
        }
        // Heuristic: queue-operation records also carry aiTitle metadata.
        if (!aiTitle && typeof d.aiTitle === "string") aiTitle = d.aiTitle;
        if (!firstUserMsg) {
          const msg = d.message || d;
          if ((d.role === "user" || d.type === "user") && msg) {
            const c = msg.content;
            if (typeof c === "string") firstUserMsg = c;
            else if (Array.isArray(c)) {
              for (const part of c) {
                if (typeof part?.text === "string") {
                  firstUserMsg = part.text;
                  break;
                }
              }
            }
          }
        }
      } catch {}
      // Read up to 150 lines to catch a late ai-title update; cwd usually
      // shows up earlier so we keep going even after it's found.
      if (count >= 150) finish();
    });
    rl.on("close", () =>
      resolve({ cwd, aiTitle, firstUserMsg }),
    );
    rl.on("error", () =>
      resolve({ cwd: null, aiTitle: null, firstUserMsg: null }),
    );
  });

const truncate = (s, max) => {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

// Fast first pass: collect (sessionId, mtime) for all jsonl files. Only the
// top-N by mtime get full metadata reads — saves time when there are dozens.
const scanSessions = async () => {
  let folders;
  try {
    folders = await fs.readdir(CLAUDE_PROJECTS);
  } catch {
    return [];
  }

  const out = [];
  for (const folder of folders) {
    const dir = path.join(CLAUDE_PROJECTS, folder);
    try {
      const dirStat = await fs.stat(dir);
      if (!dirStat.isDirectory()) continue;
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        const sessionId = entry.slice(0, -6);
        const filePath = path.join(dir, entry);
        try {
          const fileStat = await fs.stat(filePath);
          out.push({
            sessionId,
            folderName: folder,
            filePath,
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
          });
        } catch {}
      }
    } catch {}
  }
  return out;
};

export const listRecentSessions = async (limit = 10) => {
  const all = await scanSessions();
  // Skip empty sessions (size 0 — opened but never used).
  const useful = all.filter((s) => s.size > 0);
  useful.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const top = useful.slice(0, Math.max(1, Math.min(50, limit)));

  const enriched = await Promise.all(
    top.map(async (s) => {
      const meta = await readSessionMeta(s.filePath);
      const projectPath = meta.cwd || decodeFolderName(s.folderName);
      // Prefer Claude Code's auto-generated `aiTitle` (matches what VS Code's
      // session picker shows). Fall back to the first user message.
      const title = truncate(
        meta.aiTitle ||
          meta.firstUserMsg ||
          `Session ${s.sessionId.slice(0, 8)}`,
        60,
      );
      return {
        kind: "local",
        sessionId: s.sessionId,
        projectPath,
        projectLabel: path.basename(projectPath) || projectPath,
        title,
        preview: truncate(meta.firstUserMsg || "", 120),
        lastActiveAt: new Date(s.mtimeMs).toISOString(),
        hasAiTitle: !!meta.aiTitle,
      };
    }),
  );
  return enriched;
};

// Backward-compat for any consumer still asking for project-level grouping.
export const listRecentProjects = async (limit = 5) => {
  const sessions = await listRecentSessions(50);
  const seen = new Map();
  for (const s of sessions) {
    if (!seen.has(s.projectPath)) {
      seen.set(s.projectPath, {
        kind: "project",
        projectPath: s.projectPath,
        label: s.projectLabel,
        lastActiveAt: s.lastActiveAt,
        sessionCount: 1,
        preview: s.preview,
      });
    } else {
      const p = seen.get(s.projectPath);
      p.sessionCount += 1;
    }
  }
  return Array.from(seen.values()).slice(0, Math.max(1, limit));
};
