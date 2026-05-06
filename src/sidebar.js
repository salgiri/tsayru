// Sidebar: container, header, controls, list rendering, per-task UI (view/edit modes), tabs by host.
// Also: copy-to-clipboard and clear handlers, flash toast.

import { el, state, refs, safeHost, plural, persist } from "./core.js";
import { formatTasks, formatTask } from "./format.js";
import {
  toggleInspector,
  hideSidebar,
  ensureOverlay,
  moveHighlight,
} from "./inspector.js";
import { pickTargetChat } from "./chatpicker.js";

const flash = (msg) => {
  const tip = el("div", { class: "tsayru-flash" }, msg);
  document.documentElement.appendChild(tip);
  setTimeout(() => tip.remove(), 1400);
};

// Surface persist quota / I/O errors from core.js (avoids import cycle).
window.addEventListener("tsayru-persist-error", (e) => {
  flash(e?.detail?.message || "ошибка сохранения");
});

const writeClipboard = async (text, okMsg) => {
  try {
    await navigator.clipboard.writeText(text);
    flash(okMsg);
  } catch (err) {
    console.warn("[tsayru] clipboard write failed:", err);
    flash("ошибка копирования");
  }
};

const copyAll = async () => {
  const text = formatTasks();
  if (!text) {
    flash("нечего копировать");
    return;
  }
  await writeClipboard(text, "скопировано");
};

const copyOne = async (task, displayIndex) => {
  await writeClipboard(formatTask(task, displayIndex), "задача скопирована");
};

const SERVER_URL = "http://127.0.0.1:7777/tasks";

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
        { type: "TSAYRU_SEND", url: SERVER_URL, body: payload, method: "POST" },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error:
                resp?.error ||
                chrome.runtime.lastError?.message ||
                "нет ответа",
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

const pushToWebChat = (tabId, content) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "TSAYRU_PUSH_CLAUDE_AI", tabId, content },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({
              ok: false,
              error:
                resp?.error ||
                chrome.runtime.lastError?.message ||
                "нет ответа",
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
  const label = target?.title || "web-чат";
  const where = ` → ${label}`;

  // Persist to inbox in background — audit trail, useful if user later wants
  // to retrieve the batch via MCP. Don't block the inject on this.
  postBatch(tasks, target).then((p) => {
    if (!p.ok) console.warn("[tsayru] inbox save failed:", p.error);
  });

  // The actual delivery — DOM inject + auto-submit in the chosen tab.
  const fullMd = formatTasks({ includeScreenshots: true });
  const inject = await pushToWebChat(target.tabId, fullMd);
  if (inject.ok) {
    flash(`отправлено${where} ✓`);
    return;
  }
  console.warn("[tsayru] inject failed:", inject.error);
  if (isContextInvalidated(inject.error)) {
    flash("обнови страницу (Cmd+R)");
  } else if (/chat input not found/i.test(String(inject.error))) {
    flash(`инжект не удался: на вкладке нет чат-инпута`);
  } else {
    flash(`инжект не удался${where}`);
  }
};

const sendToServer = async () => {
  const tasks = state.filterHost
    ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost)
    : state.tasks;
  if (tasks.length === 0) {
    flash("нечего отправлять");
    return;
  }
  const target = await pickTargetChat();
  if (target === null) return; // cancelled
  sendBatch(tasks, target);
};

// Hover-preview: highlight the original element on the page when user hovers a task in the sidebar.
// Skipped while inspector is active — there the page-mouse-tracker takes precedence.
const onTaskHover = (selector) => {
  if (state.inspecting) return;
  if (!selector) return;
  ensureOverlay();
  let target = null;
  try {
    target = document.querySelector(selector);
  } catch {
    target = null;
  }
  moveHighlight(target);
};

const onTaskLeave = () => {
  if (state.inspecting) return;
  moveHighlight(null);
};

const clearTasks = () => {
  if (state.tasks.length === 0) return;
  const fh = state.filterHost;
  const target = fh
    ? state.tasks.filter((t) => safeHost(t.url) === fh)
    : state.tasks;
  if (target.length === 0) return;
  const msg = fh
    ? `Очистить ${target.length} задач для ${fh}?`
    : "Очистить все задачи?";
  if (!confirm(msg)) return;
  if (fh) {
    state.tasks = state.tasks.filter((t) => safeHost(t.url) !== fh);
  } else {
    state.tasks = [];
  }
  state.editingTaskIndex = null;
  persist();
  renderSidebar();
};

const renderTask = (task, idx, displayNum) => {
  if (state.editingTaskIndex === idx) {
    const ta = el("textarea", { class: "tsayru-task-edit-input", rows: 3 });
    ta.value = task.text;
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
      persist();
      renderSidebar();
    };
    const cancel = () => {
      state.editingTaskIndex = null;
      renderSidebar();
    };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });

    return el(
      "div",
      { class: "tsayru-task tsayru-task-editing" },
      el(
        "div",
        { class: "tsayru-task-head" },
        el("span", { class: "tsayru-task-num" }, `#${displayNum}`),
        el("span", { class: "tsayru-task-label" }, task.label),
        el(
          "button",
          {
            class: "tsayru-task-save",
            title: "Сохранить (Enter)",
            onClick: save,
          },
          "✓",
        ),
        el(
          "button",
          {
            class: "tsayru-task-cancel",
            title: "Отмена (Esc)",
            onClick: cancel,
          },
          "↩",
        ),
      ),
      el("div", { class: "tsayru-task-sel" }, task.selector),
      ta,
    );
  }

  return el(
    "div",
    {
      class: "tsayru-task",
      onMouseEnter: () => onTaskHover(task.selector),
      onMouseLeave: onTaskLeave,
    },
    el(
      "div",
      { class: "tsayru-task-head" },
      el("span", { class: "tsayru-task-num" }, `#${displayNum}`),
      el("span", { class: "tsayru-task-label" }, task.label),
      el(
        "button",
        {
          class: "tsayru-task-copy",
          title: "Скопировать эту задачу",
          onClick: () => copyOne(task, displayNum),
        },
        "⧉",
      ),
      el(
        "button",
        {
          class: "tsayru-task-edit",
          title: "Редактировать",
          onClick: () => {
            state.editingTaskIndex = idx;
            renderSidebar();
          },
        },
        "✎",
      ),
      el(
        "button",
        {
          class: "tsayru-task-del",
          title: "Удалить",
          onClick: () => {
            state.tasks.splice(idx, 1);
            if (state.editingTaskIndex === idx) state.editingTaskIndex = null;
            else if (
              state.editingTaskIndex !== null &&
              state.editingTaskIndex > idx
            ) {
              state.editingTaskIndex -= 1;
            }
            persist();
            renderSidebar();
          },
        },
        "×",
      ),
    ),
    el("div", { class: "tsayru-task-sel" }, task.selector),
    el("div", { class: "tsayru-task-text" }, task.text),
  );
};

export const renderSidebar = () => {
  if (!refs.sidebar) return;
  const list = refs.sidebar.querySelector(".tsayru-list");
  list.innerHTML = "";

  const hosts = [
    ...new Set(state.tasks.map((t) => safeHost(t.url)).filter(Boolean)),
  ];

  // Reset filter if its host disappeared.
  if (state.filterHost && !hosts.includes(state.filterHost)) {
    state.filterHost = null;
  }

  if (hosts.length > 1) {
    const tabs = el("div", { class: "tsayru-tabs" });
    const mkTab = (label, value, count) => {
      const active = state.filterHost === value;
      return el(
        "button",
        {
          class: "tsayru-tab" + (active ? " tsayru-tab-active" : ""),
          onClick: () => {
            state.filterHost = value;
            renderSidebar();
          },
        },
        `${label} · ${count}`,
      );
    };
    tabs.appendChild(mkTab("Все", null, state.tasks.length));
    for (const h of hosts) {
      const n = state.tasks.filter((t) => safeHost(t.url) === h).length;
      tabs.appendChild(mkTab(h, h, n));
    }
    list.appendChild(tabs);
  }

  const filtered = state.filterHost
    ? state.tasks.filter((t) => safeHost(t.url) === state.filterHost)
    : state.tasks;

  if (filtered.length === 0) {
    list.appendChild(
      el(
        "div",
        { class: "tsayru-empty" },
        state.filterHost
          ? `Нет задач для ${state.filterHost}.`
          : "Включи инспектор и кликни по блоку, чтобы добавить задачу.",
      ),
    );
  } else {
    filtered.forEach((task, fi) => {
      const idx = state.tasks.indexOf(task);
      // Display number is filter-relative — matches what `formatTasks` writes
      // into clipboard markdown so badge and `## N. label` always agree.
      list.appendChild(renderTask(task, idx, fi + 1));
    });
  }

  const counter = refs.sidebar.querySelector(".tsayru-counter");
  counter.textContent = state.tasks.length
    ? `${state.tasks.length} задач${plural(state.tasks.length)}`
    : "пусто";

  const inspectBtn = refs.sidebar.querySelector(".tsayru-inspect-btn");
  inspectBtn.classList.toggle("tsayru-active", state.inspecting);
  inspectBtn.textContent = state.inspecting
    ? "Выключить инспектор"
    : "Включить инспектор";
};

export const ensureSidebar = () => {
  if (refs.sidebar) return;
  refs.sidebar = el(
    "div",
    { class: "tsayru-sidebar" },
    el(
      "div",
      { class: "tsayru-header" },
      el("div", { class: "tsayru-title" }, "tsayru"),
      el("div", { class: "tsayru-counter" }, "пусто"),
      el(
        "button",
        {
          class: "tsayru-close",
          title: "Скрыть (выключит инспектор)",
          onClick: () => hideSidebar(),
        },
        "—",
      ),
    ),
    el(
      "div",
      { class: "tsayru-controls" },
      el(
        "button",
        {
          class: "tsayru-inspect-btn",
          onClick: () => toggleInspector(),
        },
        "Включить инспектор",
      ),
      el(
        "button",
        { class: "tsayru-copy-btn", onClick: copyAll },
        "Скопировать всё",
      ),
      el(
        "button",
        {
          class: "tsayru-send-btn",
          title:
            "Отправить пачку в открытую вкладку claude.ai / claude.com (auto-submit)",
          onClick: sendToServer,
        },
        "В Claude.ai",
      ),
      el(
        "button",
        { class: "tsayru-clear-btn", onClick: clearTasks },
        "Очистить",
      ),
    ),
    el("div", { class: "tsayru-list" }),
  );
  document.documentElement.appendChild(refs.sidebar);
  renderSidebar();
};
