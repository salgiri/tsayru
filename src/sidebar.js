// Sidebar: the pick keys, filters (hosts, #tags), the task list (view/edit
// modes) and the ship bar (send, copy, clear). Lives in the UI shadow root
// (ui.js). Also: copy-to-clipboard, inbox posting, done-status polling.

import {
  el,
  state,
  refs,
  bus,
  ask,
  lifetime,
  safeHost,
  plural,
  persist,
  sidebarVisible,
  isContextInvalidated,
  IS_MAC,
} from "./core.js";
import { formatTasks, formatTask, filterByHost, taskTags } from "./format.js";
import { queryDeep } from "./selector.js";
import {
  toggleInspector,
  toggleStylePick,
  hideSidebar,
  ensureOverlay,
  moveHighlight,
} from "./inspector.js";
import { pickTargetChat } from "./chatpicker.js";
import { uiLayer, toast, hints } from "./ui.js";
import { icon, brandMark, grain } from "./icons.js";

const warn = (msg) => toast(msg, { tone: "warn" });

// Storage and screenshot failures (core.js, screenshot.js) and other tabs'
// edits arrive over the bus — never as window events a page could forge.
bus.on("warn", warn);
bus.on("tasks-changed", () => {
  if (!state.tasks.some((t) => t.id === state.editingTaskId)) state.editingTaskId = null;
  renderSidebar();
});

// A key that just did its job says so for a moment: its icon becomes a
// check and its label the past tense ("Copied").
const confirmKey = (button, label) => {
  if (button.dataset.confirming) return;
  button.dataset.confirming = "1";
  const glyph = button.querySelector("svg");
  const text = [...button.childNodes].find((n) => n.nodeType === 3);
  const before = text?.nodeValue;
  const check = icon("check");
  check.classList.add("pop");
  glyph?.replaceWith(check);
  if (text && label) text.nodeValue = label;
  setTimeout(() => {
    check.replaceWith(glyph);
    if (text) text.nodeValue = before;
    delete button.dataset.confirming;
  }, 1200);
};

const writeClipboard = async (text, okMsg, button, done) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, { iconName: "copy" });
    if (button) confirmKey(button, done);
  } catch (err) {
    console.warn("[tsayru] clipboard write failed:", err);
    warn("Couldn’t copy to the clipboard. Try again");
  }
};

const copyAll = async (e) => {
  const tasks = visibleTasks();
  const text = formatTasks(state.tasks, state.filterHost, {
    filterTag: state.filterTag,
  });
  if (!text) {
    warn("Nothing to copy yet");
    return;
  }
  await writeClipboard(text, `Copied ${tasks.length} task${plural(tasks.length)}`, e.currentTarget, "Copied");
  // Best-effort inbox save so the copied batch (with screenshots) is also
  // retrievable via MCP when the local server is running. Silent on failure —
  // clipboard already succeeded, which is what the user asked for.
  postBatch(tasks, null).then((p) => {
    if (!p.ok) console.warn("[tsayru] inbox save skipped:", p.error);
  });
};

// The current filter scope — what the user actually sees in the list.
// Copy / send / clear all operate on this, so the buttons do what the eye expects.
const visibleTasks = () => {
  let list = filterByHost(state.tasks, state.filterHost);
  if (state.filterTag) {
    list = list.filter((t) => taskTags(t.text).includes(state.filterTag));
  }
  return list;
};

// POST batch to the local inbox for audit + future MCP pulls. Best-effort —
// failure here doesn't block the inject path; we want the chat to receive
// the markdown even if the inbox server is down.
const postBatch = (tasks, target) =>
  ask({
    type: "TSAYRU_SEND",
    path: "/tasks",
    method: "POST",
    body: {
      tasks,
      host: location.host,
      filterHost: state.filterHost || null,
      targetTabUrl: target?.url || null,
      targetTabTitle: target?.title || null,
      sentAt: new Date().toISOString(),
    },
  });

// Push to a selected web-chat tab. The picker only ever returns "online" targets
// now, so there's no local/clipboard branch.
const sendBatch = async (tasks, target) => {
  const label = target?.title || "the chat";

  // Persist to inbox in background — audit trail, useful if user later wants
  // to retrieve the batch via MCP. Don't block the inject on this.
  postBatch(tasks, target).then((p) => {
    if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
  });

  // The actual delivery — DOM inject + auto-submit in the chosen tab.
  // Markdown stays light; screenshots travel as file attachments (synthetic
  // paste in the composer) instead of inline base64, which ProseMirror choked
  // on and the chat didn't render.
  const md = formatTasks(tasks, state.filterHost, {
    filterTag: state.filterTag,
    screenshotMode: "attached",
  });
  const images = tasks.map((t) => t.screenshot).filter(Boolean);
  // Pasting, uploading screenshots and pressing Send takes a few seconds.
  toast(`Sending to ${label}…`, { iconName: "send", ttl: 20000 });
  const inject = await ask({ type: "TSAYRU_PUSH_CLAUDE_AI", tabId: target.tabId, content: md, images });
  if (inject.ok) {
    toast(`Sent to ${label}`, { iconName: "send" });
    return;
  }
  console.warn("[tsayru] inject failed:", inject.error);
  if (isContextInvalidated(inject.error)) {
    warn(`tsayru was updated. Reload this page (${IS_MAC ? "⌘R" : "F5"}) and send again`);
  } else if (/chat input not found/i.test(String(inject.error))) {
    warn("No chat input on that tab. Open a chat there and try again");
  } else {
    warn(`Couldn’t send to ${label}. Open that chat and try again`);
  }
};

const sendToServer = async () => {
  const tasks = visibleTasks();
  if (tasks.length === 0) {
    warn("Nothing to send yet");
    return;
  }
  const target = await pickTargetChat();
  if (target === null) return; // cancelled
  sendBatch(tasks, target);
};

// Done-status sync: Claude marks tasks done via the MCP tool `tsayru_mark_done`;
// the server exposes the ids; we poll while the sidebar is visible and strike
// through matching tasks. Silent when the server is down — this is an
// optional enhancement, not a dependency.
let pollQuietUntil = 0; // no server answering → ask once a minute, not every 10 s
const pollDoneStatus = async () => {
  if (!sidebarVisible() || Date.now() < pollQuietUntil || !state.tasks.some((t) => !t.done)) return;
  const resp = await ask({ type: "TSAYRU_SEND", path: "/tasks/done/recent", method: "GET" });
  if (!resp.ok) pollQuietUntil = Date.now() + 60000;
  const ids = new Set(resp?.ok && Array.isArray(resp.data?.ids) ? resp.data.ids : []);
  let changed = false;
  for (const t of state.tasks) {
    if (!t.done && ids.has(t.id)) changed = t.done = true;
  }
  if (changed) {
    persist();
    renderSidebar();
  }
};

let donePollTimer = null;
const ensureDonePolling = () => {
  if (donePollTimer) return;
  donePollTimer = setInterval(pollDoneStatus, 10000);
  lifetime.signal.addEventListener("abort", () => clearInterval(donePollTimer));
};

// Hover-preview: highlight the original element on the page when user hovers a task in the sidebar.
// Skipped while inspector is active — there the page-mouse-tracker takes precedence.
const onTaskHover = (selector) => {
  if (state.inspecting) return;
  if (!selector) return;
  ensureOverlay();
  // queryDeep resolves shadow-piercing " >>> " selectors too.
  moveHighlight(queryDeep(selector));
};

const onTaskLeave = () => {
  if (state.inspecting) return;
  moveHighlight(null);
};

// Removals act at once and offer an undo (8 s) instead of a blocking confirm.
const removeTasks = (removed, message) => {
  if (!removed.length) return;
  const at = removed.map((t) => state.tasks.indexOf(t));
  const gone = new Set(removed);
  if (removed.some((t) => t.id === state.editingTaskId)) state.editingTaskId = null;
  state.tasks = state.tasks.filter((t) => !gone.has(t));
  persist();
  renderSidebar();
  toast(message, {
    tone: "danger",
    iconName: "trash",
    action: {
      label: "Undo",
      run: () => {
        removed.forEach((t, i) => state.tasks.splice(Math.min(at[i], state.tasks.length), 0, t));
        persist();
        renderSidebar();
      },
    },
  });
};

// Clears exactly what's on screen (host + tag scope).
const clearTasks = () => {
  const removed = visibleTasks();
  removeTasks(removed, `Cleared ${removed.length} task${plural(removed.length)}`);
};

const actButton = (name, label, onClick, extra = "") =>
  el("button", { class: `act${extra}`, title: label, "aria-label": label, onClick }, icon(name));

// The edit draft survives re-renders (done-status polling, other tabs' edits).
let editDraft = null;

const editTask = (task) => {
  state.editingTaskId = task.id;
  editDraft = null;
  renderSidebar();
};

const renderEditor = (task) => {
  const ta = el("textarea", {
    class: "field",
    rows: 3,
    "aria-label": "Task text",
    placeholder: "What should change here?",
  });
  ta.value = editDraft ?? task.text;
  ta.addEventListener("input", () => {
    editDraft = ta.value;
  });
  setTimeout(() => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 0);

  const close = () => {
    state.editingTaskId = null;
    editDraft = null;
    renderSidebar();
  };
  const save = () => {
    const v = ta.value.trim();
    if (!v) {
      ta.focus();
      return;
    }
    task.text = v;
    persist();
    close();
  };
  // Keys reach fields in the shadow root only through __tsayruKey
  // (shadowhost.js stops them before the page — and element listeners — see them).
  ta.__tsayruKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      save();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }
    return false;
  };

  return el(
    "div",
    { class: "edit" },
    ta,
    el(
      "div",
      { class: "edit-ft" },
      el("button", { class: "btn quiet small", onClick: close }, "Cancel", el("span", { class: "kbd-in" }, "Esc")),
      el("button", { class: "btn ink small", onClick: save }, "Save", el("span", { class: "kbd-in" }, "↵")),
    ),
  );
};

const renderTask = (task, displayNum, entering) => {
  const editing = state.editingTaskId === task.id;
  const styleTask = !!task.styleChanges?.length;
  return el(
    "div",
    {
      class: "task" + (task.done ? " done" : "") + (editing ? " editing" : "") + (entering ? " enter" : ""),
      onMouseEnter: () => onTaskHover(task.selector),
      onMouseLeave: onTaskLeave,
    },
    el(
      "div",
      { class: "num", title: task.done ? "Done — Claude marked it" : null },
      task.done ? icon("check") : String(displayNum),
    ),
    el(
      "div",
      { class: "body" },
      el(
        "div",
        { class: "row1" },
        el("span", { class: "label", title: task.label }, task.label),
        editing
          ? null
          : el(
              "div",
              { class: "acts" },
              actButton("copy", "Copy this task", (e) =>
                writeClipboard(formatTask(task, displayNum), "Task copied", e.currentTarget),
              ),
              actButton("edit", "Edit task", () => editTask(task)),
              actButton("close", "Delete task", () => removeTasks([task], "Task deleted"), " danger"),
            ),
      ),
      el("div", { class: "sel", title: task.selector }, task.selector),
      editing
        ? renderEditor(task)
        : // Style-editor tasks speak through their change list; no nag for text.
          task.text || !styleTask
          ? el("div", { class: "text" + (task.text ? "" : " empty") }, task.text || "No note yet")
          : null,
      styleTask && !editing ? styleSummary(task.styleChanges) : null,
    ),
  );
};

// [3 style changes] background-color, padding-left, box-shadow
const styleSummary = (changes) => {
  const props = [...new Set(changes.map((c) => c.property))];
  return el(
    "div",
    {
      class: "styled",
      title: changes
        .map((c) => `${c.property}: ${c.before ?? "—"} → ${c.after ?? "removed"}`)
        .join("\n"),
    },
    el("span", { class: "chip" }, icon("sliders"), `${changes.length} style change${plural(changes.length)}`),
    el("span", { class: "props" }, props.join(", ")),
  );
};

const renderFilters = (hosts, hostScoped, allTags) => {
  const box = refs.sidebar.querySelector(".filters");
  box.replaceChildren();
  if (hosts.length > 1) {
    const seg = el("div", { class: "seg", role: "tablist", "aria-label": "Sites" });
    const mkTab = (label, value, count) =>
      el(
        "button",
        {
          class: state.filterHost === value ? "on" : "",
          role: "tab",
          "aria-selected": String(state.filterHost === value),
          title: label,
          onClick: () => {
            state.filterHost = value;
            renderSidebar();
          },
        },
        el("span", {}, label),
        el("span", { class: "n" }, String(count)),
      );
    seg.appendChild(mkTab("All", null, state.tasks.length));
    for (const h of hosts) {
      seg.appendChild(mkTab(h, h, state.tasks.filter((t) => safeHost(t.url) === h).length));
    }
    box.appendChild(seg);
  }
  // Tag chips — rendered only when hashtags exist, so the row costs nothing
  // for users who never type #tags.
  if (allTags.length > 0) {
    const row = el("div", { class: "tags" });
    for (const tag of allTags) {
      const n = hostScoped.filter((t) => taskTags(t.text).includes(tag)).length;
      const active = state.filterTag === tag;
      row.appendChild(
        el(
          "button",
          {
            class: "tag" + (active ? " on" : ""),
            "aria-pressed": String(active),
            title: active ? "Show all tags" : `Only tasks tagged #${tag}`,
            onClick: () => {
              state.filterTag = active ? null : tag; // toggle
              renderSidebar();
            },
          },
          icon("hash"),
          tag,
          el("span", { class: "n" }, String(n)),
        ),
      );
    }
    box.appendChild(row);
  }
  box.hidden = !box.childElementCount;
};

const STEPS = [
  ["Pick an element", "Press the blue key and click anything."],
  ["Say what should change", "Plain words are enough. Enter adds the task."],
  ["Send to Claude", "Screenshots and source files go along."],
];

const renderEmpty = (list) => {
  if (state.filterHost || state.filterTag) {
    list.appendChild(
      el(
        "div",
        { class: "nothing" },
        "No tasks match this filter.",
        el(
          "button",
          {
            onClick: () => {
              state.filterHost = null;
              state.filterTag = null;
              renderSidebar();
            },
          },
          "Show all tasks",
        ),
      ),
    );
    return;
  }
  list.appendChild(
    el(
      "ol",
      { class: "steps" },
      ...STEPS.map(([title, line], i) =>
        el(
          "li",
          {},
          el("span", { class: "num" }, String(i + 1)),
          el("div", {}, el("b", {}, title), el("p", {}, line)),
        ),
      ),
    ),
  );
};

// The pick keys only — toggling picking doesn't rebuild the task list.
export const renderDeck = () => {
  if (!refs.sidebar) return;
  const picking = state.inspecting;
  const styling = picking && state.pickMode === "style";
  const pick = refs.sidebar.querySelector(".pick");
  pick.classList.toggle("on", picking);
  pick.setAttribute("aria-pressed", String(picking));
  const glyph = styling ? "sliders" : "target";
  if (pick.dataset.glyph !== glyph) {
    pick.dataset.glyph = glyph;
    pick.querySelector(".disc").replaceChildren(icon(glyph));
  }
  pick.querySelector(".pick-title").textContent = !picking
    ? "Pick an element"
    : styling
      ? "Click to restyle"
      : "Click any element";
  pick.querySelector(".pick-sub").hidden = !picking;
  pick.querySelector(".led").hidden = !picking;
  const restyle = refs.sidebar.querySelector(".deck .square");
  restyle.classList.toggle("on", styling);
  restyle.setAttribute("aria-pressed", String(styling));
};

// `enter`: the id of a task that just arrived — it slides into its row once.
export const renderSidebar = ({ enter } = {}) => {
  if (!refs.sidebar) return;
  const list = refs.sidebar.querySelector(".list");
  list.replaceChildren();

  const hosts = [
    ...new Set(state.tasks.map((t) => safeHost(t.url)).filter(Boolean)),
  ];

  // Reset filters whose values disappeared.
  if (state.filterHost && !hosts.includes(state.filterHost)) {
    state.filterHost = null;
  }
  const hostScoped = filterByHost(state.tasks, state.filterHost);
  const allTags = [...new Set(hostScoped.flatMap((t) => taskTags(t.text)))];
  if (state.filterTag && !allTags.includes(state.filterTag)) {
    state.filterTag = null;
  }
  renderFilters(hosts, hostScoped, allTags);

  const filtered = visibleTasks();
  if (filtered.length === 0) {
    renderEmpty(list);
  } else {
    // Display number is filter-relative — matches what `formatTasks` writes
    // into clipboard markdown so badge and `## N. label` always agree.
    filtered.forEach((task, i) => list.appendChild(renderTask(task, i + 1, task.id === enter)));
  }

  const n = state.tasks.length;
  refs.sidebar.querySelector(".tally").textContent = n ? `${n} task${plural(n)}` : "No tasks";
  for (const b of refs.sidebar.querySelectorAll(".ship button")) {
    b.disabled = filtered.length === 0;
  }
  renderDeck();
};

export const ensureSidebar = () => {
  if (refs.sidebar) return;
  const quick = IS_MAC ? "⌥ click" : "Alt click";
  const restyleKeys = IS_MAC ? "⌘ click" : "Ctrl click";
  refs.sidebar = el(
    "div",
    { class: "panel shell", role: "complementary", "aria-label": "tsayru" },
    grain(),
    el(
      "div",
      { class: "hd" },
      el("div", { class: "mark" }, brandMark()),
      el("div", { class: "word" }, "tsayru"),
      el("div", { class: "tally" }, "No tasks"),
      el(
        "button",
        {
          class: "round",
          title: "Hide the panel (turns picking off)",
          "aria-label": "Hide the panel",
          onClick: () => hideSidebar(),
        },
        icon("hide"),
      ),
    ),
    el(
      "div",
      { class: "deck" },
      el(
        "button",
        {
          class: "pick",
          title: "Click an element on the page to add a task about it",
          onClick: () => toggleInspector(),
        },
        el("span", { class: "disc" }),
        el(
          "span",
          { class: "pick-label" },
          el("span", { class: "pick-title" }, "Pick an element"),
          el("span", { class: "pick-sub", hidden: true }, "Esc to stop"),
        ),
        el("span", { class: "led", hidden: true }),
      ),
      el(
        "button",
        {
          class: "square",
          title: `Click an element to restyle it (or ${restyleKeys} it any time)`,
          onClick: () => toggleStylePick(),
        },
        icon("sliders"),
        "Restyle",
      ),
    ),
    hints([
      [quick, "Quick add"],
      [restyleKeys, "Restyle"],
    ]),
    el("div", { class: "groove" }),
    el("div", { class: "filters", hidden: true }),
    el("div", { class: "list" }),
    el("div", { class: "groove" }),
    el(
      "div",
      { class: "ship" },
      el(
        "button",
        {
          class: "send",
          title: "Paste the tasks into an open Claude chat and send them",
          onClick: sendToServer,
        },
        el("span", { class: "disc" }, icon("send")),
        el("span", { class: "send-label" }, "Send to Claude"),
      ),
      el(
        "button",
        { class: "square", title: "Copy the tasks as Markdown", onClick: copyAll },
        icon("copy"),
        "Copy",
      ),
      el(
        "button",
        { class: "square danger", title: "Clear the tasks in view (you can undo)", onClick: clearTasks },
        icon("trash"),
        "Clear",
      ),
    ),
  );
  uiLayer().appendChild(refs.sidebar);
  ensureDonePolling();
};
