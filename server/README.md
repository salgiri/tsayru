# tsayru-server

Server-side companion for the tsayru Chrome extension. Closes roadmap items
**#5 HTTP-inbox** and **#6 MCP-server** with one shared on-disk inbox.

Two entrypoints, one storage:

| Entrypoint | Process model | Used by |
| --- | --- | --- |
| `http.js` | long-running HTTP daemon on `127.0.0.1:7777` | the Chrome extension (POSTs task batches) |
| `mcp.js` | stdio MCP server, spawned per-session | Claude Code (reads stored batches) |

Both read and write `~/.tsayru/inbox/<batchId>/{tasks.json, tasks.md}`.

---

## Install

```bash
cd /Users/mac/Documents/projects/tsayru/server
npm install
```

Requires Node.js 18.17+.

## Run the HTTP inbox

```bash
npm start
# or
node http.js
```

Starts on `http://127.0.0.1:7777`. Override the port via env var:

```bash
TSAYRU_PORT=8123 node http.js
```

The server only binds to `127.0.0.1` — never the public interface. The
extension talks to it over loopback.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/tasks` | Save a batch. Body: `{ tasks, host, filterHost }`. Returns `{ ok, batchId, path, addedAt, count }`. |
| `GET` | `/tasks/list?limit=50` | Recent batches metadata, newest first. |
| `GET` | `/tasks/:batchId` | Full batch envelope JSON. |
| `DELETE` | `/tasks/:batchId` | Remove the batch folder. |
| `GET` | `/health` | `{ ok: true, version }`. |

CORS is permissive (`*`) — fine because the server is loopback-only.

## Wire MCP into Claude Code

Add an entry to your Claude Code MCP config
(`~/.claude/claude_code_settings.json` or the equivalent the CLI prompts you
to edit) under `mcpServers`:

```json
{
  "mcpServers": {
    "tsayru": {
      "command": "node",
      "args": ["/Users/mac/Documents/projects/tsayru/server/mcp.js"]
    }
  }
}
```

Restart Claude Code. The following tools become available:

| Tool | Input | Returns |
| --- | --- | --- |
| `tsayru_latest_tasks` | — | Latest batch as markdown. |
| `tsayru_list_batches` | `{ limit?: number }` | JSON array of batch metadata. |
| `tsayru_get_batch` | `{ batchId: string }` | The named batch as markdown. |
| `tsayru_clear_inbox` | — | `{ deleted: number }`. Irreversible. |

The MCP server spawns per-session over stdio, so you do not need to keep
anything running manually for it to work — Claude Code handles the lifecycle.

## End-to-end test

In one terminal, start the HTTP server:

```bash
node /Users/mac/Documents/projects/tsayru/server/http.js
```

In another, post a batch and verify storage:

```bash
curl -sS -X POST http://127.0.0.1:7777/tasks \
  -H 'Content-Type: application/json' \
  -d '{
        "host": "example.com",
        "tasks": [{
          "selector": ".cta",
          "label": "Sign up",
          "text": "Make the CTA button more prominent.",
          "url": "https://example.com/",
          "framework": { "componentName": "CTAButton",
                         "source": { "file": "src/CTA.tsx", "line": 12 } },
          "computedStyles": { "color": "rgb(255,255,255)",
                              "backgroundColor": "rgb(0,128,255)",
                              "fontSize": "14px",
                              "fontFamily": "Inter, sans-serif",
                              "padding": "8px 16px",
                              "borderRadius": "6px" },
          "addedAt": "2026-05-06T10:00:00.000Z"
        }]
      }'

ls ~/.tsayru/inbox/
curl -sS http://127.0.0.1:7777/tasks/list
```

To verify the MCP server lists its tools, send a single JSON-RPC frame:

```bash
node /Users/mac/Documents/projects/tsayru/server/mcp.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
```

In day-to-day use Claude Code drives that handshake automatically.

## Layout

```
server/
├── package.json
├── http.js          # Express HTTP inbox, localhost-only
├── mcp.js           # MCP stdio server
├── lib/
│   ├── storage.js   # ~/.tsayru/inbox CRUD shared by both entrypoints
│   └── format.js    # port of /src/format.js — same Russian field labels
└── README.md
```

## Notes

- `batchId` is the ISO timestamp with `:` and `.` replaced by `-`, so folder
  names sort lexicographically newest-last and listing is just a sort+reverse.
- `tasks.md` is rendered at write time (cheaper than re-rendering on every
  MCP read) and falls back to re-rendering from `tasks.json` if missing.
- The HTTP body limit is 25 MB so a batch with a few PNG screenshots
  (sent as base64 data URLs) still fits.
- Logs go to stdout for `http.js` and stderr for `mcp.js` (stdout on the
  MCP side is reserved for the JSON-RPC channel).
