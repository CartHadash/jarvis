/**
 * QuickAdd — Cmd+N modal for fast node capture.
 *
 * Layout: title input (autofocused), TagInput for multi-tag selection,
 * optional content textarea, and Create button. Cmd/Ctrl+Enter submits.
 */

import { useEffect, useRef, useState } from 'react';
import { isTauri, useGraphStore } from '@/hooks/useGraph';
import { dbCreateNode } from '@/hooks/useDatabase';
import { TagInput } from '@/components/TagInput';
import type { Node } from '@/types';

export function QuickAdd() {
  const open = useGraphStore((s) => s.quickAddOpen);
  const setOpen = useGraphStore((s) => s.setQuickAddOpen);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const flyToNode = useGraphStore((s) => s.flyToNode);

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>(['domain/ideas']);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Reset & focus on open.
  useEffect(() => {
    if (open) {
      setTitle('');
      setTags(['domain/ideas']);
      setContent('');
      setBusy(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && tags.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const t = title.trim();
    const html = content.trim() ? `<p>${escapeHtml(content.trim())}</p>` : '';

    try {
      let created: Node;
      if (isTauri()) {
        created = await dbCreateNode({ title: t, tags, content: html });
      } else {
        const now = new Date().toISOString();
        created = {
          id: `local_${Date.now()}`,
          title: t,
          tags,
          content: html,
          created_at: now,
          updated_at: now,
          connections: [],
          metadata: {},
          node_type: 'concept',
          status: 'seedling',
          captured_at: now,
        };
      }
      upsertNode(created);
      requestAnimationFrame(() => {
        selectNode(created.id);
        flyToNode(created.id);
      });
      setOpen(false);
    } catch (err) {
      console.error('[jarvis] quick-add failed', err);
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick add node"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
            <span>New node</span>
            <span>
              <kbd className="font-mono">⌘↵</kbd> to create
            </span>
          </div>

          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent pb-2 text-base font-semibold text-text outline-none placeholder:text-muted"
          />

          <div className="mt-2">
            <TagInput value={tags} onChange={setTags} />
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Optional content…"
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent"
          />

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-[12px] text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
