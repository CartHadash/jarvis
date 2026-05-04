# Jarvis

A personal second brain as an interactive force-directed mind map.
Local-first, polished, and wired to Claude Desktop via MCP.

- **Frontend:** React 18 + TypeScript + D3 + Tailwind
- **Shell:** Tauri v2 (Rust)
- **Storage:** SQLite (WAL) at `<appDataDir>/jarvis.db`
- **AI bridge:** Node.js stdio MCP server in `mcp-server/`

No accounts, no cloud, no telemetry.

---

## Quick start

Prerequisites: Node 20+, Rust 1.77+, Xcode CLI tools (macOS).

```sh
# 1. Install JS deps for the app
npm install

# 2. Install MCP server deps
cd mcp-server && npm install && cd ..

# 3. Run the app in dev mode
npm run tauri:dev
```

First launch creates the SQLite database at:

| OS      | Path                                                                  |
| ------- | --------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/app.jarvis/jarvis.db`                  |
| Linux   | `~/.local/share/app.jarvis/jarvis.db`                                 |
| Windows | `%APPDATA%\app.jarvis\jarvis.db`                                      |

Eight seed nodes + five seed edges are inserted automatically and never
re-seeded after that.

To produce a release build:

```sh
npm run tauri:build
```

---

## Wiring the MCP server to Claude Desktop

The MCP server runs as a separate Node process. Claude Desktop spawns it
on demand via stdio.

1. Install dependencies (once):

   ```sh
   cd mcp-server && npm install
   ```

2. Open Claude Desktop's config:

   ```sh
   open -a "TextEdit" "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
   ```

3. Add a `jarvis` entry under `mcpServers` (replace the path with the
   absolute path to *this* project on your machine):

   ```json
   {
     "mcpServers": {
       "jarvis": {
         "command": "node",
         "args": [
           "/Users/YOU/path/to/jarvis-workspace/jarvis/mcp-server/index.js"
         ]
       }
     }
   }
   ```

   Optional — point at a custom DB location (default is the macOS path
   above):

   ```json
   "env": {
     "JARVIS_DB_PATH": "/custom/path/to/jarvis.db"
   }
   ```

4. Restart Claude Desktop. A 🛠 icon next to the chat input means the
   tools loaded successfully.

5. Verify end-to-end. In Claude Desktop ask:

   > List every node in Jarvis.

   You should see the eight seed nodes (`Build Jarvis`, `Bocconi
   Bachelor of Economics`, `Compounding`, `Long-term wealth`, `Thiel's
   core argument`, `Atomic Habits`, `Black-Scholes`, `Target top
   European Economics programme`).

   Then:

   > Create a Jarvis node titled "Test from Claude" in category "Ideas".

   It should appear in the running Jarvis app within ~1s of refreshing.

   Finally:

   > Connect "Build Jarvis" to "Target top European Economics programme".

   A dashed edge (the dash style indicates `created_by: 'claude'`) shows
   up between the two nodes.

---

## Available MCP tools

Twelve tools, grouped by purpose:

**Discovery / read**

| Tool                       | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `jarvis_read_index`        | List every node (id, title, tags, updated_at). Use first to discover what exists.                    |
| `jarvis_get_node`          | Fetch full content of one node by id, including its tags and connections.                            |
| `jarvis_search_nodes`      | FTS5 full-text search by title/content with relevance ordering.                                      |
| `jarvis_get_summaries`     | Lightweight summaries (id, title, summary, node_type, tags) for an array of ids — cheap retrieval.   |
| `jarvis_get_tags`          | List all tags (name, colour, count). Match existing tags before inventing new ones.                  |

**Mutation**

| Tool                       | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `jarvis_create_node`       | New node. Requires `node_type`, `summary`, ≥1 tag. Optional `connections` to wire it up immediately. |
| `jarvis_update_node`       | Patch any subset of fields on an existing node.                                                      |
| `jarvis_add_connection`    | Directed edge between two nodes. `label` must be one of eight semantic types. Idempotent.            |
| `jarvis_remove_connection` | Remove edge in either direction.                                                                     |

**Session logging**

| Tool                        | Purpose                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `jarvis_append_session_log` | Append a single-line breadcrumb of a Claude-driven change.                                         |
| `jarvis_append_log`         | Append a one-paragraph session summary to today's daily log. Call at end of a session.             |
| `jarvis_recent_log`         | Return the last N days of daily session logs. Use to recall recent Claude sessions.                |

Every tool validates inputs with Zod and returns JSON in the standard
MCP `content[]` shape. Errors are wrapped in `{ isError: true, ... }`
so the transport never crashes.

> Note: The schema uses **tags** (many-to-many) rather than a single
> `category`, plus `node_type` (concept / source / goal / event / …)
> and `status` (seedling / …). Older docs that mention "categories"
> are out of date.

---

## Suggested Jarvis Project system prompt

When using Jarvis from a Claude Project, paste this system prompt to
shape the assistant's behaviour:

> You are Jarvis — Timofey's personal second brain. You have access to
> a graph of nodes and connections via MCP tools (`jarvis_*`). Before
> answering questions about Timofey's notes, projects, or goals, call
> `jarvis_read_index` to see what exists, then `jarvis_get_node` for
> any node you need full content from. Use `jarvis_search_nodes` for
> open-ended retrieval.
>
> When Timofey discusses something worth remembering, proactively
> create or update nodes via `jarvis_create_node` /
> `jarvis_update_node`. Connect related nodes with
> `jarvis_add_connection` (always pass meaningful `label` text). Keep
> categories consistent with what `jarvis_get_categories` returns;
> only invent a new category if nothing fits.
>
> After meaningful changes, call `jarvis_append_session_log` with a
> one-sentence summary so the change is recoverable later.
>
> Be concise. Reflect Timofey's style: focused, ambitious, no fluff.

---

## Project layout

```
jarvis/
├── src/                 # React app (graph, panels, editor, store)
├── src-tauri/           # Rust shell + SQLite + invoke handlers
├── mcp-server/          # Node.js stdio MCP server (Phase 1)
├── scripts/             # Build helpers
└── README.md
```

See the inline doc comments at the top of each module for design notes.

---

## Phase 2 (out of scope, planned)

Session hooks (SessionStart / SessionEnd), hybrid semantic search via
local embeddings, daily reflection / audit agent, OCR for handwritten
notes, layout modes (timeline, matrix). The current schema and
`metadata` JSON column are designed to absorb these without migration.
