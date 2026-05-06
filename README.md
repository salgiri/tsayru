# tsayru

Chrome extension для аннотирования UI-элементов задачами и отправки их пачкой в Claude Code.

## Идея

Включаешь режим инспектора → водишь мышкой по странице, элементы подсвечиваются → кликаешь на блок → пишешь задачу → Enter. Повторяешь для нескольких блоков. В конце нажимаешь «Скопировать» — markdown-сообщение со всеми задачами и селекторами летит в буфер. Вставляешь в чат с Claude.

## MVP (этот этап)

- Manifest V3 chrome extension
- Toolbar-кнопка включает/выключает режим инспектора в активной вкладке
- Hover-подсветка элементов
- Click → попап с textarea, Enter добавляет задачу в список
- Side-panel со списком задач, кнопка «Скопировать всё»
- Доставка в чат — через clipboard

## Дальнейшие планы (v2)

- Локальный MCP-сервер: задачи прилетают в Claude Code в реальном времени через tool/hook
- Скриншоты областей
- Группировка задач по сессиям/страницам

## Установка (dev)

1. `npm install` (один раз)
2. `npm run build` — собирает `src/index.js` + дерево импортов в `extension/content.js` через esbuild.
   - Альтернатива при активной разработке: `npm run watch` — пересборка при сохранении.
3. Открыть `chrome://extensions`
4. Включить Developer mode
5. Load unpacked → выбрать папку `extension/`
6. После любых правок `src/**` — пересобрать (`npm run build`) и нажать ⟳ в `chrome://extensions`.

## Структура

- `src/` — ESM-модули (core, selector, framework, sidebar, modal, inspector, format, index).
- `extension/` — то, что Chrome видит как unpacked: `manifest.json`, `background.js`, bundled `content.js`, `inject.js` (MAIN world, не бандлится), `content.css`, иконки.
