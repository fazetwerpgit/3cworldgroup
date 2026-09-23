'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Search, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  AdminAvatar,
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import p from './pipeline.module.css';
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

const STAGE_TONE: Record<PipelineStage, Tone> = {
  processing: 'amber',
  need_logins: 'blue',
  cleared_to_sell: 'lime',
  active: 'lime',
  decommissioned: 'muted',
};

// These routes verify the caller from the ID token — the acting identity is
// never sent in the query string or body.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [reps, setReps] = useState<PipelineRep[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  // Sheet-local: errors raised inside a sheet show there, never the page banner.
  const [sheetError, setSheetError] = useState('');
  const [success, setSuccess] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | ''>('');
  const [managerFilter, setManagerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelsModal, setChannelsModal] = useState<PipelineRep | null>(null);
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsFailed, setChannelsFailed] = useState(false);
  const [decommissionModal, setDecommissionModal] = useState<PipelineRep | null>(null);
  const [decommissionReason, setDecommissionReason] = useState<DecommissionReason>('non_activity');
  const [decommissionNotes, setDecommissionNotes] = useState('');
  const [selectedRep, setSelectedRep] = useState<PipelineRep | null>(null);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  const fetchPipeline = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/pipeline', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pipeline');
      setReps(json.reps);
      setCounts(json.counts);
      setLoadFailed(false);
    } catch {
      // Load failures render in place (AdminFailed); `error` is for actions only.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const retry = () => {
    setLoading(true);
    setError('');
    void fetchPipeline();
  };

  const loadChannels = async (rep: PipelineRep) => {
    setChannelsLoading(true);
    setChannelsFailed(false);
    try {
      if (!user) return;
      const response = await fetch(`/api/portal/pipeline/channels?userId=${rep.uid}`, {
        headers: await authHeaders(),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load channels');
      setChannelRows(json.channels);
    } catch {
      setChannelsFailed(true);
    } finally {
      setChannelsLoading(false);
    }
  };

  const openChannels = (rep: PipelineRep) => {
    setSelectedRep(null);
    setSheetError('');
    setChannelRows([]);
    setChannelsModal(rep);
    void loadChannels(rep);
  };

  const closeChannels = () => {
    setChannelsModal(null);
    setChannelRows([]);
    setChannelsFailed(false);
    setSheetError('');
  };

  const setChannelStatus = async (channelId: string, status: ChannelOnboardingStatus) => {
    if (!channelsModal || !user) return;
    setBusy(true);
    setSheetError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: channelsModal.uid, channelId, status }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update channel');
      setChannelRows((prev) => prev.map((c) => (c.id === channelId ? { ...c, status } : c)));
      await fetchPipeline();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setBusy(false);
    }
  };

  const requestFieldTraining = async (rep: PipelineRep) => {
    if (!user) return;
    setSelectedRep(null);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/field-train', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid }),
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

  const closeDecommission = () => {
    setDecommissionModal(null);
    setDecommissionNotes('');
    setDecommissionReason('non_activity');
    setSheetError('');
  };

  const openDecommission = (rep: PipelineRep) => {
    setSelectedRep(null);
    setSheetError('');
    setDecommissionModal(rep);
  };

  const decommission = async () => {
    if (!user || !decommissionModal) return;
    if (!window.confirm(`Decommission ${decommissionModal.displayName}?`)) return;
    setBusy(true);
    setSheetError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          userId: decommissionModal.uid,
          reason: decommissionReason,
          notes: decommissionNotes,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to decommission');
      flash(json.message);
      closeDecommission();
      await fetchPipeline();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Failed to decommission');
    } finally {
      setBusy(false);
    }
  };

  const reinstate = async (rep: PipelineRep) => {
    if (!user) return;
    if (!window.confirm(`Reinstate ${rep.displayName}?`)) return;
    setSelectedRep(null);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'DELETE',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: rep.uid }),
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
  const filtered = Boolean(stageFilter || managerFilter !== 'all' || search.trim());
  const showCounts = !loading && !loadFailed;

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="Recruiting Pipeline"
          meta={showCounts ? <><b>{heroCount}</b> need attention</> : null}
          sub="Review each rep's progress and open their details for next steps."
        />

        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice>
        ) : null}
        {success ? <AdminNotice tone="ok">{success}</AdminNotice> : null}

        <div className={p.stages} role="group" aria-label="Pipeline stage filter">
          {PIPELINE_STAGE_ORDER.map((stage) => {
            const cfg = PipelineStageConfig[stage];
            const selected = stageFilter === stage;
            const count = counts[stage] ?? 0;
            return (
              <button
                key={stage}
                type="button"
                className={p.stage}
                aria-pressed={selected}
                onClick={() => setStageFilter(selected ? '' : stage)}
                title={cfg.description}
              >
                <StatusDot tone={STAGE_TONE[stage]}>{cfg.name}</StatusDot>
                {loading ? (
                  <span className={s.skel} style={{ width: 40, height: 34 }} aria-hidden="true" />
                ) : (
                  <b className={`${p.stageCount} ${!showCounts || count === 0 ? p.stageZero : ''}`}>
                    {showCounts ? count : '—'}
                  </b>
                )}
              </button>
            );
          })}
        </div>

        <div className={u.toolbar}>
          <label className={u.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              className={u.input}
              placeholder="Search reps or managers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search reps or managers"
            />
          </label>
          {managers.length > 0 ? (
            <div className={u.chips} role="group" aria-label="Manager filter">
              <button type="button" className={u.chip} aria-pressed={managerFilter === 'all'} onClick={() => setManagerFilter('all')}>
                All managers
              </button>
              {managers.map((m) => (
                <button key={m} type="button" className={u.chip} aria-pressed={managerFilter === m} onClick={() => setManagerFilter(m)}>
                  {m}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <section className={s.panel} aria-labelledby="pipeline-reps-heading">
          <div className={s.panelHead}>
            <h2 id="pipeline-reps-heading" className={s.kicker}>
              {stageFilter ? PipelineStageConfig[stageFilter].name : 'Field reps'}
            </h2>
            {showCounts ? (
              <span className={u.panelMeta}>
                {visibleReps.length} {visibleReps.length === 1 ? 'rep' : 'reps'}
                {filtered ? ` of ${reps.length}` : ''}
              </span>
            ) : null}
          </div>

          {loading ? (
            <AdminSkeletonRows rows={5} label="Loading pipeline" />
          ) : loadFailed ? (
            <AdminFailed what="the pipeline" onRetry={retry} />
          ) : visibleReps.length === 0 ? (
            <AdminEmpty
              icon={<Users size={24} aria-hidden="true" />}
              title={stageFilter ? `No reps in ${PipelineStageConfig[stageFilter].name}` : filtered ? 'No reps match' : 'No field reps yet'}
            >
              {stageFilter
                ? 'Tap the stage again to clear the filter.'
                : filtered
                  ? 'Try another name or manager.'
                  : 'Create field users in User Management to start the pipeline.'}
            </AdminEmpty>
          ) : (
            <ul className={`${u.rows} ${p.cols}`}>
              <li className={u.tHead} aria-hidden="true">
                <span>Rep</span>
                <span>Stage</span>
                <span>Manager</span>
                <span>Onboarding</span>
                <span>Channels</span>
                <span className={u.alignEnd}>Approved sales</span>
                <span />
              </li>
              {visibleReps.map((rep) => {
                const pct = rep.onboarding.total > 0 ? (rep.onboarding.approved / rep.onboarding.total) * 100 : 0;
                return (
                  <li key={rep.uid}>
                    <button
                      type="button"
                      className={`${u.row} ${p.rep}`}
                      onClick={() => setSelectedRep(rep)}
                      aria-label={`${rep.displayName}, ${PipelineStageConfig[rep.stage].name}. Open details`}
                    >
                      <span className={`${u.cellMain} ${u.person}`}>
                        <AdminAvatar name={rep.displayName} />
                        <span className={u.personText}>
                          <span className={u.personName}>
                            <span>{rep.displayName}</span>
                          </span>
                          <span className={u.personSub}>
                            {RoleDisplayNames[rep.fieldRole]}
                            {rep.isIBO ? ' · IBO' : ''}
                          </span>
                        </span>
                      </span>
                      <span className={`${u.cellEnd} ${p.stageCell}`}>
                        <StatusDot tone={STAGE_TONE[rep.stage]}>{PipelineStageConfig[rep.stage].name}</StatusDot>
                        <ChevronRight size={20} className={`${u.chev} ${p.phoneChev}`} aria-hidden="true" />
                      </span>
                      <span className={u.cell} data-label="Manager">
                        <span className={p.ellipsis}>{rep.managerName ?? '—'}</span>
                      </span>
                      <span className={`${u.cell} ${p.progressCell}`} data-label="Onboarding">
                        <span className={p.progress}>
                          <span className={`${s.track} ${p.track}`} aria-hidden="true">
                            <span className={s.fill} style={{ width: `${pct}%` }} />
                          </span>
                          <b className={u.num}>
                            {rep.onboarding.approved}/{rep.onboarding.total}
                          </b>
                        </span>
                      </span>
                      <span className={u.cell} data-label="Channels">
                        <span className={p.channels}>
                          <span className={rep.channelsCleared > 0 ? u.toneLime : u.toneMuted}>
                            {rep.channelsCleared} cleared
                          </span>
                          {rep.channelsSubmitted > 0 ? (
                            <span className={u.toneAmber}>{rep.channelsSubmitted} pending</span>
                          ) : null}
                        </span>
                      </span>
                      <span className={`${u.cell} ${u.alignEnd} ${u.num}`} data-label="Approved sales">
                        {rep.approvedSales}
                      </span>
                      <ChevronRight size={20} className={`${u.chev} ${p.deskChev}`} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {selectedRep ? (
        <AdminSheet
          title={selectedRep.displayName}
          description={`${RoleDisplayNames[selectedRep.fieldRole]} · ${PipelineStageConfig[selectedRep.stage].name}`}
          onClose={() => setSelectedRep(null)}
          footer={
            selectedRep.stage !== 'decommissioned' ? (
              <div className={p.detailActions}>
                <button type="button" className={`${s.btnSecondary} ${u.sm}`} disabled={busy} onClick={() => void requestFieldTraining(selectedRep)}>
                  Field Train
                </button>
                <button type="button" className={`${s.btnSecondary} ${u.sm}`} disabled={busy} onClick={() => openChannels(selectedRep)}>
                  Channels
                </button>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                  disabled={busy}
                  onClick={() => openDecommission(selectedRep)}
                >
                  Decommission
                </button>
                <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.quiet}`} onClick={() => setSelectedRep(null)}>
                  Close
                </button>
              </div>
            ) : (
              <div className={p.detailActions}>
                <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} disabled={busy} onClick={() => void reinstate(selectedRep)}>
                  Reinstate
                </button>
                <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.quiet}`} onClick={() => setSelectedRep(null)}>
                  Close
                </button>
              </div>
            )
          }
        >
          <div className={u.sheetPad}>
            <dl className={u.facts}>
              <div>
                <dt>Manager</dt>
                <dd>{selectedRep.managerName ?? '—'}</dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd className={u.num}>
                  {selectedRep.onboarding.approved}/{selectedRep.onboarding.total} approved
                </dd>
              </div>
              <div>
                <dt>Channels</dt>
                <dd>
                  {selectedRep.channelsCleared} cleared
                  {selectedRep.channelsSubmitted ? `, ${selectedRep.channelsSubmitted} pending` : ''}
                </dd>
              </div>
              <div>
                <dt>Approved sales</dt>
                <dd className={u.num}>{selectedRep.approvedSales}</dd>
              </div>
            </dl>
          </div>
        </AdminSheet>
      ) : null}

      {channelsModal ? (
        <AdminSheet
          title={`Channels · ${channelsModal.displayName}`}
          description="Xfinity is credentialed directly; all other channels go through DSI."
          onClose={closeChannels}
          footer={
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm}`}
              onClick={closeChannels}
            >
              Close
            </button>
          }
        >
          <div className={u.sheetPad}>
            {sheetError ? <AdminNotice tone="error" onDismiss={() => setSheetError('')}>{sheetError}</AdminNotice> : null}
            {channelsLoading ? (
              <AdminSkeletonRows rows={3} label="Loading channels" />
            ) : channelsFailed ? (
              <AdminFailed what="channels" onRetry={() => void loadChannels(channelsModal)} />
            ) : (
              <ul className={p.channelList}>
                {channelRows.map((channel) => {
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
                          onChange={(e) => setChannelStatus(channel.id, e.target.value as ChannelOnboardingStatus)}
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
      ) : null}

      {decommissionModal ? (
        <AdminSheet
          tone="danger"
          title={`Decommission ${decommissionModal.displayName}`}
          description="This deactivates the account and records the reason. The account and sales history are preserved and can be reinstated."
          onClose={closeDecommission}
          footer={
            <>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={closeDecommission}>
                Cancel
              </button>
              <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.danger}`} disabled={busy} onClick={decommission}>
                {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
                {busy ? 'Working…' : 'Confirm'}
              </button>
            </>
          }
        >
          <div className={u.sheetPad}>
            {sheetError ? <AdminNotice tone="error" onDismiss={() => setSheetError('')}>{sheetError}</AdminNotice> : null}
            <fieldset className={p.fieldset}>
              <legend className={u.label}>Reason</legend>
              <div className={p.choices}>
                {(Object.entries(DecommissionReasonLabels) as [DecommissionReason, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={p.choice}
                    aria-pressed={decommissionReason === value}
                    onClick={() => setDecommissionReason(value)}
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
                value={decommissionNotes}
                onChange={(e) => setDecommissionNotes(e.target.value)}
                placeholder="Context for the audit record"
                rows={3}
              />
            </div>
          </div>
        </AdminSheet>
      ) : null}
    </AdminGate>
  );
}
