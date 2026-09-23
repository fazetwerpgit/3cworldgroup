'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import FormAlertsCard from '@/components/portal/FormAlertsCard';
import {
  EDITABLE_OPTION_KEYS,
  FORM_OPTION_DEFAULTS,
  FORM_OPTION_LABELS,
  OptionKey,
} from '@/lib/forms/formOptionsRegistry';
import { Check, Plus, X } from 'lucide-react';
import rep from '@/components/portal/rep/rep.module.css';
import { AdminHead, Banner, LoadFailed, SkeletonRows, cx } from '@/components/portal/admin-ops/AdminKit';
import s from '@/components/portal/admin-ops/admin-ops.module.css';

export default function AdminFormOptionsPage() {
  const { user } = useAuth();
  const [options, setOptions] = useState<Record<OptionKey, string[]>>(FORM_OPTION_DEFAULTS);
  const [drafts, setDrafts] = useState<Record<OptionKey, string>>(() => {
    const initial = {} as Record<OptionKey, string>;
    for (const key of EDITABLE_OPTION_KEYS) initial[key] = '';
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<OptionKey | null>(null);
  const [successKey, setSuccessKey] = useState<OptionKey | null>(null);
  const [error, setError] = useState('');
  // Last server copy, so each list can say when it has unsaved edits.
  const [savedOptions, setSavedOptions] = useState<Record<OptionKey, string[]>>(FORM_OPTION_DEFAULTS);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
    });
  }, []);

  const loadOptions = useCallback(async () => {
    if (!user) return;
    try {
      setError('');
      const res = await authedFetch('/api/portal/forms/options');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load form options');
      if (json.options) {
        setOptions(json.options);
        setSavedOptions(json.options);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load form options');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // A failed first load shows "Couldn't load · Retry" (never the built-in defaults as
  // if they were live); later save errors show a banner.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loading && !error) setLoaded(true);
  }, [loading, error]);
  const loadFailed = !loading && !loaded && Boolean(error);
  const retry = () => {
    setError('');
    setLoading(true);
    loadOptions();
  };

  const removeValue = (key: OptionKey, index: number) => {
    setOptions((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
    setSuccessKey(null);
  };

  const addValue = (key: OptionKey) => {
    const value = drafts[key].trim();
    if (!value) return;
    setOptions((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key] : [...prev[key], value],
    }));
    setDrafts((prev) => ({ ...prev, [key]: '' }));
    setSuccessKey(null);
  };

  const saveValues = async (key: OptionKey) => {
    try {
      setError('');
      setSavingKey(key);
      setSuccessKey(null);
      const res = await authedFetch('/api/portal/forms/options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, values: options[key] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save options');
      setSavedOptions((prev) => ({ ...prev, [key]: options[key] }));
      setSuccessKey(key);
      setTimeout(() => setSuccessKey((current) => (current === key ? null : current)), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save options');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <ProtectedRoute roles={['admin']}>
      <div className={s.page}>
        <AdminHead
          kicker="Admin"
          title="Form Options"
          lede="The choices reps see in form dropdowns. Each list saves on its own."
          count={loading || loadFailed ? null : EDITABLE_OPTION_KEYS.length}
          countLabel="lists"
        />

        {error && !loadFailed ? <Banner tone="error">{error}</Banner> : null}

        {loading ? (
          <section className={cx(rep.panel, s.listPanel)}>
            <SkeletonRows rows={4} />
          </section>
        ) : loadFailed ? (
          <section className={cx(rep.panel, s.listPanel)}>
            <LoadFailed what="form options" onRetry={retry} />
          </section>
        ) : (
          <div className={s.oGrid}>
            {EDITABLE_OPTION_KEYS.map((key) => {
              const inputId = `option-add-${key}`;
              const count = options[key].length;
              const dirty = JSON.stringify(options[key]) !== JSON.stringify(savedOptions[key]);
              return (
                <section key={key} className={cx(rep.panel, s.oCard)} aria-labelledby={`${inputId}-title`}>
                  <div className={rep.panelHead}>
                    <h2 id={`${inputId}-title`} className={rep.kicker}>
                      {FORM_OPTION_LABELS[key]}
                    </h2>
                    <span className={s.panelCount}>
                      {count} option{count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className={s.oBody}>
                    {count === 0 ? (
                      <p className={s.muted} style={{ margin: 0 }}>
                        No options yet.
                      </p>
                    ) : (
                      <ul className={s.chips}>
                        {options[key].map((value, index) => (
                          <li key={`${value}-${index}`} className={s.chip}>
                            {value}
                            <button
                              type="button"
                              className={s.chipX}
                              aria-label={`Remove ${value}`}
                              onClick={() => removeValue(key, index)}
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className={s.addRow}>
                      <label htmlFor={inputId} className={rep.srOnly}>
                        Add to {FORM_OPTION_LABELS[key]}
                      </label>
                      <input
                        id={inputId}
                        className={s.input}
                        value={drafts[key]}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addValue(key);
                          }
                        }}
                        placeholder="Type a value"
                        enterKeyHint="done"
                      />
                      <button type="button" className={s.btn} onClick={() => addValue(key)} disabled={!drafts[key].trim()}>
                        <Plus size={16} aria-hidden="true" />
                        Add
                      </button>
                    </div>
                  </div>
                  <div className={s.oFoot}>
                    {successKey === key ? (
                      <span className={s.saved} role="status">
                        <Check size={16} aria-hidden="true" />
                        Saved
                      </span>
                    ) : dirty ? (
                      <span className={s.unsaved}>Unsaved changes</span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className={dirty ? s.btnLime : s.btn}
                      onClick={() => saveValues(key)}
                      disabled={savingKey === key}
                    >
                      {savingKey === key ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <FormAlertsCard />
        <p className={s.footnote}>
          Leads categories and reasons can&apos;t be edited here because they control which fields appear on the Leads
          Request form.
        </p>
      </div>
    </ProtectedRoute>
  );
}
