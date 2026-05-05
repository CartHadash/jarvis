use crate::error::{AppError, AppResult};
use crate::models::{DailyLog, Edge, Node, NodeRevision, SessionLogEntry, Tag};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Row};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MIGRATION_V1: &str = include_str!("../migrations/0001_init.sql");
const MIGRATION_V3: &str = include_str!("../migrations/0003_v2_schema.sql");
const MIGRATION_V4: &str = include_str!("../migrations/0004_daily_logs.sql");
const MIGRATION_V5: &str = include_str!("../migrations/0005_node_history.sql");

pub struct Db {
    pub conn: Mutex<Connection>,
    pub data_dir: PathBuf,
}

impl Db {
    pub fn open(data_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("jarvis.db");
        let conn = Connection::open_with_flags(
            &db_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
        )?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        // Run migrations. V1 is the idempotent fresh-install schema.
        // V2 migrates old category→tags. We handle V2 in Rust because
        // the SQL file can't cope with partial states (e.g. a prior
        // failed launch already created `tags` from V1 while `categories`
        // still exists).
        if needs_v2_migration(&conn)? {
            apply_v2_migration(&conn)?;
        }
        conn.execute_batch(MIGRATION_V1)?;

        // v3: add structured node fields (node_type, status, summary, etc.)
        if needs_v3_migration(&conn)? {
            conn.execute_batch(MIGRATION_V3)?;
            apply_v3_data_migration(&conn)?;
        }

        // v4: daily_logs table for session continuity
        conn.execute_batch(MIGRATION_V4)?;

        // v5: per-node revision history (trigger-driven snapshots)
        conn.execute_batch(MIGRATION_V5)?;

        let db = Self {
            conn: Mutex::new(conn),
            data_dir: data_dir.to_path_buf(),
        };

        db.maybe_seed()?;
        Ok(db)
    }

    fn maybe_seed(&self) -> AppResult<()> {
        let count: i64 = self
            .conn
            .lock()
            .query_row("SELECT count(*) FROM nodes", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock();

        // ── Tags with seed colours (namespaced for v2) ──────────────
        let seed_tags: &[(&str, &str)] = &[
            ("domain/ideas", "#3b82f6"),
            ("area/goals", "#f59e0b"),
            ("domain/quotes", "#8b5cf6"),
            ("area/research", "#14b8a6"),
            ("domain/books", "#ec4899"),
            ("domain/finance", "#22c55e"),
            ("domain/math", "#f97316"),
            ("area/universities", "#6366f1"),
            ("domain/general", "#6b7280"),
        ];
        for (name, color) in seed_tags {
            conn.execute(
                "INSERT OR IGNORE INTO tags(name, color, created_at) VALUES (?1, ?2, ?3)",
                params![name, color, now],
            )?;
        }

        // ── Nodes (v2: with node_type, status, summary) ────────────
        // (id, title, tags, content, metadata, node_type, status, summary)
        let seed_nodes: &[(&str, &str, &[&str], &str, serde_json::Value, &str, &str, &str)] = &[
            (
                "n_complex_mult",
                "Complex number multiplication: magnitudes multiply, angles add",
                &["domain/math"],
                "> When multiplying complex numbers, magnitudes multiply and angles add.\n\nWhen you multiply two complex numbers, their magnitudes multiply and their angles add. If z₁ has magnitude r₁ and angle θ₁, and z₂ has magnitude r₂ and angle θ₂, then z₁ × z₂ has magnitude r₁·r₂ and angle θ₁+θ₂. This is why multiplying by i (magnitude 1, angle 90°) rotates any number by 90°.",
                serde_json::json!({}),
                "concept", "evergreen",
                "When multiplying complex numbers, magnitudes multiply and angles add.",
            ),
            (
                "n_thiel",
                "Thiel's core argument: monopoly vs competition",
                &["domain/books"],
                "> Monopoly is the goal of every successful business; competition is for losers.\n\nThiel's central claim is that capitalism and competition are opposites. In a perfectly competitive market, profits disappear entirely. A monopoly owns its market so completely it can ignore competitors — freeing it to think long-term and build breakthrough things. His advice: start with a tiny market you can dominate completely, become the last great mover in that niche, then expand outward. Amazon started with books. Google started with search. The niche is a launchpad, not the destination. Honest caveat: competition has driven enormous innovation historically. The real takeaway is the direction — differentiation and unique value matter more than market share in a crowded race.",
                serde_json::json!({}),
                "concept", "evergreen",
                "Monopoly is the goal of every successful business; competition is for losers.",
            ),
            (
                "n_karpathy_wiki",
                "Karpathy's LLM wiki pattern",
                &["domain/ideas"],
                "> An LLM incrementally builds and maintains a persistent, interlinked wiki rather than re-deriving knowledge on every query.\n\nInstead of retrieving from raw documents at query time, an LLM incrementally builds and maintains a persistent wiki — a structured, interlinked collection of entries that sits between you and raw sources. When you add new material, the LLM doesn't just index it. It reads it, extracts key information, and integrates it into the existing knowledge base — updating related entries, flagging contradictions, strengthening connections. The knowledge is compiled once and kept current, not re-derived on every query. The LLM is the programmer, the wiki is the codebase, you are the director.",
                serde_json::json!({}),
                "concept", "evergreen",
                "An LLM incrementally builds and maintains a persistent, interlinked wiki rather than re-deriving knowledge on every query.",
            ),
            (
                "n_compounding",
                "Compounding knowledge principle",
                &["domain/ideas"],
                "> Knowledge compounds when each new piece is integrated into an existing structure rather than stored in isolation.\n\nThe value of a second brain is proportional to how well-maintained it is, not how much is in it. A sparse but well-connected graph is more useful than a huge pile of unlinked notes. Connections between ideas are more valuable than the ideas themselves in isolation.",
                serde_json::json!({}),
                "concept", "evergreen",
                "Knowledge compounds when each new piece is integrated into an existing structure rather than stored in isolation.",
            ),
            (
                "n_build_jarvis",
                "Build Jarvis",
                &["area/goals"],
                "> Build a personal second brain desktop app with a navigable mind map, Claude MCP integration, and automatic cross-referencing.\n\nBuild a personal second brain desktop app (Jarvis) — a local macOS app with a navigable mind map, Claude MCP integration, and automatic cross-referencing. Phase 1: core graph, MCP, seed data. Phase 2: session hooks, hybrid search, daily reflection audit.",
                serde_json::json!({"timeframe": "short"}),
                "goal", "growing",
                "Build a personal second brain desktop app with a navigable mind map, Claude MCP integration, and automatic cross-referencing.",
            ),
            (
                "n_erasmus",
                "Erasmus University Rotterdam — IBEB",
                &["area/universities"],
                "> Notes from visiting Erasmus University Rotterdam IBEB.\n\nInternational Bachelor Economics and Business (IBEB). Attended open day. Strong quantitative reputation, Rotterdam is a major finance hub, good scholarship options for non-EEA. Part of top European target list alongside Bocconi, HSG, SSE Stockholm, Tilburg.",
                serde_json::json!({}),
                "source", "growing",
                "Notes from visiting Erasmus University Rotterdam IBEB.",
            ),
            (
                "n_tilburg",
                "Tilburg University — Economics",
                &["area/universities"],
                "> Notes from visiting Tilburg University Economics programme.\n\nAttended open day. Strong economics programme, smaller campus, good quantitative track. Part of secondary target list for European Economics and Finance.",
                serde_json::json!({}),
                "source", "growing",
                "Notes from visiting Tilburg University Economics programme.",
            ),
            (
                "n_target_uni",
                "Target top European Economics programme",
                &["area/goals"],
                "> Get into a top European Economics programme, with Bocconi as primary target.\n\nPrimary target: Bocconi. Strong secondaries: HSG St Gallen, SSE Stockholm. Further targets: Erasmus IBEB, Tilburg. Key differentiators in application: Math AA HL, Bocconi Summer School (Game Theory and Finance), AI/ML projects, independent software builds.",
                serde_json::json!({"timeframe": "long"}),
                "goal", "growing",
                "Get into a top European Economics programme, with Bocconi as primary target.",
            ),
        ];
        for (id, title, tags, content, metadata, node_type, status, summary) in seed_nodes {
            conn.execute(
                "INSERT INTO nodes(id, title, content, created_at, updated_at, metadata,
                                   node_type, status, summary, captured_at)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?4)",
                params![id, title, content, now, metadata.to_string(), node_type, status, summary],
            )?;
            for tag in *tags {
                conn.execute(
                    "INSERT OR IGNORE INTO node_tags(node_id, tag) VALUES (?1, ?2)",
                    params![id, tag],
                )?;
            }
        }

        // ── Edges ───────────────────────────────────────────────────
        let seed_edges: &[(&str, &str, &str)] = &[
            ("n_karpathy_wiki", "n_compounding", "example_of"),
            ("n_karpathy_wiki", "n_build_jarvis", "inspired_by"),
            ("n_thiel", "n_compounding", "related_to"),
            ("n_erasmus", "n_target_uni", "part_of"),
            ("n_tilburg", "n_target_uni", "part_of"),
        ];
        for (src, tgt, label) in seed_edges {
            conn.execute(
                "INSERT INTO edges(id, source, target, label, created_at, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'user')",
                params![Uuid::new_v4().to_string(), src, tgt, *label, now],
            )?;
        }
        Ok(())
    }

    // ─── Node operations ────────────────────────────────────────────

    pub fn list_nodes(&self) -> AppResult<Vec<Node>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, content, created_at, updated_at, metadata,
                    node_type, status, summary, source_url, confidence, review_due, captured_at
             FROM nodes",
        )?;
        let mut nodes: Vec<Node> = stmt
            .query_map([], row_to_node)?
            .collect::<Result<_, _>>()?;
        drop(stmt);
        hydrate_tags(&conn, &mut nodes)?;
        let edges = list_edges_inner(&conn)?;
        Ok(attach_connections(nodes, &edges))
    }

    pub fn get_node(&self, id: &str) -> AppResult<Node> {
        let conn = self.conn.lock();
        let mut node = conn
            .query_row(
                "SELECT id, title, content, created_at, updated_at, metadata,
                        node_type, status, summary, source_url, confidence, review_due, captured_at
                 FROM nodes WHERE id = ?1",
                params![id],
                row_to_node,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
        hydrate_tags(&conn, std::slice::from_mut(&mut node))?;
        let edges = list_edges_inner(&conn)?;
        Ok(attach_connections(vec![node], &edges).pop().unwrap())
    }

    pub fn create_node(
        &self,
        id: Option<String>,
        title: &str,
        content: &str,
        tags: &[String],
        metadata: serde_json::Value,
        connections: &[String],
        node_type: &str,
        status: &str,
        summary: Option<&str>,
        source_url: Option<&str>,
        confidence: Option<&str>,
        review_due: Option<&str>,
    ) -> AppResult<Node> {
        let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO nodes(id, title, content, created_at, updated_at, metadata,
                                   node_type, status, summary, source_url, confidence, review_due, captured_at)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?4)",
                params![id, title, content, now, metadata.to_string(),
                        node_type, status, summary, source_url, confidence, review_due],
            )?;
            for tag in tags {
                ensure_tag_exists(&conn, tag)?;
                conn.execute(
                    "INSERT OR IGNORE INTO node_tags(node_id, tag) VALUES (?1, ?2)",
                    params![id, tag],
                )?;
            }
            for target in connections {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO edges(id, source, target, created_at, created_by)
                     VALUES (?1, ?2, ?3, ?4, 'user')",
                    params![Uuid::new_v4().to_string(), id, target, now],
                );
            }
        }
        self.get_node(&id)
    }

    pub fn update_node(
        &self,
        id: &str,
        title: Option<String>,
        content: Option<String>,
        tags: Option<Vec<String>>,
        metadata: Option<serde_json::Value>,
        node_type: Option<String>,
        status: Option<String>,
        summary: Option<Option<String>>,
        source_url: Option<Option<String>>,
        confidence: Option<Option<String>>,
        review_due: Option<Option<String>>,
    ) -> AppResult<Node> {
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock();
            let mut sets: Vec<&str> = Vec::new();
            let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            if let Some(t) = &title { sets.push("title = ?"); vals.push(Box::new(t.clone())); }
            if let Some(c) = &content { sets.push("content = ?"); vals.push(Box::new(c.clone())); }
            if let Some(m) = &metadata {
                sets.push("metadata = ?");
                vals.push(Box::new(m.to_string()));
            }
            if let Some(t) = &node_type { sets.push("node_type = ?"); vals.push(Box::new(t.clone())); }
            if let Some(s) = &status { sets.push("status = ?"); vals.push(Box::new(s.clone())); }
            if let Some(s) = &summary { sets.push("summary = ?"); vals.push(Box::new(s.clone())); }
            if let Some(u) = &source_url { sets.push("source_url = ?"); vals.push(Box::new(u.clone())); }
            if let Some(c) = &confidence { sets.push("confidence = ?"); vals.push(Box::new(c.clone())); }
            if let Some(r) = &review_due { sets.push("review_due = ?"); vals.push(Box::new(r.clone())); }
            sets.push("updated_at = ?");
            vals.push(Box::new(now));
            vals.push(Box::new(id.to_string()));
            let sql = format!("UPDATE nodes SET {} WHERE id = ?", sets.join(", "));
            let params_iter: Vec<&dyn rusqlite::ToSql> =
                vals.iter().map(|b| b.as_ref()).collect();
            let n = conn.execute(&sql, rusqlite::params_from_iter(params_iter))?;
            if n == 0 {
                return Err(AppError::NotFound(format!("node {id}")));
            }
            // Replace tags if provided
            if let Some(new_tags) = &tags {
                conn.execute("DELETE FROM node_tags WHERE node_id = ?1", params![id])?;
                for tag in new_tags {
                    ensure_tag_exists(&conn, tag)?;
                    conn.execute(
                        "INSERT OR IGNORE INTO node_tags(node_id, tag) VALUES (?1, ?2)",
                        params![id, tag],
                    )?;
                }
            }
        }
        self.get_node(id)
    }

    pub fn delete_node(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        let n = conn.execute("DELETE FROM nodes WHERE id = ?1", params![id])?;
        if n == 0 {
            return Err(AppError::NotFound(format!("node {id}")));
        }
        Ok(())
    }

    // ─── Edge operations ────────────────────────────────────────────

    pub fn list_edges(&self) -> AppResult<Vec<Edge>> {
        let conn = self.conn.lock();
        list_edges_inner(&conn)
    }

    pub fn add_edge(
        &self,
        source: &str,
        target: &str,
        label: Option<String>,
        created_by: &str,
    ) -> AppResult<Edge> {
        if source == target {
            return Err(AppError::Invalid("cannot connect a node to itself".into()));
        }
        if !matches!(created_by, "user" | "claude") {
            return Err(AppError::Invalid(format!("invalid created_by: {created_by}")));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO edges(id, source, target, label, created_at, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(source, target) DO UPDATE SET
                   label = excluded.label,
                   created_by = excluded.created_by",
                params![id, source, target, label, now, created_by],
            )?;
        }
        let conn = self.conn.lock();
        let row = conn.query_row(
            "SELECT id, source, target, label, created_at, created_by
             FROM edges WHERE source = ?1 AND target = ?2",
            params![source, target],
            row_to_edge,
        )?;
        Ok(row)
    }

    pub fn remove_edge(&self, source: &str, target: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        let n = conn.execute(
            "DELETE FROM edges WHERE source = ?1 AND target = ?2",
            params![source, target],
        )?;
        if n == 0 {
            return Err(AppError::NotFound(format!("edge {source} -> {target}")));
        }
        Ok(())
    }

    // ─── Tags ───────────────────────────────────────────────────────

    pub fn list_tags(&self) -> AppResult<Vec<Tag>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT name, color, created_at FROM tags ORDER BY created_at ASC",
        )?;
        let tags: Vec<Tag> = stmt
            .query_map([], |r| {
                Ok(Tag {
                    name: r.get(0)?,
                    color: r.get(1)?,
                    created_at: r.get(2)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(tags)
    }

    pub fn upsert_tag(&self, name: &str, color: &str) -> AppResult<Tag> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO tags(name, color, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET color = excluded.color",
            params![name, color, now],
        )?;
        let row = conn.query_row(
            "SELECT name, color, created_at FROM tags WHERE name = ?1",
            params![name],
            |r| {
                Ok(Tag {
                    name: r.get(0)?,
                    color: r.get(1)?,
                    created_at: r.get(2)?,
                })
            },
        )?;
        Ok(row)
    }

    // ─── Search ─────────────────────────────────────────────────────

    pub fn search_nodes(&self, query: &str, limit: usize) -> AppResult<Vec<Node>> {
        let conn = self.conn.lock();
        let q = sanitize_fts_query(query);
        if q.is_empty() {
            return Ok(vec![]);
        }
        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.content, n.created_at, n.updated_at, n.metadata,
                    n.node_type, n.status, n.summary, n.source_url, n.confidence, n.review_due, n.captured_at
             FROM nodes_fts f
             JOIN nodes n ON n.rowid = f.rowid
             WHERE nodes_fts MATCH ?1
             ORDER BY bm25(nodes_fts)
             LIMIT ?2",
        )?;
        let mut nodes: Vec<Node> = stmt
            .query_map(params![q, limit as i64], row_to_node)?
            .collect::<Result<_, _>>()?;
        drop(stmt);
        hydrate_tags(&conn, &mut nodes)?;
        let edges = list_edges_inner(&conn)?;
        Ok(attach_connections(nodes, &edges))
    }

    // ─── Session log ────────────────────────────────────────────────

    pub fn list_session_log(&self, limit: usize) -> AppResult<Vec<SessionLogEntry>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, content, type FROM session_log
             ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows: Vec<SessionLogEntry> = stmt
            .query_map(params![limit as i64], |r| {
                Ok(SessionLogEntry {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    content: r.get(2)?,
                    type_: r.get(3)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    }

    // ─── Daily logs ─────────────────────────────────────────────────

    pub fn list_daily_logs(&self, days: i64) -> AppResult<Vec<DailyLog>> {
        let conn = self.conn.lock();
        let cutoff = (Utc::now() - chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string();
        let mut stmt = conn.prepare(
            "SELECT date, summary, model, token_count FROM daily_logs
             WHERE date >= ?1 ORDER BY date DESC",
        )?;
        let rows: Vec<DailyLog> = stmt
            .query_map(params![cutoff], |r| {
                Ok(DailyLog {
                    date: r.get(0)?,
                    summary: r.get(1)?,
                    model: r.get(2)?,
                    token_count: r.get(3)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    }

    pub fn append_daily_log(
        &self,
        summary: &str,
        model: Option<&str>,
        token_count: Option<i64>,
    ) -> AppResult<DailyLog> {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let conn = self.conn.lock();

        // Check if a row already exists for today — if so, append.
        let existing: Option<String> = conn
            .query_row(
                "SELECT summary FROM daily_logs WHERE date = ?1",
                params![today],
                |r| r.get(0),
            )
            .optional()?;

        let final_summary = match existing {
            Some(prev) => format!("{prev}\n\n{summary}"),
            None => summary.to_string(),
        };

        conn.execute(
            "INSERT INTO daily_logs(date, summary, model, token_count)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(date) DO UPDATE SET
               summary = ?2,
               model = COALESCE(?3, daily_logs.model),
               token_count = COALESCE(?4, daily_logs.token_count)",
            params![today, final_summary, model, token_count],
        )?;

        Ok(DailyLog {
            date: today,
            summary: final_summary,
            model: model.map(|s| s.to_string()),
            token_count,
        })
    }

    /// Return the revision history for a node, newest first.
    /// Each row represents a *previous* version that has been replaced.
    pub fn list_node_history(&self, node_id: &str) -> AppResult<Vec<NodeRevision>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT version, title, content, summary, edited_at
               FROM node_history
              WHERE node_id = ?1
              ORDER BY version DESC",
        )?;
        let rows = stmt.query_map(params![node_id], |r| {
            Ok(NodeRevision {
                version: r.get(0)?,
                title: r.get(1)?,
                content: r.get(2)?,
                summary: r.get::<_, Option<String>>(3)?,
                edited_at: r.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn append_session_log(&self, content: &str, type_: &str) -> AppResult<SessionLogEntry> {
        const VALID: &[&str] = &[
            "session_start",
            "entry_added",
            "connection_made",
            "session_end",
            "note",
        ];
        if !VALID.contains(&type_) {
            return Err(AppError::Invalid(format!(
                "session_log.type must be one of {VALID:?}"
            )));
        }
        let id = Uuid::new_v4().to_string();
        let ts = Utc::now().to_rfc3339();
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO session_log(id, timestamp, content, type) VALUES (?1, ?2, ?3, ?4)",
            params![id, ts, content, type_],
        )?;
        Ok(SessionLogEntry {
            id,
            timestamp: ts,
            content: content.to_string(),
            type_: type_.to_string(),
        })
    }
}

// ─── Row helpers ────────────────────────────────────────────────────────

fn row_to_node(r: &Row) -> rusqlite::Result<Node> {
    let metadata_str: String = r.get(5)?;
    let metadata: serde_json::Value = serde_json::from_str(&metadata_str)
        .unwrap_or_else(|_| serde_json::json!({}));
    Ok(Node {
        id: r.get(0)?,
        title: r.get(1)?,
        content: r.get(2)?,
        tags: vec![], // filled by hydrate_tags
        created_at: r.get(3)?,
        updated_at: r.get(4)?,
        connections: vec![], // filled by attach_connections
        metadata,
        node_type: r.get(6)?,
        status: r.get(7)?,
        summary: r.get(8)?,
        source_url: r.get(9)?,
        confidence: r.get(10)?,
        review_due: r.get(11)?,
        captured_at: r.get(12)?,
    })
}

fn row_to_edge(r: &Row) -> rusqlite::Result<Edge> {
    Ok(Edge {
        id: r.get(0)?,
        source: r.get(1)?,
        target: r.get(2)?,
        label: r.get(3)?,
        created_at: r.get(4)?,
        created_by: r.get(5)?,
    })
}

fn list_edges_inner(conn: &Connection) -> AppResult<Vec<Edge>> {
    let mut stmt = conn.prepare(
        "SELECT id, source, target, label, created_at, created_by FROM edges",
    )?;
    let edges: Vec<Edge> = stmt
        .query_map([], row_to_edge)?
        .collect::<Result<_, _>>()?;
    Ok(edges)
}

fn attach_connections(mut nodes: Vec<Node>, edges: &[Edge]) -> Vec<Node> {
    use std::collections::HashMap;
    let mut by_id: HashMap<&str, Vec<String>> = HashMap::new();
    for e in edges {
        by_id.entry(&e.source).or_default().push(e.target.clone());
        by_id.entry(&e.target).or_default().push(e.source.clone());
    }
    for n in nodes.iter_mut() {
        if let Some(c) = by_id.remove(n.id.as_str()) {
            n.connections = c;
        }
    }
    nodes
}

/// Hydrate the `tags` vec on each node by reading from `node_tags`.
fn hydrate_tags(conn: &Connection, nodes: &mut [Node]) -> AppResult<()> {
    if nodes.is_empty() {
        return Ok(());
    }
    use std::collections::HashMap;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    let mut stmt = conn.prepare("SELECT node_id, tag FROM node_tags")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (nid, tag) = row?;
        map.entry(nid).or_default().push(tag);
    }
    for n in nodes.iter_mut() {
        if let Some(tags) = map.remove(&n.id) {
            n.tags = tags;
        }
    }
    Ok(())
}

fn ensure_tag_exists(conn: &Connection, name: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO tags(name, color, created_at)
         VALUES (?1, '#6366f1', ?2)",
        params![name, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

/// Apply the category→tags migration, handling partial states from
/// prior failed launches (e.g. `tags` table already exists from V1
/// while `categories` still needs to be merged in).
fn apply_v2_migration(conn: &Connection) -> AppResult<()> {
    let has_tags_table = table_exists(conn, "tags")?;
    let has_categories_table = table_exists(conn, "categories")?;

    if has_categories_table && !has_tags_table {
        // Clean state: just rename.
        conn.execute_batch("ALTER TABLE categories RENAME TO tags;")?;
    } else if has_categories_table && has_tags_table {
        // Partial state: V1 already created an empty `tags` table but
        // `categories` still has data. Merge categories into tags, then
        // drop the old table.
        conn.execute_batch(
            "INSERT OR IGNORE INTO tags(name, color, created_at)
               SELECT name, color, created_at FROM categories;
             DROP TABLE categories;",
        )?;
    }
    // else: no categories table — tags already set up, nothing to do.

    // Ensure junction table exists.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS node_tags (
           node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
           tag     TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
           PRIMARY KEY (node_id, tag)
         );",
    )?;

    // Migrate existing node.category values into node_tags.
    conn.execute_batch(
        "INSERT OR IGNORE INTO node_tags (node_id, tag)
           SELECT id, category FROM nodes
           WHERE category IS NOT NULL AND category != '';",
    )?;

    // Drop old column and index.
    conn.execute_batch(
        "DROP INDEX IF EXISTS idx_nodes_category;
         ALTER TABLE nodes DROP COLUMN category;",
    )?;

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag);",
    )?;

    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
        params![name],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

/// Check whether the `nodes` table still has a `category` column,
/// which means the v2 migration hasn't been applied yet.
fn needs_v2_migration(conn: &Connection) -> AppResult<bool> {
    let mut stmt = conn.prepare("PRAGMA table_info(nodes)")?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<_, _>>()?;
    Ok(cols.contains(&"category".to_string()))
}

/// Check whether the v3 migration (node_type column) has been applied.
fn needs_v3_migration(conn: &Connection) -> AppResult<bool> {
    let mut stmt = conn.prepare("PRAGMA table_info(nodes)")?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<_, _>>()?;
    Ok(!cols.contains(&"node_type".to_string()))
}

/// Migrate existing node and edge data to v2 structured fields.
/// This sets node_type, status, summary per the build brief's mapping table,
/// prepends summary blockquotes to content, labels edges, and namespaces tags.
fn apply_v3_data_migration(conn: &Connection) -> AppResult<()> {
    // ── Node data migration ────────────────────────────────────────
    struct NodeMigration {
        id: &'static str,
        node_type: &'static str,
        status: &'static str,
        summary: &'static str,
    }

    let node_migrations = &[
        NodeMigration { id: "n_build_jarvis", node_type: "goal", status: "growing", summary: "Build a personal second brain desktop app with a navigable mind map, Claude MCP integration, and automatic cross-referencing." },
        NodeMigration { id: "n_target_uni", node_type: "goal", status: "growing", summary: "Get into a top European Economics programme, with Bocconi as primary target." },
        NodeMigration { id: "n_erasmus", node_type: "source", status: "growing", summary: "Notes from visiting Erasmus University Rotterdam IBEB." },
        NodeMigration { id: "n_tilburg", node_type: "source", status: "growing", summary: "Notes from visiting Tilburg University Economics programme." },
        NodeMigration { id: "n_karpathy_wiki", node_type: "concept", status: "evergreen", summary: "An LLM incrementally builds and maintains a persistent, interlinked wiki rather than re-deriving knowledge on every query." },
        NodeMigration { id: "n_compounding", node_type: "concept", status: "evergreen", summary: "Knowledge compounds when each new piece is integrated into an existing structure rather than stored in isolation." },
        NodeMigration { id: "n_thiel", node_type: "concept", status: "evergreen", summary: "Monopoly is the goal of every successful business; competition is for losers." },
        NodeMigration { id: "n_complex_mult", node_type: "concept", status: "evergreen", summary: "When multiplying complex numbers, magnitudes multiply and angles add." },
        // UUID nodes
        NodeMigration { id: "4ccfa98d-9d85-44c7-80a2-ec4103447017", node_type: "concept", status: "evergreen", summary: "The Sheffer (NAND) operator alone can express every elementary logical function." },
        NodeMigration { id: "970a4ff6-be66-4c05-bf89-31bfc1955797", node_type: "source", status: "growing", summary: "Jack Clark of Anthropic on AI's role in education, April 2026." },
        NodeMigration { id: "08101322-4f55-4518-8088-177736922c5b", node_type: "source", status: "growing", summary: "Fortune article on Gen Z workers actively sabotaging AI rollouts at work." },
        NodeMigration { id: "5ab8f3cd-0d82-4a0d-92dd-923443d8277b", node_type: "source", status: "seedling", summary: "Tweet on the Zeigarnik effect \u{2014} unfinished tasks occupy more mental bandwidth than completed ones." },
        NodeMigration { id: "a603281c-534d-4eca-82ea-968a8485dc2c", node_type: "source", status: "evergreen", summary: "Detailed review of Bocconi's BAI programme based on a 107-student survey." },
    ];

    for m in node_migrations {
        // Check if this node exists before trying to migrate it.
        let exists: bool = conn.query_row(
            "SELECT count(*) > 0 FROM nodes WHERE id = ?1",
            params![m.id],
            |r| r.get(0),
        )?;
        if !exists { continue; }

        // Update node_type, status, summary.
        conn.execute(
            "UPDATE nodes SET node_type = ?1, status = ?2, summary = ?3 WHERE id = ?4",
            params![m.node_type, m.status, m.summary, m.id],
        )?;

        // Prepend summary blockquote to content.
        let content: String = conn.query_row(
            "SELECT content FROM nodes WHERE id = ?1",
            params![m.id],
            |r| r.get(0),
        )?;
        let new_content = format!("> {}\n\n{}", m.summary, content);
        conn.execute(
            "UPDATE nodes SET content = ?1 WHERE id = ?2",
            params![new_content, m.id],
        )?;
    }

    // ── Edge label migration ───────────────────────────────────────
    struct EdgeMigration {
        source: &'static str,
        target: &'static str,
        label: &'static str,
    }

    let edge_migrations = &[
        EdgeMigration { source: "n_karpathy_wiki", target: "n_compounding", label: "example_of" },
        EdgeMigration { source: "n_karpathy_wiki", target: "n_build_jarvis", label: "inspired_by" },
        EdgeMigration { source: "n_erasmus", target: "n_target_uni", label: "part_of" },
        EdgeMigration { source: "n_tilburg", target: "n_target_uni", label: "part_of" },
        EdgeMigration { source: "a603281c-534d-4eca-82ea-968a8485dc2c", target: "n_target_uni", label: "supports" },
    ];

    for e in edge_migrations {
        conn.execute(
            "UPDATE edges SET label = ?1 WHERE source = ?2 AND target = ?3",
            params![e.label, e.source, e.target],
        )?;
    }

    // The Thiel → Compounding edge had a free-form label "both argue quality over quantity".
    // Convert to enum-compatible label.
    conn.execute(
        "UPDATE edges SET label = 'related_to' WHERE source = 'n_thiel' AND target = 'n_compounding'",
        [],
    )?;

    // ── Tag namespace migration ────────────────────────────────────
    struct TagRename {
        old: &'static str,
        new: &'static str,
    }

    let tag_renames = &[
        TagRename { old: "Goals", new: "area/goals" },
        TagRename { old: "Universities", new: "area/universities" },
        TagRename { old: "Research", new: "area/research" },
        TagRename { old: "Ideas", new: "domain/ideas" },
        TagRename { old: "Math", new: "domain/math" },
        TagRename { old: "Books", new: "domain/books" },
    ];

    for tr in tag_renames {
        // Check if old tag exists.
        let exists: bool = conn.query_row(
            "SELECT count(*) > 0 FROM tags WHERE name = ?1",
            params![tr.old],
            |r| r.get(0),
        )?;
        if !exists { continue; }

        // Get old tag's color.
        let color: String = conn.query_row(
            "SELECT color FROM tags WHERE name = ?1",
            params![tr.old],
            |r| r.get(0),
        )?;

        // Create new tag.
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO tags(name, color, created_at) VALUES (?1, ?2, ?3)",
            params![tr.new, color, now],
        )?;

        // Update node_tags references.
        conn.execute(
            "UPDATE node_tags SET tag = ?1 WHERE tag = ?2",
            params![tr.new, tr.old],
        )?;

        // Delete old tag.
        conn.execute("DELETE FROM tags WHERE name = ?1", params![tr.old])?;
    }

    // Drop "General" tag — replace with domain/general.
    let general_exists: bool = conn.query_row(
        "SELECT count(*) > 0 FROM tags WHERE name = 'General'",
        [],
        |r| r.get(0),
    )?;
    if general_exists {
        let color: String = conn.query_row(
            "SELECT color FROM tags WHERE name = 'General'",
            [],
            |r| r.get(0),
        )?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO tags(name, color, created_at) VALUES ('domain/general', ?1, ?2)",
            params![color, now],
        )?;
        conn.execute(
            "UPDATE node_tags SET tag = 'domain/general' WHERE tag = 'General'",
            [],
        )?;
        conn.execute("DELETE FROM tags WHERE name = 'General'", [])?;
    }

    // "Quotes" → domain/quotes, "Finance" → domain/finance (not in the brief mapping
    // but consistent with the namespace pattern).
    let extra_renames = &[
        ("Quotes", "domain/quotes"),
        ("Finance", "domain/finance"),
    ];
    for (old, new_name) in extra_renames {
        let exists: bool = conn.query_row(
            "SELECT count(*) > 0 FROM tags WHERE name = ?1",
            params![old],
            |r| r.get(0),
        )?;
        if !exists { continue; }
        let color: String = conn.query_row(
            "SELECT color FROM tags WHERE name = ?1",
            params![old],
            |r| r.get(0),
        )?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO tags(name, color, created_at) VALUES (?1, ?2, ?3)",
            params![new_name, color, now],
        )?;
        conn.execute(
            "UPDATE node_tags SET tag = ?1 WHERE tag = ?2",
            params![new_name, old],
        )?;
        conn.execute("DELETE FROM tags WHERE name = ?1", params![old])?;
    }

    Ok(())
}

fn sanitize_fts_query(q: &str) -> String {
    let cleaned: String = q
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        trimmed
            .split_whitespace()
            .map(|t| format!("{t}*"))
            .collect::<Vec<_>>()
            .join(" ")
    }
}
