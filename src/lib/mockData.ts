/**
 * Seed data used when running outside Tauri (browser dev mode).
 * Mirrors the Rust seed data in db.rs.
 */

import type { Edge, Node } from '@/types';

const now = '2026-04-13T12:00:00.000Z';

export const SEED_NODES: Node[] = [
  {
    id: 'n_complex_mult',
    title: 'Complex number multiplication: magnitudes multiply, angles add',
    tags: ['domain/math'],
    content:
      '> When multiplying complex numbers, magnitudes multiply and angles add.\n\n' +
      'When you multiply two complex numbers, their magnitudes multiply and their angles add. ' +
      'If z₁ has magnitude r₁ and angle θ₁, and z₂ has magnitude r₂ and angle θ₂, then ' +
      'z₁ × z₂ has magnitude r₁·r₂ and angle θ₁+θ₂. This is why multiplying by i ' +
      '(magnitude 1, angle 90°) rotates any number by 90°.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'concept',
    status: 'evergreen',
    summary: 'When multiplying complex numbers, magnitudes multiply and angles add.',
    captured_at: now,
  },
  {
    id: 'n_thiel',
    title: "Thiel's core argument: monopoly vs competition",
    tags: ['domain/books'],
    content:
      "> Monopoly is the goal of every successful business; competition is for losers.\n\n" +
      "Thiel's central claim is that capitalism and competition are opposites. In a " +
      'perfectly competitive market, profits disappear entirely. A monopoly owns its market ' +
      'so completely it can ignore competitors — freeing it to think long-term and build ' +
      'breakthrough things. His advice: start with a tiny market you can dominate completely, ' +
      'become the last great mover in that niche, then expand outward. Amazon started with ' +
      'books. Google started with search. The niche is a launchpad, not the destination. ' +
      'Honest caveat: competition has driven enormous innovation historically. The real ' +
      'takeaway is the direction — differentiation and unique value matter more than market ' +
      'share in a crowded race.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'concept',
    status: 'evergreen',
    summary: 'Monopoly is the goal of every successful business; competition is for losers.',
    captured_at: now,
  },
  {
    id: 'n_karpathy_wiki',
    title: "Karpathy's LLM wiki pattern",
    tags: ['domain/ideas'],
    content:
      '> An LLM incrementally builds and maintains a persistent, interlinked wiki rather than re-deriving knowledge on every query.\n\n' +
      'Instead of retrieving from raw documents at query time, an LLM incrementally builds ' +
      "and maintains a persistent wiki — a structured, interlinked collection of entries " +
      "that sits between you and raw sources. When you add new material, the LLM doesn't " +
      'just index it. It reads it, extracts key information, and integrates it into the ' +
      'existing knowledge base — updating related entries, flagging contradictions, ' +
      'strengthening connections. The knowledge is compiled once and kept current, not ' +
      "re-derived on every query. The LLM is the programmer, the wiki is the codebase, " +
      'you are the director.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'concept',
    status: 'evergreen',
    summary: 'An LLM incrementally builds and maintains a persistent, interlinked wiki rather than re-deriving knowledge on every query.',
    captured_at: now,
  },
  {
    id: 'n_compounding',
    title: 'Compounding knowledge principle',
    tags: ['domain/ideas'],
    content:
      '> Knowledge compounds when each new piece is integrated into an existing structure rather than stored in isolation.\n\n' +
      'The value of a second brain is proportional to how well-maintained it is, not how ' +
      'much is in it. A sparse but well-connected graph is more useful than a huge pile of ' +
      'unlinked notes. Connections between ideas are more valuable than the ideas themselves ' +
      'in isolation.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'concept',
    status: 'evergreen',
    summary: 'Knowledge compounds when each new piece is integrated into an existing structure rather than stored in isolation.',
    captured_at: now,
  },
  {
    id: 'n_build_jarvis',
    title: 'Build Jarvis',
    tags: ['area/goals'],
    content:
      '> Build a personal second brain desktop app with a navigable mind map, Claude MCP integration, and automatic cross-referencing.\n\n' +
      'Build a personal second brain desktop app (Jarvis) — a local macOS app with a ' +
      'navigable mind map, Claude MCP integration, and automatic cross-referencing. ' +
      'Phase 1: core graph, MCP, seed data. Phase 2: session hooks, hybrid search, ' +
      'daily reflection audit.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: { timeframe: 'short' },
    node_type: 'goal',
    status: 'growing',
    summary: 'Build a personal second brain desktop app with a navigable mind map, Claude MCP integration, and automatic cross-referencing.',
    captured_at: now,
  },
  {
    id: 'n_erasmus',
    title: 'Erasmus University Rotterdam — IBEB',
    tags: ['area/universities'],
    content:
      '> Notes from visiting Erasmus University Rotterdam IBEB.\n\n' +
      'International Bachelor Economics and Business (IBEB). Attended open day. ' +
      'Strong quantitative reputation, Rotterdam is a major finance hub, good ' +
      'scholarship options for non-EEA. Part of top European target list alongside ' +
      'Bocconi, HSG, SSE Stockholm, Tilburg.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'source',
    status: 'growing',
    summary: 'Notes from visiting Erasmus University Rotterdam IBEB.',
    captured_at: now,
  },
  {
    id: 'n_tilburg',
    title: 'Tilburg University — Economics',
    tags: ['area/universities'],
    content:
      '> Notes from visiting Tilburg University Economics programme.\n\n' +
      'Attended open day. Strong economics programme, smaller campus, good ' +
      'quantitative track. Part of secondary target list for European Economics ' +
      'and Finance.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: {},
    node_type: 'source',
    status: 'growing',
    summary: 'Notes from visiting Tilburg University Economics programme.',
    captured_at: now,
  },
  {
    id: 'n_target_uni',
    title: 'Target top European Economics programme',
    tags: ['area/goals'],
    content:
      '> Get into a top European Economics programme, with Bocconi as primary target.\n\n' +
      'Primary target: Bocconi. Strong secondaries: HSG St Gallen, SSE Stockholm. ' +
      'Further targets: Erasmus IBEB, Tilburg. Key differentiators in application: ' +
      'Math AA HL, Bocconi Summer School (Game Theory and Finance), AI/ML projects, ' +
      'independent software builds.',
    created_at: now,
    updated_at: now,
    connections: [],
    metadata: { timeframe: 'long' },
    node_type: 'goal',
    status: 'growing',
    summary: 'Get into a top European Economics programme, with Bocconi as primary target.',
    captured_at: now,
  },
];

export const SEED_EDGES: Edge[] = [
  {
    id: 'e1',
    source: 'n_karpathy_wiki',
    target: 'n_compounding',
    label: 'example_of',
    created_at: now,
    created_by: 'user',
  },
  {
    id: 'e2',
    source: 'n_karpathy_wiki',
    target: 'n_build_jarvis',
    label: 'inspired_by',
    created_at: now,
    created_by: 'user',
  },
  {
    id: 'e3',
    source: 'n_thiel',
    target: 'n_compounding',
    label: 'related_to',
    created_at: now,
    created_by: 'user',
  },
  {
    id: 'e4',
    source: 'n_erasmus',
    target: 'n_target_uni',
    label: 'part_of',
    created_at: now,
    created_by: 'user',
  },
  {
    id: 'e5',
    source: 'n_tilburg',
    target: 'n_target_uni',
    label: 'part_of',
    created_at: now,
    created_by: 'user',
  },
];
