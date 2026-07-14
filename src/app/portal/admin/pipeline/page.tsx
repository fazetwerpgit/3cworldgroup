'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import {
  PipelineRep,
  PipelineStage,
  PipelineStageConfig,
  PIPELINE_STAGE_ORDER,
  DecommissionReason,
  DecommissionReasonLabels,
  RoleDisplayNames,
  Channel,
  ChannelOnboardingStatus,
} from '@/types';

interface ChannelRow extends Channel {
  status: ChannelOnboardingStatus;
  reference: string | null;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [reps, setReps] = useState<PipelineRep[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | ''>('');
  const [managerFilter, setManagerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelsModal, setChannelsModal] = useState<PipelineRep | null>(null);
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [decommissionModal, setDecommissionModal] = useState<PipelineRep | null>(null);
  const [decommissionReason, setDecommissionReason] = useState<DecommissionReason>('non_activity');
  const [decommissionNotes, setDecommissionNotes] = useState('');

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  const fetchPipeline = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/pipeline?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pipeline');
      setReps(json.reps);
      setCounts(json.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const openChannels = async (rep: PipelineRep) => {
    setChannelsModal(rep);
    setChannelsLoading(true);
    try {
      if (!user) return;
      const response = await fetch(`/api/portal/pipeline/channels?userId=${rep.uid}&requestedBy=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load channels');
      setChannelRows(json.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
      setChannelsModal(null);
    } finally {
      setChannelsLoading(false);
    }
  };

  const setChannelStatus = async (channelId: string, status: ChannelOnboardingStatus) => {
    if (!channelsModal || !user) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: channelsModal.uid, channelId, status, requestedBy: user.uid }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update channel');
      setChannelRows((prev) => prev.map((c) => (c.id === channelId ? { ...c, status } : c)));
      await fetchPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setBusy(false);
    }
  };

  const requestFieldTraining = async (rep: PipelineRep) => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/field-train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: rep.uid, requestedBy: user.uid, requestedByName: user.displayName || user.email }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to send request');
      flash(json.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setBusy(false);
    }
  };

  const decommission = async () => {
    if (!user || !decommissionModal) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: decommissionModal.uid,
          reason: decommissionReason,
          notes: decommissionNotes,
          decommissionedBy: user.uid,
          decommissionedByName: user.displayName || user.email,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to decommission');
      flash(json.message);
      setDecommissionModal(null);
      setDecommissionNotes('');
      setDecommissionReason('non_activity');
      await fetchPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decommission');
    } finally {
      setBusy(false);
    }
  };

  const reinstate = async (rep: PipelineRep) => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: rep.uid, requestedBy: user.uid }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to reinstate');
      flash(`${rep.displayName} reinstated`);
      await fetchPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reinstate');
    } finally {
      setBusy(false);
    }
  };

  const managers = useMemo(
    () => Array.from(new Set(reps.map((r) => r.managerName).filter((m): m is string => Boolean(m)))),
    [reps]
  );

  const visibleReps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reps.filter((r) => {
      if (stageFilter && r.stage !== stageFilter) return false;
      if (managerFilter !== 'all' && r.managerName !== managerFilter) return false;
      if (q && ![r.displayName, r.managerName].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reps, stageFilter, managerFilter, search]);

  const heroCount = stageFilter ? (counts[stageFilter] ?? 0) : reps.filter((r) => r.stage !== 'decommissioned' && r.stage !== 'active').length;

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <div className="ops-line-ticker">
            <b>ON AIR</b>
            <span>Ops signal / recruiting pipeline · stage board</span>
            <strong>QUEUE LIVE</strong>
          </div>

          <div className="ops-line-hero">
            <div>
              <p className="ops-line-kicker">04 / The Line / stage board</p>
              <h1><span>Move</span><br />the line.</h1>
              <p className="ops-line-intro">
                Stage counts stay visible; reps stay scannable. Track each field rep from onboarding paperwork to
                channel credentials, active sales, and decommissioning.
              </p>
            </div>
            <div className="ops-line-hero-count">
              <strong className="ops-line-display portal-metallic-num">{heroCount}</strong>
              <small>reps need action</small>
            </div>
          </div>

          {error && <div className="ops-line-error-banner">{error}</div>}
          {success && (
            <div className="ops-line-error-banner" style={{ borderColor: 'var(--ops-line-lime)', color: 'var(--ops-line-lime)', background: 'var(--ops-line-lime-soft)' }}>
              {success}
            </div>
          )}

          <div className="ops-line-stage-strip" aria-label="Pipeline stage filter">
            {PIPELINE_STAGE_ORDER.map((stage) => {
              const cfg = PipelineStageConfig[stage];
              const selected = stageFilter === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStageFilter(selected ? '' : stage)}
                  title={cfg.description}
                >
                  <span>{cfg.name}</span>
                  <b>{counts[stage] ?? 0}</b>
                </button>
              );
            })}
          </div>

          <div className="ops-line-toolbar" style={{ marginTop: 13 }}>
            <input
              type="search"
              className="ops-line-search"
              placeholder="Search reps or managers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search reps or managers"
            />
            <div className="ops-line-pill-row" role="group" aria-label="Manager filter">
              <button type="button" aria-pressed={managerFilter === 'all'} onClick={() => setManagerFilter('all')}>
                All managers
              </button>
              {managers.map((m) => (
                <button key={m} type="button" aria-pressed={managerFilter === m} onClick={() => setManagerFilter(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="ops-line-state-card" style={{ marginTop: 13 }}>Loading pipeline…</div>
          ) : visibleReps.length === 0 ? (
            <div className="ops-line-state-card" style={{ marginTop: 13 }}>
              <p style={{ fontWeight: 900, marginBottom: 4 }}>
                {stageFilter ? `No reps in "${PipelineStageConfig[stageFilter].name}"` : 'No field reps yet'}
              </p>
              <p>
                {stageFilter
                  ? 'Click the stage again to clear the filter.'
                  : 'Create field users in User Management to start the pipeline.'}
              </p>
            </div>
          ) : (
            <div className="ops-line-list" style={{ marginTop: 13 }}>
              {visibleReps.map((rep) => (
                <article key={rep.uid} className="ops-line-row ops-line-rep-row">
                  <div className="ops-line-rep-grid">
                    <div className="ops-line-rep-title">
                      <span className="ops-line-avatar">{rep.displayName?.charAt(0).toUpperCase() || 'R'}</span>
                      <div>
                        <strong>
                          {rep.displayName}
                          {rep.isIBO && <span className="ops-line-ibo">IBO</span>}
                        </strong>
                        <small>{RoleDisplayNames[rep.fieldRole]}</small>
                      </div>
                    </div>
                    <div className="ops-line-rep-cell">
                      <span className="meta">Manager</span>
                      <strong>{rep.managerName ?? '—'}</strong>
                    </div>
                    <div className="ops-line-rep-cell">
                      <span className="meta">Progress</span>
                      <div className="ops-line-progress-label">
                        <span>Onboarding</span>
                        <b>{rep.onboarding.approved}/{rep.onboarding.total}</b>
                      </div>
                      <div className="ops-line-progress-bar">
                        <i style={{ width: `${rep.onboarding.total > 0 ? (rep.onboarding.approved / rep.onboarding.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div className="ops-line-rep-cell">
                      <span className="meta">Channels</span>
                      <div className="ops-line-channels">
                        <span className="ops-line-channel" data-state={rep.channelsCleared > 0 ? 'cleared' : 'not_started'}>
                          {rep.channelsCleared} cleared
                        </span>
                        {rep.channelsSubmitted > 0 && (
                          <span className="ops-line-channel" data-state="submitted">
                            {rep.channelsSubmitted} pending
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ops-line-rep-cell">
                      <span className="meta">Approved sales</span>
                      <strong>{rep.approvedSales}</strong>
                    </div>
                    <div className="ops-line-rep-actions">
                      {rep.stage !== 'decommissioned' ? (
                        <>
                          <button type="button" className="ops-line-action" disabled={busy} onClick={() => requestFieldTraining(rep)}>
                            Field train
                          </button>
                          <button type="button" className="ops-line-action" disabled={busy} onClick={() => openChannels(rep)}>
                            Channels
                          </button>
                          <button
                            type="button"
                            className="ops-line-action reject"
                            disabled={busy}
                            onClick={() => setDecommissionModal(rep)}
                          >
                            Decommission
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ops-line-action reinstate"
                          disabled={busy}
                          onClick={() => reinstate(rep)}
                        >
                          Reinstate
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {channelsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="ops-line" style={{ margin: 0, padding: 0, width: '100%', maxWidth: 480 }}>
            <div className="ops-line-reference-card" style={{ background: 'var(--ops-line-panel)', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ fontWeight: 900, fontSize: 16, color: 'var(--ops-line-ink)' }}>
                Channel credentials — {channelsModal.displayName}
              </h3>
              <p style={{ fontSize: 11, color: 'var(--ops-line-muted)', marginTop: 4, marginBottom: 12 }}>
                Xfinity is credentialed directly; all other channels go through DSI.
              </p>
              {channelsLoading ? (
                <p className="ops-line-kicker">Loading…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {channelRows.map((channel) => (
                    <div key={channel.id} className="ops-line-detail-fields" style={{ margin: 0, gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
                      <div>
                        <span>{channel.credentialingPath === 'direct' ? 'Direct' : 'via DSI'}</span>
                        <b>{channel.name}</b>
                      </div>
                      <NativeSelect
                        value={channel.status}
                        disabled={busy}
                        onChange={(e) => setChannelStatus(channel.id, e.target.value as ChannelOnboardingStatus)}
                        className="w-36"
                      >
                        <NativeSelectOption value="not_started">Not Started</NativeSelectOption>
                        <NativeSelectOption value="submitted">Submitted</NativeSelectOption>
                        <NativeSelectOption value="cleared">Cleared</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="ops-line-action"
                style={{ marginTop: 14, width: '100%' }}
                onClick={() => { setChannelsModal(null); setChannelRows([]); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {decommissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="ops-line" style={{ margin: 0, padding: 0, width: '100%', maxWidth: 480 }}>
            <div className="ops-line-decom-panel" style={{ marginTop: 0, border: '1px solid var(--ops-line-red)', background: 'var(--ops-line-panel)' }}>
              <h4 style={{ gridColumn: '1 / -1' }}>Decommission {decommissionModal.displayName}</h4>
              <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--ops-line-muted)', margin: 0 }}>
                This deactivates the account and records the reason. The account and sales history are preserved and
                can be reinstated.
              </p>
              <div>
                <p className="ops-line-kicker" style={{ marginBottom: 6 }}>Reason</p>
                <div className="ops-line-choice">
                  {(Object.entries(DecommissionReasonLabels) as [DecommissionReason, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={decommissionReason === value}
                      onClick={() => setDecommissionReason(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="ops-line-kicker" style={{ marginBottom: 6 }}>Notes (optional)</p>
                <textarea
                  className="ops-line-notes"
                  value={decommissionNotes}
                  onChange={(e) => setDecommissionNotes(e.target.value)}
                  placeholder="Context for the audit record..."
                  rows={3}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="ops-line-action"
                  style={{ flex: 1 }}
                  onClick={() => { setDecommissionModal(null); setDecommissionNotes(''); setDecommissionReason('non_activity'); }}
                >
                  Cancel
                </button>
                <button type="button" className="ops-line-action reject" style={{ flex: 1 }} disabled={busy} onClick={decommission}>
                  {busy ? 'Working…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
