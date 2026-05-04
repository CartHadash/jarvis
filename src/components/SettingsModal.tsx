/**
 * Settings modal — Appearance, AI Integration, Data.
 *
 * Opened via:
 *   - Gear icon in TopBar
 *   - /settings in CommandPalette (Cmd+K)
 */

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useGraphStore } from '@/hooks/useGraph';
import {
  dbGetConfig,
  dbSetConfig,
  dbCallClaude,
  dbDataDir,
  dbExportVault,
  type AppConfig,
} from '@/hooks/useDatabase';
import { isTauri } from '@/hooks/useGraph';

type ApiStatus = 'unconfigured' | 'valid' | 'invalid' | 'testing';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { theme, setTheme } = useTheme();
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  // API key state
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('unconfigured');
  const [apiError, setApiError] = useState('');
  const [dirty, setDirty] = useState(false);

  // Auto-log toggle
  const [autoLog, setAutoLog] = useState(false);

  // Data directory
  const [dataDir, setDataDir] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportPath, setExportPath] = useState('');

  // Load config on mount
  useEffect(() => {
    if (!isTauri()) return;
    dbGetConfig().then((cfg: AppConfig) => {
      const key = cfg.claude_api_key ?? '';
      setApiKey(key);
      setApiStatus(key ? 'valid' : 'unconfigured');
      setAutoLog(cfg.auto_log ?? false);
    }).catch(() => {});
    dbDataDir().then(setDataDir).catch(() => {});
  }, []);

  const handleSaveKey = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await dbSetConfig({ claudeApiKey: apiKey });
      setDirty(false);
      setApiStatus(apiKey ? 'valid' : 'unconfigured');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey]);

  const handleTestKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setApiStatus('testing');
    setApiError('');
    try {
      // Save first, then test
      await dbSetConfig({ claudeApiKey: apiKey });
      setDirty(false);
      await dbCallClaude('Respond with exactly: ok', 'ping');
      setApiStatus('valid');
    } catch (err) {
      setApiStatus('invalid');
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey]);

  const handleToggleAutoLog = useCallback(async (checked: boolean) => {
    setAutoLog(checked);
    if (!isTauri()) return;
    try {
      await dbSetConfig({ autoLog: checked });
    } catch {
      setAutoLog(!checked); // revert on failure
    }
  }, []);

  const handleOpenFinder = useCallback(() => {
    if (!dataDir) return;
    // Use Tauri shell plugin or fallback
    window.open(`file://${dataDir}`);
  }, [dataDir]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-elevated hover:text-text">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Appearance ──────────────────────────────────────── */}
          <section className="px-5 py-4">
            <h3 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
              Appearance
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Theme</span>
              <div className="inline-flex rounded-lg border border-border bg-elevated p-0.5">
                <button
                  onClick={() => setTheme('dark')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-accent text-white'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-accent text-white'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Light
                </button>
              </div>
            </div>
          </section>

          <div className="mx-5 border-t border-border" />

          {/* ── AI Integration ──────────────────────────────────── */}
          <section className="px-5 py-4">
            <h3 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
              AI Integration
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Claude API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="sk-ant-..."
                      className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 pr-8 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                      title={showKey ? 'Hide' : 'Show'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        {showKey ? (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        ) : (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Save + Test row */}
              <div className="flex items-center gap-2">
                {dirty && (
                  <button
                    onClick={handleSaveKey}
                    className="rounded-lg bg-elevated px-3 py-1 text-xs font-medium text-text border border-border hover:bg-border"
                  >
                    Save
                  </button>
                )}
                <button
                  onClick={handleTestKey}
                  disabled={!apiKey.trim() || apiStatus === 'testing'}
                  className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  {apiStatus === 'testing' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                      Testing…
                    </span>
                  ) : (
                    'Test Connection'
                  )}
                </button>

                {/* Status indicator */}
                {apiStatus === 'valid' && !dirty && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                    Connected
                  </span>
                )}
                {apiStatus === 'invalid' && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                    Failed
                  </span>
                )}
                {apiStatus === 'unconfigured' && (
                  <span className="text-xs text-muted">Not configured</span>
                )}
              </div>

              {apiError && (
                <p className="text-xs text-red-400 break-words">{apiError}</p>
              )}

              <p className="text-[10px] text-muted leading-relaxed">
                Required for /ingest and /process-inbox. Get your key at{' '}
                <span className="text-accent">console.anthropic.com</span>.
                Stored locally in config.json — never sent anywhere except the Anthropic API.
              </p>

              {/* Auto-log toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <span className="text-sm text-text">Auto-log Claude sessions</span>
                  <p className="text-[10px] text-muted mt-0.5">
                    When enabled, Claude appends a session summary via MCP at session end
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoLog}
                  onClick={() => handleToggleAutoLog(!autoLog)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    autoLog ? 'bg-accent' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      autoLog ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          <div className="mx-5 border-t border-border" />

          {/* ── Data ────────────────────────────────────────────── */}
          <section className="px-5 py-4">
            <h3 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
              Data
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Data directory</span>
                <div className="flex items-center gap-2">
                  <span className="max-w-[220px] truncate text-xs text-text font-mono" title={dataDir}>
                    {dataDir || '—'}
                  </span>
                  {dataDir && (
                    <button
                      onClick={handleOpenFinder}
                      className="rounded px-1.5 py-0.5 text-[10px] text-muted border border-border hover:bg-elevated hover:text-text"
                      title="Open in Finder"
                    >
                      Open
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Nodes</span>
                <span className="text-xs text-text">{nodes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Edges</span>
                <span className="text-xs text-text">{edges.length}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted">Export</span>
                <div className="flex items-center gap-2">
                  {exportPath && (
                    <span className="text-[10px] text-accent">Exported!</span>
                  )}
                  <button
                    disabled={exporting}
                    onClick={async () => {
                      if (!isTauri()) return;
                      setExporting(true);
                      setExportPath('');
                      try {
                        const path = await dbExportVault();
                        setExportPath(path);
                        window.open(`file://${path}`);
                      } catch (err) {
                        console.error('[jarvis] vault export failed', err);
                      } finally {
                        setExporting(false);
                      }
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted border border-border hover:bg-elevated hover:text-text disabled:opacity-40"
                  >
                    {exporting ? 'Exporting…' : 'Markdown vault'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
