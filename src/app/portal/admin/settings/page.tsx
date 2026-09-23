'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase/config';
import { AdminFailed, AdminGate, AdminNotice, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
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
    <section className={s.panel} aria-labelledby="set-weekly">
      <PanelHead id="set-weekly" title="Weekly challenge">
        {loading || loadFailed ? null : <span className={`${u.status} ${u.toneLime}`}>Live</span>}
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

export default function AdminSettingsPage() {
  return (
    <AdminGate roles={['admin']}>
      <div className={u.page}>
        <AdminPageHead title="System Settings" />
        <WeeklyChallengeCard />
      </div>
    </AdminGate>
  );
}
