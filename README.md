# Jarvis

A personal second brain as an interactive force-directed mind map.
Local-first, polished, and wired to Claude Desktop via MCP.

- **Frontend:** React 18 + TypeScript + D3 + Tailwind + TipTap
- **Shell:** Tauri v2 (Rust)
- **Storage:** SQLite (WAL) + FTS5 full-text search at `<appDataDir>/jarvis.db`
- **AI bridge:** Node.js stdio MCP server in `mcp-server/` (12 tools)
- **Images:** Pasted/imported images stored at `<appDataDir>/images/<uuid>.<ext>`

No accounts, no cloud, no telemetry.

---

## Quick start

Prerequisites: Node 20+, Rust 1.77+, Xcode CLI tools (macOS).

```sh
# 1. Install JS deps for the app
npm install

# 2. Install MCP server deps
cd mcp-server && npm install && cd ..

# 3. Run the app in dev mode (terminal-attached)
npm run tauri:dev

# OR — produce a real installable .app bundle (recommended)
npm run tauri:build
# Output: src-tauri/target/release/bundle/macos/Jarvis.app
#         src-tauri/target/release/bundle/dmg/Jarvis_<version>_<arch>.dmg
```

First launch creates the SQLite database at:

| OS      | Path                                                                  |
| ------- | --------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/app.jarvis/jarvis.db`                  |
| Linux   | `~/.local/share/app.jarvis/jarvis.db`                                 |
| Windows | `%APPDATA%\app.jarvis\jarvis.db`                                      |

Eight seed nodes + five seed edges are inserted on first run and never
re-seeded after that.

---

## Data model (current schema)

After migrations `0001_init` → `0004_daily_logs`:

**`nodes`** — one row per atomic note.

| Column        | Notes                                                          |
| ------------- | -------------------------------------------------------------- |
| `id`          | TEXT, primary key (UUID or stable slug)                        |
| `title`       | TEXT, required                                                 |
| `content`     | TEXT, TipTap-serialised HTML                                   |
| `summary`     | TEXT, 1–2 sentence gist (used by `jarvis_get_summaries`)       |
| `node_type`   | `concept` \| `source` \| `goal` \| `event` \| `question` \| …  |
| `status`      | `seedling` \| `evergreen` \| `archived` \| …                   |
| `source_url`  | TEXT, optional                                                 |
| `confidence`  | TEXT, optional                                                 |
| `review_due`  | TEXT (ISO date), optional                                      |
| `captured_at` | TEXT, when first added                                         |
| `created_at`  | TEXT (ISO timestamp)                                           |
| `updated_at`  | TEXT (ISO timestamp)                                           |
| `metadata`    | TEXT (JSON blob, escape hatch for future fields)               |

**`tags`** — colour palette + tag dictionary (renamed from `categories` in 0002).
**`node_tags`** — many-to-many; nodes can carry multiple tags.
**`edges`** — `(source, target, label)`. `label` is one of eight semantic types (see below).
**`daily_logs`** — one row per day; populated by `jarvis_append_log` for cross-session continuity.
**`nodes_fts`** — FTS5 virtual table mirroring `title` + `content`, kept in sync by triggers.

### The eight semantic edge types

| Label              | When to use it                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `supports`         | A is evidence/argument FOR B                                                |
| `contradicts`      | A challenges or refutes B                                                   |
| `example_of`       | A is an instance of the more general B                                      |
| `prerequisite_for` | A must be understood/done before B                                          |
| `part_of`          | A is a component of the larger B                                            |
| `related_to`       | Generic association — use sparingly; prefer a more specific label           |
| `inspired_by`      | A came from B (idea genealogy)                                              |
| `replaces`         | A is an updated/preferred version of B                                      |

The graph renders these with three width tiers: thick (`supports`,
`part_of`, `prerequisite_for`), medium (`example_of`, `contradicts`,
`replaces`), thin (`related_to`, `inspired_by`). Claude-created edges
render dashed.

---

## Wiring the MCP server to Claude Desktop

The MCP server runs as a separate Node process. Claude Desktop spawns it
on demand via stdio and reads/writes the same SQLite file the app uses
(WAL mode keeps both processes safe).

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

5. **Verify end-to-end.** With Jarvis running, ask Claude Desktop:

   > List every node in Jarvis.

   You should get an index of all current nodes with their `id`,
   `title`, `node_type`, `summary`, and `tags`.

   Then create one:

   > Create a Jarvis node titled "Test from Claude" with `node_type:
   > concept`, summary "Smoke test of the MCP bridge", and tag `Ideas`.

   It should appear in the running Jarvis app within ~1s of refresh.

   Finally, link it:

   > Connect "Test from Claude" to "Build Jarvis" with label
   > `related_to`.

   The new edge renders as a thin dashed line (dashed = Claude-created).

---

## Available MCP tools

Twelve tools, grouped by purpose:

**Discovery / read**

| Tool                       | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `jarvis_read_index`        | List every node (id, title, tags, updated_at). Use first to discover what exists.                    |
| `jarvis_get_node`          | Fetch full content of one node by id, including its tags and connections.                            |
| `jarvis_search_nodes`      | FTS5 full-text search by title/content with BM25 relevance ordering.                                 |
| `jarvis_get_summaries`     | Lightweight summaries (id, title, summary, node_type, tags) for an array of ids — cheap retrieval.   |
| `jarvis_get_tags`          | List all tags (name, colour, count). Match existing tags before inventing new ones.                  |

**Mutation**

| Tool                       | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `jarvis_create_node`       | New node. Requires `node_type`, `summary`, ≥1 tag. Optional `connections` to wire it up immediately. |
| `jarvis_update_node`       | Patch any subset of fields on an existing node.                                                      |
| `jarvis_add_connection`    | Directed edge between two nodes. `label` must be one of the eight semantic types. Idempotent.        |
| `jarvis_remove_connection` | Remove edge in either direction.                                                                     |

**Session logging**

| Tool                        | Purpose                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `jarvis_append_session_log` | Append a single-line breadcrumb of a Claude-driven change to the session log.                      |
| `jarvis_append_log`         | Append a one-paragraph session summary to today's daily log. Call at end of a session.             |
| `jarvis_recent_log`         | Return the last N days of daily session logs. Use to recall recent Claude sessions.                |

Every tool validates inputs with Zod and returns JSON in the standard
MCP `content[]` shape. Errors are wrapped in `{ isError: true, ... }`
so the transport never crashes.

---

## Built-in app commands

Open the command palette with `⌘K` (or click the input bar) and run:

| Command          | What it does                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `/lint`          | Read-only graph audit: orphans, stale nodes (>90d), edge-label distribution, tag/type balance, review-due. |
| `/ingest`        | URL-or-paste import wizard: fetches content, searches existing graph for context, drafts a node + edges via Claude, lets you edit before approving. |
| `/process-inbox` | Promote captured-but-unstructured drafts into proper nodes.                                        |
| `/settings`      | Tags, theme, model, MCP key, export paths, keyboard shortcuts.                                     |

---

## Suggested Jarvis Project system prompt

When using Jarvis from a Claude Project, paste this system prompt to
shape the assistant's behaviour. It enforces second-brain hygiene
(atomic notes, dense linking, summary-first):

> You are Jarvis — Timofey's personal second brain. You have access to
> a graph of nodes and connections via MCP tools (`jarvis_*`).
>
> **Discovery.** Before answering questions about Timofey's notes,
> projects, or goals, call `jarvis_read_index` to see what exists. For
> retrieval, prefer `jarvis_search_nodes` (FTS5) for keywords or
> `jarvis_get_summaries` for cheap multi-node context. Only call
> `jarvis_get_node` when you need full content.
>
> **Capture.** When Timofey discusses something worth remembering,
> proactively create or update nodes via `jarvis_create_node` /
> `jarvis_update_node`. Always:
>
> - Make notes **atomic**. One concept per node. If you'd write more
>   than ~500 words, propose a split into linked nodes.
> - Always fill `summary` with a 1–2 sentence gist — this is what other
>   Claude sessions read first to decide if a node is relevant.
> - Use existing tags from `jarvis_get_tags` before inventing new ones.
> - Pick the most specific `node_type` (`concept`, `source`, `goal`,
>   `event`, `question`).
>
> **Link.** A node with no incoming edges is a node nobody finds. After
> creating or editing a node, look for **at least 2** plausible
> connections to existing nodes via `jarvis_add_connection`. Pick the
> most specific `label` from `supports`, `contradicts`, `example_of`,
> `prerequisite_for`, `part_of`, `inspired_by`, `replaces`. Use
> `related_to` only when nothing else fits.
>
> **Log.** After meaningful changes, call `jarvis_append_session_log`
> with a one-sentence summary so the change is recoverable later. At
> the end of a session, call `jarvis_append_log` with a paragraph
> covering what we worked on.
>
> Be concise. Reflect Timofey's style: focused, ambitious, no fluff.

---

## Backup & data safety

Jarvis runs SQLite in WAL (Write-Ahead Log) mode for concurrent reads
and crash safety. **All three files matter** when backing up:

```
<appDataDir>/jarvis.db        # main database
<appDataDir>/jarvis.db-wal    # write-ahead log (recent changes live here)
<appDataDir>/jarvis.db-shm    # shared memory index for the WAL
<appDataDir>/images/          # pasted/imported images
<appDataDir>/exports/         # markdown vault snapshots
```

A clean app shutdown checkpoints the WAL into the main `.db` file. If
you copy only `jarvis.db` while the app is running (or has crashed),
recent edits may be missing. Always back up the **entire**
`<appDataDir>/app.jarvis/` folder.

For periodic snapshots, use the in-app `Settings → Export vault` to
write a self-contained markdown bundle to
`<appDataDir>/exports/<timestamp>/` — easy to git-track separately.

---

## Project layout

```
jarvis/
├── src/                 # React app (graph, panels, editor, store)
├── src-tauri/           # Rust shell + SQLite + invoke handlers
│   └── migrations/      # 0001_init → 0004_daily_logs
├── mcp-server/          # Node.js stdio MCP server (12 tools)
│   └── tools/           # one file per Jarvis MCP tool
├── scripts/             # build helpers
└── README.md
```

See the inline doc comments at the top of each module for design notes.

---

## Roadmap

Hybrid semantic search via local embeddings; daily reflection / audit
agent; OCR for handwritten notes; layout modes (timeline, matrix);
session hooks (SessionStart / SessionEnd); diff view across node
versions. The current schema and `metadata` JSON column are designed to
absorb these without breaking migration.
