use serde::{Deserialize, Serialize};

/// Node — the atomic unit of Jarvis. Mirrors `src/types/index.ts` on the
/// frontend; any change here must be reflected there too.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    /// IDs of nodes connected to this one. Derived from `edges`.
    pub connections: Vec<String>,
    /// Free-form per-node JSON. `timeframe`, future fields.
    pub metadata: serde_json::Value,
    // ── v2 structured fields ──
    pub node_type: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_due: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub created_at: String,
    /// 'user' | 'claude'
    pub created_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLogEntry {
    pub id: String,
    pub timestamp: String,
    pub content: String,
    /// 'session_start' | 'entry_added' | 'connection_made' | 'session_end' | 'note'
    #[serde(rename = "type")]
    pub type_: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyLog {
    pub date: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_count: Option<i64>,
}

/// Lightweight projection used by the index file the MCP reads on
/// startup. Same shape as `jarvis_index.json`.
#[derive(Debug, Serialize)]
pub struct IndexNode {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub connections: Vec<String>,
    pub node_type: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct IndexFile {
    pub last_updated: String,
    pub nodes: Vec<IndexNode>,
}

/// One revision of a node, captured by the BEFORE-UPDATE trigger.
/// `version` increments per node starting at 1. `edited_at` is the
/// `updated_at` value the row had when this snapshot was taken — i.e.
/// the moment that revision *stopped being current*.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRevision {
    pub version: i64,
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub edited_at: String,
}
