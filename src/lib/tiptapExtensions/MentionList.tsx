/**
 * Suggestion popup for @-mentions. Renders the matching node list
 * filtered by what the user has typed after `@`. Selecting a node both
 * inserts a chip into the editor AND fires `onSelect` so the host can
 * create the corresponding edge.
 */

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraph';

export interface MentionItem {
  id: string;
  title: string;
  color: string;
}

export interface MentionListRef {
  /** Forwarded by Tiptap suggestion plugin for keyboard navigation. */
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface Props {
  query: string;
  command: (item: MentionItem) => void;
}

export const MentionList = forwardRef<MentionListRef, Props>((props, ref) => {
  const { query, command } = props;
  const [selected, setSelected] = useState(0);
  const tagColors = useGraphStore((s) => s.tagColors);
  const nodes = useGraphStore((s) => s.nodes);

  const items: MentionItem[] = nodes
    .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
    .map((n) => ({
      id: n.id,
      title: n.title,
      color: (n.tags.length > 0 ? tagColors[n.tags[0]] : undefined) ?? '#6b7280',
    }));

  useEffect(() => setSelected(0), [items.length]);

  const select = (idx: number) => {
    const item = items[idx];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % Math.max(1, items.length));
        return true;
      }
      if (event.key === 'Enter') {
        select(selected);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-elevated px-3 py-2 text-xs text-muted shadow-lg">
        No nodes match.
      </div>
    );
  }

  return (
    <ul className="max-h-60 w-72 overflow-y-auto rounded-md border border-border bg-elevated py-1 shadow-lg">
      {items.map((item, idx) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => select(idx)}
            onMouseEnter={() => setSelected(idx)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
              idx === selected ? 'bg-bg/60 text-text' : 'text-muted hover:text-text'
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
});
MentionList.displayName = 'MentionList';
