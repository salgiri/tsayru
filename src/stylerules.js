// CSS tab: every rule that styles the element, one state at a time, editable
// like DevTools' Styles pane — change values and names, tick declarations
// off and on, delete, add. Choosing Hover/Focus/Active also shows the
// element in that state on the page.

import { h, bindKeys, colorOf } from "./stylewidgets.js";
import {
  STATES,
  FORCEABLE,
  parseDeclarations,
  classifySelector,
  splitSelectorList,
} from "./cssrules.js";
import { parseColor, formatColor, toHex } from "./stylevalues.js";

const LABELS = {
  default: "Default",
  ":hover": "Hover",
  ":focus": "Focus",
  ":focus-visible": "Focus-visible",
  ":active": "Active",
  "::before": "Before",
  "::after": "After",
};

// The chosen state carries over to the next element: restyling the hover of
// one button after another stays one ⌘+click each.
let lastState = "default";

const splitImportant = (text) => {
  const s = String(text ?? "").trim();
  const important = /!\s*important\s*$/i.test(s);
  return { value: important ? s.replace(/!\s*important\s*$/i, "").trim() : s, important };
};

// Rules whose subject is `*` style every element (resets, box-sizing): true,
// but noise next to the element's own rules — folded away by default.
const isGlobal = (e) => /(^|[\s>+~(])\*$/.test(classifySelector(e.selector).base);

const normName = (text) => {
  const n = String(text ?? "").trim();
  return n.startsWith("--") ? n : n.toLowerCase();
};

// One shape for both kinds of card: a page rule, or the element's own
// style attribute (where Quick edits land).
const ruleAdapter = (api, entry) => ({
  key: entry.rule,
  entry,
  created: api.isCreated(entry.rule),
  canToggle: true,
  decls: () =>
    parseDeclarations(entry.rule.style.cssText).map((d) => ({
      ...d,
      important: api.shownImportant(entry.rule, d),
    })),
  off: () => api.disabledProps(entry.rule),
  set: (name, value, important) => api.setRuleProp(entry, name, value, important),
  remove: (name) => api.removeRuleProp(entry, name),
  disable: (name) => api.disableRuleProp(entry, name),
  enable: (name) => api.enableRuleProp(entry, name),
  changed: (name) => api.isCreated(entry.rule) || api.ruleChanged(entry.rule, name),
});

const inlineAdapter = (api) => ({
  key: "inline",
  inline: true,
  canToggle: false,
  // Previews are always !important; showing it would only be noise.
  decls: () => api.inlineDecls().map((d) => ({ ...d, important: false })),
  off: () => new Map(),
  set: (name, value) => api.setInline(name, value),
  remove: (name) => api.removeInline(name),
  changed: (name) => api.inlineChanged(name),
});

// Which declaration of each property wins in this state — the first
// !important one in cascade order, else the first. The rest are struck out.
const winnersOf = (entries, inline) => {
  const win = new Map();
  const consider = (key, d) => {
    const prev = win.get(d.name);
    if (!prev || (d.important && !prev.important)) win.set(d.name, { key, important: d.important });
  };
  for (const d of inline) consider("inline", d);
  for (const e of entries) {
    if (!e.active || e.also.length) continue;
    for (const d of parseDeclarations(e.rule.style.cssText)) consider(e.rule, d);
  }
  return win;
};

// A small swatch before colour values; clicking it opens the picker.
const swatchFor = (value, onPick) => {
  if (/var\(/i.test(value)) return null;
  const c = colorOf(value);
  if (!c) return null;
  const fill = h("span", { class: "sw-fill" });
  fill.style.background = value;
  const picker = h("input", { type: "color", tabindex: "-1", title: "Pick a colour" });
  picker.value = toHex(c);
  picker.addEventListener("input", () => {
    const next = parseColor(picker.value);
    if (next) onPick(formatColor({ ...next, a: c.a }));
  });
  return h("span", { class: "sw small" }, fill, picker);
};

const cardHead = (api, ad) => {
  if (ad.inline) {
    return h(
      "div",
      { class: "card-hd" },
      h("div", { class: "sel" }, "element.style"),
      h("div", { class: "meta" }, "this element only — Quick edits land here"),
    );
  }
  const e = ad.entry;
  const more = splitSelectorList(e.ruleSelector).length - 1;
  const count = ad.created ? 1 : api.matchCount(classifySelector(e.selector).base);
  const where = [
    ad.created ? "new rule — only this element" : e.sheet,
    ...e.conditions,
    e.layer ? `@layer ${e.layer}` : null,
    e.also.length ? `when ${e.also.join(" ")}` : null,
  ].filter(Boolean);
  return h(
    "div",
    { class: "card-hd" },
    h(
      "div",
      { class: "sel", title: e.ruleSelector },
      e.selector,
      more > 0 ? h("span", { class: "more" }, ` +${more} more`) : null,
    ),
    h(
      "div",
      { class: "meta" },
      where.join(" · "),
      count > 1
        ? h("b", { title: "Editing this rule restyles every one of them" }, ` · ${count} elements`)
        : null,
      e.active ? null : h("b", {}, " · not active now"),
    ),
  );
};

export const rulesTab = (api) => {
  let st = lastState;
  let showGlobal = false;
  const chips = h("div", { class: "chips" });
  const status = h("div", { class: "status", hidden: true });
  const list = h("div", { class: "rules" });
  let cards = new Map(); // adapter key → card node, to refocus after a re-render

  const declRow = (ad, d, { overridden, off }) => {
    const name = d.name;
    const shown = `${d.value}${d.important ? " !important" : ""}`;
    const chk = ad.canToggle
      ? h("input", { type: "checkbox", class: "chk", title: off ? "Turn back on" : "Turn off" })
      : h("span");
    if (ad.canToggle) chk.checked = !off;
    const nameIn = h("input", { class: "in dn", spellcheck: "false", value: name, list: "tsayru-props", title: name });
    const valueIn = h("input", { class: "in dv", spellcheck: "false", value: shown, title: shown });
    // The swatch is redrawn in its own slot: re-inserting the input would blur it.
    const swSlot = h("span", { class: "sw-slot" });
    const vwrap = h("div", { class: "vwrap" }, swSlot, valueIn);
    const del = h("button", { class: "x", title: "Delete" }, "×");
    const row = h(
      "div",
      { class: `decl${off ? " off" : ""}${overridden ? " over" : ""}` },
      chk,
      nameIn,
      vwrap,
      del,
    );
    const mark = () => row.classList.toggle("changed", !off && ad.changed(name));
    const apply = () => {
      const { value, important } = splitImportant(valueIn.value);
      if (!value) return;
      const ok = ad.set(name, value, important);
      valueIn.classList.toggle("bad", !ok);
      mark();
      drawSwatch();
    };
    const drawSwatch = () => {
      const sw = off
        ? null
        : swatchFor(splitImportant(valueIn.value).value, (picked) => {
            const { important } = splitImportant(valueIn.value);
            valueIn.value = `${picked}${important ? " !important" : ""}`;
            apply();
          });
      swSlot.replaceChildren(...(sw ? [sw] : []));
    };
    drawSwatch();
    mark();

    if (off) {
      nameIn.readOnly = true;
      valueIn.readOnly = true;
    } else {
      valueIn.addEventListener("input", apply);
      // Committing an empty value deletes the declaration, as in DevTools.
      valueIn.addEventListener("change", () => {
        if (valueIn.value.trim()) return;
        ad.remove(name);
        render();
      });
      bindKeys(valueIn, { prop: name, display: (v) => v, apply, revert: { run: apply } });
      nameIn.addEventListener("change", () => {
        const next = normName(nameIn.value);
        if (next === name) return;
        const { value, important } = splitImportant(valueIn.value);
        ad.remove(name);
        if (next && value) ad.set(next, value, important);
        render();
      });
      nameIn.__tsayruKey = (e) => {
        if (e.key === "Enter" || e.key === ":") {
          e.preventDefault();
          valueIn.focus();
          valueIn.select();
          return true;
        }
        if (e.key === "Escape" && nameIn.value !== name) {
          e.preventDefault();
          nameIn.value = name;
          return true;
        }
        return false;
      };
    }
    if (ad.canToggle) {
      chk.addEventListener("change", () => {
        if (chk.checked) ad.enable(name);
        else ad.disable(name);
        render();
      });
    }
    del.addEventListener("click", () => {
      ad.remove(name);
      render();
    });
    return row;
  };

  const addRow = (ad) => {
    const nameIn = h("input", { class: "in dn", placeholder: "+ property", spellcheck: "false", list: "tsayru-props" });
    const valueIn = h("input", { class: "in dv", placeholder: "value", spellcheck: "false" });
    let done = false;
    const commit = () => {
      const name = normName(nameIn.value);
      const { value, important } = splitImportant(valueIn.value);
      if (done || !name || !value) return;
      if (!ad.set(name, value, important)) {
        valueIn.classList.add("bad");
        return;
      }
      done = true;
      render({ focusAdd: ad.key });
    };
    // Pasting `color: red;` into the name box splits itself.
    nameIn.addEventListener("input", () => {
      const i = nameIn.value.indexOf(":");
      if (i < 1) return;
      valueIn.value = nameIn.value.slice(i + 1).replace(/;\s*$/, "").trim();
      nameIn.value = nameIn.value.slice(0, i).trim();
      valueIn.focus();
    });
    nameIn.__tsayruKey = (e) => {
      if ((e.key === "Enter" || e.key === ":") && nameIn.value.trim()) {
        e.preventDefault();
        valueIn.focus();
        return true;
      }
      return false;
    };
    valueIn.addEventListener("input", () => valueIn.classList.remove("bad"));
    valueIn.addEventListener("change", commit);
    valueIn.__tsayruKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        return true;
      }
      if (e.key === "Escape" && (nameIn.value || valueIn.value)) {
        e.preventDefault();
        nameIn.value = "";
        valueIn.value = "";
        nameIn.focus();
        return true;
      }
      return false;
    };
    return h("div", { class: "decl add" }, h("span"), nameIn, h("div", { class: "vwrap" }, valueIn), h("span"));
  };

  const card = (ad, winners, entry) => {
    const rows = ad.decls().map((d) => {
      const w = winners.get(d.name);
      return declRow(ad, d, { overridden: !!w && w.key !== ad.key });
    });
    for (const [name, v] of ad.off()) {
      rows.push(declRow(ad, { name, value: v.value, important: v.priority === "important" }, { off: true }));
    }
    rows.push(addRow(ad));
    const classes = [
      "card",
      ad.inline ? "inline" : "",
      ad.created ? "created" : "",
      entry && !entry.active ? "inactive" : "",
    ].filter(Boolean);
    const node = h("div", { class: classes.join(" ") }, cardHead(api, ad), h("div", { class: "decls" }, ...rows));
    cards.set(ad.key, node);
    return node;
  };

  const select = (next) => {
    st = lastState = next;
    api.force(FORCEABLE.includes(next) ? next : null);
    render();
  };

  const render = ({ focusAdd } = {}) => {
    const { groups, skipped } = api.rules();
    const inline = api.inlineDecls();
    chips.replaceChildren(
      ...STATES.map((s) => {
        const own = groups[s].filter((e) => !isGlobal(e) || api.isCreated(e.rule));
        const n = own.length + (s === "default" && inline.length ? 1 : 0);
        return h(
          "button",
          {
            class: `chip${s === st ? " on" : ""}${n ? "" : " empty"}`,
            title: FORCEABLE.includes(s) ? `${s} rules — the page shows the element ${s} while this is picked` : s === "default" ? "Rules that apply now" : `${s} rules`,
            onClick: () => select(s),
          },
          LABELS[s],
          h("span", { class: "n" }, String(n)),
        );
      }),
      h(
        "button",
        {
          class: "ic small refresh",
          title: "Re-read the page's stylesheets",
          onClick: () => {
            api.rules(true);
            render();
          },
        },
        "↻",
      ),
    );
    status.hidden = !api.forced();
    status.textContent = api.forced() ? `The page shows this element ${api.forced()} while this tab is open.` : "";

    const entries = groups[st] || [];
    const created = entries.filter((e) => api.isCreated(e.rule));
    const rest = entries.filter((e) => !api.isCreated(e.rule));
    const own = rest.filter((e) => !isGlobal(e));
    const global = rest.filter(isGlobal);
    const winners = winnersOf([...created, ...rest], st === "default" ? inline : []);
    cards = new Map();
    const nodes = [];
    if (st.startsWith("::") && /^(none|normal)?$/.test(api.pseudoContent(st) || "")) {
      nodes.push(h("div", { class: "muted" }, `No ${st} box is drawn right now (its content is none).`));
    }
    if (st === "default") nodes.push(card(inlineAdapter(api), winners));
    // What applies now first, rules under a non-matching @media after.
    for (const e of [...created, ...own.filter((x) => x.active), ...own.filter((x) => !x.active)]) {
      nodes.push(card(ruleAdapter(api, e), winners, e));
    }
    if (!created.length && !own.length && st !== "default") {
      nodes.push(h("div", { class: "muted" }, `No rule of its own styles this element ${st} yet.`));
    }
    if (global.length) {
      nodes.push(
        h(
          "button",
          {
            class: "link fold",
            title: "Rules whose subject is * — resets that style every element",
            onClick: () => {
              showGlobal = !showGlobal;
              render();
            },
          },
          `${showGlobal ? "▾" : "▸"} ${global.length} global rule${global.length === 1 ? "" : "s"} (*)`,
        ),
      );
      if (showGlobal) for (const e of global) nodes.push(card(ruleAdapter(api, e), winners, e));
    }
    nodes.push(
      h(
        "button",
        {
          class: "link",
          onClick: () => {
            const rule = api.addRule(st);
            if (rule) render({ focusAdd: rule });
          },
        },
        `+ New ${st === "default" ? "" : `${st} `}rule for this element`,
      ),
    );
    if (skipped) {
      nodes.push(
        h("div", { class: "muted" }, `${skipped} stylesheet${skipped === 1 ? "" : "s"} from another origin can't be read.`),
      );
    }
    list.replaceChildren(...nodes);
    if (focusAdd) cards.get(focusAdd)?.querySelector(".add .dn")?.focus();
  };

  if (FORCEABLE.includes(st)) api.force(st);
  render();
  // Typing never re-renders (it would steal focus); structural edits do.
  return { node: h("div", { class: "css" }, chips, status, list), refresh: () => {} };
};
