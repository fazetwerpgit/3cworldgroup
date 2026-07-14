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
import { AdminCatalogCard, AdminCatalogList } from '@/components/admin/AdminCatalogList';

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
      if (json.options) setOptions(json.options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load form options');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

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
      <AdminCatalogList
        kicker="catalog / form options"
        heroAccent="Keep every record"
        heroPlain="ready to reuse."
        intro="Edit dropdown lists used by portal forms. Saved changes are used by reps and server-side validation."
        heroCount={EDITABLE_OPTION_KEYS.length}
        heroCountLabel="option lists on file"
        loading={loading}
        loadingLabel="Loading form options…"
        error={error || null}
        success={null}
        isEmpty={false}
        isFilteredEmpty={false}
        emptyTrue={{ title: 'No lists.', body: '' }}
        emptyFiltered={{ title: 'No lists match.', body: '' }}
      >
        {EDITABLE_OPTION_KEYS.map((key) => (
          <AdminCatalogCard
            key={key}
            eyebrow="form options"
            title={FORM_OPTION_LABELS[key]}
            statusLabel={successKey === key ? 'saved' : undefined}
            statusTone="lime"
            metaLeft={`${options[key].length} option${options[key].length === 1 ? '' : 's'}`}
            extra={
              <div style={{ marginTop: 10 }}>
                <div className="admin-line-value-chips" style={{ marginBottom: 10 }}>
                  {options[key].length === 0 ? (
                    <span className="admin-line-meta">No options yet.</span>
                  ) : (
                    options[key].map((value, index) => (
                      <span key={`${value}-${index}`} className="admin-line-value-chip" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {value}
                        <button
                          type="button"
                          aria-label={`Remove ${value}`}
                          onClick={() => removeValue(key, index)}
                          style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 900 }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="admin-line-search"
                    style={{ flex: '1 1 auto' }}
                    value={drafts[key]}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addValue(key);
                      }
                    }}
                    placeholder="Type a value"
                  />
                  <button type="button" className="admin-line-action" onClick={() => addValue(key)}>
                    Add value
                  </button>
                </div>
              </div>
            }
            actions={
              <button type="button" className="admin-line-primary" onClick={() => saveValues(key)} disabled={savingKey === key}>
                {savingKey === key ? 'Saving…' : 'Save inline'}
              </button>
            }
          />
        ))}
      </AdminCatalogList>

      <div className="admin-line-main">
        <div className="admin-line" style={{ paddingTop: 0 }}>
          <FormAlertsCard />
          <p className="admin-line-sub" style={{ marginTop: 12 }}>
            Leads categories and reasons cannot be edited here because they control which fields
            appear on the Leads Request form.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
