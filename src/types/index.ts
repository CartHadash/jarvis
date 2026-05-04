/**
 * Core data model for Jarvis. These shapes are mirrored in the Rust
 * backend (src-tauri/src/*) and the MCP server (mcp-server/). Any change
 * here needs to be reflected in both.
 */

export type EdgeAuthor = 'user' | 'claude';
export type Timeframe = 'short' | 'long';
export type NodeType = 'concept' | 'source' | 'goal' | 'decision' | 'question' | 'person' | 'event';
export type NodeStatus = 'seedling' | 'growing' | 'evergreen' | 'stale';
export type Confidence = 'low' | 'medium' | 'high';
export type EdgeLabel =
  | 'supports' | 'contradicts' | 'example_of' | 'prerequisite_for'
  | 'part_of' | 'related_to' | 'inspired_by' | 'replaces';

export interface Node {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  connections: string[];            // derived from edges for convenience
  metadata: Record<string, unknown>; // timeframe, etc.
  // v2 structured fields
  node_type: NodeType;
  status: NodeStatus;
  summary?: string;
  source_url?: string;
  confidence?: Confidence;
  review_due?: string;
  captured_at?: string;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: EdgeLabel;
  created_at: string;
  created_by: EdgeAuthor;
}

export interface Tag {
  name: string;
  color: string;
  created_at: string;
}

export type SessionLogType =
  | 'session_start'
  | 'entry_added'
  | 'connection_made'
  | 'session_end'
  | 'note';

export interface SessionLogEntry {
  id: string;
  timestamp: string;
  content: string;
  type: SessionLogType;
}

export type Theme = 'dark' | 'light';
