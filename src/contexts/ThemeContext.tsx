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

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // Fall through to the device-size default when storage is unavailable.
  }

  // Dark everywhere until the user says otherwise. Desktop used to default to
  // 'system', which handed most laptops the light palette; Jacob, 2026-09-03:
  // "make the default mode on desktop dark mode as well... we can keep it the
  // way it is but still" — light stays available, it just is not the default.
  return 'dark';
}

function getInitialSystemDark() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Scoped to the portal: the `dark` class lives on the wrapper below (not <html>),
  // so the public marketing site is never affected. The portal starts DARK on
  // every device; light and 'follow my device' are still there in Settings, and
  // an explicit choice overrides and persists as before.
  // Server renders light; the real preference is applied on mount (a lazy
  // initializer would make the server and first client render differ).
  const [theme, setThemeState] = useState<Theme>('dark');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(getInitialTheme());
    setSystemDark(getInitialSystemDark());

    // Track the device preference live so 'system' mode follows OS switches
    // (e.g. phones that go dark at sunset) without a reload.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
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

  // Mirror the theme onto <body> so Radix overlays (Sheet/Dialog/Dropdown) that
  // portal to document.body — outside the wrapper div below — still pick up the
  // `dark` class and the `.portal-scope` token/focus rules. classList.add/remove
  // (never className=) so we never clobber classes other libraries put on body.
  // Cleanup removes BOTH so unmount (leaving /portal) can't leak dark styles
  // onto the public marketing site.
  useEffect(() => {
    const body = document.body;
    body.classList.add('portal-scope');
    if (resolvedTheme === 'dark') {
      body.classList.add('dark');
    } else {
      body.classList.remove('dark');
    }
    return () => {
      body.classList.remove('portal-scope');
      body.classList.remove('dark');
    };
  }, [resolvedTheme]);

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
