import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useGraphStore } from '@/hooks/useGraph';

interface TopBarProps {
  onOpenSettings?: () => void;
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const openQuickAdd = useGraphStore((s) => s.setQuickAddOpen);
  const bootstrap = useGraphStore((s) => s.bootstrap);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = async () => {
    setSpinning(true);
    try {
      await bootstrap();
    } finally {
      // Keep the spin visible for a beat so the action registers.
      window.setTimeout(() => setSpinning(false), 350);
    }
  };

  return (
    <header
      className="no-select flex h-12 items-center justify-between border-b border-border bg-surface px-4"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full bg-accent"
        />
        <span className="font-mono text-[11px] font-semibold tracking-[0.25em] text-text">
          JARVIS
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh from database"
          title="Refresh (⌘R) — reloads changes made by Claude Desktop"
          className="rounded-md border border-border bg-elevated px-2 py-1 text-[12px] text-muted hover:text-text"
        >
          <span
            aria-hidden
            className={`inline-block leading-none ${spinning ? 'animate-spin' : ''}`}
            style={{ transformOrigin: 'center' }}
          >
            ↻
          </span>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted hover:text-text"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings (⌘K → /settings)"
          className="rounded-md border border-border bg-elevated px-2 py-1 text-muted hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Add node"
          title="Add node (⌘N)"
          className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
          onClick={() => openQuickAdd(true)}
        >
          + New
        </button>
      </div>
    </header>
  );
}
