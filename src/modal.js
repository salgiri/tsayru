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

// Cancel path (Esc / backdrop / × / Cancel): confirm before discarding a
// non-empty draft — losing typed text to a stray click is worse than one
// extra confirm.
const requestClose = () => {
  const ta = refs.modal?.querySelector(".tsayru-modal-input");
  if (ta && ta.value.trim() && !confirm("Discard this task draft?")) return;
  closeModal();
};

// Build and persist a task object. `ctx` carries everything captured at
// click time: { computedStyles, screenshot, html, env }.
const addTask = async (selector, label, text, frameworkPromise, ctx) => {
  const framework = await Promise.race([
    frameworkPromise || Promise.resolve(null),
    new Promise((resolve) => setTimeout(() => resolve(null), 250)),
  ]);
  state.tasks.push({
    // Stable id — the done-status sync from the server matches on it.
    id: crypto.randomUUID(),
    selector,
    label,
    text,
    url: location.href,
    framework: framework || null,
    computedStyles: ctx?.computedStyles || null,
    screenshot: ctx?.screenshot || null,
    html: ctx?.html || null,
    env: ctx?.env || null,
    pageErrors: ctx?.pageErrors?.length ? ctx.pageErrors : null,
    done: false,
    addedAt: new Date().toISOString(),
  });
  await persist();
  renderSidebar();
  // Re-arm the inspector for the next element (handled in inspector.js).
  window.dispatchEvent(new CustomEvent("tsayru-task-added"));
};

// Alt+click path: skip the modal entirely, save the task with empty text.
// The user fills descriptions later via inline edit (✎); the formatter
// substitutes a sensible instruction if they never do.
export const quickAddTask = async (target, ctx) => {
  const selector = buildSelector(target);
  const label = shortLabel(target);
  const frameworkPromise = detectFramework(target).catch(() => null);
  await addTask(selector, label, "", frameworkPromise, ctx);
};

const submitTask = async (selector, label, frameworkPromise, ctx) => {
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
  await addTask(selector, label, text, frameworkPromise, ctx);
  closeModal();
};

export const openModal = (target, ctx = {}) => {
  closeModal();
  const selector = buildSelector(target);
  const label = shortLabel(target);
  const frameworkPromise = detectFramework(target).catch(() => null);
  const screenshot = ctx.screenshot || null;

  refs.modal = el(
    "div",
    {
      class: "tsayru-modal-backdrop",
      onClick: (e) => {
        if (e.target === refs.modal) requestClose();
      },
    },
    el(
      "div",
      { class: "tsayru-modal" },
      el(
        "div",
        { class: "tsayru-modal-head" },
        el("div", { class: "tsayru-modal-title" }, "Task for this element"),
        el(
          "button",
          { class: "tsayru-modal-close", onClick: requestClose },
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
          "What should change here? (Enter to add, Shift+Enter for newline)",
        rows: 4,
      }),
      el(
        "div",
        { class: "tsayru-modal-footer" },
        el(
          "button",
          { class: "tsayru-modal-cancel", onClick: requestClose },
          "Cancel",
        ),
        el(
          "button",
          {
            class: "tsayru-modal-submit",
            onClick: () => submitTask(selector, label, frameworkPromise, ctx),
          },
          "Add (Enter)",
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
      submitTask(selector, label, frameworkPromise, ctx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
    }
  });
};
