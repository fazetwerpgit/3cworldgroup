'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

// Light/Dark appearance switch, shown in Settings. Scoped to the portal.
export default function ThemeToggleCard() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
          {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">Appearance</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Choose how the portal looks. Dark is easier on the eyes in low light.
          </p>

          <div className="mt-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-border dark:bg-muted">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors ${
                theme === 'light'
                  ? 'bg-white text-[#0A1F44] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-muted-foreground dark:hover:text-foreground'
              }`}
            >
              <Sun className="size-4" />
              Light
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-muted-foreground dark:hover:text-foreground'
              }`}
            >
              <Moon className="size-4" />
              Dark
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
