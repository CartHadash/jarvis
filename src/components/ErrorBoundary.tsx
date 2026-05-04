/**
 * ErrorBoundary — catches React render/lifecycle errors and shows a
 * readable panel instead of leaving the user staring at a black screen.
 *
 * Only catches descendants. If the bug is outside React (e.g. a Tauri
 * backend panic leaving the webview orphaned), the DevTools console is
 * still the right place to look.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[jarvis] uncaught', error, info);
    this.setState({ error, info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg p-8 text-text">
        <div className="max-w-xl rounded-lg border border-border bg-surface p-5">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-red-400">
            Render error
          </div>
          <h1 className="mb-2 text-sm font-semibold">
            {this.state.error.message}
          </h1>
          <pre className="max-h-64 overflow-auto rounded bg-elevated p-3 font-mono text-[11px] text-muted">
            {this.state.error.stack}
            {this.state.info?.componentStack}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
}
