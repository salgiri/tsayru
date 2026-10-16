// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  splitSelectorList,
  classifySelector,
  expandStates,
  specificity,
  resolveNested,
  forceSelector,
  parseDeclarations,
  shortPath,
  collectRules,
  groupByState,
  winningEntry,
  declaredIn,
  forceState,
  FORCE_ATTR,
} from "../src/cssrules.js";

// jsdom has no matchMedia; the walker takes a window-like with one.
const fakeWin = (matches = () => true) => ({
  matchMedia: (q) => ({ matches: matches(q) }),
});

const mount = (css, html) => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = html;
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("splitSelectorList", () => {
  it("splits on top-level commas only", () => {
    expect(splitSelectorList('a, b:is(c, d), [x="1,2"]')).toEqual([
      "a",
      "b:is(c, d)",
      '[x="1,2"]',
    ]);
  });
  it("keeps escaped commas inside class names", () => {
    expect(splitSelectorList(".a\\,b, .c")).toEqual([".a\\,b", ".c"]);
  });
});

describe("classifySelector", () => {
  it("strips the state and keeps the base", () => {
    expect(classifySelector(".btn:hover")).toMatchObject({ state: ":hover", base: ".btn", also: [] });
    expect(classifySelector(".btn:focus-visible")).toMatchObject({ state: ":focus-visible", base: ".btn" });
    expect(classifySelector(".btn")).toMatchObject({ state: "default", base: ".btn" });
  });
  it("puts pseudo-elements first and keeps the states they need", () => {
    expect(classifySelector(".btn:hover::before")).toMatchObject({
      state: "::before",
      also: [":hover"],
      base: ".btn",
    });
    expect(classifySelector(".x:after")).toMatchObject({ state: "::after", base: ".x" });
  });
  it("leaves :focus-within and :focus-visible alone when looking for :focus", () => {
    expect(classifySelector(".f:focus-within")).toMatchObject({ state: "default", base: ".f:focus-within" });
  });
  it("ignores states inside :not() and :has()", () => {
    expect(classifySelector(".btn:focus:not(:focus-visible)")).toMatchObject({
      state: ":focus",
      base: ".btn:not(:focus-visible)",
    });
    expect(classifySelector(".card:has(:hover)")).toMatchObject({ state: "default" });
  });
  it("ignores escaped colons in utility class names", () => {
    expect(classifySelector(".hover\\:bg-red:hover")).toMatchObject({
      state: ":hover",
      base: ".hover\\:bg-red",
    });
    expect(classifySelector(".\\[\\&\\:hover\\]\\:x")).toMatchObject({ state: "default" });
  });
  it("keeps a compound when its only part was the state", () => {
    expect(classifySelector(".menu > :hover .icon").base).toBe(".menu > * .icon");
    expect(classifySelector("::before").base).toBe("*");
  });
  it("files ancestor states under the element's view of them", () => {
    expect(classifySelector(".card:hover .title")).toMatchObject({
      state: ":hover",
      base: ".card .title",
    });
  });
});

describe("expandStates", () => {
  it("splits state alternatives inside :is()", () => {
    expect(expandStates(".x:is(:hover, :focus-visible)")).toEqual([
      ".x:is(:hover)",
      ".x:is(:focus-visible)",
    ]);
    expect(classifySelector(".x:is(:hover)")).toMatchObject({ state: ":hover", base: ".x:is(*)" });
    expect(expandStates(".x:is(.a, .b)")).toEqual([".x:is(.a, .b)"]);
    expect(expandStates(".x:not(:hover, :focus)")).toEqual([".x:not(:hover, :focus)"]);
  });
});

describe("specificity", () => {
  it("counts ids, classes and types", () => {
    expect(specificity("#a .b c")).toEqual([1, 1, 1]);
    expect(specificity("a.b.c:hover::before")).toEqual([0, 3, 2]);
    expect(specificity('[data-x="y"]')).toEqual([0, 1, 0]);
  });
  it("handles :where(), :is() and :not()", () => {
    expect(specificity(":where(#a) .b")).toEqual([0, 1, 0]);
    expect(specificity(":is(#a, .b) c")).toEqual([1, 0, 1]);
    expect(specificity(".a:not(.b, #c)")).toEqual([1, 1, 0]);
  });
  it("treats escaped class names as one class", () => {
    expect(specificity(".md\\:px-4")).toEqual([0, 1, 0]);
    expect(specificity(".hover\\:bg-x:hover")).toEqual([0, 2, 0]);
  });
});

describe("resolveNested", () => {
  it("substitutes & and prefixes bare selectors", () => {
    expect(resolveNested("&:hover", [".btn"])).toBe(".btn:hover");
    expect(resolveNested(".icon", [".btn"])).toBe(".btn .icon");
    expect(resolveNested("&:hover", [".a", ".b"])).toBe(":is(.a, .b):hover");
    expect(resolveNested(".x &", [".a .b"])).toBe(".x :is(.a .b)");
  });
});

describe("forceSelector", () => {
  it("swaps states for the force attribute", () => {
    expect(forceSelector(".card:hover .badge", ["hover"])).toBe(
      `.card[${FORCE_ATTR}~="hover"] .badge`,
    );
    expect(forceSelector(".i:focus-visible", ["focus-visible", "focus"])).toBe(
      `.i[${FORCE_ATTR}~="focus-visible"]`,
    );
  });
  it("leaves :not() arguments and escapes alone", () => {
    expect(forceSelector(".a:not(:hover)", ["hover"])).toBe(".a:not(:hover)");
    expect(forceSelector(".hover\\:x:hover", ["hover"])).toBe(
      `.hover\\:x[${FORCE_ATTR}~="hover"]`,
    );
  });
});

describe("parseDeclarations", () => {
  it("keeps shorthands, importance and quoted semicolons", () => {
    expect(parseDeclarations('padding: 6px 22px; background: url("a;b") !important;')).toEqual([
      { name: "padding", value: "6px 22px", important: false },
      { name: "background", value: 'url("a;b")', important: true },
    ]);
  });
});

describe("shortPath", () => {
  it("cuts absolute dev paths at the project's source folder", () => {
    expect(shortPath("/Users/x/Rise/client/src/kit/bento.css?t=1")).toBe(
      "client/src/kit/bento.css",
    );
    expect(shortPath("/assets/index-abc.css")).toBe("assets/index-abc.css");
  });
});

describe("collectRules", () => {
  it("groups the element's rules by state, winner first", () => {
    mount(
      `.btn { color: red }
       a.btn { padding: 4px }
       .btn:hover { color: blue }
       .btn::before { content: "" }
       .other { color: green }
       @media (min-width: 900px) { .btn { margin: 0 } }`,
      `<a class="btn" href="#">x</a>`,
    );
    const target = document.querySelector(".btn");
    const { entries, skipped } = collectRules(target, {
      root: document,
      win: fakeWin((q) => !q.includes("900px")),
    });
    expect(skipped).toBe(0);
    const groups = groupByState(entries);
    expect(groups.default.map((e) => e.selector)).toEqual(["a.btn", ".btn", ".btn"]);
    expect(groups[":hover"].map((e) => e.selector)).toEqual([".btn:hover"]);
    expect(groups["::before"]).toHaveLength(1);
    const media = groups.default.find((e) => e.conditions.length);
    expect(media.conditions).toEqual(["@media (min-width: 900px)"]);
    expect(media.active).toBe(false);
  });

  it("lists :is() state alternatives under each state", () => {
    mount(`.a:is(:hover, :focus-visible) { color: red }`, `<a class="a">x</a>`);
    const { entries } = collectRules(document.querySelector(".a"), { root: document, win: fakeWin() });
    const groups = groupByState(entries);
    expect(groups[":hover"]).toHaveLength(1);
    expect(groups[":focus-visible"]).toHaveLength(1);
    expect(groups[":hover"][0].selector).toBe(".a:is(:hover, :focus-visible)");
  });

  it("lists a selector list once per state, under its most specific match", () => {
    mount(`.a, a.a, .a:hover { color: red }`, `<a class="a">x</a>`);
    const { entries } = collectRules(document.querySelector(".a"), { root: document, win: fakeWin() });
    const groups = groupByState(entries);
    expect(groups.default).toHaveLength(1);
    expect(groups.default[0].selector).toBe("a.a");
    expect(groups.default[0].ruleSelector).toBe(".a, a.a, .a:hover");
    expect(groups[":hover"]).toHaveLength(1);
  });

  it("finds the rule that sets a property", () => {
    // Longhands only: jsdom's CSSOM doesn't expand shorthands (Chrome does).
    mount(
      `.x { padding-top: 4px; padding-left: 8px } #y { padding-left: 2px } .x.z { color: red !important } #y { color: blue }`,
      `<div id="y" class="x z"></div>`,
    );
    const { entries } = collectRules(document.querySelector(".x"), { root: document, win: fakeWin() });
    expect(winningEntry(entries, "padding-left").selector).toBe("#y");
    expect(winningEntry(entries, "padding-top").selector).toBe(".x");
    expect(winningEntry(entries, "color").selector).toBe(".x.z");
    expect(winningEntry(entries, "margin")).toBeNull();
  });

  it("finds a declaration made through a shorthand", () => {
    const style = { getPropertyValue: (p) => (p === "background" ? "var(--bg)" : ""), getPropertyPriority: () => "" };
    expect(declaredIn(style, "background-color")).toEqual({ value: "var(--bg)", priority: "", via: "background" });
    expect(declaredIn(style, "color")).toBeNull();
  });
});

describe("forceState", () => {
  it("twins state rules and marks the element and its ancestors", () => {
    mount(`.card:hover .t { color: red } .t:focus { color: blue }`, `<div class="card"><p class="t">x</p></div>`);
    const t = document.querySelector(".t");
    const rules = document.styleSheets[0].cssRules;
    const undo = forceState(t, ":hover", { root: document, win: fakeWin() });
    expect(rules[0].selectorText).toContain(`.card[${FORCE_ATTR}~="hover"] .t`);
    expect(rules[1].selectorText).toBe(".t:focus");
    expect(t.getAttribute(FORCE_ATTR)).toBe("hover");
    expect(document.querySelector(".card").getAttribute(FORCE_ATTR)).toBe("hover");
    // collectRules never lists the twins.
    const { entries } = collectRules(t, { root: document, win: fakeWin() });
    expect(entries.filter((e) => e.selector.includes(FORCE_ATTR))).toHaveLength(0);
    undo();
    expect(rules[0].selectorText).toBe(".card:hover .t");
    expect(t.hasAttribute(FORCE_ATTR)).toBe(false);
    expect(document.querySelector(".card").hasAttribute(FORCE_ATTR)).toBe(false);
  });
});
