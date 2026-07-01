'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = '3c-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Scoped to the portal: the `dark` class lives on the wrapper below (not <html>),
  // so the public marketing site is never affected. Default light on the server;
  // the real preference is applied on mount from localStorage.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null) as Theme | null;
    if (stored === 'dark' || stored === 'light') setThemeState(stored);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <div className={theme === 'dark' ? 'dark' : undefined}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
