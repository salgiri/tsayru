(() => {
  if (window.__tsayruInjected) return;
  window.__tsayruInjected = true;

  const STORAGE_KEY = "tsayru_tasks";
  const state = {
    inspecting: false,
    hovered: null,
    tasks: [],
  };

  // ---------- DOM helpers ----------

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // Build a reasonably unique CSS selector for an element.
  const buildSelector = (target) => {
    if (!(target instanceof Element)) return "";
    if (target.id) return `#${CSS.escape(target.id)}`;
    const parts = [];
    let node = target;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let part = node.tagName.toLowerCase();
      if (node.classList.length) {
        const cls = [...node.classList]
          .filter((c) => !c.startsWith("tsayru-"))
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join("");
        part += cls;
      }
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter(
          (c) => c.tagName === node.tagName,
        );
        if (sameTag.length > 1) {
          part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      if (node.id) {
        parts[0] = `#${CSS.escape(node.id)}`;
        break;
      }
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  };

  const shortLabel = (target) => {
    if (!target) return "";
    const text = (target.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length === 0) return target.tagName.toLowerCase();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };

  // ---------- Overlay (highlight) ----------

  let highlight, sidebar, modal;

  const ensureOverlay = () => {
    if (highlight) return;
    highlight = el("div", { class: "tsayru-highlight" });
    document.documentElement.appendChild(highlight);
  };

  const moveHighlight = (target) => {
    if (!highlight) return;
    if (!target) {
      highlight.style.display = "none";
      return;
    }
    const r = target.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.transform = `translate(${r.left + window.scrollX}px, ${r.top + window.scrollY}px)`;
    highlight.style.width = `${r.width}px`;
    highlight.style.height = `${r.height}px`;
  };

  // ---------- Sidebar ----------

  const renderSidebar = () => {
    if (!sidebar) return;
    const list = sidebar.querySelector(".tsayru-list");
    list.innerHTML = "";
    if (state.tasks.length === 0) {
      list.appendChild(
        el(
          "div",
          { class: "tsayru-empty" },
          "Включи инспектор и кликни по блоку, чтобы добавить задачу.",
        ),
      );
    } else {
      state.tasks.forEach((task, idx) => {
        list.appendChild(
          el(
            "div",
            { class: "tsayru-task" },
            el(
              "div",
              { class: "tsayru-task-head" },
              el("span", { class: "tsayru-task-num" }, `#${idx + 1}`),
              el("span", { class: "tsayru-task-label" }, task.label),
              el(
                "button",
                {
                  class: "tsayru-task-del",
                  title: "Удалить",
                  onClick: () => {
                    state.tasks.splice(idx, 1);
                    persist();
                    renderSidebar();
                  },
                },
                "×",
              ),
            ),
            el("div", { class: "tsayru-task-sel" }, task.selector),
            el("div", { class: "tsayru-task-text" }, task.text),
          ),
        );
      });
    }

    const counter = sidebar.querySelector(".tsayru-counter");
    counter.textContent = state.tasks.length
      ? `${state.tasks.length} задач${plural(state.tasks.length)}`
      : "пусто";

    const inspectBtn = sidebar.querySelector(".tsayru-inspect-btn");
    inspectBtn.classList.toggle("tsayru-active", state.inspecting);
    inspectBtn.textContent = state.inspecting
      ? "Выключить инспектор"
      : "Включить инспектор";
  };

  const plural = (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "а";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "и";
    return "";
  };

  const ensureSidebar = () => {
    if (sidebar) return;
    sidebar = el(
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
            title: "Скрыть",
            onClick: () => {
              sidebar.classList.add("tsayru-hidden");
            },
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
          {
            class: "tsayru-copy-btn",
            onClick: copyAll,
          },
          "Скопировать всё",
        ),
        el(
          "button",
          {
            class: "tsayru-clear-btn",
            onClick: () => {
              if (state.tasks.length === 0) return;
              if (confirm("Очистить все задачи?")) {
                state.tasks = [];
                persist();
                renderSidebar();
              }
            },
          },
          "Очистить",
        ),
      ),
      el("div", { class: "tsayru-list" }),
    );
    document.documentElement.appendChild(sidebar);
    renderSidebar();
  };

  // ---------- Modal (task input) ----------

  const openModal = (target) => {
    closeModal();
    const selector = buildSelector(target);
    const label = shortLabel(target);
    const r = target.getBoundingClientRect();

    modal = el(
      "div",
      { class: "tsayru-modal-backdrop", onClick: (e) => {
        if (e.target === modal) closeModal();
      } },
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
              onClick: () => submitTask(selector, label),
            },
            "Добавить (Enter)",
          ),
        ),
      ),
    );

    document.documentElement.appendChild(modal);
    const ta = modal.querySelector(".tsayru-modal-input");
    ta.focus();
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitTask(selector, label);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    });
  };

  const submitTask = (selector, label) => {
    if (!modal) return;
    const ta = modal.querySelector(".tsayru-modal-input");
    const text = ta.value.trim();
    if (!text) {
      ta.focus();
      return;
    }
    state.tasks.push({
      selector,
      label,
      text,
      url: location.href,
      addedAt: new Date().toISOString(),
    });
    persist();
    renderSidebar();
    closeModal();
  };

  const closeModal = () => {
    if (modal) {
      modal.remove();
      modal = null;
    }
  };

  // ---------- Inspector mode ----------

  const onMouseMove = (e) => {
    if (!state.inspecting) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === state.hovered) return;
    if (target.closest(".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight")) {
      state.hovered = null;
      moveHighlight(null);
      return;
    }
    state.hovered = target;
    moveHighlight(target);
  };

  const onClick = (e) => {
    if (!state.inspecting) return;
    if (e.target.closest(".tsayru-sidebar, .tsayru-modal-backdrop")) return;
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target) return;
    if (target.closest(".tsayru-sidebar, .tsayru-modal-backdrop, .tsayru-highlight")) return;
    setInspecting(false);
    moveHighlight(null);
    openModal(target);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape" && state.inspecting) {
      setInspecting(false);
      moveHighlight(null);
    }
  };

  const setInspecting = (on) => {
    state.inspecting = on;
    document.documentElement.classList.toggle("tsayru-inspecting", on);
    if (!on) moveHighlight(null);
    renderSidebar();
  };

  const toggleInspector = () => {
    ensureOverlay();
    ensureSidebar();
    sidebar.classList.remove("tsayru-hidden");
    setInspecting(!state.inspecting);
  };

  // ---------- Copy ----------

  const formatTasks = () => {
    if (state.tasks.length === 0) return "";
    const lines = ["# UI-задачи (tsayru)", ""];
    state.tasks.forEach((t, i) => {
      lines.push(`## ${i + 1}. ${t.label}`);
      lines.push(`- селектор: \`${t.selector}\``);
      lines.push(`- url: ${t.url}`);
      lines.push("");
      lines.push(t.text);
      lines.push("");
    });
    return lines.join("\n");
  };

  const copyAll = async () => {
    const text = formatTasks();
    if (!text) {
      flash("нечего копировать");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flash("скопировано");
    } catch (err) {
      console.warn("[tsayru] clipboard write failed:", err);
      flash("ошибка копирования");
    }
  };

  const flash = (msg) => {
    const tip = el("div", { class: "tsayru-flash" }, msg);
    document.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 1400);
  };

  // ---------- Persistence ----------

  const persist = () => {
    try {
      chrome.storage?.local?.set({ [STORAGE_KEY]: state.tasks });
    } catch {}
  };

  const restore = async () => {
    try {
      const data = await chrome.storage?.local?.get(STORAGE_KEY);
      if (data && Array.isArray(data[STORAGE_KEY])) {
        state.tasks = data[STORAGE_KEY];
      }
    } catch {}
  };

  // ---------- Wire up ----------

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", () => {
    if (state.hovered) moveHighlight(state.hovered);
  }, true);
  window.addEventListener("resize", () => {
    if (state.hovered) moveHighlight(state.hovered);
  });

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === "TSAYRU_TOGGLE") {
      toggleInspector();
    }
  });

  restore().then(() => {
    ensureSidebar();
  });
})();
