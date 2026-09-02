'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-b.css';

const InertNote = () => <span className="admin-line-inert-note">Not available yet</span>;

const WEEKLY_CHALLENGE_PRESETS = [
  { value: 3, descriptor: 'Warm-up' },
  { value: 5, descriptor: 'Steady' },
  { value: 7, descriptor: 'Standard' },
  { value: 10, descriptor: 'Hard' },
  { value: 15, descriptor: 'Beast mode' },
];

function WeeklyChallengeCard() {
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch('/api/portal/settings/weekly-challenge', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load weekly challenge');
        if (!cancelled) setTarget(data.targetSales);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load weekly challenge');
          setTarget(7);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPreset = target !== null && WEEKLY_CHALLENGE_PRESETS.some((p) => p.value === target);

  const handleCustomChange = (raw: string) => {
    setError(null);
    if (raw === '') {
      setTarget(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) return;
    setTarget(Math.min(99, Math.max(1, parsed)));
  };

  const handleSave = async () => {
    if (target === null || target < 1 || target > 99) {
      setError('Enter a value between 1 and 99');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch('/api/portal/settings/weekly-challenge', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetSales: target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save weekly challenge');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save weekly challenge');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-line-settings-card">
      <h2>Weekly challenge</h2>
      <div className="admin-line-field">
        <label>Target sales</label>
        {loading ? (
          <span className="admin-line-inert-note">Loading current target…</span>
        ) : (
          <>
            <div className="admin-line-multi-toggle">
              {WEEKLY_CHALLENGE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.descriptor}
                  aria-pressed={target === preset.value}
                  onClick={() => {
                    setTarget(preset.value);
                    setSaved(false);
                    setError(null);
                  }}
                >
                  {preset.value} sales
                </button>
              ))}
            </div>
            <div className="admin-line-weekly-custom">
              <label htmlFor="weekly-challenge-custom">Custom</label>
              <input
                id="weekly-challenge-custom"
                type="number"
                min={1}
                max={99}
                value={!isPreset && target !== null ? target : ''}
                placeholder={isPreset ? String(target) : '—'}
                className={!isPreset ? 'admin-line-weekly-custom-active' : ''}
                onChange={(e) => {
                  handleCustomChange(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
          </>
        )}
      </div>
      <p className="admin-line-weekly-preview">
        Reps will see: <strong>&ldquo;Close {target ?? '—'} sales by Sunday&rdquo;</strong>
      </p>
      <div className="admin-line-save-line">
        <button type="button" className="admin-line-primary" disabled={saving || loading} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="saved">Saved — live on the leaderboard now</span>}
        {error && <span className="admin-line-weekly-error">{error}</span>}
      </div>
    </section>
  );
}

export default function AdminSettingsPage() {
  const { isRole } = useAuth();
  const isAdmin = isRole('admin');

  if (!isAdmin) {
    return (
      <div className="admin-line-main">
        <div className="admin-line">
          <PageTitle title="System Settings" meta="Admin access required" />
          <div className="admin-line-role-denied">
            <Lock className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--admin-line-red)' }} />
            <p style={{ fontSize: 16, fontWeight: 900 }}>Access Denied</p>
            <p className="admin-line-sub" style={{ marginTop: 6 }}>Only admins can access system settings.</p>
            <Link href="/portal/dashboard" className="admin-line-primary" style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none' }}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-line-main">
      <div className="admin-line">
        <PageTitle title="System Settings" meta="4 sections" subtitle="Manage weekly goals, company details, scoring, and notifications." />

        <div className="admin-line-settings-grid">
          <WeeklyChallengeCard />

          <section className="admin-line-settings-card">
            <h2>Company</h2>
            <div className="admin-line-field">
              <label htmlFor="company-name">Company name</label>
              <input id="company-name" value="3C World Group" disabled readOnly />
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label htmlFor="support-email">Support email</label>
              <input id="support-email" type="email" value="support@3cworldgroup.com" disabled readOnly />
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label>Default role for new users</label>
              <div className="admin-line-segmented" role="group" aria-label="Default role">
                {['Field rep', 'Operations', 'Admin'].map((label, i) => (
                  <button key={label} type="button" aria-pressed={i === 0} disabled>
                    {label}
                  </button>
                ))}
              </div>
              <InertNote />
            </div>
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save changes
              </button>
              <InertNote />
            </div>
          </section>

          <section className="admin-line-settings-card">
            <h2>Sales and points</h2>
            <div className="admin-line-toggle-row">
              <div>
                <strong>Auto-approve sales</strong>
                <small>Trust the current submission path.</small>
              </div>
              <button type="button" className="admin-line-toggle" aria-pressed={false} disabled>
                <span />
              </button>
            </div>
            <div className="admin-line-field">
              <label>Points</label>
              <div className="admin-line-number-grid">
                <input aria-label="Minimum points" value={0} type="number" disabled readOnly />
                <input aria-label="Default points" value={10} type="number" disabled readOnly />
                <input aria-label="Maximum points" value={100} type="number" disabled readOnly />
              </div>
              <InertNote />
            </div>
            <div className="admin-line-field">
              <label>Leaderboard periods</label>
              <div className="admin-line-multi-toggle">
                {['Day', 'Week', 'Month', 'Quarter', 'Year', 'All-time'].map((label, i) => (
                  <button key={label} type="button" aria-pressed={i < 3} disabled>
                    {label}
                  </button>
                ))}
              </div>
              <InertNote />
            </div>
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save changes
              </button>
              <InertNote />
            </div>
          </section>

          <section className="admin-line-settings-card">
            <h2>Notifications</h2>
            {[
              { label: 'New sale', sub: 'Tell the admin desk when a sale arrives.', on: true },
              { label: 'Approved', sub: "Keep the rep's next step visible.", on: true },
              { label: 'Rejected', sub: 'Surface the reason, not just the state.', on: false },
              { label: 'Leaderboard changes', sub: 'Keep reps up to date when scores change.', on: true },
            ].map((row) => (
              <div className="admin-line-toggle-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.sub}</small>
                </div>
                <button type="button" className="admin-line-toggle" aria-pressed={row.on} disabled>
                  <span />
                </button>
              </div>
            ))}
            <div className="admin-line-save-line">
              <button type="button" className="admin-line-primary" disabled>
                Save changes
              </button>
              <InertNote />
            </div>
          </section>
        </div>

        <div className="admin-line-danger-room">
          <h2>Reset data</h2>
          <div className="admin-line-danger-actions">
            <div className="admin-line-danger-action">
              <strong>Reset sales</strong>
              <p>Clears saved sales data.</p>
              <button type="button" disabled>
                Reset sales
              </button>
              <div className="admin-line-danger-confirm">
                <input className="admin-line-danger-input" type="text" placeholder="Type RESET" aria-label="Type RESET to reset sales" disabled readOnly />
                <button type="button" className="confirm" disabled>
                  Confirm reset
                </button>
              </div>
              <InertNote />
            </div>
            <div className="admin-line-danger-action">
              <strong>Reset leaderboard</strong>
              <p>Returns leaderboard data to its starting state.</p>
              <button type="button" disabled>
                Reset leaderboard
              </button>
              <div className="admin-line-danger-confirm">
                <input className="admin-line-danger-input" type="text" placeholder="Type RESET" aria-label="Type RESET to reset leaderboard" disabled readOnly />
                <button type="button" className="confirm" disabled>
                  Confirm reset
                </button>
              </div>
              <InertNote />
            </div>
          </div>
          <p className="admin-line-sub" style={{ marginTop: 12 }}>
            These controls are disabled until the required permissions and audit steps are ready.
          </p>
        </div>
      </div>
    </div>
  );
}
