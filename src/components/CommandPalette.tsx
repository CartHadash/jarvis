/**
 * Command Palette — Cmd+K to open.
 *
 * Lists the three workflow commands (/lint, /ingest, /process-inbox).
 * Selecting one opens its respective modal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type Command = 'lint' | 'ingest' | 'process-inbox' | 'settings';

const COMMANDS: { id: Command; label: string; description: string; shortcut?: string }[] = [
  { id: 'lint', label: '/lint', description: 'Audit graph health — orphans, stale nodes, distributions' },
  { id: 'ingest', label: '/ingest', description: 'Import a URL or text — Claude drafts a node with edges' },
  { id: 'process-inbox', label: '/process-inbox', description: 'Enrich seedling orphan nodes one by one' },
  { id: 'settings', label: '/settings', description: 'Theme, Claude API key, data directory' },
];

interface Props {
  onSelect: (command: Command) => void;
  onClose: () => void;
}

export function CommandPalette({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.description.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleSelect = useCallback(
    (cmd: Command) => {
      onSelect(cmd);
    },
    [onSelect],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIdx]) {
        e.preventDefault();
        handleSelect(filtered[activeIdx].id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIdx, handleSelect, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="py-1">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">No matching commands</p>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => handleSelect(cmd.id)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                i === activeIdx ? 'bg-elevated' : ''
              }`}
            >
              <span className="text-sm font-medium text-accent">{cmd.label}</span>
              <span className="text-xs text-muted">{cmd.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { Command };
