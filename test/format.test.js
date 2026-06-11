import { describe, it, expect } from "vitest";
import {
  formatTask,
  formatTasks,
  filterByHost,
  safeHost,
} from "../src/format.js";

const task = (over = {}) => ({
  selector: "#save-btn",
  label: "Save",
  text: "Make this button green.",
  url: "http://localhost:5173/settings",
  framework: null,
  computedStyles: null,
  screenshot: null,
  ...over,
});

describe("safeHost", () => {
  it("extracts host with port", () => {
    expect(safeHost("http://localhost:5173/x")).toBe("localhost:5173");
  });
  it("returns null on garbage", () => {
    expect(safeHost("not a url")).toBeNull();
  });
});

describe("filterByHost", () => {
  it("filters by host and tolerates null input", () => {
    const a = task();
    const b = task({ url: "https://example.com/" });
    expect(filterByHost([a, b], "localhost:5173")).toEqual([a]);
    expect(filterByHost(null, null)).toEqual([]);
  });
});

describe("formatTasks", () => {
  it("renders header, numbering and selector", () => {
    const md = formatTasks([task(), task({ label: "Logo" })], null);
    expect(md).toContain("# UI tasks (tsayru)");
    expect(md).toContain("## 1. Save");
    expect(md).toContain("## 2. Logo");
    expect(md).toContain("- selector: `#save-btn`");
  });

  it("suffixes header with filterHost and drops other hosts", () => {
    const md = formatTasks(
      [task(), task({ url: "https://other.com/", label: "Other" })],
      "localhost:5173",
    );
    expect(md).toContain("# UI tasks (tsayru) — localhost:5173");
    expect(md).not.toContain("Other");
  });

  it("returns empty string for no tasks", () => {
    expect(formatTasks([], null)).toBe("");
  });

  it("converts rgb styles to hex and drops defaults", () => {
    const md = formatTasks(
      [
        task({
          computedStyles: {
            color: "rgb(45, 74, 62)",
            backgroundColor: "rgba(0, 0, 0, 0)", // transparent — dropped
            fontSize: "14px",
            fontFamily: '"Inter", sans-serif',
            fontWeight: "600",
            padding: "0px", // default — dropped
            borderRadius: "6px",
            border: "0px none rgb(0, 0, 0)", // none — dropped
            width: 320,
            height: 40,
          },
        }),
      ],
      null,
    );
    expect(md).toContain("color #2d4a3e");
    expect(md).not.toContain("bg ");
    expect(md).toContain("font 14px Inter 600");
    expect(md).toContain("r 6px");
    expect(md).toContain("320×40");
    expect(md).not.toContain("pad ");
  });

  it("renders component and file from framework info", () => {
    const md = formatTasks(
      [
        task({
          framework: {
            framework: "react",
            componentName: "SaveButton",
            source: { file: "src/SaveButton.tsx", line: 23 },
          },
        }),
      ],
      null,
    );
    expect(md).toContain("- component: `SaveButton`");
    expect(md).toContain("- file: `src/SaveButton.tsx:23`");
  });

  it("renders component breadcrumbs outermost-first", () => {
    const md = formatTasks(
      [
        task({
          framework: {
            framework: "react",
            componentName: "SaveButton",
            componentChain: ["SaveButton", "SettingsPage", "App"],
            source: null,
          },
        }),
      ],
      null,
    );
    expect(md).toContain("- component: `SaveButton` (in App › SettingsPage)");
  });

  it("renders html snippet and env line", () => {
    const md = formatTasks(
      [
        task({
          html: '<button class="btn">Save</button>',
          env: { viewport: "1440×900", scheme: "dark", dpr: 2 },
        }),
      ],
      null,
    );
    expect(md).toContain('- html: `<button class="btn">Save</button>`');
    expect(md).toContain("- env: 1440×900 · dark · dpr 2");
  });

  it("omits dpr 1 from env and skips missing html", () => {
    const md = formatTasks(
      [task({ env: { viewport: "1280×800", scheme: "light", dpr: 1 } })],
      null,
    );
    expect(md).toContain("- env: 1280×800 · light");
    expect(md).not.toContain("dpr");
    expect(md).not.toContain("- html:");
  });

  it("renders recent page errors with count/source/age metadata", () => {
    const md = formatTasks(
      [
        task({
          pageErrors: [
            {
              message: "TypeError: x is undefined",
              source: "src/App.tsx:42",
              count: 3,
              ago: 12,
            },
            { message: "unhandled rejection: boom", source: null, count: 1, ago: 2 },
          ],
        }),
      ],
      null,
    );
    expect(md).toContain("- recent page errors:");
    expect(md).toContain("  - `TypeError: x is undefined` (×3, src/App.tsx:42, 12s ago)");
    expect(md).toContain("  - `unhandled rejection: boom` (2s ago)");
  });

  it("marks done tasks and substitutes text for quick-marked ones", () => {
    const md = formatTasks(
      [task({ done: true }), task({ label: "Quick", text: "" })],
      null,
    );
    expect(md).toContain("## 1. ✅ Save");
    expect(md).toContain("## 2. Quick");
    expect(md).toContain("(no description provided");
  });

  describe("screenshot modes", () => {
    const shot = task({ screenshot: "data:image/jpeg;base64,AAAA" });

    it("note (default): no image data leaks into clipboard markdown", () => {
      const md = formatTasks([shot], null);
      expect(md).toContain("- screenshot: ✓ captured");
      expect(md).not.toContain("base64");
    });

    it("inline: embeds the data URL after the task text", () => {
      const md = formatTasks([shot], null, { screenshotMode: "inline" });
      expect(md).toContain("![Save](data:image/jpeg;base64,AAAA)");
      // Text comes before the image — unified order (the old server fork drifted).
      expect(md.indexOf("Make this button green.")).toBeLessThan(
        md.indexOf("![Save]"),
      );
    });

    it("attached: numbers attachments only for tasks that have screenshots", () => {
      const md = formatTasks(
        [task(), shot, task({ ...shot, label: "Second" })],
        null,
        { screenshotMode: "attached" },
      );
      expect(md).toContain("- screenshot: attached image #1");
      expect(md).toContain("- screenshot: attached image #2");
      expect(md).not.toContain("attached image #3");
    });
  });
});

describe("formatTask", () => {
  it("renders a self-contained single-task snippet", () => {
    const md = formatTask(task(), 3);
    expect(md).toContain("# UI task (tsayru)");
    expect(md).toContain("## 3. Save");
    expect(md).toContain("Make this button green.");
  });
});
