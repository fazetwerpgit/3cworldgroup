'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  Search,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import { displayPhone, telHref } from '@/lib/phone';
import { INVITABLE_FIELD_ROLES } from '@/types/auth';
import { AdminEmpty, AdminFailed, AdminNotice, AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { hubTabHref, ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './recruiting.module.css';
import { ApplicationRecord, FieldRole, OnboardingInviteStatus, RoleDisplayNames } from '@/types';
import { ONBOARDING_ITEMS } from '@/types/onboarding';
import {
  EXPORT_COLUMNS,
  exportRow,
  matchesSearch,
  needsAction,
  recruitRows,
  recruitSentence,
  type RecruitRow,
} from './recruitList';

// The recruiting routes verify the caller from the ID token — the acting
// identity is never sent in the query string or body.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

export interface InviteView {
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

/**
 * The Recruits tab: "Send an invite" (opens the form in place) and a search
 * box, then everyone being recruited as one list (see recruitList), each row
 * with its one or two actions, then "Export list". Recruits loads the data and
 * gates the tab; `reload` refetches it after every action. `onChanged` runs
 * after each action that changes the recruits, so the hub's tab counts follow.
 */
export function Invites({
  invites,
  applications,
  loading,
  loadFailed,
  reload,
  onChanged,
}: {
  invites: InviteView[];
  applications: ApplicationRecord[];
  loading: boolean;
  loadFailed: boolean;
  reload: () => Promise<void>;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const prefillApplicationId = useSearchParams().get('application');
  const [formOpen, setFormOpen] = useState(false);
  // Bumped each time the form is asked for; the effect below scrolls to it
  // once it has rendered.
  const [formCalls, setFormCalls] = useState(0);
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
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const clearNotices = () => {
    setError('');
    setSuccess('');
    setWarning('');
  };

  const openForm = () => {
    setFormOpen(true);
    setFormCalls((count) => count + 1);
  };

  const closeForm = () => {
    setFormOpen(false);
    setForm(emptyForm);
    setLatestInviteUrl('');
  };

  useEffect(() => {
    if (formCalls === 0) return;
    document.getElementById('invite-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('invite-name')?.focus({ preventScroll: true });
  }, [formCalls]);

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

  /** A row's Invite button (and the ?application= link): the form opens filled from that application. */
  const inviteApplicant = (applicationId: string) => {
    fillFromApplication(applicationId);
    setLatestInviteUrl('');
    openForm();
  };

  // A link from elsewhere in the portal sets ?application=<id>: once the
  // applications load, open the form filled from it, then drop the param so a
  // reload starts clean.
  useEffect(() => {
    if (!prefillApplicationId || loading) return;
    if (applications.some((application) => application.id === prefillApplicationId)) {
      inviteApplicant(prefillApplicationId);
    }
    router.replace(hubTabHref(ONBOARDING_HUB, 'recruits'), { scroll: false });
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
      setLatestInviteUrl(json.inviteUrl);
      setForm(emptyForm);
      if (json.emailSent) {
        setSuccess(`Invite emailed to ${json.invite.candidateEmail} from the onboarding department.`);
      } else {
        setWarning("Invite created, but the email didn't go out. Copy the link below and send it yourself.");
      }
      await reload();
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
        setWarning('Your browser blocked copying. Select the link under their name and copy it.');
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
        setWarning(`The email didn't go out. Copy the link under their name and send it yourself (works until ${until}).${fresh}`);
      }
      await reload();
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
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recruit');
    } finally {
      setProcessingId(null);
    }
  };

  const rows = recruitRows(applications, invites);
  const actionCount = rows.filter(needsAction).length;
  const visible = rows.filter((row) => (showAll || needsAction(row)) && matchesSearch(row, query));
  const ready = !loading && !loadFailed;
  // The form's picker offers people not invited yet, plus whichever application is filled in.
  const pickableApplications = rows.flatMap((row) => (row.state === 'new' && row.application ? [row.application] : []));
  const filledApplication = applications.find((application) => application.id === form.applicationId);
  if (filledApplication && !pickableApplications.includes(filledApplication)) {
    pickableApplications.unshift(filledApplication);
  }

  /** One or two buttons for what the row is waiting on; none once it's settled. */
  const rowActions = (row: RecruitRow) => {
    const { invite, application } = row;
    if (row.state === 'new' && application) {
      return (
        <button
          type="button"
          className={`${s.btnSecondary} ${u.sm}`}
          aria-label={`Invite ${row.name}`}
          onClick={() => inviteApplicant(application.id)}
        >
          <UserPlus size={16} aria-hidden="true" />
          Invite
        </button>
      );
    }
    if (!invite) return null;
    if (row.state === 'finished') {
      const busy = processingId === invite.id;
      return (
        <>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${r.activate}`}
            disabled={busy}
            onClick={() => convertInvite(invite, 'approved')}
          >
            {busy && rejectConfirmId !== invite.id ? (
              <Loader2 size={16} className={u.spin} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={16} aria-hidden="true" />
            )}
            Activate
          </button>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
            disabled={busy}
            aria-expanded={rejectConfirmId === invite.id}
            onClick={() => setRejectConfirmId(invite.id)}
          >
            <XCircle size={16} aria-hidden="true" />
            Reject
          </button>
        </>
      );
    }
    if (row.state !== 'invited' && row.state !== 'started' && row.state !== 'expired') return null;
    const linkAction = linkBusy?.id === invite.id ? linkBusy.action : null;
    // An older invite (no saved link) the recruit already opened: a new link
    // replaces the one in the page they may have open, so it asks first.
    const openedLegacy = !invite.linkSaved && row.state === 'started';
    return (
      <>
        {invite.linkSaved && row.state !== 'expired' ? (
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm}`}
            disabled={linkAction !== null}
            aria-label={`Copy invite link for ${row.name}`}
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
          aria-label={`Resend invite email to ${row.name}`}
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
          Resend
        </button>
      </>
    );
  };

  const renderRow = (row: RecruitRow) => {
    const { invite } = row;
    const actions = rowActions(row);
    const busy = !!invite && processingId === invite.id;
    return (
      <li key={row.key}>
        <div className={`${u.row} ${r.recruit} ${row.state === 'finished' ? u.rowHot : ''}`}>
          <span className={`${u.cellMain} ${u.personText}`}>
            <span className={u.personName}>
              <span>{row.name}</span>
            </span>
            <span className={u.personSub}>
              {row.city}
              {row.city && row.phone ? ' · ' : ''}
              {row.phone ? (
                <a className={`${u.num} ${r.contact}`} href={telHref(row.phone)}>
                  {displayPhone(row.phone)}
                </a>
              ) : null}
            </span>
          </span>
          <span className={`${r.sentence} ${needsAction(row) ? '' : u.toneMuted}`}>{recruitSentence(row)}</span>
          {actions ? <span className={`${u.btnRow} ${r.actions}`}>{actions}</span> : null}
        </div>
        {invite && shownLink?.id === invite.id ? (
          <div className={r.rowLink}>
            <p className={r.readyUrl}>{shownLink.url}</p>
            <a className={`${s.btnSecondary} ${u.sm}`} href={shownLink.url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} aria-hidden="true" />
              Open
            </a>
          </div>
        ) : null}
        {invite && replaceConfirmId === invite.id ? (
          <div className={u.confirm} role="alert">
            <span>
              {row.name} already opened their first link. A new link replaces it: if their onboarding page is
              still open, they&apos;ll need the new email. Files they uploaded are kept.
            </span>
            <span className={u.btnRow}>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setReplaceConfirmId(null)}>
                Cancel
              </button>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => resendInvite(invite, true)}>
                Yes, send a new link
              </button>
            </span>
          </div>
        ) : null}
        {invite && rejectConfirmId === invite.id ? (
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
  };

  return (
    <>
      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>{error}</AdminNotice>
      ) : null}
      {success ? (
        <AdminNotice tone="ok" onDismiss={() => setSuccess('')}>{success}</AdminNotice>
      ) : null}
      {warning ? (
        <AdminNotice tone="warn" onDismiss={() => setWarning('')}>{warning}</AdminNotice>
      ) : null}

      <div className={r.topBar}>
        {formOpen ? null : (
          <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={openForm}>
            <UserPlus size={18} aria-hidden="true" />
            Send an invite
          </button>
        )}
        <label className={`${u.search} ${r.search}`}>
          <Search size={18} aria-hidden="true" />
          <input
            className={u.input}
            type="search"
            placeholder="Search name, city, email, phone"
            aria-label="Search recruits"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {formOpen ? (
        <div className={r.formWrap}>
          <section className={`${s.panel} ${r.formPanel}`} id="invite-form" aria-labelledby="recruiting-form-heading">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="recruiting-form-heading" className={s.kicker}>Send an invite</h2>
              <button type="button" className={`${s.btnSecondary} ${u.sm} ${u.quiet}`} onClick={closeForm}>
                {latestInviteUrl ? 'Close' : 'Cancel'}
              </button>
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
                  {saving ? 'Sending…' : 'Send invite'}
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
      ) : null}

      <section className={s.panel} id="recruits" aria-label="Recruits">
        <div className={`${s.panelHead} ${r.filterBar}`}>
          <div className={u.segmented} role="group" aria-label="Show">
            <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>
              Needs action
              {ready ? <span className={r.segCount}>{actionCount}</span> : null}
            </button>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>
              All
            </button>
          </div>
        </div>
        {loading ? (
          <AdminSkeletonRows rows={4} label="Loading recruits" />
        ) : loadFailed ? (
          <AdminFailed what="recruits" onRetry={reload} />
        ) : rows.length === 0 ? (
          <AdminEmpty title="No recruits yet" />
        ) : visible.length === 0 ? (
          <AdminEmpty title={query.trim() ? 'No one matches' : 'Nothing waiting on you'} />
        ) : (
          <ul className={`${u.rows} ${r.list}`}>{visible.map(renderRow)}</ul>
        )}
      </section>

      {ready && visible.length > 0 ? (
        <button
          type="button"
          className={r.exportLink}
          onClick={() => downloadCsv('recruits.csv', toCsv(EXPORT_COLUMNS, visible.map(exportRow)))}
        >
          Export list
        </button>
      ) : null}
    </>
  );
}
