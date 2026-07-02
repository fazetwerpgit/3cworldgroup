'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** The user's choice: explicit light/dark, or 'system' to follow the device. */
  theme: Theme;
  /** What is actually rendered right now. */
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = '3c-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Scoped to the portal: the `dark` class lives on the wrapper below (not <html>),
  // so the public marketing site is never affected. Default follows the DEVICE
  // setting ('system'); an explicit choice in Settings overrides and persists.
  // Server renders light; the real preference is applied on mount.
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null) as Theme | null;
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      // Restoring after mount (not via lazy initializer) keeps the server and
      // first client render identical, avoiding a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored);
    }

    // Track the device preference live so 'system' mode follows OS switches
    // (e.g. phones that go dark at sunset) without a reload.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  const toggleTheme = useCallback(() => {
    // Toggling from 'system' pins whichever mode is the opposite of what the
    // user currently sees.
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      <div className={resolvedTheme === 'dark' ? 'dark' : undefined}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
