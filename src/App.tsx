import { useEffect, useRef, useState } from 'react';
import { Graph } from '@/components/Graph';
import { NodePanel } from '@/components/NodePanel';
import { QuickAdd } from '@/components/QuickAdd';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { CommandPalette, type Command } from '@/components/CommandPalette';
import { LintReport } from '@/components/LintReport';
import { IngestWizard } from '@/components/IngestWizard';
import { ProcessInbox } from '@/components/ProcessInbox';
import { SettingsModal } from '@/components/SettingsModal';
import { GraphFilters } from '@/components/GraphFilters';
import { isTauri, useGraphStore } from '@/hooks/useGraph';
import { dbIndexMtime } from '@/hooks/useDatabase';
import { listen } from '@tauri-apps/api/event';

// How often to check whether jarvis_index.json changed (i.e. the MCP
// server mutated the DB). Cheap — one fs::metadata call per interval.
const EXTERNAL_POLL_MS = 1500;

export default function App() {
  const bootstrap = useGraphStore((s) => s.bootstrap);
  const setQuickAddOpen = useGraphStore((s) => s.setQuickAddOpen);
  const quickAddOpen = useGraphStore((s) => s.quickAddOpen);
  const lastMtime = useRef<number>(0);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // ── Cmd+N: open QuickAdd ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setQuickAddOpen(!quickAddOpen);
      }
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdPaletteOpen((o) => !o);
      }
      // Cmd+R → force re-read from DB (covers any edge case where
      // auto-refresh missed something).
      if (mod && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        void bootstrap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickAddOpen, setQuickAddOpen, bootstrap, cmdPaletteOpen]);

  // ── Global hotkey: Cmd+Shift+N (from Tauri global-shortcut plugin) ─
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen('global-quick-add', () => {
      setQuickAddOpen(true);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [setQuickAddOpen]);

  // ── Auto-refresh when MCP server mutates the DB ───────────────────
  // Watch the mtime of jarvis_index.json (rewritten on every backend
  // mutation). When it changes, re-read the DB into the store.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const mt = await dbIndexMtime();
        if (cancelled) return;
        // Skip the very first read — that's just our own bootstrap.
        if (lastMtime.current === 0) {
          lastMtime.current = mt;
          return;
        }
        if (mt > lastMtime.current) {
          lastMtime.current = mt;
          await bootstrap();
        }
      } catch {
        // If the command fails (e.g. file missing during startup race),
        // fall through silently — the next tick will retry.
      }
    };

    const id = window.setInterval(tick, EXTERNAL_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bootstrap]);

  return (
    <div className="flex h-full w-full flex-col bg-bg text-text">
      <TopBar onOpenSettings={() => setActiveCommand('settings')} />
      <main className="relative flex flex-1 overflow-hidden">
        <Sidebar />
        <section className="relative flex-1 overflow-hidden">
          <Graph />
          <GraphFilters />
        </section>
        <NodePanel />
      </main>
      <QuickAdd />
      {cmdPaletteOpen && (
        <CommandPalette
          onSelect={(cmd) => {
            setCmdPaletteOpen(false);
            setActiveCommand(cmd);
          }}
          onClose={() => setCmdPaletteOpen(false)}
        />
      )}
      {activeCommand === 'lint' && (
        <LintReport onClose={() => setActiveCommand(null)} />
      )}
      {activeCommand === 'ingest' && (
        <IngestWizard onClose={() => setActiveCommand(null)} />
      )}
      {activeCommand === 'process-inbox' && (
        <ProcessInbox onClose={() => setActiveCommand(null)} />
      )}
      {activeCommand === 'settings' && (
        <SettingsModal onClose={() => setActiveCommand(null)} />
      )}
    </div>
  );
}
