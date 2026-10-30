'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { latestRequest } from '@/lib/fetch/latestRequest';
import { AdminFailed, AdminNotice, AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import p from './pipeline.module.css';
import {
  Channel,
  ChannelOnboardingStatus,
  DecommissionReason,
  DecommissionReasonLabels,
  type PipelineRep,
} from '@/types';
import { authHeaders, formatMissingItems, type Notice } from './Invites';

// What Hiring can do with someone who has an account (the pipeline routes,
// unchanged): activate them once their paperwork is approved, request field
// training, set their channels, decommission and reinstate. Every route
// verifies the caller from the ID token; decommission stays management only.

interface ChannelRow extends Channel {
  status: ChannelOnboardingStatus;
  reference: string | null;
}

export function useTeamActions({
  reload,
  onChanged,
  notify,
}: {
  reload: () => Promise<unknown>;
  onChanged?: () => void;
  notify: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const requestFieldTraining = async (rep: PipelineRep) => {
    setBusy(true);
    notify(null);
    try {
      const response = await fetch('/api/portal/pipeline/field-train', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to send request');
      notify({ tone: 'ok', text: typeof json.message === 'string' ? json.message : 'Field training requested.' });
    } catch (err) {
      notify({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to send request' });
    } finally {
      setBusy(false);
    }
  };

  /** Activates an account whose paperwork is all approved (no invite to convert). */
  const activateRep = async (rep: PipelineRep): Promise<boolean> => {
    setBusy(true);
    notify(null);
    try {
      const response = await fetch('/api/portal/onboarding/activate', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const missing = formatMissingItems(json.missing);
        throw new Error(
          missing ? `Can't activate ${rep.displayName} yet. Missing: ${missing}` : json.error || 'Failed to activate'
        );
      }
      notify({ tone: 'ok', text: `${rep.displayName} is activated.` });
      await reload();
      onChanged?.();
      return true;
    } catch (err) {
      notify({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to activate' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** The caller confirms first (the person sheet asks inline). */
  const reinstate = async (rep: PipelineRep): Promise<boolean> => {
    setBusy(true);
    notify(null);
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'DELETE',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to reinstate');
      notify({ tone: 'ok', text: `${rep.displayName} reinstated.` });
      await reload();
      return true;
    } catch (err) {
      notify({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to reinstate' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, requestFieldTraining, activateRep, reinstate };
}

/** Channels for one rep: Xfinity direct, the rest via DSI, each Not started / Submitted / Cleared. */
export function ChannelsSheet({
  rep,
  onClose,
  onChanged,
}: {
  rep: PipelineRep;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Answers for a sheet that was closed are dropped.
  const [request] = useState(latestRequest);
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
      request.cancel();
    },
    [request]
  );

  const load = async () => {
    const { signal, isCurrent } = request.start();
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/portal/pipeline/channels?userId=${encodeURIComponent(rep.uid)}`, {
        headers: await authHeaders(),
        signal,
      });
      const json = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(json.error || 'Failed to load channels');
      setRows(json.channels);
    } catch {
      if (isCurrent()) setFailed(true);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per sheet (keyed by rep)
  }, []);

  const setStatus = async (channelId: string, status: ChannelOnboardingStatus) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid, channelId, status }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update channel');
      if (open.current) setRows((prev) => prev.map((c) => (c.id === channelId ? { ...c, status } : c)));
      await onChanged();
    } catch (err) {
      if (open.current) setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      if (open.current) setBusy(false);
    }
  };

  return (
    <AdminSheet
      title={`Channels · ${rep.displayName}`}
      description="Xfinity is credentialed directly; all other channels go through DSI."
      onClose={onClose}
      footer={
        <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className={u.sheetPad}>
        {error ? <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice> : null}
        {loading ? (
          <AdminSkeletonRows rows={3} label="Loading channels" />
        ) : failed ? (
          <AdminFailed what="channels" onRetry={() => void load()} />
        ) : (
          <ul className={p.channelList}>
            {rows.map((channel) => {
              const selectId = `channel-${channel.id}`;
              return (
                <li key={channel.id} className={p.channelRow}>
                  <label htmlFor={selectId} className={p.channelName}>
                    <strong>{channel.name}</strong>
                    <span>{channel.credentialingPath === 'direct' ? 'Direct' : 'via DSI'}</span>
                  </label>
                  <span className={`${u.selectWrap} ${p.channelSelect}`}>
                    <select
                      id={selectId}
                      className={u.input}
                      value={channel.status}
                      disabled={busy}
                      onChange={(e) => void setStatus(channel.id, e.target.value as ChannelOnboardingStatus)}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="submitted">Submitted</option>
                      <option value="cleared">Cleared</option>
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminSheet>
  );
}

/** Decommission: a reason and optional notes, then the account is turned off (and can be reinstated). */
export function DecommissionSheet({
  rep,
  onClose,
  onDone,
}: {
  rep: PipelineRep;
  onClose: () => void;
  onDone: (message: string) => Promise<unknown> | void;
}) {
  const [reason, setReason] = useState<DecommissionReason>('non_activity');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Confirm asks once more inline, like the person sheet's other destructive actions.
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (asking) askRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [asking]);

  const confirm = async () => {
    setAsking(false);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid, reason, notes }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to decommission');
      await onDone(typeof json.message === 'string' ? json.message : `${rep.displayName} decommissioned.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decommission');
      setBusy(false);
    }
  };

  return (
    <AdminSheet
      tone="danger"
      title={`Decommission ${rep.displayName}`}
      description="This deactivates the account and records the reason. The account and sales history are preserved and can be reinstated."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
            disabled={busy || asking}
            onClick={() => setAsking(true)}
          >
            {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </>
      }
    >
      <div className={u.sheetPad}>
        {error ? <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice> : null}
        <fieldset className={p.fieldset}>
          <legend className={u.label}>Reason</legend>
          <div className={p.choices}>
            {(Object.entries(DecommissionReasonLabels) as [DecommissionReason, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={p.choice}
                aria-pressed={reason === value}
                onClick={() => setReason(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={u.field}>
          <label htmlFor="decommission-notes" className={u.label}>Notes (optional)</label>
          <textarea
            id="decommission-notes"
            className={`${u.input} ${u.textarea}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context for the audit record"
            rows={3}
          />
        </div>
        {asking ? (
          <div className={u.confirm} role="alert" ref={askRef}>
            <span>Decommission {rep.displayName}? Their account is turned off until someone reinstates it.</span>
            <span className={u.btnRow}>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                disabled={busy}
                onClick={() => void confirm()}
              >
                Yes, decommission
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </AdminSheet>
  );
}
