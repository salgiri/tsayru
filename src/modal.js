// Task input modal — shown after a click in inspector mode.
// Fires framework detection in parallel; styles snapshot is captured upstream and passed in.

import { el, state, refs, persist } from "./core.js";
import { buildSelector, shortLabel } from "./selector.js";
import { detectFramework } from "./framework.js";
import { renderSidebar } from "./sidebar.js";

export const closeModal = () => {
  if (refs.modal) {
    refs.modal.remove();
    refs.modal = null;
  }
};

const submitTask = async (
  selector,
  label,
  frameworkPromise,
  computedStyles,
  screenshot,
) => {
  if (!refs.modal) return;
  // Re-entry guard: rapid Enter/double-click was creating duplicate tasks
  // because the previous invocation hadn't finished its `await` yet.
  if (refs.modal.__submitting) return;
  refs.modal.__submitting = true;
  const ta = refs.modal.querySelector(".tsayru-modal-input");
  const text = ta.value.trim();
  if (!text) {
    refs.modal.__submitting = false;
    ta.focus();
    return;
  }
  const framework = await Promise.race([
    frameworkPromise || Promise.resolve(null),
    new Promise((resolve) => setTimeout(() => resolve(null), 250)),
  ]);
  state.tasks.push({
    selector,
    label,
    text,
    url: location.href,
    framework: framework || null,
    computedStyles: computedStyles || null,
    screenshot: screenshot || null,
    addedAt: new Date().toISOString(),
  });
  await persist();
  renderSidebar();
  closeModal();
};

export const openModal = (target, computedStyles, screenshot) => {
  closeModal();
  const selector = buildSelector(target);
  const label = shortLabel(target);
  const frameworkPromise = detectFramework(target).catch(() => null);

  refs.modal = el(
    "div",
    {
      class: "tsayru-modal-backdrop",
      onClick: (e) => {
        if (e.target === refs.modal) closeModal();
      },
    },
    el(
      "div",
      { class: "tsayru-modal" },
      el(
        "div",
        { class: "tsayru-modal-head" },
        el("div", { class: "tsayru-modal-title" }, "Задача для блока"),
        el(
          "button",
          { class: "tsayru-modal-close", onClick: closeModal },
          "×",
        ),
      ),
      el(
        "div",
        { class: "tsayru-modal-meta" },
        el("div", { class: "tsayru-modal-label" }, label),
        el("div", { class: "tsayru-modal-sel" }, selector),
        screenshot
          ? el("img", { class: "tsayru-modal-thumb", src: screenshot, alt: "" })
          : null,
      ),
      el("textarea", {
        class: "tsayru-modal-input",
        placeholder:
          "Что поменять в этом блоке? (Enter — добавить, Shift+Enter — перенос)",
        rows: 4,
      }),
      el(
        "div",
        { class: "tsayru-modal-footer" },
        el(
          "button",
          { class: "tsayru-modal-cancel", onClick: closeModal },
          "Отмена",
        ),
        el(
          "button",
          {
            class: "tsayru-modal-submit",
            onClick: () =>
              submitTask(selector, label, frameworkPromise, computedStyles, screenshot),
          },
          "Добавить (Enter)",
        ),
      ),
    ),
  );

  document.documentElement.appendChild(refs.modal);
  const ta = refs.modal.querySelector(".tsayru-modal-input");
  ta.focus();
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitTask(selector, label, frameworkPromise, computedStyles, screenshot);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });
};
