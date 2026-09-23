'use client';

import { useTheme } from '@/contexts/ThemeContext';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

// Appearance switch in Settings. Redesigned (direction D) pages are dark only
// and ignore it; it still sets the look of the portal screens that have not
// moved to the new design yet (admin, forms, chat...). "Auto" follows the
// device's light/dark setting live.
export default function ThemeToggleCard() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'system' as const, label: 'Auto' },
    { value: 'light' as const, label: 'Light' },
    { value: 'dark' as const, label: 'Dark' },
  ];

  return (
    <div className={st.theme}>
      <div className={p.tabs} role="group" aria-label="Theme for older screens">
        {options.map(({ value, label }) => (
          <button key={value} type="button" className={p.tab} onClick={() => setTheme(value)} aria-pressed={theme === value}>
            {label}
          </button>
        ))}
      </div>
      <p className={p.hint}>
        New screens like this one are always dark. This sets the look of screens that haven&apos;t moved to the new
        design yet{theme === 'system' ? ', following your device setting' : ''}.
      </p>
    </div>
  );
}
