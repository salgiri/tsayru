// Inline SVG for the UI: a small hand-drawn icon set on a 24px grid, the
// brand mark and the shell's speckle. Built with createElementNS — no markup
// strings, nothing for a page's Trusted Types policy to object to.
//
// Icons are filled where there is a shape to fill (cut-outs via evenodd);
// glyphs that are only lines (×, ✓, chevron, #) stay as round 2.2px strokes.

const NS = "http://www.w3.org/2000/svg";

const svg = (attrs, children = []) => {
  const node = document.createElementNS(NS, attrs.tag || "svg");
  for (const [k, v] of Object.entries(attrs)) if (k !== "tag") node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
};

const path = (d) => svg({ tag: "path", d });
const solid = (d) => svg({ tag: "path", d, class: "fill", "fill-rule": "evenodd" });
const dot = (cx, cy, r) => svg({ tag: "circle", cx, cy, r, class: "fill" });

const ICONS = {
  // bullseye with sight marks
  target: () => [
    solid("M4.5 12a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0ZM7.4 12a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0-9.2 0Z"),
    dot(12, 12, 2.3),
    path("M12 1.5V4M12 20v2.5M1.5 12H4M20 12h2.5"),
  ],
  sliders: () => [path("M3.5 7h17M3.5 17h17"), dot(15, 7, 3.2), dot(9, 17, 3.2)],
  // paper plane, the fold cut out
  send: () => [
    solid(
      "M20.9 3.1a.9.9 0 0 1 .2 1L14.6 20.6a1 1 0 0 1-1.8.1l-3-6.4-6.4-3a1 1 0 0 1 .1-1.8l16.5-6.5a.9.9 0 0 1 .9.1ZM19.9 3.5l.6.6-9.6 9.6-.6-.6Z",
    ),
  ],
  copy: () => [
    svg({ tag: "rect", x: 8.5, y: 8.5, width: 12, height: 12, rx: 3, class: "fill" }),
    path("M15.5 6v-.5A2.5 2.5 0 0 0 13 3H5.5A2.5 2.5 0 0 0 3 5.5V13a2.5 2.5 0 0 0 2.5 2.5H6"),
  ],
  trash: () => [
    path("M3.5 6.5h17M9.5 6.5V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1.5"),
    solid("M5.7 8.5h12.6l-.85 11.2a2 2 0 0 1-2 1.8H8.55a2 2 0 0 1-2-1.8ZM9.6 11.5h1.3V18H9.6ZM13.1 11.5h1.3V18h-1.3Z"),
  ],
  hide: () => [path("m9.5 6 6 6-6 6")],
  close: () => [path("m6.5 6.5 11 11M17.5 6.5l-11 11")],
  // pencil, the ferrule seam cut out
  edit: () => [
    solid(
      "M14.6 4.9a2.3 2.3 0 0 1 3.25 0l1.25 1.25a2.3 2.3 0 0 1 0 3.25L8.9 19.6l-4.6 1.1a.8.8 0 0 1-1-1l1.1-4.6ZM12.9 6.9l.6-.6 4.2 4.2-.6.6Z",
    ),
  ],
  check: () => [path("m5 12.5 4.5 4.5L19 7")],
  chat: () => [
    solid("M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5Z"),
  ],
  hash: () => [path("M5 9h14M5 15h14M10 4 8 20M16 4l-2 16")],
  // triangle, the exclamation mark cut out
  alert: () => [
    solid(
      "M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM11 8.8h2v5.4h-2ZM12 15.6a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4Z",
    ),
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
