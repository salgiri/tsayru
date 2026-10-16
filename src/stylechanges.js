// Style-editor change records: merge and render. Pure — format.js (and so
// the Node server) renders them too.
//
// A change:
//   { scope: "element" | "rule" | "new-rule",
//     selector,    // element: the element's selector; rule: the rule's selector list
//     state,       // new-rule: ":hover", "::before", …
//     sheet,       // rule: the stylesheet it lives in
//     conditions,  // rule: ["@media (min-width: 901px)", …]
//     property, before, after,  // before null = added, after null = removed
//     origin }     // element: { selector, sheet, conditions, inherited } of
//                  // the rule that set `before`, when one did

export const changeKey = (c) =>
  [c.scope, c.selector, c.state || "", (c.conditions || []).join(" "), c.property].join(
    "\u0001",
  );

// Fold `next` into `prev`: the earliest `before` and the latest `after` win,
// and a property back where it started drops out.
export const mergeChanges = (prev = [], next = []) => {
  const map = new Map((prev || []).map((c) => [changeKey(c), { ...c }]));
  for (const c of next || []) {
    const key = changeKey(c);
    const old = map.get(key);
    map.set(key, old ? { ...c, before: old.before, origin: old.origin ?? c.origin } : { ...c });
  }
  return [...map.values()].filter((c) => (c.before ?? null) !== (c.after ?? null));
};

const code = (s) => `\`${String(s).replace(/`/g, "'")}\``;
const where = (sheet, conditions) =>
  [sheet, ...(conditions || [])].filter(Boolean).join(" · ");

const groupHead = (c) => {
  if (c.scope === "element") return "this element (previewed as inline styles)";
  if (c.scope === "new-rule") {
    const state = c.state && c.state !== "default" ? ` ${code(c.state)}` : "";
    return `new${state} rule for this element (${code(c.selector)})`;
  }
  const at = where(c.sheet, c.conditions);
  return `rule ${code(c.selector)}${at ? ` in ${at}` : ""}`;
};

const changeLine = (c) => {
  const prop = code(c.property);
  let line;
  if (c.before == null) line = `${prop}: add ${code(c.after)}`;
  else if (c.after == null) line = `${prop}: remove (was ${code(c.before)})`;
  else line = `${prop}: ${code(c.before)} → ${code(c.after)}`;
  if (c.origin?.selector) {
    const at = where(c.origin.sheet, c.origin.conditions);
    const how = c.origin.inherited ? "inherited from" : "set by";
    line += ` — ${how} ${code(c.origin.selector)}${at ? ` in ${at}` : ""}`;
  }
  return line;
};

// Markdown lines for a task's change list, grouped by where each change
// belongs. Empty array when there is nothing to render.
export const styleChangeLines = (changes) => {
  if (!Array.isArray(changes) || !changes.length) return [];
  const groups = new Map();
  for (const c of changes) {
    const head = groupHead(c);
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(c);
  }
  const lines = ["- style changes:"];
  for (const [head, list] of groups) {
    lines.push(`  - ${head}:`);
    for (const c of list) lines.push(`    - ${changeLine(c)}`);
  }
  return lines;
};

// What Claude is asked to do with a style task.
export const STYLE_INSTRUCTION =
  "Apply the style changes above in the source code. Change the rule or component " +
  "that sets each value (not inline styles), and use an existing design token " +
  "where one matches. A rule change applies to every element that rule styles; " +
  "if the rule is a utility class (Tailwind etc.), change this element's classes instead.";
