'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
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
  processing: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  need_logins: 'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  cleared_to_sell: 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  active: 'border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300',
  decommissioned: 'border-slate-200 dark:border-border bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground',
};

const STAGE_CARD_ACCENT: Record<PipelineStage, string> = {
  processing: 'text-amber-700 dark:text-amber-300',
  need_logins: 'text-blue-700 dark:text-blue-300',
  cleared_to_sell: 'text-indigo-700 dark:text-indigo-300',
  active: 'text-[#4f7f1e] dark:text-green-300',
  decommissioned: 'text-slate-600 dark:text-muted-foreground',
};

const CHANNEL_STATUS_BADGE: Record<ChannelOnboardingStatus, string> = {
  not_started: 'border-slate-200 dark:border-border bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground',
  submitted: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  cleared: 'border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300',
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
  const [channelsModal, setChannelsModal] = useState<PipelineRep | null>(null);
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [decommissionModal, setDecommissionModal] = useState<PipelineRep | null>(null);
  const [decommissionReason, setDecommissionReason] =
    useState<DecommissionReason>('non_activity');
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

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const openChannels = async (rep: PipelineRep) => {
    setChannelsModal(rep);
    setChannelsLoading(true);
    try {
      if (!user) return;
      const response = await fetch(
        `/api/portal/pipeline/channels?userId=${rep.uid}&requestedBy=${user.uid}`
      );
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

  const setChannelStatus = async (
    channelId: string,
    status: ChannelOnboardingStatus
  ) => {
    if (!channelsModal || !user) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/portal/pipeline/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: channelsModal.uid,
          channelId,
          status,
          requestedBy: user.uid,
        }),
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

  const visibleReps = stageFilter
    ? reps.filter((r) => r.stage === stageFilter)
    : reps;

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PortalPageHeader
          compact
          eyebrow="Administration"
          title="Recruiting Pipeline"
          description="Track each field rep from onboarding paperwork to channel credentials, active sales, and decommissioning."
        />

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-4 py-3 text-sm text-[#4f7f1e] dark:text-green-300">
            {success}
          </div>
        )}

        <div className="portal-enter portal-enter-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE_STAGE_ORDER.map((stage) => {
            const cfg = PipelineStageConfig[stage];
            const selected = stageFilter === stage;
            return (
              <button
                key={stage}
                onClick={() => setStageFilter(selected ? '' : stage)}
                className={`cursor-pointer rounded-lg border bg-white dark:bg-card p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-border dark:hover:bg-muted ${
                  selected
                    ? 'border-[#8dc63f] ring-2 ring-[#8dc63f]/20'
                    : 'border-slate-200 dark:border-border'
                }`}
              >
                <p className={`text-2xl font-semibold ${STAGE_CARD_ACCENT[stage]}`}>
                  {counts[stage] ?? 0}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-950 dark:text-foreground">{cfg.name}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">{cfg.description}</p>
              </button>
            );
          })}
        </div>

        {loading ? (
          <Card className="portal-enter portal-enter-3 rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500 dark:text-muted-foreground">Loading pipeline...</p>
            </CardContent>
          </Card>
        ) : visibleReps.length === 0 ? (
          <Card className="portal-enter portal-enter-3 rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 text-center shadow-sm">
            <CardContent className="py-12">
              <p className="font-medium text-slate-950 dark:text-foreground">
                {stageFilter
                  ? `No reps in "${PipelineStageConfig[stageFilter].name}"`
                  : 'No field reps yet'}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
                {stageFilter
                  ? 'Click the card again to clear the filter.'
                  : 'Create field users in User Management to start the pipeline.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="portal-enter portal-enter-3 overflow-hidden rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-left">
                    {[
                      'Rep',
                      'Stage',
                      'Onboarding',
                      'Channels',
                      'Sales',
                      'Manager',
                      'Actions',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground ${
                          heading === 'Actions' ? 'text-right' : ''
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleReps.map((rep) => (
                    <tr
                      key={rep.uid}
                      className="border-b border-slate-100 dark:border-border transition-colors hover:bg-slate-50 dark:hover:bg-muted"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950 dark:text-foreground">{rep.displayName}</p>
                        <p className="text-xs text-slate-500 dark:text-muted-foreground">
                          {RoleDisplayNames[rep.fieldRole]}
                          {rep.isIBO && (
                            <span className="ml-1.5 font-medium text-[#4f7f1e] dark:text-green-300">
                              IBO
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STAGE_BADGE[rep.stage]}>
                          {PipelineStageConfig[rep.stage].name}
                        </Badge>
                        {rep.decommission && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                            {DecommissionReasonLabels[rep.decommission.reason]}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-muted">
                            <div
                              className="h-1.5 rounded-full bg-[#8dc63f]"
                              style={{
                                width: `${
                                  rep.onboarding.total > 0
                                    ? (rep.onboarding.approved / rep.onboarding.total) *
                                      100
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-600 dark:text-muted-foreground">
                            {rep.onboarding.approved}/{rep.onboarding.total}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">
                        {rep.channelsCleared} cleared
                        {rep.channelsSubmitted > 0 && (
                          <span className="text-amber-700 dark:text-amber-300">
                            {' '}
                            - {rep.channelsSubmitted} pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">{rep.approvedSales}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">
                        {rep.managerName ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {rep.stage !== 'decommissioned' ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestFieldTraining(rep)}
                                disabled={busy}
                                title="Message manager to field train"
                              >
                                Field Train
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openChannels(rep)}
                                disabled={busy}
                              >
                                Channels
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDecommissionModal(rep)}
                                disabled={busy}
                                className="border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-800 dark:hover:text-red-300"
                              >
                                Decommission
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => reinstate(rep)}
                              disabled={busy}
                              className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                            >
                              Reinstate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {channelsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">
                  Channel Credentials - {channelsModal.displayName}
                </h3>
                <p className="text-sm text-slate-500 dark:text-muted-foreground">
                  Xfinity is credentialed directly; all other channels go through DSI.
                  Credentials live with the vendor; only status is tracked here.
                </p>
              </CardHeader>
              <CardContent className="p-5">
                {channelsLoading ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channelRows.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-border p-3"
                      >
                        <div>
                          <p className="font-medium text-slate-950 dark:text-foreground">{channel.name}</p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                            {channel.credentialingPath === 'direct' ? 'Direct' : 'via DSI'}
                            <Badge
                              variant="outline"
                              className={CHANNEL_STATUS_BADGE[channel.status]}
                            >
                              {channel.status.replace('_', ' ')}
                            </Badge>
                          </p>
                        </div>
                        <NativeSelect
                          value={channel.status}
                          onChange={(e) =>
                            setChannelStatus(
                              channel.id,
                              e.target.value as ChannelOnboardingStatus
                            )
                          }
                          disabled={busy}
                          className="w-36"
                        >
                          <NativeSelectOption value="not_started">
                            Not Started
                          </NativeSelectOption>
                          <NativeSelectOption value="submitted">
                            Submitted
                          </NativeSelectOption>
                          <NativeSelectOption value="cleared">
                            Cleared
                          </NativeSelectOption>
                        </NativeSelect>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setChannelsModal(null);
                    setChannelRows([]);
                  }}
                  className="mt-4 w-full"
                >
                  Close
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {decommissionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">
                  Decommission {decommissionModal.displayName}
                </h3>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  This deactivates the account and records the reason. The account
                  and sales history are preserved and can be reinstated.
                </p>
              </CardHeader>
              <CardContent className="p-5">
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Reason
                </label>
                <NativeSelect
                  value={decommissionReason}
                  onChange={(e) =>
                    setDecommissionReason(e.target.value as DecommissionReason)
                  }
                  className="mb-3 w-full"
                >
                  {(
                    Object.entries(DecommissionReasonLabels) as [
                      DecommissionReason,
                      string,
                    ][]
                  ).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Notes (optional)
                </label>
                <Textarea
                  value={decommissionNotes}
                  onChange={(e) => setDecommissionNotes(e.target.value)}
                  placeholder="Context for the audit record..."
                  rows={3}
                />
                <div className="mt-4 flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDecommissionModal(null);
                      setDecommissionNotes('');
                      setDecommissionReason('non_activity');
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={decommission}
                    disabled={busy}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                  >
                    {busy ? 'Working...' : 'Confirm'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
