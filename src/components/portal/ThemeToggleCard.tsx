'use client';

import { Moon, MonitorSmartphone, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

// Appearance switch, shown in Settings. Scoped to the portal.
// "Auto" follows the device's light/dark setting live.
export default function ThemeToggleCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const options = [
    { value: 'system' as const, label: 'Auto', icon: MonitorSmartphone },
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
          {resolvedTheme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">Appearance</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Auto follows your phone or computer&apos;s setting. Pick Light or Dark to override.
          </p>

          <div className="mt-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-border dark:bg-muted">
            {options.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors ${
                  theme === value
                    ? 'bg-white text-[#0A1F44] shadow-sm dark:bg-card dark:text-foreground'
                    : 'text-slate-500 hover:text-slate-700 dark:text-muted-foreground dark:hover:text-foreground'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
