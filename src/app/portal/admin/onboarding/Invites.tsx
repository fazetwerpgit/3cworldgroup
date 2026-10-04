'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  RotateCw,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
import { hubTabHref, ONBOARDING_HUB, RECRUITING_ROLES } from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './recruiting.module.css';
import {
  ApplicationRecord,
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
  /** The link is stored and can be copied again. False on invites made before links were saved. */
  linkSaved: boolean;
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

/** Invites the recruit can still fill in: their link can be copied or re-sent. */
const OPEN_INVITE_STATUSES: OnboardingInviteStatus[] = ['invited', 'in_progress', 'expired'];

/** The stored status turns 'expired' only when the recruit opens a stale link; the date tells first. */
function shownStatus(invite: InviteView): OnboardingInviteStatus {
  const pastExpiry = !!invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now();
  return pastExpiry && (invite.status === 'invited' || invite.status === 'in_progress') ? 'expired' : invite.status;
}

/**
 * Copies a link that is still being fetched. Safari only lets a click write to
 * the clipboard synchronously, so the pending text goes in as a ClipboardItem
 * promise; browsers without ClipboardItem wait for the text, then write it.
 */
async function copyPendingText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}

const inviteStatusTone: Record<OnboardingInviteStatus, Tone> = {
  invited: 'blue',
  in_progress: 'amber',
  submitted: 'lime',
  approved: 'lime',
  rejected: 'red',
  expired: 'muted',
  converted: 'lime',
};

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing
        .map(String)
        .map((id) => ONBOARDING_ITEMS.find((item) => item.id === id)?.label ?? id)
        .join(', ')
    : '';
}

/** `onChanged` runs after each action that changes the recruits, so the hub's tab counts follow. */
export function Invites({ onChanged }: { onChanged?: () => void } = {}) {
  const { user, hasPermission, isRole } = useAuth();
  const router = useRouter();
  const prefillApplicationId = useSearchParams().get('application');
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [replaceConfirmId, setReplaceConfirmId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<{ id: string; action: 'copy' | 'resend' } | null>(null);
  const [shownLink, setShownLink] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
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

  const clearNotices = () => {
    setError('');
    setSuccess('');
    setWarning('');
  };

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

  const inviteFromApplication = (applicationId: string) => {
    fillFromApplication(applicationId);
    document.getElementById('invite-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('invite-name')?.focus({ preventScroll: true });
  };

  // Applicants' Invite button lands here with ?application=<id>: fill the form
  // once the applications load, then drop the param so a reload starts clean.
  useEffect(() => {
    if (!prefillApplicationId || loading) return;
    if (applications.some((application) => application.id === prefillApplicationId)) {
      inviteFromApplication(prefillApplicationId);
    }
    router.replace(hubTabHref(ONBOARDING_HUB, 'invites'), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per handed-over applicant
  }, [prefillApplicationId, loading]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    clearNotices();
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
      if (json.emailSent) {
        setSuccess(`Invite emailed to ${json.invite.candidateEmail} from the onboarding department.`);
      } else {
        setWarning("Invite created, but the email didn't go out. Copy the link below and send it yourself.");
      }
      await fetchRecruiting();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = async (invite: InviteView) => {
    clearNotices();
    setLinkBusy({ id: invite.id, action: 'copy' });
    const url = (async () => {
      const response = await fetch(`/api/portal/recruiting/invites/${invite.id}`, { headers: await authHeaders() });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not load the link');
      return json.inviteUrl as string;
    })();
    try {
      await copyPendingText(url);
      setShownLink({ id: invite.id, url: await url });
      setSuccess(`Link for ${invite.candidateName} copied.`);
    } catch {
      // Either the link failed to load or the browser refused the clipboard.
      try {
        setShownLink({ id: invite.id, url: await url });
        setWarning('Your browser blocked copying. Select the link under the invite and copy it.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the link');
      }
    } finally {
      setLinkBusy(null);
    }
  };

  const resendInvite = async (invite: InviteView, replaceOpenedLink = false) => {
    clearNotices();
    setReplaceConfirmId(null);
    setLinkBusy({ id: invite.id, action: 'resend' });
    try {
      const response = await fetch(`/api/portal/recruiting/invites/${invite.id}`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ replaceOpenedLink }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to re-send the invite');
      const until = formatDate(json.expiresAt);
      const fresh = json.newLink ? ' This is a new link; the one sent before no longer works.' : '';
      if (json.emailSent) {
        setSuccess(`Invite re-sent to ${invite.candidateEmail}. The link works until ${until}.${fresh}`);
      } else {
        setShownLink({ id: invite.id, url: json.inviteUrl });
        setWarning(`The email didn't go out. Copy the link under the invite and send it yourself (works until ${until}).${fresh}`);
      }
      await fetchRecruiting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-send the invite');
    } finally {
      setLinkBusy(null);
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
    clearNotices();
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
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recruit');
    } finally {
      setProcessingId(null);
    }
  };

  const submittedCount = invites.filter((invite) => invite.status === 'submitted').length;
  const activeCount = invites.filter((invite) => invite.status === 'converted').length;
  const inProgressCount = invites.filter((invite) =>
    ['invited', 'in_progress'].includes(shownStatus(invite))
  ).length;
  const newApplications = applications.filter((application) => application.status === 'applied').length;
  // The form's picker offers applicants not yet invited, plus whichever one is filled in.
  const pickableApplications = applications.filter(
    (application) => application.status === 'applied' || application.id === form.applicationId
  );
  const showCounts = !loading && !loadFailed;

  return (
    <AdminGate roles={RECRUITING_ROLES}>
      <div className={u.page}>
        <AdminPageHead
          title="Recruiting"
          meta={
            showCounts ? (
              <a href={hubTabHref(ONBOARDING_HUB, 'applicants')} className={r.jump}>
                <b>{newApplications}</b> new {newApplications === 1 ? 'applicant' : 'applicants'}
              </a>
            ) : null
          }
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
        {warning ? (
          <AdminNotice tone="warn" onDismiss={() => setWarning('')}>{warning}</AdminNotice>
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
                const status = shownStatus(invite);
                const open = OPEN_INVITE_STATUSES.includes(invite.status);
                // An older invite (no saved link) the recruit already opened: a new link
                // replaces the one in the page they may have open, so it asks first.
                const openedLegacy = !invite.linkSaved && invite.status === 'in_progress' && status !== 'expired';
                const linkAction = linkBusy?.id === invite.id ? linkBusy.action : null;
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
                        <StatusDot tone={inviteStatusTone[status] ?? 'blue'}>
                          {RecruitingStatusLabels[status] ?? status}
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
                        <StatusDot tone={inviteStatusTone[status] ?? 'blue'}>
                          {RecruitingStatusLabels[status] ?? status}
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
                      ) : open ? (
                        <span className={`${u.btnRow} ${r.actions}`}>
                          {invite.linkSaved && status !== 'expired' ? (
                            <button
                              type="button"
                              className={`${s.btnSecondary} ${u.sm}`}
                              disabled={linkAction !== null}
                              aria-label={`Copy invite link for ${invite.candidateName}`}
                              onClick={() => copyInviteLink(invite)}
                            >
                              {linkAction === 'copy' ? (
                                <Loader2 size={16} className={u.spin} aria-hidden="true" />
                              ) : (
                                <Link2 size={16} aria-hidden="true" />
                              )}
                              Copy link
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm}`}
                            disabled={linkAction !== null}
                            aria-label={`Resend invite email to ${invite.candidateName}`}
                            title={
                              invite.linkSaved
                                ? 'Emails the same link again and gives it 14 more days'
                                : 'This invite predates saved links: emails a new link (the old one stops working)'
                            }
                            onClick={() => (openedLegacy ? setReplaceConfirmId(invite.id) : resendInvite(invite))}
                          >
                            {linkAction === 'resend' ? (
                              <Loader2 size={16} className={u.spin} aria-hidden="true" />
                            ) : (
                              <Mail size={16} aria-hidden="true" />
                            )}
                            Resend email
                          </button>
                        </span>
                      ) : (
                        <span className={`${u.cell} ${u.alignEnd} ${r.deskOnly} ${u.toneMuted}`}>No action</span>
                      )}
                    </div>
                    {shownLink?.id === invite.id ? (
                      <div className={r.rowLink}>
                        <p className={r.readyUrl}>{shownLink.url}</p>
                        <a className={`${s.btnSecondary} ${u.sm}`} href={shownLink.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} aria-hidden="true" />
                          Open
                        </a>
                      </div>
                    ) : null}
                    {replaceConfirmId === invite.id ? (
                      <div className={u.confirm} role="alert">
                        <span>
                          {invite.candidateName} already opened their first link. A new link replaces it: if their
                          onboarding page is still open, they&apos;ll need the new email. Files they uploaded are kept.
                        </span>
                        <span className={u.btnRow}>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm}`}
                            onClick={() => setReplaceConfirmId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={`${s.btnSecondary} ${u.sm}`}
                            onClick={() => resendInvite(invite, true)}
                          >
                            Yes, send a new link
                          </button>
                        </span>
                      </div>
                    ) : null}
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

        <div className={r.formWrap}>
          <section className={`${s.panel} ${r.formPanel}`} id="invite-form" aria-labelledby="recruiting-form-heading">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="recruiting-form-heading" className={s.kicker}>Start recruit onboarding</h2>
            </div>
            <div className={u.panelBody}>
              <form onSubmit={createInvite} className={u.formGrid}>
                {pickableApplications.length > 0 && (
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
                        {pickableApplications.map((application) => (
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
        </div>
      </div>
    </AdminGate>
  );
}
