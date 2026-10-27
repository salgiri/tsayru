import { describe, it, expect, beforeEach, vi } from "vitest";

// A minimal chrome.storage: get/set on a plain object, onChanged listeners
// fired the way Chrome fires them (every tab, including the writer).
const listeners = new Set();
const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: store[k], newValue: v };
          store[k] = v;
        }
        for (const fn of listeners) fn(changes, "local");
      },
    },
    onChanged: {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    },
  },
};

const { state, bus, persist, restore, watchTasks, uid } = await import("../src/core.js");

describe("uid", () => {
  it("is unique", () => {
    const ids = new Set(Array.from({ length: 200 }, uid));
    expect(ids.size).toBe(200);
  });

  it("works where crypto.randomUUID is missing (plain http:// pages)", () => {
    const original = crypto.randomUUID;
    crypto.randomUUID = undefined;
    try {
      expect(uid()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      crypto.randomUUID = original;
    }
  });
});

describe("tasks across tabs", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    state.tasks = [];
    watchTasks(false);
  });

  it("restore gives legacy tasks (no id) an id", async () => {
    store.tsayru_tasks = [{ label: "old", text: "from v0.13" }];
    await restore();
    expect(state.tasks[0].id).toBeTruthy();
  });

  it("ignores its own writes but takes another tab's", async () => {
    const changed = vi.fn();
    bus.on("tasks-changed", changed);
    watchTasks(true);

    state.tasks = [{ id: "a", text: "mine" }];
    const mine = state.tasks;
    await persist();
    expect(state.tasks).toBe(mine); // our echo: state untouched
    expect(changed).not.toHaveBeenCalled();

    // Another tab writes (different writer id in the rev).
    for (const fn of listeners) {
      fn(
        {
          tsayru_tasks: { newValue: [{ id: "b", text: "theirs" }, { text: "no id" }] },
          tsayru_rev: { newValue: "other-tab:7" },
        },
        "local",
      );
    }
    expect(state.tasks.map((t) => t.text)).toEqual(["theirs", "no id"]);
    expect(state.tasks[1].id).toBeTruthy();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("stops listening when the sidebar hides", async () => {
    watchTasks(true);
    watchTasks(false);
    expect(listeners.size).toBe(0);
  });
});
