/**
 * NodeHistory — collapsible section in NodePanel that lists every
 * prior revision of the current node and shows an inline diff (against
 * the next-newer revision, i.e. the version that *replaced* it).
 *
 * History rows come from the `node_history` table populated by an
 * SQLite trigger on UPDATE of `nodes.title|content|summary`. The
 * trigger captures the OLD row, so the most recent history entry is
 * the *previous* current value.
 */

import { useEffect, useState } from 'react';
import { dbListNodeHistory, type NodeRevision } from '@/hooks/useDatabase';

interface Props {
  nodeId: string;
  /** The current (live) content of the node, used as the comparand
   *  against the most-recent historical revision. */
  currentContent: string;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '');

/**
 * LCS-based line diff. Returns rows tagged 'same' | 'add' | 'remove'.
 * O(n*m) memory; fine for the small note sizes we expect.
 */
function lineDiff(oldStr: string, newStr: string): { type: 'same' | 'add' | 'remove'; line: string }[] {
  const a = stripHtml(oldStr).split(/\n/);
  const b = stripHtml(newStr).split(/\n/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: 'same' | 'add' | 'remove'; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', line: a[i] });
      i++;
    } else {
      out.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: 'remove', line: a[i++] });
  while (j < n) out.push({ type: 'add', line: b[j++] });
  return out;
}

export function NodeHistory({ nodeId, currentContent }: Props) {
  const [revisions, setRevisions] = useState<NodeRevision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRevisions(null);
    setExpandedVersion(null);
    setOpen(false);
  }, [nodeId]);

  const handleToggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (revisions !== null) return;
    setLoading(true);
    try {
      const rows = await dbListNodeHistory(nodeId);
      setRevisions(rows);
    } catch (err) {
      console.error('[jarvis] history load failed', err);
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  };

  const count = revisions?.length ?? 0;

  return (
    <section className="border-t border-border px-4 py-4">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-widest text-muted hover:text-text"
      >
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History{revisions !== null ? ` (${count})` : ''}
        </span>
        <span className="text-[9px]">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && <p className="text-[11px] text-muted">Loading…</p>}
          {!loading && revisions !== null && revisions.length === 0 && (
            <p className="text-[11px] text-muted">
              No prior revisions yet. History is captured automatically on
              every meaningful edit (title / content / summary).
            </p>
          )}
          {!loading && revisions !== null && revisions.length > 0 && (
            <ul className="space-y-2">
              {revisions.map((r, i) => {
                // Compare each revision against the *next-newer* state:
                // the previous revision in the array (i-1), or the live
                // content if this is the most recent (i === 0).
                const newerContent = i === 0 ? currentContent : revisions[i - 1].content;
                const isOpen = expandedVersion === r.version;
                const diff = isOpen ? lineDiff(r.content, newerContent) : null;
                return (
                  <li key={r.version} className="rounded-md border border-border bg-elevated/40">
                    <button
                      type="button"
                      onClick={() => setExpandedVersion(isOpen ? null : r.version)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] hover:bg-elevated"
                    >
                      <span className="text-muted">
                        v{r.version} ·{' '}
                        <time dateTime={r.edited_at}>
                          {new Date(r.edited_at).toLocaleString()}
                        </time>
                      </span>
                      <span className="truncate text-text/80">{r.title}</span>
                      <span className="text-[9px] text-muted">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && diff && (
                      <div className="border-t border-border/60 px-3 py-2 font-mono text-[11px] leading-snug">
                        {diff.length === 0 ? (
                          <p className="text-muted">No textual differences.</p>
                        ) : (
                          diff.map((row, k) => (
                            <div
                              key={k}
                              className={
                                row.type === 'add'
                                  ? 'whitespace-pre-wrap rounded px-1 text-emerald-300/90 bg-emerald-500/10'
                                  : row.type === 'remove'
                                  ? 'whitespace-pre-wrap rounded px-1 text-red-300/90 bg-red-500/10 line-through decoration-red-400/40'
                                  : 'whitespace-pre-wrap text-muted'
                              }
                            >
                              {row.type === 'add' ? '+ ' : row.type === 'remove' ? '− ' : '  '}
                              {row.line || ' '}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
