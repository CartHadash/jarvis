/**
 * TagInput — multi-select tag picker with type-to-create.
 *
 * Shows selected tags as removable chips above the input. Type to filter
 * existing tags or create new ones. Enter/click adds a tag; backspace
 * removes the last tag.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectTags, useGraphStore } from '@/hooks/useGraph';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  autoFocus?: boolean;
}

export function TagInput({ value, onChange, autoFocus }: Props) {
  const allTags = useGraphStore(useShallow(selectTags));
  const tagColors = useGraphStore((s) => s.tagColors);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const q = input.trim().toLowerCase();
  const matches = useMemo(
    () => allTags.filter((t) => !value.includes(t) && t.toLowerCase().includes(q)),
    [allTags, value, q],
  );

  const exactMatch = allTags.some((t) => t.toLowerCase() === q) || value.some((t) => t.toLowerCase() === q);
  const showCreate = q.length > 0 && !exactMatch;
  const items: Array<{ kind: 'create' | 'pick'; label: string }> = [
    ...(showCreate ? [{ kind: 'create' as const, label: input.trim() }] : []),
    ...matches.map((m) => ({ kind: 'pick' as const, label: m })),
  ];

  useEffect(() => {
    if (highlight >= items.length) setHighlight(0);
  }, [items.length, highlight]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const addTag = (tag: string) => {
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Selected tag chips */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-elevated px-2 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: tagColors[tag] ?? '#6b7280' }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 opacity-70 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          autoFocus={autoFocus}
          placeholder={value.length === 0 ? 'Add tags…' : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && input === '' && value.length > 0) {
              removeTag(value[value.length - 1]);
              return;
            }
            if (!open || items.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              const item = items[highlight];
              if (item) {
                e.preventDefault();
                addTag(item.label);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="min-w-[60px] flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
        />
      </div>

      {open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-elevated shadow-lg"
        >
          {items.map((it, i) => {
            const isHi = i === highlight;
            const dot = it.kind === 'pick' ? tagColors[it.label] ?? '#6b7280' : '#6b7280';
            return (
              <li key={`${it.kind}-${it.label}`}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => addTag(it.label)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] ${
                    isHi ? 'bg-bg text-text' : 'text-muted hover:text-text'
                  }`}
                >
                  {it.kind === 'create' ? (
                    <>
                      <span className="text-muted">+</span>
                      <span>
                        Create <span className="text-text">"{it.label}"</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: dot }}
                      />
                      <span className="text-text">{it.label}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
