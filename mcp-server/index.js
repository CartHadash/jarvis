#!/usr/bin/env node
/**
 * Jarvis MCP server — stdio transport.
 *
 * Bridges Claude Desktop ⇄ Jarvis SQLite. Reads from the same database
 * file the Tauri app writes; WAL mode keeps the two processes safe.
 *
 * To register with Claude Desktop, add this snippet to
 * ~/Library/Application Support/Claude/claude_desktop_config.json:
 *
 *   {
 *     "mcpServers": {
 *       "jarvis": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/jarvis/mcp-server/index.js"]
 *       }
 *     }
 *   }
 *
 * (Override the DB path with `env: { JARVIS_DB_PATH: "..." }` if needed.)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { openDb } from './db.js';

import * as readIndex from './tools/readIndex.js';
import * as getNode from './tools/getNode.js';
import * as bulkGet from './tools/bulkGet.js';
import * as getBacklinks from './tools/getBacklinks.js';
import * as searchNodes from './tools/searchNodes.js';
import * as createNode from './tools/createNode.js';
import * as updateNode from './tools/updateNode.js';
import * as addConnection from './tools/addConnection.js';
import * as removeConnection from './tools/removeConnection.js';
import * as sessionLog from './tools/sessionLog.js';
import * as getTags from './tools/getTags.js';
import * as getSummaries from './tools/getSummaries.js';
import * as recentLog from './tools/recentLog.js';
import * as appendLog from './tools/appendLog.js';

const TOOLS = [
  readIndex,
  getNode,
  bulkGet,
  getBacklinks,
  searchNodes,
  createNode,
  updateNode,
  addConnection,
  removeConnection,
  sessionLog,
  getTags,
  getSummaries,
  recentLog,
  appendLog,
];

const server = new Server(
  { name: 'jarvis', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return errorResult(`Unknown tool: ${req.params.name}`);
  }
  try {
    const args = tool.inputSchema.parse(req.params.arguments ?? {});
    const db = openDb();
    const result = tool.handler(args, db);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
});

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: `[jarvis-mcp] ${message}` }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

// Stderr only — stdout is reserved for the JSON-RPC protocol.
process.stderr.write('[jarvis-mcp] ready\n');
