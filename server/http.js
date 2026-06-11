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
  listDoneTaskIds,
} from "./lib/storage.js";
import { resolveProjectByHost } from "./lib/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.TSAYRU_PORT || 7777);
const HOST = "127.0.0.1"; // never bind 0.0.0.0 — extension talks to localhost only

const pkg = JSON.parse(
  await readFile(path.join(__dirname, "package.json"), "utf8"),
);

const app = express();

// Origin gate. Binding to 127.0.0.1 does NOT protect the inbox from the
// user's own browser: any web page can fetch http://127.0.0.1:7777/... and a
// permissive CORS policy would let it read batches (screenshots, source
// paths) or wipe the inbox. Browsers always attach an http(s) Origin to such
// cross-origin requests, so we allow only:
//   - requests with no Origin header (curl, local scripts, same-machine tools)
//   - the extension's own background worker (Origin: chrome-extension://…)
// Everything else gets 403 and no CORS approval.
const originAllowed = (origin) =>
  origin === undefined || origin.startsWith("chrome-extension://");

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    res.status(403).json({ ok: false, error: "forbidden origin" });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Extension can ship screenshots as base64 data URLs — bump the limit so
// a batch with a few images still fits.
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
    // Auto-target: resolve the project behind a localhost dev server from the
    // listening process's cwd, so MCP routes the batch to the right Claude
    // Code session without the user picking anything.
    let projectPath = targetProjectPath || null;
    if (!projectPath) {
      projectPath = await resolveProjectByHost(host);
      if (projectPath) {
        console.log(`[tsayru] auto-targeted ${host} → ${projectPath}`);
      }
    }
    const meta = await saveBatch({
      tasks,
      host,
      filterHost,
      targetProjectPath: projectPath,
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
    const invalid = /must be|too many/.test(String(err?.message));
    res
      .status(invalid ? 400 : 500)
      .json({ ok: false, error: String(err.message || err) });
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

// Ids of done tasks across recent batches — polled by the extension sidebar
// to strike through tasks Claude has completed (via MCP `tsayru_mark_done`).
app.get("/tasks/done/recent", async (_req, res) => {
  try {
    const ids = await listDoneTaskIds();
    res.json({ ok: true, ids });
  } catch (err) {
    console.error("[tsayru] GET /tasks/done/recent failed:", err);
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

const server = app.listen(PORT, HOST, () => {
  console.log(`[tsayru] inbox listening on http://${HOST}:${PORT}`);
  console.log(`[tsayru] version ${pkg.version}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[tsayru] port ${PORT} is already in use — is another tsayru-server running?\n` +
        `[tsayru] pick another port with: TSAYRU_PORT=<port> node http.js`,
    );
    process.exit(1);
  }
  throw err;
});
