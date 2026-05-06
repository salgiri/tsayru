// On-disk storage for tsayru task batches.
// Layout: ~/.tsayru/inbox/<batchId>/{tasks.json, tasks.md}
// Both http.js and mcp.js share this module so the inbox is a single source of truth.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { formatBatch } from "./format.js";

const INBOX_ROOT = path.join(os.homedir(), ".tsayru", "inbox");

// batchId is the ISO timestamp with non-filename-safe chars stripped.
// Sortable lexicographically -> newest-first listing is just sort+reverse.
const newBatchId = () =>
  new Date().toISOString().replace(/[:.]/g, "-");

const ensureRoot = async () => {
  await fs.mkdir(INBOX_ROOT, { recursive: true });
};

// Allowlist match: only chars produced by our own batchId generator
// (digits, hyphens, T/Z separators from ISO timestamps with `:`/`.` replaced).
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
