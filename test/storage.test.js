import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the inbox at a temp dir BEFORE the module reads the env at import time.
const TMP = await mkdtemp(path.join(tmpdir(), "tsayru-test-"));
process.env.TSAYRU_INBOX = TMP;
process.env.TSAYRU_MAX_BATCHES = "5";

const storage = await import("../server/lib/storage.js");

const sampleTasks = [
  {
    selector: ".cta",
    label: "Sign up",
    text: "Make the CTA more prominent.",
    url: "https://example.com/",
  },
];

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("storage", () => {
  it("saves a batch and lists it newest-first", async () => {
    const meta = await storage.saveBatch({ tasks: sampleTasks, host: "example.com" });
    expect(meta.batchId).toBeTruthy();
    expect(meta.count).toBe(1);

    const list = await storage.listBatches();
    expect(list[0].batchId).toBe(meta.batchId);
    expect(list[0].host).toBe("example.com");
  });

  it("round-trips the envelope and renders markdown", async () => {
    const meta = await storage.saveBatch({ tasks: sampleTasks, host: "example.com" });
    const env = await storage.readBatch(meta.batchId);
    expect(env.tasks).toEqual(sampleTasks);

    const md = await storage.readBatchMarkdown(meta.batchId);
    expect(md).toContain("# UI tasks (tsayru)");
    expect(md).toContain("Make the CTA more prominent.");
  });

  it("generates unique ids for same-millisecond saves", async () => {
    const [a, b] = await Promise.all([
      storage.saveBatch({ tasks: sampleTasks }),
      storage.saveBatch({ tasks: sampleTasks }),
    ]);
    expect(a.batchId).not.toBe(b.batchId);
  });

  it("rejects traversal-shaped batch ids", async () => {
    await expect(storage.readBatch("../../etc/passwd")).rejects.toThrow(/unsafe/);
    await expect(storage.deleteBatch("a/b")).rejects.toThrow(/unsafe/);
  });

  it("rejects oversized and malformed batches", async () => {
    const tooMany = Array.from({ length: 501 }, () => ({ text: "x" }));
    await expect(storage.saveBatch({ tasks: tooMany })).rejects.toThrow(/too many/);
    await expect(storage.saveBatch({ tasks: ["not-an-object"] })).rejects.toThrow(
      /must be an object/,
    );
    await expect(storage.saveBatch({ tasks: "nope" })).rejects.toThrow(/array/);
  });

  it("deleteBatch returns false for missing, true for existing", async () => {
    expect(await storage.deleteBatch("2099-01-01T00-00-00-000Z-aaaaaa")).toBe(false);
    const meta = await storage.saveBatch({ tasks: sampleTasks });
    expect(await storage.deleteBatch(meta.batchId)).toBe(true);
    expect(await storage.readBatch(meta.batchId)).toBeNull();
  });

  it("prunes oldest batches beyond TSAYRU_MAX_BATCHES", async () => {
    await storage.clearInbox();
    for (let i = 0; i < 8; i++) {
      await storage.saveBatch({ tasks: sampleTasks });
    }
    const list = await storage.listBatches({ limit: 50 });
    expect(list.length).toBeLessThanOrEqual(5);
  });

  it("markTasksDone by ids, indices, and all; listDoneTaskIds picks them up", async () => {
    await storage.clearInbox();
    const tasks = [
      { id: "id-a", text: "a", label: "A", selector: ".a", url: "https://x.test/" },
      { id: "id-b", text: "b", label: "B", selector: ".b", url: "https://x.test/" },
      { id: "id-c", text: "c", label: "C", selector: ".c", url: "https://x.test/" },
    ];
    const meta = await storage.saveBatch({ tasks });

    // by id
    let r = await storage.markTasksDone(meta.batchId, { taskIds: ["id-b"] });
    expect(r).toEqual({ marked: 1, total: 3 });
    // by 1-based index
    r = await storage.markTasksDone(meta.batchId, { indices: [1] });
    expect(r).toEqual({ marked: 1, total: 3 });
    // remaining (all)
    r = await storage.markTasksDone(meta.batchId);
    expect(r).toEqual({ marked: 1, total: 3 });

    const env = await storage.readBatch(meta.batchId);
    expect(env.tasks.every((t) => t.done)).toBe(true);

    // markdown re-rendered with checkmarks
    const md = await storage.readBatchMarkdown(meta.batchId);
    expect(md).toContain("✅");

    const ids = await storage.listDoneTaskIds();
    expect(ids.sort()).toEqual(["id-a", "id-b", "id-c"]);

    // missing batch -> null
    expect(await storage.markTasksDone("2099-01-01T00-00-00-000Z-ffffff")).toBeNull();
  });

  it("clearInbox wipes everything and reports the count", async () => {
    await storage.saveBatch({ tasks: sampleTasks });
    const deleted = await storage.clearInbox();
    expect(deleted).toBeGreaterThan(0);
    expect(await storage.listBatches()).toEqual([]);
  });
});
