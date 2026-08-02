<!--
  ─────────────────────────────────────────────────────────────
  SKELETON README — fill in the blanks marked with 〔 〕
  Everything in <!-- comments --> is invisible on GitHub.
  Delete each comment once you've done what it says.
  ─────────────────────────────────────────────────────────────
-->

# Jarvis

**〔One line: what Jarvis is, in your own words. This shows up in search results and under the repo title — make it count.〕**

<!--
  HERO SCREENSHOT — the single most important image.
  Use your best-looking graph view. Wide, not tall.
  Save it as screenshots/graph-view.png
-->
![Jarvis graph view](screenshots/graph-view.png)

〔Two or three sentences. Why does this exist? What problem were you solving for yourself? People decide whether to keep reading here — write like you're telling a friend, not writing a spec.〕

- 🧠 〔feature — e.g. every note is a node you can see and navigate〕
- 🔗 〔feature — e.g. eight kinds of connection, not just "related"〕
- 🤖 〔feature — e.g. Claude can read and write your notes directly〕
- 🔒 Local-first. No accounts, no cloud, no telemetry.

---

## Install

**Requires an Apple Silicon Mac (M1 or later).**

1. Download the latest `.dmg` → **[Releases](https://github.com/CartHadash/jarvis/releases/latest)**
2. Open the `.dmg` and drag **Jarvis** into your Applications folder.
3. **First launch only:** right-click Jarvis → **Open** → **Open**.

> macOS will say the app is from an unidentified developer. That's expected — the app isn't code-signed. Right-click → Open is how you get past it the first time; after that it opens normally.

Your notes live at `~/Library/Application Support/app.jarvis/jarvis.db` and never leave your machine.

---

## Screenshots

<!--
  Add 2-4 more. Capture a window with ⌘⇧4 then Space, then click the window.
  Name files without spaces. Drop them in the screenshots/ folder.
-->

### 〔The editor〕
![Node editor](screenshots/node-editor.png)

〔One line on what the reader is looking at.〕

### 〔The command palette〕
![Command palette](screenshots/command-palette.png)

〔One line. Mention ⌘K, /lint, /ingest — they're genuinely interesting.〕

---

## Using it with Claude

〔A sentence on why this is the good bit — Claude reads and writes your graph directly, so your notes become context it actually has.〕

Add this to Claude Desktop's config at
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jarvis": {
      "command": "node",
      "args": ["/absolute/path/to/jarvis/mcp-server/index.js"]
    }
  }
}
```

Restart Claude Desktop. A 🛠 icon by the chat input means it worked.

Twelve tools are exposed — reading the index, full-text search, creating notes, linking them, and daily session logs.

---

## Build from source

Requires Node 20+, Rust 1.77+, and Xcode command line tools.

```sh
git clone https://github.com/CartHadash/jarvis.git
cd jarvis
npm install
cd mcp-server && npm install && cd ..

npm run tauri:dev      # run in development
npm run tauri:build    # build a .dmg into src-tauri/target/release/bundle/
```

---

## Built with

| Layer | Tech |
| --- | --- |
| Interface | React 18 · TypeScript · D3 · Tailwind · TipTap |
| Shell | Tauri v2 (Rust) |
| Storage | SQLite (WAL) with FTS5 full-text search |
| AI bridge | Node.js MCP server |

---

## License

〔Pick one, or delete this section. MIT is the usual choice for a personal project you're happy for people to reuse — github.com/CartHadash/jarvis → Add file → Create new file → type `LICENSE` and GitHub offers you a template picker.〕
