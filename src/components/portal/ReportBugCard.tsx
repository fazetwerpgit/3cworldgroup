'use client';

import { useEffect, useState } from 'react';
import { Bug, CheckCircle2, Send } from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const AREAS = ['Forms', 'Sales', 'Onboarding', 'Chat', 'Leaderboard', 'Other'];

// Available to every role in Settings. Files a bug report that lands in the admin
// Bug Reports list and pings admins' notification bell.
export default function ReportBugCard() {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState('Forms');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Auto-open the form when arriving via the header "Report a Bug" link.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#report-bug') {
      setOpen(true);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const res = await fetch('/api/portal/forms/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ area, summary, details, pageUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setDone(true);
      setSummary('');
      setDetails('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="report-bug" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
            <Bug className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">Report a Bug</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
              Found something broken? Let us know and it goes straight to the team.
            </p>
          </div>
        </div>
        {!open && !done && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Report a bug
          </Button>
        )}
      </div>

      {done ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          Thanks — your report was sent to the team.
        </div>
      ) : (
        open && (
          <form onSubmit={submit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">{error}</div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Area</Label>
                <NativeSelect value={area} onChange={(e) => setArea(e.target.value)} className="w-full">
                  {AREAS.map((a) => (
                    <NativeSelectOption key={a} value={a}>{a}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label>Short summary</Label>
                <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What went wrong?" required />
              </div>
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What were you doing? What did you expect to happen?"
                rows={4}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || !summary} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                <Send className="size-4" />
                {saving ? 'Sending…' : 'Send report'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )
      )}
    </div>
  );
}
