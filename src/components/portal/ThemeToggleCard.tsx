'use client';

import { useTheme } from '@/contexts/ThemeContext';

// Appearance switch, shown in Settings inside the "App + appearance" panel.
// Scoped to the portal. "Auto" follows the device's light/dark setting live.
// Renders bare segmented-control markup — the panel chrome comes from the
// Settings page (member-the-line-goal.md: one real "App + appearance" panel,
// not a standalone card).
export default function ThemeToggleCard() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'system' as const, label: 'Auto' },
    { value: 'light' as const, label: 'Light' },
    { value: 'dark' as const, label: 'Dark' },
  ];

  return (
    <div style={{ marginTop: 15 }}>
      <p className="member-line-label">Appearance / segmented</p>
      <div className="member-line-segmented" role="group" aria-label="Appearance">
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={theme === value}
          >
            {label}
          </button>
        ))}
      </div>
      {theme === 'system' && (
        <div className="member-line-note" style={{ marginTop: 10 }}>
          Auto follows your device setting.
        </div>
      )}
    </div>
  );
}
