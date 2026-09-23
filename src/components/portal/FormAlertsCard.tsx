'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import rep from '@/components/portal/rep/rep.module.css';
import { LoadFailed, SkeletonRows, cx } from '@/components/portal/admin-ops/AdminKit';
import s from '@/components/portal/admin-ops/admin-ops.module.css';

interface FormAlert {
  key: string;
  label: string;
  enabled: boolean;
}

// Admin control: per-form in-portal submission alerts (admins + operations get the
// bell notification). Lives on the Form Options page, in direction D.
export default function FormAlertsCard() {
  const [forms, setForms] = useState<FormAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/portal/forms/alerts');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load alerts');
      setForms(json.forms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const toggle = async (key: string, enabled: boolean) => {
    // Optimistic update; revert on failure.
    setForms((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
    const res = await authedFetch('/api/portal/forms/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, enabled }),
    });
    if (!res.ok) {
      setForms((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !enabled } : f)));
    }
  };

  return (
    <section className={cx(rep.panel, s.listPanel)} aria-labelledby="form-alerts-title">
      <div className={rep.panelHead}>
        <h2 id="form-alerts-title" className={rep.kicker}>
          Submission alerts
        </h2>
      </div>
      <p className={s.emptyBody} style={{ padding: '12px 16px 4px' }}>
        When on, admins and operations get a notification when this form is submitted.
      </p>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <LoadFailed what="alerts" onRetry={retry} />
      ) : (
        <ul className={s.switchList}>
          {forms.map((f) => (
            <li key={f.key} className={s.switchRow}>
              <span className={s.switchLabel} id={`alert-${f.key}`}>
                {f.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={f.enabled}
                aria-labelledby={`alert-${f.key}`}
                className={s.switch}
                onClick={() => toggle(f.key, !f.enabled)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
