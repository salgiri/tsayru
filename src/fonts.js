// The UI typeface, Onest (SIL OFL, extension/fonts/). @font-face rules don't
// apply inside shadow roots and a page's CSP may block font URLs, so the
// background hands over the files' bytes and the faces go into
// document.fonts directly — no web_accessible_resources for pages to probe.
// Until they load (or if they never do) the system UI font stands in.

import { ask } from "./core.js";
import { FONT_FAMILY } from "./theme-css.js";

const FACES = [
  {
    file: "onest-latin.woff2",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
  {
    file: "onest-cyrillic.woff2",
    unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  },
];

const readFont = async (file) => {
  const resp = await ask({ type: "TSAYRU_FONT", file });
  return resp.ok ? resp.data : null;
};

const toBytes = (base64) => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

let loading = null;

export const ensureFonts = () =>
  (loading ||= Promise.all(
    FACES.map(async ({ file, unicodeRange }) => {
      const data = await readFont(file);
      if (!data) return;
      const face = new FontFace(FONT_FAMILY, toBytes(data), {
        weight: "100 900",
        unicodeRange,
      });
      document.fonts.add(face);
      await face.load();
    }),
  ).catch((err) => console.warn("[tsayru] UI font failed to load:", err)));

// For the first open: the font, or after `ms` whatever we have.
export const fontsReady = (ms) =>
  Promise.race([ensureFonts(), new Promise((resolve) => setTimeout(resolve, ms))]);
