'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import {
  EDITABLE_OPTION_KEYS,
  FORM_OPTION_DEFAULTS,
  FORM_OPTION_LABELS,
  OptionKey,
} from '@/lib/forms/formOptionsRegistry';

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

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const removeValue = (key: OptionKey, index: number) => {
    setOptions((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
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
      <div className="mx-auto max-w-[1200px] space-y-5">
        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
              Form Options
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
              Edit dropdown lists used by portal forms. Saved changes are used by reps and server-side validation.
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
            <CardContent className="py-10 text-center text-sm text-slate-600 dark:text-muted-foreground">
              Loading form options...
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {EDITABLE_OPTION_KEYS.map((key) => (
              <Card key={key} className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
                <CardHeader className="border-b border-slate-200 px-5 py-4 dark:border-border">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">
                        {FORM_OPTION_LABELS[key]}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                        {options[key].length} option{options[key].length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => saveValues(key)}
                      disabled={savingKey === key}
                      className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                    >
                      {savingKey === key ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  {successKey === key && (
                    <div className="rounded-md border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-3 py-2 text-sm text-[#4f7f1e] dark:text-green-300 dark:text-[#b9e78a]">
                      Saved updated options.
                    </div>
                  )}

                  <div className="space-y-2">
                    {options[key].length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
                        No options. Add one below.
                      </p>
                    ) : (
                      options[key].map((value, index) => (
                        <div key={`${value}-${index}`} className="flex items-center gap-2">
                          <Input
                            value={value}
                            onChange={(e) => {
                              const next = [...options[key]];
                              next[index] = e.target.value;
                              setOptions((prev) => ({ ...prev, [key]: next }));
                              setSuccessKey(null);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeValue(key, index)}
                            aria-label={`Remove ${value}`}
                            className="shrink-0"
                          >
                            ×
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-4 dark:border-border">
                    <Label htmlFor={`add-${key}`} className="mb-2 text-slate-700 dark:text-muted-foreground">
                      Add option
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id={`add-${key}`}
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
                      <Button type="button" variant="outline" onClick={() => addValue(key)}>
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="rounded-lg border-slate-200 bg-slate-50 py-0 shadow-sm dark:border-border dark:bg-muted">
          <CardContent className="p-5 text-sm text-slate-600 dark:text-muted-foreground">
            Leads categories and reasons cannot be edited here because they control which fields appear on the Leads Request form.
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
