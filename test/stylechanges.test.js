import { describe, it, expect } from "vitest";
import { mergeChanges, styleChangeLines } from "../src/stylechanges.js";
import { formatTask } from "../src/format.js";

const el = (property, before, after, extra = {}) => ({
  scope: "element",
  selector: "a.cta",
  property,
  before,
  after,
  ...extra,
});

describe("mergeChanges", () => {
  it("keeps the first before and the last after", () => {
    const merged = mergeChanges([el("padding-left", "22px", "28px")], [el("padding-left", "28px", "30px")]);
    expect(merged).toEqual([el("padding-left", "22px", "30px")]);
  });
  it("drops a property put back where it started", () => {
    expect(mergeChanges([el("color", "#000", "#f00")], [el("color", "#f00", "#000")])).toEqual([]);
    expect(mergeChanges([], [el("color", "#000", "#000")])).toEqual([]);
  });
  it("keeps the same property in different rules apart", () => {
    const a = { scope: "rule", selector: ".a", property: "color", before: "red", after: "blue" };
    const b = { ...a, selector: ".b" };
    expect(mergeChanges([a], [b])).toHaveLength(2);
  });
});

describe("styleChangeLines", () => {
  it("groups by where the change belongs and says where values came from", () => {
    const lines = styleChangeLines([
      el("padding-left", "22px", "28px", {
        origin: { selector: ".gc .bt-cta", sheet: "client/src/kit/bento.css", conditions: [] },
      }),
      el("color", "rgb(0, 0, 0)", "#2f0dff", { origin: { selector: ".hero", sheet: "a.css", inherited: true } }),
      {
        scope: "rule",
        selector: ".bt-cta:hover",
        sheet: "client/src/kit/bento.css",
        conditions: ["@media (hover: hover)"],
        property: "box-shadow",
        before: "none",
        after: null,
      },
      { scope: "new-rule", selector: "a.cta:focus-visible", state: ":focus-visible", property: "outline", before: null, after: "2px solid #2f0dff" },
    ]);
    expect(lines).toEqual([
      "- style changes:",
      "  - this element (previewed as inline styles):",
      "    - `padding-left`: `22px` → `28px` — set by `.gc .bt-cta` in client/src/kit/bento.css",
      "    - `color`: `rgb(0, 0, 0)` → `#2f0dff` — inherited from `.hero` in a.css",
      "  - rule `.bt-cta:hover` in client/src/kit/bento.css · @media (hover: hover):",
      "    - `box-shadow`: remove (was `none`)",
      "  - new `:focus-visible` rule for this element (`a.cta:focus-visible`):",
      "    - `outline`: add `2px solid #2f0dff`",
    ]);
  });
  it("renders nothing without changes", () => {
    expect(styleChangeLines(undefined)).toEqual([]);
    expect(styleChangeLines([])).toEqual([]);
  });
});

describe("formatTask with style changes", () => {
  it("lists the changes and asks for a source edit", () => {
    const md = formatTask(
      {
        selector: "a.cta",
        label: "Style: Start",
        text: "",
        url: "http://localhost:5197/",
        styleChanges: [el("padding-left", "22px", "28px")],
      },
      1,
    );
    expect(md).toContain("- style changes:");
    expect(md).toContain("`padding-left`: `22px` → `28px`");
    expect(md).toContain("Apply the style changes above in the source code.");
    expect(md).not.toContain("no description provided");
  });
  it("keeps the user's note ahead of the instruction", () => {
    const md = formatTask(
      { selector: "a", label: "Style: x", text: "Match the hero button", url: "http://x/", styleChanges: [el("color", "red", "blue")] },
      1,
    );
    expect(md).toMatch(/Match the hero button\n\nApply the style changes above/);
  });
});
