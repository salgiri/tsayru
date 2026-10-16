// Quick tab: the controls most restyling needs — fill, border, shadow,
// spacing, type. Each writes an inline preview on the element itself; a
// label marked ↺ resets its property on click.

import {
  h,
  propInput,
  selectInput,
  colorInput,
  colorControl,
  bindKeys,
  pair,
  section,
} from "./stylewidgets.js";
import { parseShadows, formatShadows, SHADOW_PRESETS, trimPx, withUnit } from "./stylevalues.js";

const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
const ALIGNS = ["start", "left", "center", "right", "justify", "end"];
const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"];

// Shadow layers as rows: offsets, blur, spread, colour, inset.
const shadowSection = (api, syncers) => {
  let layers = [];
  let shown = null;
  const list = h("div", { class: "layers" });
  const write = () => api.setInline("box-shadow", formatShadows(layers));

  const lengthBox = (layer, key, label) => {
    const input = h("input", { class: "in", spellcheck: "false", value: trimPx(layer[key]), title: `${label}, px` });
    const apply = () => {
      layer[key] = withUnit(key, input.value) || "0px";
      write();
    };
    input.addEventListener("input", apply);
    bindKeys(input, { prop: key, fallback: () => layer[key], apply });
    return h("label", { class: "mini" }, h("span", {}, label), input);
  };

  const layerRow = (layer, i) => {
    const color = colorControl({
      read: () => layer.color,
      write: (value) => {
        if (!CSS.supports("color", value)) return false;
        layer.color = value;
        write();
        return true;
      },
      focused: () => api.focused(),
    });
    color.sync();
    const inset = h("input", { type: "checkbox" });
    inset.checked = layer.inset;
    inset.addEventListener("change", () => {
      layer.inset = inset.checked;
      write();
    });
    const remove = () => {
      layers.splice(i, 1);
      write();
      render();
    };
    return h(
      "div",
      { class: "layer" },
      h(
        "div",
        { class: "quad" },
        lengthBox(layer, "x", "X"),
        lengthBox(layer, "y", "Y"),
        lengthBox(layer, "blur", "Blur"),
        lengthBox(layer, "spread", "Spread"),
      ),
      h(
        "div",
        { class: "layer-ft" },
        color.node,
        h("label", { class: "check" }, inset, "inset"),
        h("button", { class: "ic small", title: "Remove this layer", onClick: remove }, "×"),
      ),
    );
  };

  const render = () => {
    shown = api.computed().getPropertyValue("box-shadow");
    layers = parseShadows(shown);
    list.replaceChildren(...layers.map(layerRow));
  };

  const presets = h(
    "div",
    { class: "presets" },
    ...SHADOW_PRESETS.map(([label, value]) =>
      h(
        "button",
        {
          class: "pill",
          title: value,
          onClick: () => {
            api.setInline("box-shadow", value);
            render();
          },
        },
        label,
      ),
    ),
  );
  const add = h(
    "button",
    {
      class: "link",
      onClick: () => {
        layers.push({ inset: false, x: "0px", y: "4px", blur: "12px", spread: "0px", color: "rgb(0 0 0 / 0.12)" });
        write();
        render();
      },
    },
    "+ Layer",
  );
  syncers.push(() => {
    const active = api.focused();
    if (active && list.contains(active)) return;
    if (api.computed().getPropertyValue("box-shadow") !== shown) render();
  });
  render();
  return section(["Shadow", presets], list, add);
};

// Margin around padding around width × height, the way DevTools draws it.
const boxModel = (api, bind) => {
  const side = (prop, area) => {
    const node = bind(propInput(api, prop, { cls: "box-in", title: prop }));
    node.classList.add(area);
    return node;
  };
  const whole = (v) => (/^-?\d*\.?\d+px$/.test(v) ? String(Math.round(parseFloat(v))) : v);
  const size = (prop) => bind(propInput(api, prop, { cls: "box-in wide", title: prop, display: whole }));
  const content = h("div", { class: "content c" }, size("width"), h("span", { class: "times" }, "×"), size("height"));
  const padding = h(
    "div",
    { class: "box pad c" },
    h("span", { class: "box-tag" }, "padding"),
    side("padding-top", "t"),
    side("padding-left", "l"),
    content,
    side("padding-right", "r"),
    side("padding-bottom", "b"),
  );
  return h(
    "div",
    { class: "box" },
    h("span", { class: "box-tag" }, "margin"),
    side("margin-top", "t"),
    side("margin-left", "l"),
    padding,
    side("margin-right", "r"),
    side("margin-bottom", "b"),
  );
};

export const quickTab = (api) => {
  const syncers = [];
  const bind = (widget) => {
    syncers.push(widget.sync);
    return widget.node;
  };
  // A labelled row; the label turns ↺ when any of `props` is changed and
  // resets them on click.
  const field = (label, props, node) => {
    const lbl = h("span", { class: "lbl", title: label }, label);
    lbl.addEventListener("click", () => {
      for (const p of props) if (api.inlineChanged(p)) api.resetInline(p);
    });
    syncers.push(() => {
      const changed = props.some((p) => api.inlineChanged(p));
      lbl.classList.toggle("changed", changed);
      lbl.title = changed ? `${label} — click to reset` : label;
    });
    return h("div", { class: "row" }, lbl, node);
  };

  const cs = api.computed();
  const hasImage = cs.backgroundImage && cs.backgroundImage !== "none";
  const layout = /flex|grid/.test(cs.display);

  const node = h(
    "div",
    { class: "quick" },
    section(
      "Fill",
      field("Text", ["color"], bind(colorInput(api, "color"))),
      field("Background", ["background-color"], bind(colorInput(api, "background-color"))),
      hasImage
        ? field("Image", ["background-image"], bind(propInput(api, "background-image", { display: (v) => v })))
        : null,
      field("Opacity", ["opacity"], bind(propInput(api, "opacity"))),
    ),
    section(
      "Border",
      field("Color", ["border-color"], bind(colorInput(api, "border-color", { read: "border-top-color" }))),
      field(
        "Width · style",
        ["border-width", "border-style"],
        pair(
          bind(propInput(api, "border-width", { read: "border-top-width" })),
          bind(selectInput(api, "border-style", BORDER_STYLES, { read: "border-top-style" })),
        ),
      ),
      field("Radius", ["border-radius"], bind(propInput(api, "border-radius"))),
    ),
    shadowSection(api, syncers),
    section(
      "Spacing",
      boxModel(api, bind),
      layout ? field("Gap", ["gap"], bind(propInput(api, "gap"))) : null,
    ),
    section(
      "Text",
      field(
        "Size · weight",
        ["font-size", "font-weight"],
        pair(bind(propInput(api, "font-size")), bind(selectInput(api, "font-weight", WEIGHTS))),
      ),
      field(
        "Line · letter",
        ["line-height", "letter-spacing"],
        pair(bind(propInput(api, "line-height")), bind(propInput(api, "letter-spacing"))),
      ),
      field("Align", ["text-align"], bind(selectInput(api, "text-align", ALIGNS))),
      field("Font", ["font-family"], bind(propInput(api, "font-family", { display: (v) => v }))),
    ),
  );

  const refresh = () => {
    const now = api.computed();
    for (const sync of syncers) sync(now);
  };
  refresh();
  return { node, refresh };
};
