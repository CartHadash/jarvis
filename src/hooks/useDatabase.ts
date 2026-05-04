/**
 * Typed wrappers around Tauri invoke commands.
 *
 * Every backend command lives in `src-tauri/src/commands.rs`. The names
 * and parameter shapes here must match exactly — Tauri serialises the
 * top-level params object directly into the Rust handler.
 */

import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import type {
  Confidence,
  Edge,
  EdgeAuthor,
  EdgeLabel,
  Node,
  NodeStatus,
  NodeType,
  SessionLogEntry,
  SessionLogType,
  Tag,
} from '@/types';

// ─── Nodes ──────────────────────────────────────────────────────────────

export const dbListNodes = (): Promise<Node[]> => invoke('list_nodes');

export const dbGetNode = (id: string): Promise<Node> => invoke('get_node', { id });

export interface CreateNodeArgs {
  id?: string;
  title: string;
  content?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  connections?: string[];
  node_type?: NodeType;
  status?: NodeStatus;
  summary?: string;
  source_url?: string;
  confidence?: Confidence;
  review_due?: string;
}
export const dbCreateNode = (args: CreateNodeArgs): Promise<Node> =>
  invoke('create_node', args as unknown as InvokeArgs);

export interface UpdateNodeArgs {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  node_type?: NodeType;
  status?: NodeStatus;
  summary?: string | null;
  source_url?: string | null;
  confidence?: Confidence | null;
  review_due?: string | null;
}
export const dbUpdateNode = (args: UpdateNodeArgs): Promise<Node> =>
  invoke('update_node', args as unknown as InvokeArgs);

export const dbDeleteNode = (id: string): Promise<void> => invoke('delete_node', { id });

// ─── Edges ──────────────────────────────────────────────────────────────

export const dbListEdges = (): Promise<Edge[]> => invoke('list_edges');

export interface AddEdgeArgs {
  source: string;
  target: string;
  label?: EdgeLabel;
  createdBy?: EdgeAuthor;
}
export const dbAddEdge = (args: AddEdgeArgs): Promise<Edge> =>
  invoke('add_edge', {
    source: args.source,
    target: args.target,
    label: args.label,
    // Tauri converts camelCase TS keys to snake_case Rust params automatically
    // in v2; we pass the camelCase key here.
    createdBy: args.createdBy ?? 'user',
  });

export const dbRemoveEdge = (source: string, target: string): Promise<void> =>
  invoke('remove_edge', { source, target });

// ─── Tags ───────────────────────────────────────────────────────────────

export const dbListTags = (): Promise<Tag[]> => invoke('list_tags');

export const dbUpsertTag = (name: string, color: string): Promise<Tag> =>
  invoke('upsert_tag', { name, color });

// ─── Search ─────────────────────────────────────────────────────────────

export const dbSearchNodes = (query: string, limit = 50): Promise<Node[]> =>
  invoke('search_nodes', { query, limit });

// ─── Session log ────────────────────────────────────────────────────────

export const dbListSessionLog = (limit = 10): Promise<SessionLogEntry[]> =>
  invoke('list_session_log', { limit });

export const dbAppendSessionLog = (
  content: string,
  type_: SessionLogType,
): Promise<SessionLogEntry> =>
  invoke('append_session_log', { content, type_ });

// ─── Images ─────────────────────────────────────────────────────────────

/** Save raw bytes to disk; returns the absolute file path. */
export const dbSaveImage = (bytes: Uint8Array, ext?: string): Promise<string> =>
  invoke('save_image', { bytes: Array.from(bytes), ext });

// ─── Misc ───────────────────────────────────────────────────────────────

export const dbDataDir = (): Promise<string> => invoke('data_dir');

/** Mtime (ms) of jarvis_index.json. Used to auto-refresh when the MCP
 *  server writes to the DB behind our back. 0 means the file doesn't
 *  exist yet. */
export const dbIndexMtime = (): Promise<number> => invoke('index_mtime');

// ─── Config ─────────────────────────────────────────────────────────────

export interface AppConfig {
  claude_api_key?: string | null;
  auto_log?: boolean | null;
}

export const dbGetConfig = (): Promise<AppConfig> => invoke('get_config');

export const dbSetConfig = (opts: {
  claudeApiKey?: string;
  autoLog?: boolean;
}): Promise<AppConfig> => invoke('set_config', opts);

// ─── Claude API ─────────────────────────────────────────────────────────

export const dbCallClaude = (system: string, userMessage: string): Promise<string> =>
  invoke('call_claude_api', { system, userMessage });

export const dbFetchUrl = (url: string): Promise<string> =>
  invoke('fetch_url', { url });

// ─── Markdown export ───────────────────────────────────────────────────

/** Export the full vault as Obsidian-compatible markdown. Returns the directory path. */
export const dbExportVault = (): Promise<string> => invoke('export_vault_cmd');

/** Export a single node as markdown. Returns the file path. */
export const dbExportNodeMarkdown = (id: string): Promise<string> =>
  invoke('export_node_markdown', { id });
