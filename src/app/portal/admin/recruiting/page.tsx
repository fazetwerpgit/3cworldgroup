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
import { useAuth } from '@/contexts/AuthContext';
import { toCsv, downloadCsv } from '@/lib/export/csv';
import {
  ApplicationRecord,
  ApplicationStatus,
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

/** Client-form offers a fixed 8-role subset (excludes general_manager/gm_in_training/
 * office_manager, which aren't recruit-invite targets) — labels sourced from the shared
 * RoleDisplayNames map instead of hand-typed strings (B-6). */
const ROLE_OPTIONS: FieldRole[] = [
  'entry_level_rep',
  'entry_rep',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
];

/** Split from the previously-conflated single lookup (B-4) — ApplicationStatus and
 * OnboardingInviteStatus are distinct enums with only partial overlap. */
const applicationStatusTone: Record<ApplicationStatus, string> = {
  applied: 'tone-blue',
  contacted: 'tone-amber',
  invited: 'tone-blue',
  not_selected: 'tone-muted',
  converted: 'tone-lime',
};

const inviteStatusTone: Record<OnboardingInviteStatus, string> = {
  invited: 'tone-blue',
  in_progress: 'tone-amber',
  submitted: 'tone-lime',
  approved: 'tone-lime',
  rejected: 'tone-red',
  expired: 'tone-muted',
  converted: 'tone-lime',
};

export default function RecruitingCommandCenterPage() {
  const { user, hasPermission, isRole } = useAuth();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
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
      'ibo_level_4'
    );

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

  return (
    <ProtectedRoute
      roles={[
        'admin',
        'operations',
        'l1_manager',
        'l2_manager',
        'ibo_level_1',
        'ibo_level_2',
        'ibo_level_3',
        'ibo_level_4',
      ]}
    >
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <div className="ops-line-ticker">
            <b>ON AIR</b>
            <span>Ops signal / recruit intake · one board</span>
            <strong>{loading ? 'SYNCING' : 'LIVE'}</strong>
          </div>

          <div className="ops-line-hero">
            <div>
              <p className="ops-line-kicker">05 / The Line / recruit intake</p>
              <h1>
                <span>Open</span>
                <br />
                the line.
              </h1>
              <p className="ops-line-intro">
                Create invite links, keep recruits inside the website, and activate submitted profiles
                from one manager queue.
              </p>
            </div>
            <div className="ops-line-hero-count">
              <strong className="ops-line-display portal-metallic-num">{loading ? '—' : submittedCount}</strong>
              <small>submitted, waiting on you</small>
            </div>
          </div>

          <div className="ops-line-recruiting-strip">
            <div className="ops-line-strip-cell">
              <span>In motion</span>
              <b>{loading ? '—' : inProgressCount}</b>
              <span className="note">invited, not yet submitted</span>
            </div>
            <div className="ops-line-strip-cell accent">
              <span>Submitted</span>
              <b>{loading ? '—' : submittedCount}</b>
              <span className="note">ready to activate or reject</span>
            </div>
            <div className="ops-line-strip-cell">
              <span>Activated</span>
              <b>{loading ? '—' : activeCount}</b>
              <span className="note">converted to a real account</span>
            </div>
            <div className="ops-line-strip-cell">
              <span>Applications</span>
              <b>{loading ? '—' : waitingApplications}</b>
              <span className="note">from the public website</span>
            </div>
          </div>

          {error && <div className="ops-line-error-banner">{error}</div>}
          {success && (
            <div className="ops-line-error-banner" style={{ borderColor: 'color-mix(in srgb, var(--ops-line-lime) 45%, transparent)', background: 'var(--ops-line-lime-soft)', color: 'var(--ops-line-lime)' }}>
              {success}
            </div>
          )}

          <div className="ops-line-recruiting-grid">
            <div className="ops-line-form-card">
              <div className="ops-line-form-head">
                <UserPlus size={15} />
                <h3>Start Recruit Onboarding</h3>
              </div>
              <form onSubmit={createInvite} className="ops-line-form">
                {applications.length > 0 && (
                  <div className="ops-line-field">
                    <label>Use website application</label>
                    <select
                      className="ops-line-select"
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
                  </div>
                )}

                <div className="ops-line-field">
                  <label>Name</label>
                  <input
                    className="ops-line-input"
                    value={form.candidateName}
                    onChange={(event) => setForm((prev) => ({ ...prev, candidateName: event.target.value }))}
                    required
                  />
                </div>
                <div className="ops-line-field">
                  <label>Email</label>
                  <input
                    className="ops-line-input"
                    type="email"
                    value={form.candidateEmail}
                    onChange={(event) => setForm((prev) => ({ ...prev, candidateEmail: event.target.value }))}
                    required
                  />
                </div>
                <div className="ops-line-form-row">
                  <div className="ops-line-field">
                    <label>Phone</label>
                    <input
                      className="ops-line-input"
                      value={form.candidatePhone}
                      onChange={(event) => setForm((prev) => ({ ...prev, candidatePhone: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="ops-line-field">
                    <label>City</label>
                    <input
                      className="ops-line-input"
                      value={form.candidateCity}
                      onChange={(event) => setForm((prev) => ({ ...prev, candidateCity: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="ops-line-field">
                  <label>Role Path</label>
                  <select
                    className="ops-line-select"
                    value={form.intendedFieldRole}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, intendedFieldRole: event.target.value as FieldRole }))
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {RoleDisplayNames[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="ops-line-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.isIBO}
                    onChange={(event) => setForm((prev) => ({ ...prev, isIBO: event.target.checked }))}
                  />
                  Include IBO business items
                </label>
                <button type="submit" className="ops-line-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Create Invite Link
                </button>
              </form>

              {latestInviteUrl && (
                <div className="ops-line-invite-ready">
                  <p className="ops-line-invite-ready-title">Invite link ready</p>
                  <p className="ops-line-invite-ready-url">{latestInviteUrl}</p>
                  <div className="ops-line-invite-ready-actions">
                    <button type="button" className="ops-line-primary" onClick={copyLatestInvite}>
                      <Link2 size={13} />
                      {copied ? 'Copied' : 'Copy Link'}
                    </button>
                    <a
                      className="ops-line-action"
                      href={latestInviteUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <ExternalLink size={13} />
                      Open
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="ops-line-applications-card">
              <div className="ops-line-form-head" style={{ justifyContent: 'space-between' }}>
                <h3>Website Applications</h3>
                <button
                  type="button"
                  className="ops-line-export"
                  disabled={applications.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'applications.csv',
                      toCsv(APPLICATION_COLUMNS, applications as unknown as Record<string, unknown>[])
                    )
                  }
                >
                  Export CSV
                </button>
              </div>
              {applications.length === 0 ? (
                <div className="ops-line-state-card">No website applications yet.</div>
              ) : (
                <div className="ops-line-list">
                  {applications.map((application) => (
                    <div key={application.id} className="ops-line-row app">
                      <div className="ops-line-app-row">
                        <span className="ops-line-person ops-line-cell">
                          <span className="ops-line-avatar">
                            {application.name
                              .split(' ')
                              .map((p) => p[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>
                            <strong>{application.name}</strong>
                            <small>{application.city}</small>
                          </span>
                        </span>
                        <span className="ops-line-cell">
                          <strong>{application.phone}</strong>
                          <small>{application.email}</small>
                        </span>
                        <span className="ops-line-cell">
                          <strong>Submitted</strong>
                          <small>{formatDate(application.createdAt ? application.createdAt.toString() : null)}</small>
                        </span>
                        <span className={`ops-line-status-chip ${applicationStatusTone[application.status] ?? 'tone-blue'}`}>
                          {application.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ops-line-queue-card-wide">
              <div className="ops-line-form-head">
                <h3>Recruit Onboarding Queue</h3>
              </div>
              {loading ? (
                <div className="ops-line-state-card">Loading recruits…</div>
              ) : invites.length === 0 ? (
                <div className="ops-line-state-card">No invite links have been created yet.</div>
              ) : (
                <div className="ops-line-list">
                  {invites.map((invite) => {
                    const confirmingReject = rejectConfirmId === invite.id;
                    const busy = processingId === invite.id;
                    return (
                      <article key={invite.id} className={`ops-line-row${invite.status === 'submitted' ? ' new' : ''}`}>
                        <div className="ops-line-recruit-row">
                          <span className="ops-line-person ops-line-cell">
                            <span className="ops-line-avatar">
                              {invite.candidateName
                                .split(' ')
                                .map((p) => p[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <span>
                              <strong>{invite.candidateName}</strong>
                              <small>{invite.candidateEmail}</small>
                            </span>
                          </span>
                          <span className="ops-line-cell">
                            <strong>{RoleDisplayNames[invite.intendedFieldRole]}</strong>
                            {invite.isIBO && <small>IBO</small>}
                          </span>
                          <span className="ops-line-cell">
                            <strong>{invite.ownerName}</strong>
                            <small>
                              {invite.submittedAt ? `Submitted ${formatDate(invite.submittedAt)}` : `Created ${formatDate(invite.createdAt)}`}
                            </small>
                          </span>
                          <span className={`ops-line-status-chip ${inviteStatusTone[invite.status] ?? 'tone-blue'}`}>
                            {RecruitingStatusLabels[invite.status] ?? invite.status}
                          </span>
                          {invite.status === 'submitted' ? (
                            <span className="ops-line-detail-actions" style={{ margin: 0 }}>
                              <button
                                type="button"
                                className="ops-line-action resolve"
                                disabled={busy}
                                onClick={() => convertInvite(invite.id, 'approved')}
                              >
                                <CheckCircle2 size={12} />
                                Activate
                              </button>
                              <button
                                type="button"
                                className="ops-line-action reject"
                                disabled={busy}
                                onClick={() => setRejectConfirmId(invite.id)}
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </span>
                          ) : (
                            <span className="ops-line-no-action">No action</span>
                          )}
                        </div>
                        {confirmingReject && (
                          <div className="ops-line-confirm-strip">
                            <span>Reject this recruit? This deactivates their account.</span>
                            <span style={{ display: 'flex', gap: 6 }}>
                              <button type="button" onClick={() => setRejectConfirmId(null)} disabled={busy}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="yes"
                                onClick={() => convertInvite(invite.id, 'rejected')}
                                disabled={busy}
                              >
                                {busy ? 'Rejecting…' : 'Yes, reject'}
                              </button>
                            </span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="ops-line-quiet-rail">
            <span>Empty queues stay quiet — 0 new means clear, never an alarm.</span>
            <button type="button" className="ops-line-export" onClick={fetchRecruiting} disabled={loading}>
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Clipboard size={12} />}
              Refresh
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
