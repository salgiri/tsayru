// Sidebar: the pick keys, filters (hosts, #tags), the task list (view/edit
// modes) and the ship bar (send, copy, clear). Lives in the UI shadow root
// (ui.js). Also: copy-to-clipboard, inbox posting, done-status polling.

import { el, state, refs, safeHost, plural, persist, IS_MAC } from "./core.js";
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

export const flash = (msg, opts) => toast(msg, opts);
const warn = (msg) => toast(msg, { warn: true });

// Surface persist quota / I/O errors from core.js (avoids import cycle).
window.addEventListener("tsayru-persist-error", (e) => {
  warn(e?.detail?.message || "Couldn't save tasks");
});

// Surface screenshot-capture failures from screenshot.js (same pattern) —
// previously a missing activeTab grant just silently dropped the screenshot.
window.addEventListener("tsayru-capture-error", (e) => {
  warn(e?.detail?.message || "Screenshot failed");
});

const writeClipboard = async (text, okMsg) => {
  try {
    await navigator.clipboard.writeText(text);
    flash(okMsg, { iconName: "copy" });
  } catch (err) {
    console.warn("[tsayru] clipboard write failed:", err);
    warn("Couldn't write to the clipboard");
  }
};

const copyAll = async () => {
  const tasks = visibleTasks();
  const text = formatTasks(state.tasks, state.filterHost, {
    filterTag: state.filterTag,
  });
  if (!text) {
    warn("Nothing to copy yet");
    return;
  }
  await writeClipboard(text, `Copied ${tasks.length} task${plural(tasks.length)}`);
  // Best-effort inbox save so the copied batch (with screenshots) is also
  // retrievable via MCP when the local server is running. Silent on failure —
  // clipboard already succeeded, which is what the user asked for.
  postBatch(tasks, null).then((p) => {
    if (!p.ok) console.warn("[tsayru] inbox save skipped:", p.error);
  });
};

const copyOne = async (task, displayIndex) => {
  await writeClipboard(formatTask(task, displayIndex), "Task copied");
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

const isContextInvalidated = (err) =>
  /context invalidated|Extension context/i.test(String(err || ""));

// POST batch to the local inbox for audit + future MCP pulls. Best-effort —
// failure here doesn't block the inject path; we want the chat to receive
// the markdown even if the inbox server is down.
const postBatch = (tasks, target) =>
  new Promise((resolve) => {
    const payload = {
      tasks,
      host: location.host,
      filterHost: state.filterHost || null,
      targetTabUrl: target?.url || null,
      targetTabTitle: target?.title || null,
      sentAt: new Date().toISOString(),
    };
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_SEND", path: "/tasks", body: payload, method: "POST" },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error:
                resp?.error ||
                chrome.runtime.lastError?.message ||
                "no response",
            });
            return;
          }
          resolve({ ok: true, batchId: resp.data?.batchId });
        },
      );
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });

const pushToWebChat = (tabId, content, images) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_PUSH_CLAUDE_AI", tabId, content, images },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error:
                resp?.error ||
                chrome.runtime.lastError?.message ||
                "no response",
            });
            return;
          }
          resolve({ ok: true, ...resp });
        },
      );
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
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
  const inject = await pushToWebChat(target.tabId, md, images);
  if (inject.ok) {
    flash(`Sent to ${label}`, { iconName: "send" });
    return;
  }
  console.warn("[tsayru] inject failed:", inject.error);
  if (isContextInvalidated(inject.error)) {
    warn(`tsayru was updated. Reload this page (${IS_MAC ? "⌘R" : "F5"})`);
  } else if (/chat input not found/i.test(String(inject.error))) {
    warn("No chat input on that tab. Open a chat there and try again");
  } else {
    warn(`Couldn't send to ${label}`);
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
const pollDoneStatus = () => {
  if (!refs.sidebar || refs.sidebar.classList.contains("hidden")) return;
  if (!state.tasks.some((t) => t.id && !t.done)) return;
  try {
    chrome.runtime.sendMessage(
      { type: "TSAYRU_SEND", path: "/tasks/done/recent", method: "GET" },
      (resp) => {
        void chrome.runtime.lastError;
        const ids =
          resp?.ok && Array.isArray(resp.data?.ids) ? resp.data.ids : null;
        if (!ids || ids.length === 0) return;
        const doneIds = new Set(ids);
        let changed = false;
        for (const t of state.tasks) {
          if (t.id && !t.done && doneIds.has(t.id)) {
            t.done = true;
            changed = true;
          }
        }
        if (changed) {
          persist();
          renderSidebar();
        }
      },
    );
  } catch {}
};

let donePollTimer = null;
const ensureDonePolling = () => {
  if (donePollTimer) return;
  donePollTimer = setInterval(pollDoneStatus, 10000);
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

// Clear with undo instead of a blocking confirm: the snapshot of removed
// tasks lives until the toast expires (8s), then it's gone for real.
const clearTasks = () => {
  if (state.tasks.length === 0) return;
  // Clears exactly what's on screen (host + tag scope) — undoable below.
  const removed = visibleTasks();
  if (removed.length === 0) return;
  const removedSet = new Set(removed);
  state.tasks = state.tasks.filter((t) => !removedSet.has(t));
  state.editingTaskIndex = null;
  persist();
  renderSidebar();
  toast(`Cleared ${removed.length} task${plural(removed.length)}`, {
    iconName: "trash",
    action: {
      label: "Undo",
      run: () => {
        state.tasks.push(...removed);
        persist();
        renderSidebar();
      },
    },
  });
};

const actButton = (name, label, onClick) =>
  el("button", { class: "act", title: label, "aria-label": label, onClick }, icon(name));

// The edit draft survives re-renders (done-status polling, inspector toggles).
let editDraft = null;

const editTask = (idx) => {
  state.editingTaskIndex = idx;
  editDraft = null;
  renderSidebar();
};

const deleteTask = (idx) => {
  state.tasks.splice(idx, 1);
  if (state.editingTaskIndex === idx) state.editingTaskIndex = null;
  else if (state.editingTaskIndex !== null && state.editingTaskIndex > idx) {
    state.editingTaskIndex -= 1;
  }
  persist();
  renderSidebar();
};

const renderEditor = (task, idx) => {
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

  const save = () => {
    const v = ta.value.trim();
    if (!v) {
      ta.focus();
      return;
    }
    state.tasks[idx].text = v;
    state.editingTaskIndex = null;
    editDraft = null;
    persist();
    renderSidebar();
  };
  const cancel = () => {
    state.editingTaskIndex = null;
    editDraft = null;
    renderSidebar();
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
      cancel();
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
      el("button", { class: "btn quiet small", onClick: cancel }, "Cancel", el("span", { class: "kbd-in" }, "Esc")),
      el("button", { class: "btn ink small", onClick: save }, "Save", el("span", { class: "kbd-in" }, "↵")),
    ),
  );
};

const renderTask = (task, idx, displayNum) => {
  const editing = state.editingTaskIndex === idx;
  const styleTask = !!task.styleChanges?.length;
  return el(
    "div",
    {
      class: "task" + (task.done ? " done" : "") + (editing ? " editing" : ""),
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
              actButton("copy", "Copy this task", () => copyOne(task, displayNum)),
              actButton("edit", "Edit", () => editTask(idx)),
              actButton("close", "Delete", () => deleteTask(idx)),
            ),
      ),
      el("div", { class: "sel", title: task.selector }, task.selector),
      editing
        ? renderEditor(task, idx)
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

const renderDeck = () => {
  const picking = state.inspecting;
  const styling = picking && state.pickMode === "style";
  const pick = refs.sidebar.querySelector(".pick");
  pick.classList.toggle("on", picking);
  pick.setAttribute("aria-pressed", String(picking));
  pick.querySelector(".disc").replaceChildren(icon(styling ? "sliders" : "target"));
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

export const renderSidebar = () => {
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
    filtered.forEach((task, fi) => {
      const idx = state.tasks.indexOf(task);
      // Display number is filter-relative — matches what `formatTasks` writes
      // into clipboard markdown so badge and `## N. label` always agree.
      list.appendChild(renderTask(task, idx, fi + 1));
    });
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
        el("span", { class: "disc" }, icon("target")),
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
        { class: "square", title: "Clear the tasks in view (you can undo)", onClick: clearTasks },
        icon("trash"),
        "Clear",
      ),
    ),
  );
  uiLayer().appendChild(refs.sidebar);
  ensureDonePolling();
  renderSidebar();
};
