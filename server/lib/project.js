// Resolve the project directory behind a localhost dev server.
//
// The extension sends `host` (e.g. "localhost:5173"). The process listening
// on that port is almost always the dev server started from the project root,
// so its cwd IS the project path. That lets the inbox auto-stamp
// `targetProjectPath` and the MCP tool route the batch to the right Claude
// Code session — with zero user interaction.
//
// Best-effort by design: works on macOS/Linux via `lsof`; returns null on
// Windows, in containers, or when anything looks off. A null just means the
// batch stays "global", which was the previous behavior for every batch.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

const EXEC_OPTS = { timeout: 1500 };

export const resolveProjectByHost = async (host) => {
  try {
    if (!host || typeof host !== "string") return null;
    const u = new URL(`http://${host}`);
    if (!LOCAL_HOSTNAMES.has(u.hostname)) return null;
    const port = Number(u.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

    // Listening pid on that port (first one wins).
    const { stdout: pidsOut } = await exec(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      EXEC_OPTS,
    );
    const pid = pidsOut
      .split("\n")
      .map((s) => s.trim())
      .find((s) => /^\d+$/.test(s));
    if (!pid) return null;

    // That process's cwd (`-Fn` machine format: lines prefixed with `n`).
    const { stdout: cwdOut } = await exec(
      "lsof",
      ["-a", "-p", pid, "-d", "cwd", "-Fn"],
      EXEC_OPTS,
    );
    const line = cwdOut.split("\n").find((l) => l.startsWith("n"));
    const cwd = line ? line.slice(1).trim() : null;
    return cwd && cwd.startsWith("/") ? cwd : null;
  } catch {
    return null;
  }
};
