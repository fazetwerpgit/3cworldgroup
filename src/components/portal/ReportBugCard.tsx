'use client';

import { useEffect, useState } from 'react';
import { Bug, CheckCircle2, ChevronDown, Send } from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { Collapse } from './Collapse';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

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

  // Auto-open the form when arriving via the account menu's "Report a bug"
  // link, and also when that link is tapped while already on Settings: Next
  // changes only the hash then (pushState, no hashchange), so the tap itself
  // is caught too.
  useEffect(() => {
    const openIfAsked = () => {
      if (window.location.hash === '#report-bug') setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href$="#report-bug"]') : null;
      if (!link) return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById('report-bug')?.scrollIntoView({ block: 'start' }));
    };
    openIfAsked();
    window.addEventListener('hashchange', openIfAsked);
    window.addEventListener('popstate', openIfAsked);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', openIfAsked);
      window.removeEventListener('popstate', openIfAsked);
      document.removeEventListener('click', onClick, true);
    };
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
    <section id="report-bug" className={s.panel} aria-label="Report a bug">
      <button type="button" className={st.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          <Bug size={20} aria-hidden="true" />
          Found a problem? Report a bug
        </span>
        <ChevronDown size={18} className={st.toggleChev} aria-hidden="true" />
      </button>

      <Collapse open={open} className={st.drawer}>
          {done ? (
            <div className={`${p.notice} ${p.noticeLime}`} role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Thanks. Your report went to the team.</span>
            </div>
          ) : (
            <form onSubmit={submit} className={st.stack}>
              {error && (
                <p className={`${p.hint} ${p.hintError}`} role="alert">
                  {error}
                </p>
              )}
              <div className={p.field}>
                <span className={p.label} id="member-bug-area">Where did it happen?</span>
                <div className={st.areas} role="group" aria-labelledby="member-bug-area">
                  {AREAS.map((a) => (
                    <button key={a} type="button" className={p.chip} aria-pressed={area === a} onClick={() => setArea(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <label className={p.field}>
                <span className={p.label}>Short summary</span>
                <input
                  id="member-bug-summary"
                  className={p.input}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="What went wrong?"
                  required
                />
              </label>
              <label className={p.field}>
                <span className={p.label}>Details (optional)</span>
                <textarea
                  id="member-bug-details"
                  className={`${p.input} ${p.textarea}`}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What were you doing? What did you expect to happen?"
                  rows={4}
                />
              </label>
              <div className={st.actions}>
                <button type="button" className={s.btnSecondary} onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={s.btnPrimary} disabled={saving || !summary}>
                  <Send size={18} aria-hidden="true" />
                  {saving ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          )}
      </Collapse>
    </section>
  );
}
