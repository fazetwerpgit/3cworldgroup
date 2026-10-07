'use client';

import { useId, useState } from 'react';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { MANUAL_NOTE_MAX, MANUAL_NOTE_MIN } from '@/lib/onboarding/manualCompletion';

export interface MarkCompleteTarget {
  userId: string;
  itemId: string;
  itemLabel: string;
}

/**
 * Owner-only: mark one onboarding item complete with a required note, shown
 * under the item in the Check sheet. The route checks the owner role from the
 * token; callers only decide whether to offer it.
 */
export function MarkCompleteForm({
  target,
  onCancel,
  onDone,
}: {
  target: MarkCompleteTarget;
  onCancel: () => void;
  onDone: () => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const trimmed = note.trim();
  const valid = trimmed.length >= MANUAL_NOTE_MIN && trimmed.length <= MANUAL_NOTE_MAX;
  // Shown once they start typing, not on an empty box.
  const tooShort = trimmed.length > 0 && trimmed.length < MANUAL_NOTE_MIN;

  const confirm = async () => {
    setWorking(true);
    setError('');
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/onboarding/mark-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ userId: target.userId, itemId: target.itemId, note: trimmed }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to mark complete');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark complete');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={u.field}>
      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}
      <label className={u.label} htmlFor={noteId}>
        Why is {target.itemLabel} done? Your name and note are saved with it.
      </label>
      <textarea
        id={noteId}
        className={`${u.input} ${u.textarea}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Signed on paper 9/20"
        maxLength={MANUAL_NOTE_MAX}
        rows={2}
        aria-describedby={tooShort ? `${noteId}-hint` : undefined}
      />
      {tooShort ? (
        <p id={`${noteId}-hint`} className={u.hint}>
          At least {MANUAL_NOTE_MIN} characters
        </p>
      ) : null}
      <div className={u.btnRow}>
        <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={onCancel} disabled={working}>
          Cancel
        </button>
        <button
          type="button"
          className={`${s.btnPrimary} ${u.primarySm}`}
          disabled={working || !valid}
          onClick={() => void confirm()}
        >
          {working ? 'Saving…' : 'Mark complete'}
        </button>
      </div>
    </div>
  );
}
