import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

// Surface uncaught errors that happen outside React's render tree
// (promise rejections, window event handlers) — otherwise they go
// silently to console.error inside the webview.
window.addEventListener('error', (e) => {
  console.error('[jarvis] window error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[jarvis] unhandled promise:', e.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
