// Inline SVG for the UI: a small hand-drawn icon set (24px grid, 2px round
// strokes), the brand mark and the shell's speckle. Built with createElementNS
// — no markup strings, nothing for a page's Trusted Types policy to object to.

const NS = "http://www.w3.org/2000/svg";

const svg = (attrs, children = []) => {
  const node = document.createElementNS(NS, attrs.tag || "svg");
  for (const [k, v] of Object.entries(attrs)) if (k !== "tag") node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
};

const path = (d) => svg({ tag: "path", d });
const circle = (cx, cy, r, fill) => svg({ tag: "circle", cx, cy, r, ...(fill ? { class: "fill" } : {}) });
const rect = (x, y, width, height, rx) => svg({ tag: "rect", x, y, width, height, rx });

const ICONS = {
  target: () => [circle(12, 12, 7.5), circle(12, 12, 2.6, true), path("M12 1.5V5M12 19v3.5M1.5 12H5M19 12h3.5")],
  sliders: () => [path("M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"), circle(15, 7, 2.5), circle(9, 17, 2.5)],
  send: () => [path("M21 3 10.5 13.5"), path("M21 3 14.5 21l-4-7.5L3 9.5z")],
  copy: () => [
    rect(8.5, 8.5, 12, 12, 3),
    path("M15.5 8.5v-2a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2"),
  ],
  trash: () => [
    path("M4 6.5h16"),
    path("M9.5 6.5v-2A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5v2"),
    path("m6 6.5.9 12.6a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 6.5"),
  ],
  hide: () => [path("m9.5 6 6 6-6 6")],
  close: () => [path("m6.5 6.5 11 11M17.5 6.5l-11 11")],
  edit: () => [path("m4 20 1-4.5L15.8 4.7a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19z"), path("m13.5 7 3.5 3.5")],
  check: () => [path("m5 12.5 4.5 4.5L19 7")],
  chat: () => [
    path("M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5z"),
  ],
  hash: () => [path("M5 9h14M5 15h14M10 4 8 20M16 4l-2 16")],
  alert: () => [
    path("M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
    path("M12 9.5v4"),
    path("M12 17h.01"),
  ],
  external: () => [path("M14 4h6v6M20 4l-9 9"), path("M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4")],
};

export const icon = (name) =>
  svg({ class: "i", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, ICONS[name]());

// The toolbar icon's needle (icon/tsayru.svg), drawn on the signal key.
const NEEDLE =
  "M1157 -71.5 543.6 537.9 535.5 546c-67.5 67.5-67.5 176.9 0 244.4l8.1 8.1-81.5 81.5-8.1-8.1" +
  "c-67.5-67.5-176.9-67.5-244.4 0l-8.1 8.1-81.5-81.5 8.1-8.1c67.5-67.5 67.5-176.9 0-244.4" +
  "l-8.1-8.1 81.5-81.5 8.1 8.1c67.5 67.5 176.9 67.5 244.4 0l8.1-8.1L1075.5 -153z";

export const brandMark = () =>
  svg({ viewBox: "0 0 1000 1000", "aria-hidden": "true", focusable: "false" }, [
    svg({ tag: "path", d: NEEDLE, fill: "#fad620" }),
  ]);

// Sparse light and dark specks from one noise field — the matte plastic of
// the shell. Theme opacity lives in CSS (.grain).
let grainId = 0;
export const grain = () => {
  const id = `tsayru-grain-${++grainId}`;
  const matrix = (values, result) => svg({ tag: "feColorMatrix", in: "n", type: "matrix", values, result });
  return svg({ class: "grain", "aria-hidden": "true", focusable: "false" }, [
    svg({ tag: "filter", id, x: "0", y: "0", width: "100%", height: "100%" }, [
      svg({
        tag: "feTurbulence",
        type: "fractalNoise",
        baseFrequency: "0.95",
        numOctaves: "1",
        seed: "4",
        stitchTiles: "stitch",
        result: "n",
      }),
      matrix("0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  14 0 0 0 -9.1", "hi"),
      matrix("0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -14 0 0 4.6", "lo"),
      svg({ tag: "feMerge" }, [svg({ tag: "feMergeNode", in: "lo" }), svg({ tag: "feMergeNode", in: "hi" })]),
    ]),
    svg({ tag: "rect", width: "100%", height: "100%", filter: `url(#${id})` }),
  ]);
};
