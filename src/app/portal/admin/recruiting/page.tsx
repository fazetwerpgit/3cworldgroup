'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { toCsv, downloadCsv } from '@/lib/export/csv';
import {
  ApplicationRecord,
  FieldRole,
  OnboardingInviteStatus,
  RecruitingStatusLabels,
  RoleDisplayNames,
} from '@/types';

interface InviteView {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateCity: string;
  intendedFieldRole: FieldRole;
  isIBO: boolean;
  status: OnboardingInviteStatus;
  ownerName: string;
  applicationId?: string | null;
  convertedUserId?: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  createdAt: string | null;
}

const emptyForm = {
  candidateName: '',
  candidateEmail: '',
  candidatePhone: '',
  candidateCity: '',
  intendedFieldRole: 'entry_rep' as FieldRole,
  isIBO: false,
  applicationId: '',
};

const APPLICATION_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Submitted' },
];

const statusTone: Record<string, string> = {
  invited: 'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  in_progress: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  submitted: 'border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300',
  approved: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  converted: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  expired: 'border-slate-200 dark:border-border bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground',
};

export default function RecruitingCommandCenterPage() {
  const { user, hasPermission, isRole } = useAuth();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canAccess =
    hasPermission('recruiting:read') ||
    isRole('admin', 'operations', 'l1_manager', 'l2_manager');

  const fetchRecruiting = useCallback(async () => {
    if (!user || !canAccess) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/portal/recruiting/invites?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting data');
      setInvites(json.invites);
      setApplications(json.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recruiting data');
    } finally {
      setLoading(false);
    }
  }, [canAccess, user]);

  useEffect(() => {
    fetchRecruiting();
  }, [fetchRecruiting]);

  const fillFromApplication = (applicationId: string) => {
    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      setForm((prev) => ({ ...prev, applicationId }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      applicationId,
      candidateName: application.name,
      candidateEmail: application.email,
      candidatePhone: application.phone,
      candidateCity: application.city,
    }));
  };

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess('');
    setLatestInviteUrl('');
    try {
      const response = await fetch('/api/portal/recruiting/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          requestedBy: user.uid,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to create invite');
      setInvites((prev) => [json.invite, ...prev]);
      setLatestInviteUrl(json.inviteUrl);
      setForm(emptyForm);
      setSuccess('Invite link created. Copy it and send it by text, call follow-up, or manager chat.');
      await fetchRecruiting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setSaving(false);
    }
  };

  const copyLatestInvite = async () => {
    if (!latestInviteUrl) return;
    await navigator.clipboard.writeText(latestInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const convertInvite = async (inviteId: string, action: 'approved' | 'rejected') => {
    if (!user) return;
    setProcessingId(inviteId);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/portal/recruiting/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedBy: user.uid,
          inviteId,
          action,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update recruit');
      setSuccess(action === 'approved' ? 'Recruit activated.' : 'Recruit rejected.');
      await fetchRecruiting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recruit');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const submittedCount = invites.filter((invite) => invite.status === 'submitted').length;
  const activeCount = invites.filter((invite) => invite.status === 'converted').length;
  const inProgressCount = invites.filter((invite) =>
    ['invited', 'in_progress'].includes(invite.status)
  ).length;
  const waitingApplications = applications.length;

  return (
    <ProtectedRoute roles={['admin', 'operations', 'l1_manager', 'l2_manager']}>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PortalPageHeader
          compact
          eyebrow="Administration"
          title="Recruiting Command Center"
          description="Create invite links, keep recruits inside the website, and activate submitted profiles from one manager queue."
          actions={
            <>
              <Badge variant="outline" className="rounded-md border-white/25 bg-white/10 text-white">
                Website onboarding
              </Badge>
              <Button
                type="button"
                variant="outline"
                onClick={fetchRecruiting}
                disabled={loading}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Clipboard className="size-4" />}
                Refresh
              </Button>
            </>
          }
        />

        {error && (
          <Alert className="border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-800 dark:text-red-300">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="portal-enter portal-enter-2 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Card className="portal-panel rounded-lg py-0">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                In motion
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-foreground">{inProgressCount}</p>
            </CardContent>
          </Card>
          <Card className="portal-panel rounded-lg py-0">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                Submitted
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-foreground">{submittedCount}</p>
            </CardContent>
          </Card>
          <Card className="portal-panel rounded-lg py-0">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                Activated
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-foreground">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="portal-panel rounded-lg py-0">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                Applications
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-foreground">{waitingApplications}</p>
            </CardContent>
          </Card>
        </div>

        <div className="portal-enter portal-enter-3 grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="size-5 text-[#0A1F44] dark:text-foreground" />
                Start Recruit Onboarding
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={createInvite} className="space-y-4">
                {applications.length > 0 && (
                  <div>
                    <Label>Use website application</Label>
                    <NativeSelect
                      value={form.applicationId}
                      onChange={(event) => fillFromApplication(event.target.value)}
                    >
                      <option value="">Manual entry</option>
                      {applications.map((application) => (
                        <option key={application.id} value={application.id}>
                          {application.name} - {application.city}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}

                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.candidateName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, candidateName: event.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.candidateEmail}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, candidateEmail: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={form.candidatePhone}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, candidatePhone: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={form.candidateCity}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, candidateCity: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Role Path</Label>
                  <NativeSelect
                    value={form.intendedFieldRole}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        intendedFieldRole: event.target.value as FieldRole,
                      }))
                    }
                  >
                    <option value="entry_rep">Account Executive</option>
                    <option value="l1_manager">L1 Manager</option>
                    <option value="l2_manager">L2 Manager</option>
                  </NativeSelect>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 dark:border-border p-3 text-sm">
                  <Checkbox
                    checked={form.isIBO}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isIBO: checked === true }))
                    }
                  />
                  Include IBO business items
                </label>
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Create Invite Link
                </Button>
              </form>

              {latestInviteUrl && (
                <div className="mt-5 rounded-lg border border-[#8dc63f]/30 bg-[#8dc63f]/10 p-3">
                  <p className="text-sm font-semibold text-[#335d14]">Invite link ready</p>
                  <p className="mt-1 break-all text-xs text-[#4f7f1e] dark:text-green-300">{latestInviteUrl}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={copyLatestInvite}
                      className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                    >
                      <Link2 className="size-4" />
                      {copied ? 'Copied' : 'Copy Link'}
                    </Button>
                    <Button asChild type="button" size="sm" variant="outline">
                      <a href={latestInviteUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                        Open
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm xl:col-span-2">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <CardTitle className="text-base">Website Applications</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  disabled={applications.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'applications.csv',
                      toCsv(APPLICATION_COLUMNS, applications as unknown as Record<string, unknown>[])
                    )
                  }
                >
                  Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {applications.length === 0 ? (
                <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-8 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  No website applications yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((application) => (
                    <div
                      key={application.id}
                      className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-medium text-slate-950 dark:text-foreground">{application.name}</p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">{application.city}</p>
                        </div>
                        <Badge variant="outline" className={statusTone[application.status] ?? statusTone.invited}>
                          {application.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 dark:text-muted-foreground sm:grid-cols-3">
                        <div>{application.phone}</div>
                        <div>{application.email}</div>
                        <div>Submitted {formatDate(application.createdAt ? application.createdAt.toString() : null)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <CardTitle className="text-base">Recruit Onboarding Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-muted-foreground">Loading recruits...</div>
              ) : invites.length === 0 ? (
                <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-8 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  No invite links have been created yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-muted text-left text-xs uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Recruit</th>
                          <th className="px-4 py-3">Path</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Owner</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-border bg-white dark:bg-card">
                        {invites.map((invite) => (
                          <tr key={invite.id} className="hover:bg-slate-50 dark:hover:bg-muted/80">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-950 dark:text-foreground">{invite.candidateName}</div>
                              <div className="text-xs text-slate-500 dark:text-muted-foreground">{invite.candidateEmail}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div>{RoleDisplayNames[invite.intendedFieldRole]}</div>
                              {invite.isIBO && (
                                <Badge variant="secondary" className="mt-1 text-[11px]">
                                  IBO
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={statusTone[invite.status] ?? statusTone.invited}
                              >
                                {RecruitingStatusLabels[invite.status] ?? invite.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">{invite.ownerName}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">
                              {invite.submittedAt
                                ? `Submitted ${formatDate(invite.submittedAt)}`
                                : `Created ${formatDate(invite.createdAt)}`}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {invite.status === 'submitted' ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => convertInvite(invite.id, 'approved')}
                                    disabled={processingId === invite.id}
                                    className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                                  >
                                    <CheckCircle2 className="size-4" />
                                    Activate
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => convertInvite(invite.id, 'rejected')}
                                    disabled={processingId === invite.id}
                                    className="border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15"
                                  >
                                    <XCircle className="size-4" />
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-muted-foreground">No action</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
