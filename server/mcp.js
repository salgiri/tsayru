// MCP server for the tsayru inbox.
// Spawned by Claude Code over stdio. Reads the same ~/.tsayru/inbox/
// folder that http.js writes into.
//
// Tools:
//   tsayru_latest_tasks  -> latest batch as markdown
//   tsayru_list_batches  -> recent batch metadata { limit? }
//   tsayru_get_batch     -> specific batch as markdown { batchId }
//   tsayru_mark_done     -> mark tasks completed { batchId?, taskIds?, indices? }
//   tsayru_clear_inbox   -> wipe all batches; returns { deleted }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import {
  listBatches,
  readBatchMarkdown,
  clearInbox,
  markTasksDone,
} from "./lib/storage.js";

const pkg = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8"),
);

const server = new McpServer({
  name: "tsayru",
  version: pkg.version,
});

const textResult = (text, isError = false) => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

// Filter batches by `targetProjectPath` matching the current process CWD.
// The inbox auto-stamps batches by resolving the dev server's cwd from the
// page's localhost port (server/lib/project.js). The match is prefix-tolerant
// both ways: the dev server may run in a subfolder (monorepo `frontend/`)
// while the Claude Code session sits at the repo root, or vice versa.
const cwdMatches = (projectPath, cwd) =>
  projectPath === cwd ||
  projectPath.startsWith(cwd + "/") ||
  cwd.startsWith(projectPath + "/");

const pickLatestForCwd = async () => {
  const cwd = process.cwd();
  const all = await listBatches({ limit: 200 });
  const targeted = all.filter(
    (b) => b.targetProjectPath && cwdMatches(b.targetProjectPath, cwd),
  );
  if (targeted.length > 0) return targeted[0];
  const global = all.filter((b) => !b.targetProjectPath);
  if (global.length > 0) return global[0];
  return null;
};

server.registerTool(
  "tsayru_latest_tasks",
  {
    title: "Latest tsayru batch",
    description:
      "Return the most recent tsayru task batch targeted at this project (cwd), with global batches as fallback. Rendered as markdown.",
    inputSchema: {},
  },
  async () => {
    const latest = await pickLatestForCwd();
    if (!latest) {
      return textResult(
        `Inbox has no batches for ${process.cwd()} (and no global batches).`,
      );
    }
    const md = await readBatchMarkdown(latest.batchId);
    if (!md) {
      return textResult(
        `Batch ${latest.batchId} could not be read.`,
        true,
      );
    }
    return textResult(md);
  },
);

server.registerTool(
  "tsayru_list_batches",
  {
    title: "List tsayru batches",
    description:
      "Return metadata for the most recent tsayru batches (newest first).",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .max(200)
        .optional()
        .describe("Max number of batches to return. Defaults to 50."),
    },
  },
  async ({ limit }) => {
    const list = await listBatches({ limit: limit ?? 50 });
    return textResult(JSON.stringify(list, null, 2));
  },
);

server.registerTool(
  "tsayru_get_batch",
  {
    title: "Get tsayru batch",
    description: "Return a specific tsayru batch rendered as markdown.",
    inputSchema: {
      batchId: z.string().min(1).describe("Batch identifier (folder name)."),
    },
  },
  async ({ batchId }) => {
    try {
      const md = await readBatchMarkdown(batchId);
      if (md == null) {
        return textResult(`Batch ${batchId} not found.`, true);
      }
      return textResult(md);
    } catch (err) {
      return textResult(
        `Failed to read batch ${batchId}: ${err.message || err}`,
        true,
      );
    }
  },
);

server.registerTool(
  "tsayru_mark_done",
  {
    title: "Mark tsayru tasks done",
    description:
      "Mark tasks in a tsayru batch as completed after implementing them. " +
      "The user's sidebar strikes them through automatically. Without " +
      "batchId, targets the latest batch for this project. Without taskIds/" +
      "indices, marks the whole batch.",
    inputSchema: {
      batchId: z
        .string()
        .min(1)
        .optional()
        .describe("Batch identifier. Defaults to the latest batch for this project."),
      taskIds: z
        .array(z.string())
        .optional()
        .describe("Task ids (the `id` field in the batch JSON) to mark done."),
      indices: z
        .array(z.number().int().positive())
        .optional()
        .describe("1-based task numbers (as shown in the markdown) to mark done."),
    },
  },
  async ({ batchId, taskIds, indices }) => {
    let id = batchId;
    if (!id) {
      const latest = await pickLatestForCwd();
      if (!latest) {
        return textResult("Inbox has no batches to mark done.", true);
      }
      id = latest.batchId;
    }
    try {
      const result = await markTasksDone(id, { taskIds, indices });
      if (!result) {
        return textResult(`Batch ${id} not found.`, true);
      }
      return {
        content: [
          {
            type: "text",
            text: `Marked ${result.marked}/${result.total} task${result.total === 1 ? "" : "s"} done in batch ${id}.`,
          },
        ],
        structuredContent: { batchId: id, ...result },
      };
    } catch (err) {
      return textResult(
        `Failed to mark batch ${id}: ${err.message || err}`,
        true,
      );
    }
  },
);

server.registerTool(
  "tsayru_clear_inbox",
  {
    title: "Clear tsayru inbox",
    description:
      "Delete every saved tsayru batch. Irreversible. Returns the number of batches removed.",
    inputSchema: {},
  },
  async () => {
    const deleted = await clearInbox();
    return {
      content: [
        {
          type: "text",
          text: `Removed ${deleted} batch${deleted === 1 ? "" : "es"}.`,
        },
      ],
      structuredContent: { deleted },
    };
  },
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the JSON-RPC channel — log to stderr.
  console.error("[tsayru-mcp] connected via stdio");
};

main().catch((err) => {
  console.error("[tsayru-mcp] fatal:", err);
  process.exit(1);
});
