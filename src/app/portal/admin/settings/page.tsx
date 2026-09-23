'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { AdminEmpty, AdminFailed, AdminNotice, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import st from './admin-settings.module.css';

const WEEKLY_CHALLENGE_PRESETS = [
  { value: 3, descriptor: 'Warm\u2011up' },
  { value: 5, descriptor: 'Steady' },
  { value: 7, descriptor: 'Standard' },
  { value: 10, descriptor: 'Hard' },
  { value: 15, descriptor: 'Beast mode' },
];

/** Panel title row: kicker on the left, a status or tag on the right. */
function PanelHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className={s.panelHead}>
      <h2 id={id} className={s.kicker}>
        {title}
      </h2>
      {children}
    </div>
  );
}

const NotYet = () => <span className={u.tag}>Not available yet</span>;

function WeeklyChallengeCard() {
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
        if (!cancelled) {
          setTarget(data.targetSales);
          setLoadFailed(false);
        }
      } catch {
        // Never present a made-up target as the live one: say it failed and offer a retry.
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    setAttempt((value) => value + 1);
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
    <section className={`${s.panel} ${st.span}`} aria-labelledby="set-weekly">
      <PanelHead id="set-weekly" title="Weekly challenge">
        {loadFailed ? null : <span className={`${u.status} ${u.toneLime}`}>Live</span>}
      </PanelHead>

      {loadFailed ? (
        <AdminFailed what="the current target" onRetry={retry} />
      ) : loading ? (
        <div className={`${u.panelBody} ${st.stack}`} role="status" aria-label="Loading current target">
          <span className={s.skel} style={{ width: 120, height: 14 }} aria-hidden="true" />
          <span className={st.presets} aria-hidden="true">
            {WEEKLY_CHALLENGE_PRESETS.map((preset) => (
              <span key={preset.value} className={s.skel} style={{ height: 72 }} />
            ))}
          </span>
        </div>
      ) : (
        <div className={`${u.panelBody} ${st.stack}`}>
          <div className={st.weeklyGrid}>
            <div className={u.field}>
              <span className={u.label} id="weekly-presets-label">
                Target sales
              </span>
              <div className={st.presets} role="group" aria-labelledby="weekly-presets-label">
                {WEEKLY_CHALLENGE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={st.preset}
                    aria-pressed={target === preset.value}
                    onClick={() => {
                      setTarget(preset.value);
                      setSaved(false);
                      setError(null);
                    }}
                  >
                    <strong>{preset.value}</strong>
                    <span>{preset.descriptor}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={`${u.field} ${st.custom}`}>
              <label className={u.label} htmlFor="weekly-challenge-custom">
                Custom (1–99)
              </label>
              <input
                id="weekly-challenge-custom"
                className={`${u.input} ${!isPreset && target !== null ? st.customActive : ''}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={!isPreset && target !== null ? target : ''}
                placeholder={isPreset ? String(target) : '—'}
                onChange={(e) => {
                  handleCustomChange(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
          </div>

          <div className={st.preview}>
            <span className={s.kicker}>Reps will see</span>
            <strong>
              Close {target ?? '—'} {target === 1 ? 'sale' : 'sales'} by Saturday
            </strong>
          </div>

          {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
          {saved ? <AdminNotice tone="ok">Saved. Live on the leaderboard now.</AdminNotice> : null}

          <div className={u.btnRow}>
            <button
              type="button"
              className={`${s.btnPrimary} ${u.primarySm}`}
              disabled={saving || loading}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** A disabled on/off row (inert until the setting is wired up). */
function InertToggle({ label, sub, on }: { label: string; sub: string; on: boolean }) {
  return (
    <div className={st.toggleRow}>
      <div className={st.rowText}>
        <strong>{label}</strong>
        <span>{sub}</span>
      </div>
      <button type="button" className={u.switch} aria-pressed={on} aria-label={label} disabled />
    </div>
  );
}

export default function AdminSettingsPage() {
  const { isRole } = useAuth();
  const isAdmin = isRole('admin');

  if (!isAdmin) {
    return (
      <div className={u.page}>
        <AdminPageHead title="System Settings" />
        <section className={s.panel}>
          <AdminEmpty
            icon={<Lock size={28} aria-hidden="true" />}
            title="Admin access required"
            action={
              <Link href="/portal/dashboard" className={`${s.btnSecondary} ${u.sm}`}>
                Back to Dashboard
              </Link>
            }
          >
            Only admins can access system settings.
          </AdminEmpty>
        </section>
      </div>
    );
  }

  return (
    <div className={u.page}>
      <AdminPageHead
        title="System Settings"
        sub="The weekly challenge is live. Company, scoring, notification and reset settings are not wired up yet."
      />

      <div className={st.grid}>
        <WeeklyChallengeCard />

        <section className={s.panel} aria-labelledby="set-company">
          <PanelHead id="set-company" title="Company">
            <NotYet />
          </PanelHead>
          <div className={`${u.panelBody} ${u.formGrid}`}>
            <div className={u.field}>
              <label className={u.label} htmlFor="company-name">
                Company name
              </label>
              <input id="company-name" className={u.input} value="3C World Group" disabled readOnly />
            </div>
            <div className={u.field}>
              <label className={u.label} htmlFor="support-email">
                Support email
              </label>
              <input
                id="support-email"
                className={u.input}
                type="email"
                value="support@3cworldgroup.com"
                disabled
                readOnly
              />
            </div>
            <div className={u.field}>
              <span className={u.label} id="default-role-label">
                Default role for new users
              </span>
              <div className={u.segmented} role="group" aria-labelledby="default-role-label">
                {['Field rep', 'Operations', 'Admin'].map((label, i) => (
                  <button key={label} type="button" aria-pressed={i === 0} disabled>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={s.panel} aria-labelledby="set-sales">
          <PanelHead id="set-sales" title="Sales and points">
            <NotYet />
          </PanelHead>
          <div className={`${u.panelBody} ${u.formGrid}`}>
            <InertToggle label="Auto-approve sales" sub="Trust the current submission path." on={false} />
            <div className={u.field}>
              <span className={u.label}>Points: minimum, default, maximum</span>
              <div className={st.numberGrid}>
                <input aria-label="Minimum points" className={u.input} value={0} type="number" disabled readOnly />
                <input aria-label="Default points" className={u.input} value={10} type="number" disabled readOnly />
                <input aria-label="Maximum points" className={u.input} value={100} type="number" disabled readOnly />
              </div>
            </div>
            <div className={u.field}>
              <span className={u.label} id="lb-periods-label">
                Leaderboard periods
              </span>
              <div className={st.chipWrap} role="group" aria-labelledby="lb-periods-label">
                {['Day', 'Week', 'Month', 'Quarter', 'Year', 'All-time'].map((label, i) => (
                  <button key={label} type="button" className={u.chip} aria-pressed={i < 3} disabled>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={s.panel} aria-labelledby="set-notify">
          <PanelHead id="set-notify" title="Notifications">
            <NotYet />
          </PanelHead>
          <div className={st.list}>
            {[
              { label: 'New sale', sub: 'Tell the admin desk when a sale arrives.', on: true },
              { label: 'Approved', sub: "Keep the rep's next step visible.", on: true },
              { label: 'Rejected', sub: 'Surface the reason, not just the state.', on: false },
              { label: 'Leaderboard changes', sub: 'Keep reps up to date when scores change.', on: true },
            ].map((row) => (
              <InertToggle key={row.label} label={row.label} sub={row.sub} on={row.on} />
            ))}
          </div>
        </section>

        <section className={s.panel} aria-labelledby="set-reset">
          <PanelHead id="set-reset" title="Reset data">
            <NotYet />
          </PanelHead>
          <div className={st.list}>
            {[
              { label: 'Reset sales', sub: 'Clears saved sales data.' },
              { label: 'Reset leaderboard', sub: 'Returns leaderboard data to its starting state.' },
            ].map((row) => (
              <div key={row.label} className={st.toggleRow}>
                <div className={st.rowText}>
                  <strong>{row.label}</strong>
                  <span>{row.sub}</span>
                </div>
                <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.danger}`} disabled>
                  {row.label}
                </button>
              </div>
            ))}
          </div>
          <p className={st.footnote}>
            These controls stay disabled until the required permissions and audit steps are ready.
          </p>
        </section>
      </div>
    </div>
  );
}
