// HTTP inbox for the tsayru Chrome extension.
// Listens on 127.0.0.1:7777 (override with TSAYRU_PORT). Localhost-only by design.
//
// Endpoints:
//   POST   /tasks            { tasks, host, filterHost } -> { ok, batchId, path }
//   GET    /tasks/list       -> [{ batchId, host, count, addedAt }, ...] newest first
//   GET    /tasks/:batchId   -> full batch envelope JSON
//   DELETE /tasks/:batchId   -> { ok, deleted }
//   GET    /health           -> { ok, version }

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  saveBatch,
  listBatches,
  readBatch,
  deleteBatch,
} from "./lib/storage.js";
import { listRecentSessions } from "./lib/chats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.TSAYRU_PORT || 7777);
const HOST = "127.0.0.1"; // never bind 0.0.0.0 — extension talks to localhost only

const pkg = JSON.parse(
  await readFile(path.join(__dirname, "package.json"), "utf8"),
);

const app = express();

// CORS — extension origin is unstable (chrome-extension://<id>) and the server
// is localhost-only anyway, so a permissive policy is safe.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Extension can ship screenshots as base64 data URLs — bump the limit so
// a batch with a few PNGs still fits.
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, version: pkg.version });
});

app.post("/tasks", async (req, res) => {
  const {
    tasks,
    host,
    filterHost,
    targetProjectPath,
    targetSessionId,
    targetTabUrl,
    targetTabTitle,
  } = req.body || {};
  if (!Array.isArray(tasks)) {
    res.status(400).json({ ok: false, error: "tasks must be an array" });
    return;
  }
  try {
    const meta = await saveBatch({
      tasks,
      host,
      filterHost,
      targetProjectPath,
      targetSessionId,
      targetTabUrl,
      targetTabTitle,
    });
    const targetStr = targetSessionId
      ? ` → session ${targetSessionId.slice(0, 8)}`
      : targetProjectPath
        ? ` → ${targetProjectPath}`
        : targetTabUrl
          ? ` → tab ${targetTabUrl}`
          : "";
    console.log(
      `[tsayru] saved batch ${meta.batchId} (${meta.count} task${meta.count === 1 ? "" : "s"})${host ? " host=" + host : ""}${targetStr}`,
    );
    res.json({ ok: true, ...meta });
  } catch (err) {
    console.error("[tsayru] POST /tasks failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// List recent Claude Code SESSIONS (one per .jsonl) so the extension picker
// can show the actual chats — same titles the user sees as VS Code tabs.
app.get("/chats/recent", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  try {
    const sessions = await listRecentSessions(limit);
    res.json({ ok: true, sessions });
  } catch (err) {
    console.error("[tsayru] GET /chats/recent failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/tasks/list", async (req, res) => {
  const limit = Math.min(
    200,
    Math.max(1, Number(req.query.limit) || 50),
  );
  try {
    const list = await listBatches({ limit });
    res.json(list);
  } catch (err) {
    console.error("[tsayru] GET /tasks/list failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/tasks/:batchId", async (req, res) => {
  try {
    const envelope = await readBatch(req.params.batchId);
    if (!envelope) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json(envelope);
  } catch (err) {
    console.error("[tsayru] GET /tasks/:batchId failed:", err);
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

app.delete("/tasks/:batchId", async (req, res) => {
  try {
    const ok = await deleteBatch(req.params.batchId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ ok: true, deleted: req.params.batchId });
  } catch (err) {
    console.error("[tsayru] DELETE /tasks/:batchId failed:", err);
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not found" });
});

app.listen(PORT, HOST, () => {
  console.log(`[tsayru] inbox listening on http://${HOST}:${PORT}`);
  console.log(`[tsayru] version ${pkg.version}`);
});
