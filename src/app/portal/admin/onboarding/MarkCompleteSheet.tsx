'use client';

import { useState } from 'react';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { MANUAL_NOTE_MAX, MANUAL_NOTE_MIN } from '@/lib/onboarding/manualCompletion';

export interface MarkCompleteTarget {
  userId: string;
  itemId: string;
  itemLabel: string;
  repName: string;
}

/**
 * Owner-only: mark one onboarding item complete with a required note. The
 * route checks the owner role from the token; callers only decide whether to
 * offer the button.
 */
export function MarkCompleteSheet({
  target,
  onClose,
  onDone,
}: {
  target: MarkCompleteTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const trimmed = note.trim();
  const valid = trimmed.length >= MANUAL_NOTE_MIN && trimmed.length <= MANUAL_NOTE_MAX;

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
    <AdminSheet
      title={`Mark ${target.itemLabel} complete`}
      description={`For ${target.repName}. This skips review and signing. Your name and note are saved with it.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btnPrimary} ${u.primarySm}`}
            disabled={working || !valid}
            onClick={() => void confirm()}
          >
            {working ? 'Saving…' : 'Confirm'}
          </button>
        </>
      }
    >
      <div className={u.sheetPad}>
        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        ) : null}
        <div className={u.field}>
          <label className={u.label} htmlFor="onb-mark-complete-note">
            Note
          </label>
          <textarea
            id="onb-mark-complete-note"
            className={`${u.input} ${u.textarea}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Signed on paper 9/20"
            maxLength={MANUAL_NOTE_MAX}
            rows={3}
          />
        </div>
      </div>
    </AdminSheet>
  );
}
