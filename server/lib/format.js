// Thin wrapper over the shared formatter in /src/format.js — single source of
// truth for the markdown shape (the old hand-copied port drifted; never fork it
// again). Server output embeds screenshots inline so MCP consumers get the
// full picture without extra round-trips.

import { formatTasks } from "../../src/format.js";

export { formatTasks };

// Convenience wrapper for callers that already have a stored batch envelope
// `{ batchId, host, filterHost, tasks, addedAt }`.
export const formatBatch = (batch) =>
  formatTasks(batch.tasks, batch.filterHost || null, {
    screenshotMode: "inline",
  });
