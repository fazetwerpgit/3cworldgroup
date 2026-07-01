'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface FormAlert {
  key: string;
  label: string;
  enabled: boolean;
}

// Admin control: per-form in-portal submission alerts (admins + operations get the
// bell notification). Lives on the Form Options page.
export default function FormAlertsCard() {
  const [forms, setForms] = useState<FormAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  useEffect(() => {
    (async () => {
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
    })();
  }, [authedFetch]);

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
    <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
      <CardHeader className="border-b border-slate-200 px-5 py-4 dark:border-border">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
            <Bell className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">Submission Alerts</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              When on, admins and operations get a notification when this form is submitted.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-border">
            {forms.map((f) => (
              <li key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-800 dark:text-foreground">{f.label}</span>
                <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v === true)} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
