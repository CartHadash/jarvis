//! Tauri invoke commands. Thin wrappers over `Db` methods, with the
//! index writer triggered after every mutation.

use crate::claude;
use crate::config;
use crate::db::Db;
use crate::error::AppResult;
use crate::images::save_image_to_dir;
use crate::index_writer::write_index;
use crate::markdown;
use crate::models::{DailyLog, Edge, Node, SessionLogEntry, Tag};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub fn list_nodes(db: State<'_, Db>) -> AppResult<Vec<Node>> {
    db.list_nodes()
}

#[tauri::command]
pub fn get_node(db: State<'_, Db>, id: String) -> AppResult<Node> {
    db.get_node(&id)
}

#[tauri::command]
pub fn create_node(
    db: State<'_, Db>,
    id: Option<String>,
    title: String,
    content: Option<String>,
    tags: Vec<String>,
    metadata: Option<Value>,
    connections: Option<Vec<String>>,
    node_type: Option<String>,
    status: Option<String>,
    summary: Option<String>,
    source_url: Option<String>,
    confidence: Option<String>,
    review_due: Option<String>,
) -> AppResult<Node> {
    let node = db.create_node(
        id,
        &title,
        &content.unwrap_or_default(),
        &tags,
        metadata.unwrap_or_else(|| serde_json::json!({})),
        &connections.unwrap_or_default(),
        &node_type.unwrap_or_else(|| "concept".into()),
        &status.unwrap_or_else(|| "seedling".into()),
        summary.as_deref(),
        source_url.as_deref(),
        confidence.as_deref(),
        review_due.as_deref(),
    )?;
    let _ = write_index(&db);
    Ok(node)
}

#[tauri::command]
pub fn update_node(
    db: State<'_, Db>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    metadata: Option<Value>,
    node_type: Option<String>,
    status: Option<String>,
    summary: Option<Option<String>>,
    source_url: Option<Option<String>>,
    confidence: Option<Option<String>>,
    review_due: Option<Option<String>>,
) -> AppResult<Node> {
    let node = db.update_node(&id, title, content, tags, metadata,
                              node_type, status, summary, source_url, confidence, review_due)?;
    let _ = write_index(&db);
    Ok(node)
}

#[tauri::command]
pub fn delete_node(db: State<'_, Db>, id: String) -> AppResult<()> {
    db.delete_node(&id)?;
    let _ = write_index(&db);
    Ok(())
}

#[tauri::command]
pub fn list_edges(db: State<'_, Db>) -> AppResult<Vec<Edge>> {
    db.list_edges()
}

#[tauri::command]
pub fn add_edge(
    db: State<'_, Db>,
    source: String,
    target: String,
    label: Option<String>,
    created_by: Option<String>,
) -> AppResult<Edge> {
    let edge = db.add_edge(&source, &target, label, &created_by.unwrap_or_else(|| "user".into()))?;
    let _ = write_index(&db);
    Ok(edge)
}

#[tauri::command]
pub fn remove_edge(db: State<'_, Db>, source: String, target: String) -> AppResult<()> {
    db.remove_edge(&source, &target)?;
    let _ = write_index(&db);
    Ok(())
}

#[tauri::command]
pub fn list_tags(db: State<'_, Db>) -> AppResult<Vec<Tag>> {
    db.list_tags()
}

#[tauri::command]
pub fn upsert_tag(
    db: State<'_, Db>,
    name: String,
    color: String,
) -> AppResult<Tag> {
    db.upsert_tag(&name, &color)
}

#[tauri::command]
pub fn search_nodes(
    db: State<'_, Db>,
    query: String,
    limit: Option<usize>,
) -> AppResult<Vec<Node>> {
    db.search_nodes(&query, limit.unwrap_or(50))
}

#[tauri::command]
pub fn list_session_log(
    db: State<'_, Db>,
    limit: Option<usize>,
) -> AppResult<Vec<SessionLogEntry>> {
    db.list_session_log(limit.unwrap_or(10))
}

#[tauri::command]
pub fn append_session_log(
    db: State<'_, Db>,
    content: String,
    type_: String,
) -> AppResult<SessionLogEntry> {
    db.append_session_log(&content, &type_)
}

#[tauri::command]
pub fn save_image(
    db: State<'_, Db>,
    bytes: Vec<u8>,
    ext: Option<String>,
) -> AppResult<String> {
    let path = save_image_to_dir(&db.data_dir, &bytes, ext.as_deref())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn data_dir(db: State<'_, Db>) -> String {
    db.data_dir.to_string_lossy().into_owned()
}

/// Return the modification time (ms since UNIX epoch) of `jarvis_index.json`.
/// Used by the UI to detect mutations from the MCP server without polling
/// the full DB. Returns 0 if the file doesn't exist yet.
#[tauri::command]
pub fn index_mtime(db: State<'_, Db>) -> u64 {
    let path = db.data_dir.join("jarvis_index.json");
    std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ─── Config ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_config(db: State<'_, Db>) -> AppResult<config::Config> {
    config::read_config(&db.data_dir)
}

#[tauri::command]
pub fn set_config(
    db: State<'_, Db>,
    claude_api_key: Option<String>,
    auto_log: Option<bool>,
) -> AppResult<config::Config> {
    let mut cfg = config::read_config(&db.data_dir)?;
    if let Some(key) = claude_api_key {
        cfg.claude_api_key = if key.is_empty() { None } else { Some(key) };
    }
    if let Some(v) = auto_log {
        cfg.auto_log = Some(v);
    }
    config::write_config(&db.data_dir, &cfg)?;
    Ok(cfg)
}

// ─── Claude API ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn call_claude_api(
    db: State<'_, Db>,
    system: String,
    user_message: String,
) -> AppResult<String> {
    let cfg = config::read_config(&db.data_dir)?;
    let key = cfg.claude_api_key.unwrap_or_default();
    claude::call_claude(&key, &system, &user_message).await
}

#[tauri::command]
pub async fn fetch_url(url: String) -> AppResult<String> {
    claude::fetch_url(&url).await
}

// ─── Daily logs ────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_daily_logs(db: State<'_, Db>, days: Option<i64>) -> AppResult<Vec<DailyLog>> {
    db.list_daily_logs(days.unwrap_or(7))
}

#[tauri::command]
pub fn append_daily_log(
    db: State<'_, Db>,
    summary: String,
    model: Option<String>,
    token_count: Option<i64>,
) -> AppResult<DailyLog> {
    db.append_daily_log(&summary, model.as_deref(), token_count)
}

// ─── Markdown export ──────────────────────────────────────────────────

#[tauri::command]
pub fn export_vault_cmd(db: State<'_, Db>) -> AppResult<String> {
    let nodes = db.list_nodes()?;
    let edges = db.list_edges()?;
    let tags = db.list_tags()?;
    let path = markdown::export_vault(&db.data_dir, &nodes, &edges, &tags)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn export_node_markdown(db: State<'_, Db>, id: String) -> AppResult<String> {
    let node = db.get_node(&id)?;
    let all_nodes = db.list_nodes()?;
    let edges = db.list_edges()?;
    let path = markdown::export_single_node(&db.data_dir, &node, &edges, &all_nodes)?;
    Ok(path.to_string_lossy().into_owned())
}
