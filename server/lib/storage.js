// On-disk storage for tsayru task batches.
// Layout: ~/.tsayru/inbox/<batchId>/{tasks.json, tasks.md}
// Both http.js and mcp.js share this module so the inbox is a single source of truth.

import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";

import { formatBatch } from "./format.js";

// Overridable for tests (TSAYRU_INBOX) — read once at import time.
const INBOX_ROOT =
  process.env.TSAYRU_INBOX || path.join(os.homedir(), ".tsayru", "inbox");

// Retention cap: oldest batches beyond this count are pruned on every save,
// so the inbox can't grow without bound (batches can carry megabytes of
// base64 screenshots). Overridable for tests.
const MAX_BATCHES = Number(process.env.TSAYRU_MAX_BATCHES || 200);

const MAX_TASKS_PER_BATCH = 500;

// batchId is the ISO timestamp with non-filename-safe chars stripped, plus a
// short random suffix so two saves in the same millisecond can't collide.
// Still sortable lexicographically -> newest-first listing is sort+reverse.
const newBatchId = () =>
  new Date().toISOString().replace(/[:.]/g, "-") +
  "-" +
  randomBytes(3).toString("hex");

const ensureRoot = async () => {
  await fs.mkdir(INBOX_ROOT, { recursive: true });
};

// Allowlist match: only chars produced by our own batchId generator
// (digits, hyphens, T/Z separators from ISO timestamps, hex suffix).
// Blocks `.`, `..`, path separators, NUL, and any traversal vector.
const isSafeBatchId = (id) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(id);

const batchDir = (batchId) => {
  if (!isSafeBatchId(batchId)) {
    throw new Error(`unsafe batchId: ${batchId}`);
  }
  return path.join(INBOX_ROOT, batchId);
};

// Drop the oldest batch folders beyond MAX_BATCHES. Best-effort — a prune
// failure must never fail the save that triggered it.
const pruneOldBatches = async () => {
  let entries;
  try {
    entries = await fs.readdir(INBOX_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse(); // newest first
  for (const name of dirs.slice(MAX_BATCHES)) {
    try {
      await fs.rm(path.join(INBOX_ROOT, name), { recursive: true, force: true });
    } catch {}
  }
};

// Persist a new batch. `payload` is the body posted by the extension.
// Returns the metadata envelope including the assigned batchId and folder path.
export const saveBatch = async ({
  tasks,
  host,
  filterHost,
  targetProjectPath,
  targetSessionId,
  targetTabUrl,
  targetTabTitle,
}) => {
  if (!Array.isArray(tasks)) {
    throw new Error("tasks must be an array");
  }
  if (tasks.length > MAX_TASKS_PER_BATCH) {
    throw new Error(`too many tasks (max ${MAX_TASKS_PER_BATCH})`);
  }
  if (!tasks.every((t) => t && typeof t === "object" && !Array.isArray(t))) {
    throw new Error("each task must be an object");
  }
  await ensureRoot();
  const batchId = newBatchId();
  const dir = batchDir(batchId);
  await fs.mkdir(dir, { recursive: true });

  const addedAt = new Date().toISOString();
  const envelope = {
    batchId,
    host: host || null,
    filterHost: filterHost || null,
    targetProjectPath: targetProjectPath || null,
    targetSessionId: targetSessionId || null,
    targetTabUrl: targetTabUrl || null,
    targetTabTitle: targetTabTitle || null,
    addedAt,
    count: tasks.length,
    tasks,
  };

  const md = formatBatch(envelope);
  await fs.writeFile(
    path.join(dir, "tasks.json"),
    JSON.stringify(envelope, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(dir, "tasks.md"), md, "utf8");

  await pruneOldBatches();

  return { batchId, path: dir, addedAt, count: tasks.length };
};

// Read a single batch envelope from disk. Returns null if not found.
export const readBatch = async (batchId) => {
  const dir = batchDir(batchId);
  try {
    const raw = await fs.readFile(path.join(dir, "tasks.json"), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
};

// Read the cached markdown for a batch. Falls back to re-rendering from JSON.
export const readBatchMarkdown = async (batchId) => {
  const dir = batchDir(batchId);
  try {
    return await fs.readFile(path.join(dir, "tasks.md"), "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const envelope = await readBatch(batchId);
  if (!envelope) return null;
  return formatBatch(envelope);
};

// List recent batches, newest first. Each entry is small metadata only —
// the full task array stays on disk until callers request a specific batch.
export const listBatches = async ({ limit = 50 } = {}) => {
  await ensureRoot();
  let entries;
  try {
    entries = await fs.readdir(INBOX_ROOT, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  // Lexicographic sort works because batchIds are ISO timestamps.
  dirs.sort();
  dirs.reverse();

  const out = [];
  for (const id of dirs.slice(0, Math.max(0, limit))) {
    try {
      const env = await readBatch(id);
      if (!env) continue;
      out.push({
        batchId: env.batchId || id,
        host: env.host || null,
        filterHost: env.filterHost || null,
        targetProjectPath: env.targetProjectPath || null,
        count: env.count ?? (env.tasks ? env.tasks.length : 0),
        addedAt: env.addedAt || null,
      });
    } catch {
      // Skip unreadable batches rather than failing the whole listing.
    }
  }
  return out;
};

// Mark tasks in a batch as done. `taskIds` narrows by task id, `indices`
// (1-based, matching the markdown numbering) narrows by position; with
// neither, the whole batch is marked. Rewrites both tasks.json and tasks.md.
// Returns { marked, total } or null if the batch doesn't exist.
export const markTasksDone = async (batchId, { taskIds, indices } = {}) => {
  const envelope = await readBatch(batchId);
  if (!envelope || !Array.isArray(envelope.tasks)) return null;
  const idSet = Array.isArray(taskIds) && taskIds.length ? new Set(taskIds) : null;
  const idxSet =
    Array.isArray(indices) && indices.length ? new Set(indices) : null;
  const doneAt = new Date().toISOString();
  let marked = 0;
  envelope.tasks.forEach((t, i) => {
    if (!t || typeof t !== "object") return;
    const byId = idSet ? t.id && idSet.has(t.id) : false;
    const byIdx = idxSet ? idxSet.has(i + 1) : false;
    const all = !idSet && !idxSet;
    if ((all || byId || byIdx) && !t.done) {
      t.done = true;
      t.doneAt = doneAt;
      marked += 1;
    }
  });
  const dir = batchDir(batchId);
  await fs.writeFile(
    path.join(dir, "tasks.json"),
    JSON.stringify(envelope, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(dir, "tasks.md"), formatBatch(envelope), "utf8");
  return { marked, total: envelope.tasks.length };
};

// Ids of done tasks across the most recent batches — the extension polls this
// to strike through completed tasks in the sidebar.
export const listDoneTaskIds = async ({ batchLimit = 20 } = {}) => {
  const recent = await listBatches({ limit: batchLimit });
  const ids = [];
  for (const meta of recent) {
    try {
      const env = await readBatch(meta.batchId);
      for (const t of env?.tasks || []) {
        if (t && t.done && typeof t.id === "string") ids.push(t.id);
      }
    } catch {}
  }
  return [...new Set(ids)];
};

// Remove a single batch folder. Returns true if removed, false if missing.
// `force: false` so ENOENT actually throws and we can return false honestly.
export const deleteBatch = async (batchId) => {
  const dir = batchDir(batchId);
  try {
    await fs.rm(dir, { recursive: true });
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
};

// Wipe every batch. Used by the `tsayru_clear_inbox` MCP tool.
export const clearInbox = async () => {
  await ensureRoot();
  let entries;
  try {
    entries = await fs.readdir(INBOX_ROOT, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
  let deleted = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    await fs.rm(path.join(INBOX_ROOT, e.name), { recursive: true, force: true });
    deleted += 1;
  }
  return deleted;
};

export const inboxRoot = () => INBOX_ROOT;
