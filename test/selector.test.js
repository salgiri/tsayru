// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { buildSelector, queryDeep, shortLabel } from "../src/selector.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

const mount = (html) => {
  document.body.innerHTML = html;
};

describe("buildSelector — anchor priority", () => {
  it("prefers data-testid over everything", () => {
    mount('<button id="b1" data-testid="save" class="btn">Save</button>');
    const el = document.querySelector("button");
    expect(buildSelector(el)).toBe('[data-testid="save"]');
  });

  it("falls back to id", () => {
    mount('<button id="save-btn" class="btn">Save</button>');
    const el = document.querySelector("button");
    expect(buildSelector(el)).toBe("#save-btn");
  });

  it("uses tag[aria-label] when no testid/id", () => {
    mount('<button aria-label="Save file">💾</button>');
    const el = document.querySelector("button");
    expect(buildSelector(el)).toBe('button[aria-label="Save\\ file"]');
  });
});

describe("buildSelector — class chains", () => {
  it("filters hash-like classes but keeps semantic ones", () => {
    mount('<div class="container css-1d4qfvq x9f3k2lp1"><span>x</span></div>');
    const el = document.querySelector("div");
    const sel = buildSelector(el);
    expect(sel).toContain(".container");
    expect(sel).not.toContain("css-1d4qfvq");
    expect(sel).not.toContain("x9f3k2lp1");
  });

  it("disambiguates siblings with nth-of-type", () => {
    mount("<ul><li>a</li><li>b</li><li>c</li></ul>");
    const second = document.querySelectorAll("li")[1];
    const sel = buildSelector(second);
    expect(sel).toContain("li:nth-of-type(2)");
    expect(document.querySelector(sel)).toBe(second);
  });

  it("produced selector uniquely matches the target", () => {
    mount(`
      <div class="row"><button class="btn">A</button></div>
      <div class="row"><button class="btn">B</button></div>
    `);
    const target = document.querySelectorAll("button")[1];
    const sel = buildSelector(target);
    const matches = document.querySelectorAll(sel);
    expect(matches.length).toBe(1);
    expect(matches[0]).toBe(target);
  });
});

describe("shadow DOM", () => {
  it("builds a host >>> inner selector and queryDeep resolves it", () => {
    mount('<div id="host"></div>');
    const host = document.getElementById("host");
    const root = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    inner.className = "inner-btn";
    inner.textContent = "Click";
    root.appendChild(inner);

    const sel = buildSelector(inner);
    expect(sel).toBe("#host >>> button.inner-btn");
    expect(queryDeep(sel)).toBe(inner);
  });

  it("queryDeep returns null when a hop is missing", () => {
    mount('<div id="host"></div>');
    expect(queryDeep("#host >>> .nope")).toBeNull();
    expect(queryDeep("#missing >>> .x")).toBeNull();
  });
});

describe("shortLabel", () => {
  it("collapses whitespace and truncates at 60 chars", () => {
    mount(`<p>  hello\n   world  </p>`);
    expect(shortLabel(document.querySelector("p"))).toBe("hello world");
    mount(`<p>${"a".repeat(80)}</p>`);
    expect(shortLabel(document.querySelector("p"))).toHaveLength(60);
  });

  it("falls back to tag name for empty elements", () => {
    mount("<section></section>");
    expect(shortLabel(document.querySelector("section"))).toBe("section");
  });
});
