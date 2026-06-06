'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
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

const STAGE_BADGE: Record<PipelineStage, string> = {
  processing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  need_logins: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cleared_to_sell: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  active: 'bg-[#8dc63f]/20 text-[#8dc63f] border-[#8dc63f]/30',
  decommissioned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const STAGE_CARD_ACCENT: Record<PipelineStage, string> = {
  processing: 'text-yellow-400',
  need_logins: 'text-blue-400',
  cleared_to_sell: 'text-purple-400',
  active: 'text-[#8dc63f]',
  decommissioned: 'text-gray-400',
};

const CHANNEL_STATUS_BADGE: Record<ChannelOnboardingStatus, string> = {
  not_started: 'bg-gray-500/20 text-gray-400',
  submitted: 'bg-yellow-500/20 text-yellow-400',
  cleared: 'bg-[#8dc63f]/20 text-[#8dc63f]',
};

export default function PipelinePage() {
  const { user } = useAuth();
  const [reps, setReps] = useState<PipelineRep[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStage | ''>('');
  const [busy, setBusy] = useState(false);

  // Modals
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
    try {
      const response = await fetch('/api/portal/pipeline');
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load pipeline');
      setReps(json.reps);
      setCounts(json.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const openChannels = async (rep: PipelineRep) => {
    setChannelsModal(rep);
    setChannelsLoading(true);
    try {
      const response = await fetch(`/api/portal/pipeline/channels?userId=${rep.uid}`);
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
    if (!channelsModal) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: channelsModal.uid, channelId, status }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update channel');
      setChannelRows((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, status } : c))
      );
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
        body: JSON.stringify({
          userId: rep.uid,
          requestedBy: user.uid,
          requestedByName: user.displayName || user.email,
        }),
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
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/decommission', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
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

  const visibleReps = stageFilter ? reps.filter((r) => r.stage === stageFilter) : reps;

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Recruiting Pipeline</h1>
          <p className="text-white/60 text-sm mt-1">
            Track every rep from onboarding to active selling
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm border border-red-500/30">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-[#8dc63f]/20 text-[#8dc63f] px-4 py-3 rounded-xl text-sm border border-[#8dc63f]/30">
            {success}
          </div>
        )}

        {/* Stage summary cards (click to filter) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PIPELINE_STAGE_ORDER.map((stage) => {
            const cfg = PipelineStageConfig[stage];
            const selected = stageFilter === stage;
            return (
              <button
                key={stage}
                onClick={() => setStageFilter(selected ? '' : stage)}
                className={`text-left bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-4 border transition-all ${
                  selected ? 'border-[#8dc63f]/60 ring-1 ring-[#8dc63f]/40' : 'border-white/10 hover:border-white/25'
                }`}
              >
                <p className={`text-2xl font-bold ${STAGE_CARD_ACCENT[stage]}`}>
                  {counts[stage] ?? 0}
                </p>
                <p className="text-sm font-medium text-white mt-1">{cfg.name}</p>
                <p className="text-xs text-white/40 mt-0.5">{cfg.description}</p>
              </button>
            );
          })}
        </div>

        {/* Rep table */}
        {loading ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-white/10 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-white/60">Loading pipeline...</p>
          </div>
        ) : visibleReps.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-12 border border-white/10 text-center">
            <p className="text-white font-medium">
              {stageFilter ? `No reps in "${PipelineStageConfig[stageFilter].name}"` : 'No field reps yet'}
            </p>
            <p className="text-white/50 text-sm mt-1">
              {stageFilter ? 'Click the card again to clear the filter.' : 'Create field users in User Management to start the pipeline.'}
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Rep</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Stage</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Onboarding</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Channels</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Sales</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Manager</th>
                    <th className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReps.map((rep) => (
                    <tr key={rep.uid} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{rep.displayName}</p>
                        <p className="text-xs text-white/50">
                          {RoleDisplayNames[rep.fieldRole]}
                          {rep.isIBO && <span className="ml-1.5 text-[#8dc63f]">IBO</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border ${STAGE_BADGE[rep.stage]}`}>
                          {PipelineStageConfig[rep.stage].name}
                        </span>
                        {rep.decommission && (
                          <p className="text-xs text-white/40 mt-1">
                            {DecommissionReasonLabels[rep.decommission.reason]}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-white/10 rounded-full h-1.5">
                            <div
                              className="bg-[#8dc63f] h-1.5 rounded-full"
                              style={{
                                width: `${rep.onboarding.total > 0 ? (rep.onboarding.approved / rep.onboarding.total) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-white/70 text-xs">
                            {rep.onboarding.approved}/{rep.onboarding.total}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {rep.channelsCleared} cleared
                        {rep.channelsSubmitted > 0 && (
                          <span className="text-yellow-400/80"> · {rep.channelsSubmitted} pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/70">{rep.approvedSales}</td>
                      <td className="px-4 py-3 text-white/70">{rep.managerName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {rep.stage !== 'decommissioned' ? (
                            <>
                              <button
                                onClick={() => requestFieldTraining(rep)}
                                disabled={busy}
                                title="Message manager to field train"
                                className="px-3 py-1.5 text-xs font-medium bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                              >
                                Field Train
                              </button>
                              <button
                                onClick={() => openChannels(rep)}
                                disabled={busy}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                              >
                                Channels
                              </button>
                              <button
                                onClick={() => setDecommissionModal(rep)}
                                disabled={busy}
                                className="px-3 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-50"
                              >
                                Decommission
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => reinstate(rep)}
                              disabled={busy}
                              className="px-3 py-1.5 text-xs font-medium bg-[#8dc63f]/20 text-[#8dc63f] rounded-lg hover:bg-[#8dc63f]/30 transition-colors disabled:opacity-50"
                            >
                              Reinstate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Channels modal */}
        {channelsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Channel Credentials — {channelsModal.displayName}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Xfinity is credentialed directly; all other channels go through DSI.
                Credentials live with the vendor — only status is tracked here.
              </p>
              {channelsLoading ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#8dc63f] mx-auto"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {channelRows.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{channel.name}</p>
                        <p className="text-xs text-gray-500">
                          {channel.credentialingPath === 'direct' ? 'Direct' : 'via DSI'} ·{' '}
                          <span className={`px-1.5 py-0.5 rounded ${CHANNEL_STATUS_BADGE[channel.status]}`}>
                            {channel.status.replace('_', ' ')}
                          </span>
                        </p>
                      </div>
                      <select
                        value={channel.status}
                        onChange={(e) =>
                          setChannelStatus(channel.id, e.target.value as ChannelOnboardingStatus)
                        }
                        disabled={busy}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] outline-none disabled:opacity-50"
                      >
                        <option value="not_started">Not Started</option>
                        <option value="submitted">Submitted</option>
                        <option value="cleared">Cleared</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setChannelsModal(null);
                  setChannelRows([]);
                }}
                className="w-full mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Decommission modal */}
        {decommissionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Decommission {decommissionModal.displayName}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This deactivates the account (sign-in blocked) and records the reason.
                The account and sales history are preserved and can be reinstated.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select
                value={decommissionReason}
                onChange={(e) => setDecommissionReason(e.target.value as DecommissionReason)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] outline-none mb-3"
              >
                {(Object.entries(DecommissionReasonLabels) as [DecommissionReason, string][]).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={decommissionNotes}
                onChange={(e) => setDecommissionNotes(e.target.value)}
                placeholder="Context for the audit record..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none resize-none"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setDecommissionModal(null);
                    setDecommissionNotes('');
                    setDecommissionReason('non_activity');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={decommission}
                  disabled={busy}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Working...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
