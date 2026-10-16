import { describe, it, expect } from "vitest";
import {
  withUnit,
  trimPx,
  nudge,
  stepFor,
  parseColor,
  formatColor,
  toHex,
  parseShadows,
  formatShadows,
} from "../src/stylevalues.js";

describe("lengths", () => {
  it("adds px only where a bare number is invalid", () => {
    expect(withUnit("padding-left", "24")).toBe("24px");
    expect(withUnit("padding-left", "0")).toBe("0");
    expect(withUnit("padding-left", "1.5rem")).toBe("1.5rem");
    expect(withUnit("line-height", "1.5")).toBe("1.5");
    expect(withUnit("opacity", "0.4")).toBe("0.4");
    expect(withUnit("--gap", "4")).toBe("4");
  });
  it("trims px for display", () => {
    expect(trimPx("22px")).toBe("22");
    expect(trimPx("22.504px")).toBe("22.5");
    expect(trimPx("6px 22px")).toBe("6px 22px");
    expect(trimPx("auto")).toBe("auto");
  });
  it("nudges the number and keeps the unit", () => {
    expect(nudge("22px", 1)).toBe("23px");
    expect(nudge("1.5rem", 0.1)).toBe("1.6rem");
    expect(nudge("22", -10)).toBe("12");
    expect(nudge("auto", 1, "16px")).toBe("17px");
    expect(nudge("auto", 1, "normal")).toBeNull();
    expect(nudge("0.95", 0.1, "", "opacity")).toBe("1");
  });
  it("steps by tenths for small-range properties", () => {
    expect(stepFor("padding-top", {})).toBe(1);
    expect(stepFor("padding-top", { shiftKey: true })).toBe(10);
    expect(stepFor("opacity", {})).toBe(0.1);
  });
});

describe("colours", () => {
  it("parses what getComputedStyle returns", () => {
    expect(parseColor("rgb(47, 13, 255)")).toEqual({ r: 47, g: 13, b: 255, a: 1 });
    expect(parseColor("rgba(47, 13, 255, 0.08)")).toEqual({ r: 47, g: 13, b: 255, a: 0.08 });
    expect(parseColor("rgb(47 13 255 / 8%)")).toEqual({ r: 47, g: 13, b: 255, a: 0.08 });
    expect(parseColor("#2f0dff")).toEqual({ r: 47, g: 13, b: 255, a: 1 });
    expect(parseColor("#fff8")).toEqual({ r: 255, g: 255, b: 255, a: 0.533 });
    expect(parseColor("color(srgb 1 0 0.5 / 0.5)")).toEqual({ r: 255, g: 0, b: 128, a: 0.5 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor("var(--x)")).toBeNull();
  });
  it("writes hex when opaque, rgb() with alpha otherwise", () => {
    expect(formatColor({ r: 47, g: 13, b: 255, a: 1 })).toBe("#2f0dff");
    expect(formatColor({ r: 47, g: 13, b: 255, a: 0.08 })).toBe("rgb(47 13 255 / 0.08)");
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });
});

describe("shadows", () => {
  it("parses computed and authored layers", () => {
    expect(parseShadows("rgba(0, 0, 0, 0.1) 0px 4px 12px 0px, rgb(47, 13, 255) 0px 0px 0px 1px inset")).toEqual([
      { inset: false, x: "0px", y: "4px", blur: "12px", spread: "0px", color: "rgba(0, 0, 0, 0.1)" },
      { inset: true, x: "0px", y: "0px", blur: "0px", spread: "1px", color: "rgb(47, 13, 255)" },
    ]);
    expect(parseShadows("inset 0 1px var(--edge)")).toEqual([
      { inset: true, x: "0", y: "1px", blur: "0px", spread: "0px", color: "var(--edge)" },
    ]);
    expect(parseShadows("none")).toEqual([]);
  });
  it("round-trips", () => {
    const layers = parseShadows("rgba(0, 0, 0, 0.1) 0px 4px 12px 0px");
    layers[0].blur = "20";
    expect(formatShadows(layers)).toBe("0px 4px 20px 0px rgba(0, 0, 0, 0.1)");
    expect(formatShadows([])).toBe("none");
  });
});
