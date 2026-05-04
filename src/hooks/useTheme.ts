import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '@/types';

const STORAGE_KEY = 'jarvis.theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' ? 'light' : 'dark';
}

/**
 * Theme is synchronised to <html data-theme="..."> so that CSS variables
 * defined in globals.css resolve correctly. The index.html inline script
 * applies the theme before first paint to avoid a flash.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
