'use client';

import { useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { nativeHaptic } from '@/lib/app/bridge';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

/** What the person types to confirm. */
export const DELETE_CONFIRM_WORD = 'DELETE';

export function deleteConfirmMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

// Self-service account deletion (SPEC A3). Settings shows it in the 3C iOS
// app only (Jacob 2026-10-16); on the web, deletion is by request.
// Behind a typed confirmation; the server (DELETE /api/portal/auth/me)
// disables the sign-in and anonymizes the profile. Sales and pay records,
// with the names on them, are kept for payroll, as /privacy says.
export default function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setTyped('');
    setError('');
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteConfirmMatches(typed)) {
      setError(`Type ${DELETE_CONFIRM_WORD} to confirm.`);
      return;
    }
    setWorking(true);
    setError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/portal/auth/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Couldn't delete your account. Try again.");
        setWorking(false);
        return;
      }
      nativeHaptic('success');
      // The sign-in is closed server-side; drop the local session too.
      try {
        await signOut();
      } catch {
        // The profile listener signs the closed account out anyway.
      }
      window.location.assign('/portal');
    } catch {
      setError('No signal. Check your connection and try again.');
      setWorking(false);
    }
  };

  return (
    <section className={s.panel} aria-label="Delete account">
      <button
        type="button"
        className={st.toggle}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span>
          <Trash2 size={20} aria-hidden="true" />
          Delete account
        </span>
        <ChevronDown size={18} className={st.toggleChev} aria-hidden="true" />
      </button>
      {open ? (
        <div className={st.drawer}>
          <form onSubmit={handleDelete} className={st.stack}>
            <p className={p.hint}>
              This closes your portal account for good. You will be signed out and can&apos;t sign back in. Your
              profile details, contact info, ID documents and devices are removed, and your chat messages show as
              &ldquo;Deleted user.&rdquo; Your name stays on the sales and pay records the company must keep for
              payroll and carrier reconciliation.
            </p>
            <label className={p.field}>
              <span className={p.label}>Type {DELETE_CONFIRM_WORD} to confirm</span>
              <input
                className={p.input}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
              />
            </label>
            {error ? (
              <div className={`${p.notice} ${p.noticeRed}`} role="alert">
                <span>{error}</span>
              </div>
            ) : null}
            <div className={st.actions}>
              <button type="button" className={s.btnSecondary} onClick={close} disabled={working}>
                Cancel
              </button>
              <button type="submit" className={s.btnPrimary} disabled={working || !deleteConfirmMatches(typed)}>
                {working ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
