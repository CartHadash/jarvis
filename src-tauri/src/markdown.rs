//! Markdown export — single-node and full-vault.
//!
//! Pure functions that take data structs and produce Obsidian-compatible
//! markdown files with YAML frontmatter and [[wikilinks]].

use crate::error::AppResult;
use crate::models::{Edge, Node, Tag};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ─── Public API ──────────────────────────────────────────────────────────

/// Generate markdown for a single node, including frontmatter and connections.
pub fn node_to_markdown(node: &Node, edges: &[Edge], all_nodes: &[Node]) -> String {
    let title_map: HashMap<&str, &str> = all_nodes
        .iter()
        .map(|n| (n.id.as_str(), n.title.as_str()))
        .collect();

    let mut out = String::new();

    // ── YAML frontmatter ─────────────────────────────────────────────
    out.push_str("---\n");
    out.push_str(&format!("title: \"{}\"\n", yaml_escape(&node.title)));
    out.push_str(&format!("type: {}\n", node.node_type));
    out.push_str(&format!("status: {}\n", node.status));
    out.push_str(&format!(
        "tags: [{}]\n",
        node.tags
            .iter()
            .map(|t| format!("\"{}\"", yaml_escape(t)))
            .collect::<Vec<_>>()
            .join(", ")
    ));
    if let Some(ref c) = node.confidence {
        out.push_str(&format!("confidence: {c}\n"));
    }
    if let Some(ref ca) = node.captured_at {
        out.push_str(&format!("captured_at: {ca}\n"));
    }
    if let Some(ref url) = node.source_url {
        if !url.is_empty() {
            out.push_str(&format!("source_url: \"{}\"\n", yaml_escape(url)));
        }
    }
    out.push_str("---\n\n");

    // ── Content ──────────────────────────────────────────────────────
    let content = node.content.trim();
    if !content.is_empty() {
        out.push_str(content);
        out.push_str("\n\n");
    }

    // ── Connections ──────────────────────────────────────────────────
    let connections = node_connections(&node.id, edges, &title_map);
    if !connections.is_empty() {
        out.push_str("## Connections\n");
        for (other_title, label) in &connections {
            out.push_str(&format!("- [[{}]] — {}\n", other_title, label));
        }
    }

    out
}

/// Export the full vault to a timestamped directory.
/// Returns the path to the created vault folder.
pub fn export_vault(
    data_dir: &Path,
    nodes: &[Node],
    edges: &[Edge],
    tags: &[Tag],
) -> AppResult<PathBuf> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S");
    let vault_dir = data_dir.join("exports").join(format!("vault-{timestamp}"));
    std::fs::create_dir_all(&vault_dir)?;

    // Write one .md per node.
    for node in nodes {
        let md = node_to_markdown(node, edges, nodes);
        let filename = format!("{}.md", slugify(&node.title));
        std::fs::write(vault_dir.join(&filename), md)?;
    }

    // _jarvis-meta.json
    let edge_labels = [
        "supports",
        "contradicts",
        "example_of",
        "prerequisite_for",
        "part_of",
        "related_to",
        "inspired_by",
        "replaces",
    ];
    let meta = serde_json::json!({
        "schema_version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "edge_labels": edge_labels,
        "tags": tags.iter().map(|t| serde_json::json!({
            "name": t.name,
            "color": t.color,
        })).collect::<Vec<_>>(),
    });
    std::fs::write(
        vault_dir.join("_jarvis-meta.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    // _index.md — grouped by node_type
    let index = build_index(nodes);
    std::fs::write(vault_dir.join("_index.md"), index)?;

    Ok(vault_dir)
}

/// Export a single node to `<data_dir>/exports/<slug>.md`.
/// Returns the file path.
pub fn export_single_node(
    data_dir: &Path,
    node: &Node,
    edges: &[Edge],
    all_nodes: &[Node],
) -> AppResult<PathBuf> {
    let exports_dir = data_dir.join("exports");
    std::fs::create_dir_all(&exports_dir)?;

    let md = node_to_markdown(node, edges, all_nodes);
    let filename = format!("{}.md", slugify(&node.title));
    let path = exports_dir.join(&filename);
    std::fs::write(&path, md)?;

    Ok(path)
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/// Slugify a title for use as a filename.
fn slugify(title: &str) -> String {
    let s: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    // Collapse consecutive dashes and trim.
    let mut result = String::new();
    let mut prev_dash = false;
    for c in s.chars() {
        if c == '-' {
            if !prev_dash && !result.is_empty() {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    result.trim_end_matches('-').to_string()
}

/// Escape a string for YAML double-quoted scalar.
fn yaml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Get all connections for a node as (other_title, label) pairs.
fn node_connections<'a>(
    node_id: &str,
    edges: &[Edge],
    title_map: &HashMap<&str, &'a str>,
) -> Vec<(String, String)> {
    let mut result = Vec::new();
    for edge in edges {
        let (other_id, label) = if edge.source == node_id {
            (edge.target.as_str(), edge.label.as_deref().unwrap_or("related_to"))
        } else if edge.target == node_id {
            (edge.source.as_str(), edge.label.as_deref().unwrap_or("related_to"))
        } else {
            continue;
        };
        let other_title = title_map
            .get(other_id)
            .copied()
            .unwrap_or("Unknown");
        result.push((other_title.to_string(), label.to_string()));
    }
    result
}

/// Build the `_index.md` file: nodes grouped by type with wikilinks.
fn build_index(nodes: &[Node]) -> String {
    let type_order = [
        "concept", "source", "goal", "decision", "question", "person", "event",
    ];
    let type_labels: HashMap<&str, &str> = [
        ("concept", "Concepts"),
        ("source", "Sources"),
        ("goal", "Goals"),
        ("decision", "Decisions"),
        ("question", "Questions"),
        ("person", "People"),
        ("event", "Events"),
    ]
    .into();

    let mut groups: HashMap<&str, Vec<&Node>> = HashMap::new();
    for node in nodes {
        groups.entry(node.node_type.as_str()).or_default().push(node);
    }

    let mut out = String::from("# Jarvis Knowledge Graph\n\n");
    for ty in &type_order {
        if let Some(group) = groups.get(ty) {
            let label = type_labels.get(ty).unwrap_or(ty);
            out.push_str(&format!("## {label}\n\n"));
            let mut sorted: Vec<_> = group.iter().collect();
            sorted.sort_by_key(|n| &n.title);
            for node in sorted {
                out.push_str(&format!("- [[{}]]\n", node.title));
            }
            out.push('\n');
        }
    }
    out
}
