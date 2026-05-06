// MCP server for the tsayru inbox.
// Spawned by Claude Code over stdio. Reads the same ~/.tsayru/inbox/
// folder that http.js writes into.
//
// Tools:
//   tsayru_latest_tasks  -> latest batch as markdown
//   tsayru_list_batches  -> recent batch metadata { limit? }
//   tsayru_get_batch     -> specific batch as markdown { batchId }
//   tsayru_clear_inbox   -> wipe all batches; returns { deleted }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  listBatches,
  readBatchMarkdown,
  clearInbox,
} from "./lib/storage.js";

const server = new McpServer({
  name: "tsayru",
  version: "0.1.0",
});

const textResult = (text, isError = false) => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

// Filter batches by `targetProjectPath` matching the current process CWD.
// When the extension picker stamps a batch with a project, only sessions
// running in that project's CWD will see it through this tool.
// Batches with no `targetProjectPath` (legacy / global sends) are returned
// to every project as a fallback.
const pickLatestForCwd = async () => {
  const cwd = process.cwd();
  const all = await listBatches({ limit: 200 });
  const targeted = all.filter(
    (b) => b.targetProjectPath && b.targetProjectPath === cwd,
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
