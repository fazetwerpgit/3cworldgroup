'use client';

import { useEffect, useState } from 'react';
import { Bug, CheckCircle2, Send } from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
    <section id="report-bug" className="member-line-panel member-line-bug">
      <div className="member-line-panel-head">
        <div>
          <p className="member-line-eyebrow">02 / call the desk</p>
          <h2>Report a bug</h2>
          <p className="member-line-sub">The current page URL attaches automatically.</p>
        </div>
        <span className="member-line-meta">quick access</span>
      </div>

      {done ? (
        <div className="member-line-note flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          Thanks — your report was sent to the team.
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="member-line-note warn mb-3">{error}</div>}
          {!open ? (
            <button type="button" className="member-line-button primary small" onClick={() => setOpen(true)}>
              <Bug className="mr-1.5 inline size-3.5" />
              Report a bug
            </button>
          ) : (
            <>
              <div className="member-line-field">
                <label>Area / choose one</label>
                <div className="member-line-segmented" role="group" aria-label="Bug area">
                  {AREAS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={area === a}
                      onClick={() => setArea(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="member-line-field" style={{ marginTop: 13 }}>
                <label htmlFor="member-bug-summary">Short summary / required</label>
                <Input
                  id="member-bug-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="What went wrong?"
                  required
                />
              </div>
              <div className="member-line-field" style={{ marginTop: 12 }}>
                <label htmlFor="member-bug-details">Details / optional</label>
                <Textarea
                  id="member-bug-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What were you doing? What did you expect to happen?"
                  rows={4}
                />
              </div>
              <div className="member-line-actions">
                <button
                  type="submit"
                  className="member-line-button primary small"
                  disabled={saving || !summary}
                >
                  <Send className="mr-1.5 inline size-3.5" />
                  {saving ? 'Sending…' : 'Send report'}
                </button>
                <button
                  type="button"
                  className="member-line-button small"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
