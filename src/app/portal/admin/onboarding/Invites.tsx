'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  RotateCw,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toCsv, downloadCsv } from '@/lib/export/csv';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { INVITABLE_FIELD_ROLES } from '@/types/auth';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { RECRUITING_ROLES } from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './recruiting.module.css';
import {
  ApplicationRecord,
  ApplicationStatus,
  FieldRole,
  OnboardingInviteStatus,
  RecruitingStatusLabels,
  RoleDisplayNames,
} from '@/types';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

// The recruiting routes verify the caller from the ID token — the acting
// identity is never sent in the query string or body.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

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
  intendedFieldRole: 'entry_level_rep' as FieldRole,
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

/** Split from the previously-conflated single lookup (B-4) — ApplicationStatus and
 * OnboardingInviteStatus are distinct enums with only partial overlap. */
const applicationStatusTone: Record<ApplicationStatus, Tone> = {
  applied: 'blue',
  contacted: 'amber',
  invited: 'blue',
  not_selected: 'muted',
  converted: 'lime',
};

const applicationStatusLabel: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  contacted: 'Contacted',
  invited: 'Invited',
  not_selected: 'Not selected',
  converted: 'Converted',
};

const inviteStatusTone: Record<OnboardingInviteStatus, Tone> = {
  invited: 'blue',
  in_progress: 'amber',
  submitted: 'lime',
  approved: 'lime',
  rejected: 'red',
  expired: 'muted',
  converted: 'lime',
};

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing
        .map(String)
        .map((id) => ONBOARDING_ITEMS.find((item) => item.id === id)?.label ?? id)
        .join(', ')
    : '';
}

export function Invites() {
  const { user, hasPermission, isRole } = useAuth();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canAccess =
    hasPermission('recruiting:read') ||
    isRole(
      'admin',
      'operations',
      'l1_manager',
      'l2_manager',
      'ibo_level_1',
      'ibo_level_2',
      'ibo_level_3',
      'ibo_level_4',
      'regional_manager',
      'director'
    );

  const fetchRecruiting = useCallback(async () => {
    if (!user || !canAccess) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/portal/recruiting/invites', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting data');
      setInvites(json.invites);
      setApplications(json.applications);
      setLoadFailed(false);
    } catch {
      // Load failures render in place (AdminFailed); `error` is for actions only.
      setLoadFailed(true);
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
        headers: await authHeaders(true),
        body: JSON.stringify(form),
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

  const convertInvite = async (invite: InviteView, action: 'approved' | 'rejected') => {
    if (!user) return;
    setProcessingId(invite.id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/portal/recruiting/convert', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ inviteId: invite.id, action }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          const missing = formatMissingItems(json.missing);
          throw new Error(
            missing
              ? `Cannot activate yet. Missing: ${missing}`
              : 'Cannot activate yet. Required onboarding items are missing.'
          );
        }
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to update recruit'
        );
      }
      setSuccess(action === 'approved' ? 'Recruit activated.' : 'Recruit rejected.');
      setRejectConfirmId(null);
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
  const showCounts = !loading && !loadFailed;

  return (
    <AdminGate roles={RECRUITING_ROLES}>
      <div className={u.page}>
        <AdminPageHead
          title="Recruiting"
          meta={showCounts ? <><b>{waitingApplications}</b> applications</> : null}
          actions={
            <>
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                onClick={() => {
                  document.getElementById('invite-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  document.getElementById('invite-name')?.focus({ preventScroll: true });
                }}
              >
                <UserPlus size={18} aria-hidden="true" />
                New Invite
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                onClick={fetchRecruiting}
                disabled={loading}
              >
                <RotateCw size={16} className={loading ? u.spin : undefined} aria-hidden="true" />
                Refresh
              </button>
            </>
          }
        />

        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice>
        ) : null}
        {success ? (
          <AdminNotice tone="ok" onDismiss={() => setSuccess('')}>{success}</AdminNotice>
        ) : null}

        <section className={s.panel} aria-labelledby="recruiting-invites-heading">
          <div className={`${s.panelHead} ${u.band}`}>
            <h2 id="recruiting-invites-heading" className={s.kicker}>Invites</h2>
            {showCounts && invites.length > 0 ? (
              <span className={u.panelMeta}>
                {[
                  submittedCount ? `${submittedCount} ready to review` : null,
                  inProgressCount ? `${inProgressCount} in progress` : null,
                  activeCount ? `${activeCount} activated` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </div>
          {loading ? (
            <AdminSkeletonRows rows={4} label="Loading recruits" />
          ) : loadFailed ? (
            <AdminFailed what="recruits" onRetry={fetchRecruiting} />
          ) : invites.length === 0 ? (
            <AdminEmpty title="No invites yet">
              Create one below and send the link to your recruit.
            </AdminEmpty>
          ) : (
            <ul className={`${u.rows} ${r.inviteCols}`}>
              <li className={u.tHead} aria-hidden="true">
                <span>Recruit</span>
                <span>Role</span>
                <span>Owner</span>
                <span>Status</span>
                <span className={u.alignEnd}>Action</span>
              </li>
              {invites.map((invite) => {
                const confirmingReject = rejectConfirmId === invite.id;
                const busy = processingId === invite.id;
                const submitted = invite.status === 'submitted';
                return (
                  <li key={invite.id}>
                    <div className={`${u.row} ${r.invite} ${submitted ? u.rowHot : ''}`}>
                      <span className={`${u.cellMain} ${u.person}`}>
                        <span className={u.personText}>
                          <span className={u.personName}>
                            <span>{invite.candidateName}</span>
                          </span>
                          <span className={u.personSub}>{invite.candidateEmail}</span>
                        </span>
                      </span>
                      <span className={`${u.cellEnd} ${r.phoneOnly}`}>
                        <StatusDot tone={inviteStatusTone[invite.status] ?? 'blue'}>
                          {RecruitingStatusLabels[invite.status] ?? invite.status}
                        </StatusDot>
                      </span>
                      <span className={u.cell} data-label="Role">
                        <span className={r.roleValue}>
                          {RoleDisplayNames[invite.intendedFieldRole]}
                          {invite.isIBO ? <span className={u.tag}>IBO</span> : null}
                        </span>
                      </span>
                      <span className={u.cell} data-label="Owner">
                        <span className={r.stackValue}>
                          <span>{invite.ownerName}</span>
                          <span className={u.cellSub}>
                            {invite.submittedAt ? `Submitted ${formatDate(invite.submittedAt)}` : `Created ${formatDate(invite.createdAt)}`}
                          </span>
                        </span>
                      </span>
                      <span className={`${u.cell} ${r.deskOnly}`}>
                        <StatusDot tone={inviteStatusTone[invite.status] ?? 'blue'}>
                          {RecruitingStatusLabels[invite.status] ?? invite.status}
                        </StatusDot>
                      </span>
                      {submitted ? (
                        <span className={`${u.btnRow} ${r.actions}`}>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm} ${r.activate}`}
                            disabled={busy}
                            onClick={() => convertInvite(invite, 'approved')}
                          >
                            {busy && !confirmingReject ? (
                              <Loader2 size={16} className={u.spin} aria-hidden="true" />
                            ) : (
                              <CheckCircle2 size={16} aria-hidden="true" />
                            )}
                            Activate
                          </button>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                            disabled={busy}
                            aria-expanded={confirmingReject}
                            onClick={() => setRejectConfirmId(invite.id)}
                          >
                            <XCircle size={16} aria-hidden="true" />
                            Reject
                          </button>
                        </span>
                      ) : (
                        <span className={`${u.cell} ${u.alignEnd} ${r.deskOnly} ${u.toneMuted}`}>No action</span>
                      )}
                    </div>
                    {confirmingReject ? (
                      <div className={u.confirm} role="alert">
                        <span>Reject this recruit? This deactivates their account.</span>
                        <span className={u.btnRow}>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm}`}
                            onClick={() => setRejectConfirmId(null)}
                            disabled={busy}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                            onClick={() => convertInvite(invite, 'rejected')}
                            disabled={busy}
                          >
                            {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
                            {busy ? 'Rejecting…' : 'Yes, reject'}
                          </button>
                        </span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className={r.grid}>
          <section className={`${s.panel} ${r.formPanel}`} id="invite-form" aria-labelledby="recruiting-form-heading">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="recruiting-form-heading" className={s.kicker}>Start recruit onboarding</h2>
            </div>
            <div className={u.panelBody}>
              <form onSubmit={createInvite} className={u.formGrid}>
                {applications.length > 0 && (
                  <div className={u.field}>
                    <label htmlFor="invite-application" className={u.label}>Use website application</label>
                    <span className={u.selectWrap}>
                      <select
                        id="invite-application"
                        className={u.input}
                        value={form.applicationId}
                        onChange={(event) => fillFromApplication(event.target.value)}
                      >
                        <option value="">Manual entry</option>
                        {applications.map((application) => (
                          <option key={application.id} value={application.id}>
                            {application.name} - {application.city}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} aria-hidden="true" />
                    </span>
                  </div>
                )}

                <div className={u.field}>
                  <label htmlFor="invite-name" className={u.label}>Name</label>
                  <input
                    id="invite-name"
                    className={u.input}
                    autoComplete="off"
                    value={form.candidateName}
                    onChange={(event) => setForm((prev) => ({ ...prev, candidateName: event.target.value }))}
                    required
                  />
                </div>
                <div className={u.field}>
                  <label htmlFor="invite-email" className={u.label}>Email</label>
                  <input
                    id="invite-email"
                    className={u.input}
                    type="email"
                    autoComplete="off"
                    value={form.candidateEmail}
                    onChange={(event) => setForm((prev) => ({ ...prev, candidateEmail: event.target.value }))}
                    required
                  />
                </div>
                <div className={`${u.formGrid} ${u.formGrid2}`}>
                  <div className={u.field}>
                    <label htmlFor="invite-phone" className={u.label}>Phone</label>
                    <input
                      id="invite-phone"
                      className={u.input}
                      inputMode="tel"
                      autoComplete="off"
                      value={form.candidatePhone}
                      onChange={(event) => setForm((prev) => ({ ...prev, candidatePhone: event.target.value }))}
                      required
                    />
                  </div>
                  <div className={u.field}>
                    <label htmlFor="invite-city" className={u.label}>City</label>
                    <input
                      id="invite-city"
                      className={u.input}
                      autoComplete="off"
                      value={form.candidateCity}
                      onChange={(event) => setForm((prev) => ({ ...prev, candidateCity: event.target.value }))}
                    />
                  </div>
                </div>
                <div className={u.field}>
                  <label htmlFor="invite-role" className={u.label}>Role</label>
                  <span className={u.selectWrap}>
                    <select
                      id="invite-role"
                      className={u.input}
                      value={form.intendedFieldRole}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, intendedFieldRole: event.target.value as FieldRole }))
                      }
                    >
                      {INVITABLE_FIELD_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {RoleDisplayNames[role]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </div>
                <label className={u.check}>
                  <input
                    type="checkbox"
                    checked={form.isIBO}
                    onChange={(event) => setForm((prev) => ({ ...prev, isIBO: event.target.checked }))}
                  />
                  Include IBO business items
                </label>
                <button type="submit" className={`${s.btnPrimary} ${r.submit}`} disabled={saving}>
                  {saving ? <Loader2 size={20} className={u.spin} aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
                  Create invite
                </button>
              </form>

              {latestInviteUrl && (
                <div className={r.ready} role="status">
                  <p className={r.readyTitle}>
                    <CheckCircle2 size={18} aria-hidden="true" />
                    Invite link ready
                  </p>
                  <p className={r.readyUrl}>{latestInviteUrl}</p>
                  <div className={u.btnRow}>
                    <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={copyLatestInvite}>
                      <Link2 size={18} aria-hidden="true" />
                      {copied ? 'Copied' : 'Copy Link'}
                    </button>
                    <a
                      className={`${s.btnSecondary} ${u.sm}`}
                      href={latestInviteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      Open
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={s.panel} aria-labelledby="recruiting-apps-heading">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="recruiting-apps-heading" className={s.kicker}>Website applications</h2>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.quiet} ${r.export}`}
                disabled={applications.length === 0}
                onClick={() =>
                  downloadCsv(
                    'applications.csv',
                    toCsv(APPLICATION_COLUMNS, applications as unknown as Record<string, unknown>[])
                  )
                }
              >
                <Download size={16} aria-hidden="true" />
                Export CSV
              </button>
            </div>
            {loading ? (
              <AdminSkeletonRows rows={3} label="Loading applications" />
            ) : loadFailed ? (
              <AdminFailed what="applications" onRetry={fetchRecruiting} />
            ) : applications.length === 0 ? (
              <AdminEmpty title="No website applications yet" />
            ) : (
              <ul className={`${u.rows} ${r.appCols}`}>
                {applications.map((application) => (
                  <li key={application.id} className={`${u.row} ${r.app}`}>
                    <span className={`${u.cellMain} ${u.person}`}>
                      <span className={u.personText}>
                        <span className={u.personName}>
                          <span>{application.name}</span>
                        </span>
                        <span className={u.personSub}>{application.city}</span>
                      </span>
                    </span>
                    <span className={`${u.cellEnd} ${r.appStatus}`}>
                      <StatusDot tone={applicationStatusTone[application.status] ?? 'blue'}>
                        {applicationStatusLabel[application.status] ?? application.status}
                      </StatusDot>
                    </span>
                    <span className={`${u.cell} ${r.phoneOnly}`} data-label="Phone">
                      <span className={u.num}>{application.phone}</span>
                    </span>
                    <span className={`${u.cell} ${r.phoneOnly}`} data-label="Email">
                      <span className={r.ellipsis}>{application.email}</span>
                    </span>
                    <span className={`${u.cell} ${r.deskOnly}`}>
                      <span className={r.stackValue}>
                        <span className={u.num}>{application.phone}</span>
                        <span className={`${u.cellSub} ${r.ellipsis}`}>{application.email}</span>
                      </span>
                    </span>
                    <span className={u.cell} data-label="Submitted">
                      <span className={u.num}>
                        {formatDate(application.createdAt ? application.createdAt.toString() : null)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AdminGate>
  );
}
