// Task dialog — shown after a click in inspector mode.
// Fires framework detection in parallel; styles snapshot is captured upstream and passed in.

import { el, state, refs, persist, bus, uid, IS_MAC } from "./core.js";
import { buildSelector, shortLabel } from "./selector.js";
import { detectFramework } from "./framework.js";
import { renderSidebar } from "./sidebar.js";
import { openDialog, dialogHeader, hints } from "./ui.js";

let dialog = null;

export const closeModal = () => {
  if (dialog) {
    dialog.close();
    dialog = null;
    refs.modal = null;
  }
};

// Cancel path (Esc / scrim / × / Cancel): confirm before discarding a
// non-empty draft — losing typed text to a stray click is worse than one
// extra confirm.
const requestClose = () => {
  const ta = refs.modal?.querySelector(".field");
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
  const id = uid();
  state.tasks.push({
    // Stable id — the done-status sync from the server matches on it.
    id,
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
  renderSidebar({ enter: id });
  // Re-arm the inspector for the next element (handled in inspector.js).
  bus.emit("task-added");
};

// Alt+click path: skip the dialog entirely, save the task with empty text.
// The user fills descriptions later via inline edit; the formatter
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
  const ta = refs.modal.querySelector(".field");
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
  const submit = () => submitTask(selector, label, frameworkPromise, ctx);

  dialog = openDialog({ label: "New task", onEscape: requestClose });
  refs.modal = dialog.scrim;

  const ta = el("textarea", {
    class: "field",
    placeholder: "What should change here?",
    "aria-label": "What should change here?",
    rows: 4,
  });
  // Keys reach fields in the shadow root only through __tsayruKey.
  ta.__tsayruKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
      return true;
    }
    return false; // Escape falls through to the dialog (requestClose)
  };

  dialog.dialog.append(
    dialogHeader("New task", requestClose),
    el(
      "div",
      { class: "target" },
      ctx.screenshot ? el("img", { class: "shot", src: ctx.screenshot, alt: "" }) : null,
      el(
        "div",
        { class: "target-meta" },
        el("b", { title: label }, label),
        el("span", { class: "sel" }, selector),
      ),
    ),
    ta,
    el(
      "div",
      { class: "dlg-ft" },
      hints([["Enter", "add"], [IS_MAC ? "⇧ Enter" : "Shift Enter", "new line"]]),
      el("button", { class: "btn quiet", onClick: requestClose }, "Cancel"),
      el("button", { class: "btn primary", onClick: submit }, "Add task"),
    ),
  );
  ta.focus();
};
