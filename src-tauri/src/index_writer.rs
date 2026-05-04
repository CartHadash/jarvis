use crate::db::Db;
use crate::error::AppResult;
use crate::models::{IndexFile, IndexNode};
use chrono::Utc;
use std::path::PathBuf;

/// Writes `<data_dir>/jarvis_index.json` — the lightweight projection
/// that the MCP server reads to give Claude a cheap context snapshot
/// without loading every node's full content.
///
/// Synchronous + small (most users will have <1k nodes for years), so a
/// debounce isn't strictly necessary; we just call `write` after every
/// mutating command.
pub fn write_index(db: &Db) -> AppResult<PathBuf> {
    let nodes = db.list_nodes()?;
    let index_nodes: Vec<IndexNode> = nodes
        .into_iter()
        .map(|n| IndexNode {
            id: n.id,
            title: n.title,
            tags: n.tags,
            connections: n.connections,
            node_type: n.node_type,
            status: n.status,
            summary: n.summary,
        })
        .collect();
    let file = IndexFile {
        last_updated: Utc::now().to_rfc3339(),
        nodes: index_nodes,
    };
    let path = db.data_dir.join("jarvis_index.json");
    let json = serde_json::to_string_pretty(&file)?;
    std::fs::write(&path, json)?;
    Ok(path)
}
