'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { latestRequest } from '@/lib/fetch/latestRequest';
import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminSkeletonRows,
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

// These routes verify the caller from the ID token — the acting identity is
// never sent in the query string or body.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

function shortDay(when: string | Date): string {
  const d = new Date(when);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    'en-US',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One plain sentence saying where a rep is; it carries the stage, so rows need no stage column. */
function whereTheyAre(rep: PipelineRep): string {
  switch (rep.stage) {
    case 'processing':
      return rep.onboarding && rep.onboarding.total > 0
        ? `Paperwork ${rep.onboarding.approved} of ${rep.onboarding.total} approved`
        : 'Paperwork not finished';
    case 'need_logins':
      return 'Never signed into the portal';
    case 'cleared_to_sell':
      return rep.lastSignInAt ? `Signed in ${shortDay(rep.lastSignInAt)} · no sales yet` : 'Signed in · no sales yet';
    case 'active': {
      const parts: string[] = [];
      if (rep.approvedSales > 0 || rep.carrierOrders === 0) parts.push(plural(rep.approvedSales, 'sale'));
      if (rep.carrierOrders > 0) parts.push(plural(rep.carrierOrders, 'carrier order'));
      return parts.join(' · ');
    }
    case 'decommissioned': {
      const record = rep.decommission;
      if (!record) return 'Off the team';
      const when = record.decommissionedAt ? ` ${shortDay(record.decommissionedAt)}` : '';
      return `Off the team${when} · ${DecommissionReasonLabels[record.reason]}`;
    }
  }
}

export function Pipeline() {
  const { user } = useAuth();
  const [reps, setReps] = useState<PipelineRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  // Sheet-local: errors raised inside a sheet show there, never the page banner.
  const [sheetError, setSheetError] = useState('');
  const [success, setSuccess] = useState('');
  // '' is the All chip: the whole team in one list.
  const [stage, setStage] = useState<PipelineStage | ''>('');
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

  // Answers for a sheet that was closed or reopened for another rep are dropped.
  const [channelsReq] = useState(latestRequest);
  const openRepRef = useRef<string | null>(null);
  useEffect(() => () => channelsReq.cancel(), [channelsReq]);
  const loadChannels = async (rep: PipelineRep) => {
    const { signal, isCurrent } = channelsReq.start();
    setChannelsLoading(true);
    setChannelsFailed(false);
    try {
      if (!user) return;
      const response = await fetch(`/api/portal/pipeline/channels?userId=${rep.uid}`, {
        headers: await authHeaders(),
        signal,
      });
      const json = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(json.error || 'Failed to load channels');
      setChannelRows(json.channels);
    } catch {
      if (isCurrent()) setChannelsFailed(true);
    } finally {
      if (isCurrent()) setChannelsLoading(false);
    }
  };

  const openChannels = (rep: PipelineRep) => {
    setSelectedRep(null);
    setSheetError('');
    setChannelRows([]);
    openRepRef.current = rep.uid;
    setChannelsModal(rep);
    void loadChannels(rep);
  };

  const closeChannels = () => {
    channelsReq.cancel();
    openRepRef.current = null;
    setChannelsModal(null);
    setChannelsLoading(false);
    setChannelRows([]);
    setChannelsFailed(false);
    setSheetError('');
  };

  const setChannelStatus = async (channelId: string, status: ChannelOnboardingStatus) => {
    if (!channelsModal || !user) return;
    const repUid = channelsModal.uid;
    // Every rep has the same channel ids: never mark one on another rep's sheet.
    const stillOpen = () => openRepRef.current === repUid;
    setBusy(true);
    setSheetError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: repUid, channelId, status }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update channel');
      if (stillOpen()) setChannelRows((prev) => prev.map((c) => (c.id === channelId ? { ...c, status } : c)));
      await fetchPipeline();
    } catch (err) {
      if (stillOpen()) setSheetError(err instanceof Error ? err.message : 'Failed to update channel');
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
    () => Array.from(new Set(reps.map((r) => r.managerName).filter((m): m is string => Boolean(m)))).sort(),
    [reps]
  );
  const showManagers = managers.length > 1;

  const teamReps = useMemo(
    () => (showManagers && managerFilter !== 'all' ? reps.filter((r) => r.managerName === managerFilter) : reps),
    [reps, showManagers, managerFilter]
  );

  const counts = useMemo(() => {
    const tally = Object.fromEntries(PIPELINE_STAGE_ORDER.map((key) => [key, 0])) as Record<PipelineStage, number>;
    for (const r of teamReps) tally[r.stage] += 1;
    return tally;
  }, [teamReps]);

  const query = search.trim().toLowerCase();

  // Typing a search goes back to All, so a search always finds people in
  // every stage (each row's sentence says where they are).
  const visibleReps = useMemo(
    () =>
      teamReps.filter((r) => {
        if (stage && r.stage !== stage) return false;
        if (query && ![r.displayName, r.managerName].filter(Boolean).join(' ').toLowerCase().includes(query)) return false;
        return true;
      }),
    [teamReps, query, stage]
  );

  const showCounts = !loading && !loadFailed;

  const pickStage = (key: PipelineStage | '') => {
    setStage(key);
    setSearch('');
  };

  const onSearch = (value: string) => {
    setSearch(value);
    if (value.trim()) setStage('');
  };

  const chips: { key: PipelineStage | ''; label: string; count: number }[] = [
    { key: '', label: 'All', count: teamReps.length },
    ...PIPELINE_STAGE_ORDER.map((key) => ({ key, label: PipelineStageConfig[key].name, count: counts[key] })),
  ];

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice>
        ) : null}
        {success ? <AdminNotice tone="ok">{success}</AdminNotice> : null}

        <div className={p.picker}>
          <div className={u.chips} role="group" aria-label="Pipeline stage">
            {chips.map((chip) => (
              <button
                key={chip.key || 'all'}
                type="button"
                className={u.chip}
                aria-pressed={stage === chip.key}
                onClick={() => pickStage(chip.key)}
              >
                {chip.label}
                {showCounts ? <span className={`${u.chipCount} ${u.num}`}>{chip.count}</span> : null}
              </button>
            ))}
          </div>
          <p className={u.hint}>{stage ? PipelineStageConfig[stage].description : 'Everyone on the team. Each row says where they are.'}</p>
        </div>

        <div className={u.toolbar}>
          <label className={u.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              className={u.input}
              placeholder="Search by name or manager"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              aria-label="Search by name or manager"
            />
          </label>
          {showManagers ? (
            <span className={`${u.selectWrap} ${p.manager}`}>
              <select
                className={u.input}
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                aria-label="Manager"
              >
                <option value="all">All managers</option>
                {managers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <section className={s.panel} aria-label={query ? 'Search results' : stage ? PipelineStageConfig[stage].name : 'Everyone'}>
          {loading ? (
            <AdminSkeletonRows rows={5} label="Loading pipeline" />
          ) : loadFailed ? (
            <AdminFailed what="the pipeline" onRetry={retry} />
          ) : reps.length === 0 ? (
            <AdminEmpty title="No field reps yet">Field reps show up here once their signup is approved.</AdminEmpty>
          ) : visibleReps.length === 0 ? (
            <AdminEmpty title={query ? 'No one matches' : 'No one here right now'} />
          ) : (
            <ul className={`${u.rows} ${p.cols}`}>
              {visibleReps.map((rep) => {
                const where = whereTheyAre(rep);
                return (
                  <li key={rep.uid}>
                    <button
                      type="button"
                      className={u.row}
                      onClick={() => setSelectedRep(rep)}
                      aria-label={`${rep.displayName}, ${where}. Open details`}
                    >
                      <span className={`${u.cellMain} ${u.person}`}>
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
                      <span className={`${u.cell} ${p.where}`}>{where}</span>
                      <span className={u.cellEnd}>
                        <ChevronRight size={20} className={u.chev} aria-hidden="true" />
                      </span>
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
                  {!selectedRep.onboarding
                    ? 'Joined before the checklist'
                    : selectedRep.onboarding.total === 0
                      ? 'No checklist for this role'
                      : `${selectedRep.onboarding.approved}/${selectedRep.onboarding.total} approved`}
                </dd>
              </div>
              <div>
                <dt>Channels</dt>
                <dd>
                  {selectedRep.channelsCleared} cleared
                  {selectedRep.channelsSubmitted ? `, ${selectedRep.channelsSubmitted} pending` : ''}
                  {selectedRep.carrierOrders > 0 ? ` · ${selectedRep.carrierOrders} orders on the carrier report` : ''}
                </dd>
              </div>
              <div>
                <dt>Last portal sign-in</dt>
                <dd>
                  {selectedRep.lastSignInAt
                    ? new Date(selectedRep.lastSignInAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Never'}
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
