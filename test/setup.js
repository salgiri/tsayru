// jsdom does not implement CSS.escape — minimal spec-compatible polyfill for
// the character classes our selectors actually produce (Chrome provides the
// real one at runtime).
if (typeof globalThis.CSS === "undefined") globalThis.CSS = {};
if (!globalThis.CSS.escape) {
  globalThis.CSS.escape = (value) => {
    const s = String(value);
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const code = ch.charCodeAt(0);
      if (code === 0) {
        out += "�";
      } else if (i === 0 && /[0-9]/.test(ch)) {
        out += `\\${code.toString(16)} `;
      } else if (code >= 0x80 || /[a-zA-Z0-9_-]/.test(ch)) {
        out += ch;
      } else {
        out += `\\${ch}`;
      }
    }
    return out;
  };
}
