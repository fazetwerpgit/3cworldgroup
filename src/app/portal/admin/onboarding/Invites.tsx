'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, Link2, Loader2, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { invitableFieldRolesFor } from '@/lib/recruiting/roleCeiling';
import { AdminNotice } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { shareLinkViaApp, shouldShareViaApp } from '@/lib/app/shareLink';
import r from './recruiting.module.css';
import {
  ApplicationRecord,
  FieldRole,
  InviteEmailStatus,
  isRecruiter,
  OnboardingInviteStatus,
  RoleDisplayNames,
} from '@/types';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

// Invites as Hiring uses them: the invite record the recruiting API sends,
// the invite actions (copy or share the link, resend, activate or reject the
// paperwork) and the Send an invite form. People runs them all; To do runs
// Activate on its own.

// The recruiting routes verify the caller from the ID token — the acting
// identity is never sent in the query string or body.
export async function authHeaders(json = false): Promise<Record<string, string>> {
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
  /** The email already had an account: its link goes only to that inbox, never to Copy link. */
  existingAccount?: boolean;
  /** The latest invite email: sent, failed, delivered or bounced. Null on older invites. */
  emailStatus?: InviteEmailStatus | null;
  ownerName: string;
  applicationId?: string | null;
  convertedUserId?: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
}

export interface Notice {
  tone: 'ok' | 'error' | 'warn';
  text: string;
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

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing
        .map(String)
        .map((id) => ONBOARDING_ITEMS.find((item) => item.id === id)?.label ?? id)
        .join(', ')
    : '';
}

/**
 * The invite actions, each one call to the recruiting API it always used.
 * Results go to `notify`; `reload` refetches after a change and `onChanged`
 * tells the hub (its tab counts) that something moved.
 */
export function useInviteActions({
  reload,
  onChanged,
  notify,
}: {
  reload: () => Promise<unknown>;
  onChanged?: () => void;
  notify: (notice: Notice | null) => void;
}) {
  const [linkBusy, setLinkBusy] = useState<{ id: string; action: 'copy' | 'resend' } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  // A link copied or re-sent by hand shows under the person so it can be selected.
  const [shownLink, setShownLink] = useState<{ id: string; url: string } | null>(null);

  const copyInviteLink = async (invite: InviteView) => {
    notify(null);
    setLinkBusy({ id: invite.id, action: 'copy' });
    const url = (async () => {
      const response = await fetch(`/api/portal/recruiting/invites/${invite.id}`, { headers: await authHeaders() });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not load the link');
      return json.inviteUrl as string;
    })();
    if (shouldShareViaApp()) {
      // In the app the share sheet replaces the clipboard (Copy is one of its actions).
      try {
        let link: string;
        try {
          link = await url;
        } catch {
          notify({ tone: 'error', text: "Couldn't load the link. Try again." });
          return;
        }
        setShownLink({ id: invite.id, url: link });
        try {
          await shareLinkViaApp(link, `Invite for ${invite.candidateName}`);
        } catch {
          // The share sheet didn't open: copy instead, in plain words.
          try {
            await navigator.clipboard.writeText(link);
            notify({ tone: 'ok', text: `Link for ${invite.candidateName} copied.` });
          } catch {
            notify({ tone: 'warn', text: "Couldn't open sharing. Select the link below and copy it." });
          }
        }
      } finally {
        setLinkBusy(null);
      }
      return;
    }
    try {
      await copyPendingText(url);
      setShownLink({ id: invite.id, url: await url });
      notify({ tone: 'ok', text: `Link for ${invite.candidateName} copied.` });
    } catch {
      // Either the link failed to load or the browser refused the clipboard.
      try {
        setShownLink({ id: invite.id, url: await url });
        notify({ tone: 'warn', text: 'Your browser blocked copying. Select the link below and copy it.' });
      } catch (err) {
        notify({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load the link' });
      }
    } finally {
      setLinkBusy(null);
    }
  };

  const resendInvite = async (invite: InviteView, replaceOpenedLink = false) => {
    notify(null);
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
        notify({ tone: 'ok', text: `Invite re-sent to ${invite.candidateEmail}. The link works until ${until}.${fresh}` });
      } else if (typeof json.inviteUrl !== 'string') {
        notify({ tone: 'warn', text: "The email didn't go out. Try Resend again in a minute." });
      } else {
        setShownLink({ id: invite.id, url: json.inviteUrl });
        notify({
          tone: 'warn',
          text: `The email didn't go out. Copy the link below and send it yourself (works until ${until}).${fresh}`,
        });
      }
      await reload();
    } catch (err) {
      notify({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to re-send the invite' });
    } finally {
      setLinkBusy(null);
    }
  };

  /** Activate or Reject a recruit whose paperwork is in. Resolves true when it went through. */
  const convertInvite = async (invite: InviteView, action: 'approved' | 'rejected'): Promise<boolean> => {
    setProcessingId(invite.id);
    notify(null);
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
              ? `Can't activate ${invite.candidateName} yet. Missing: ${missing}`
              : `Can't activate ${invite.candidateName} yet. Required onboarding items are missing.`
          );
        }
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update recruit');
      }
      notify({
        tone: 'ok',
        text: action === 'approved' ? `${invite.candidateName} is activated.` : `${invite.candidateName} was rejected.`,
      });
      await reload();
      onChanged?.();
      return true;
    } catch (err) {
      notify({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to update recruit' });
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  return { linkBusy, processingId, shownLink, setShownLink, copyInviteLink, resendInvite, convertInvite };
}

/** A link shown under someone (copied or re-sent by hand): selectable, with Open. */
export function ShownLink({ url }: { url: string }) {
  return (
    <div className={r.rowLink}>
      <p className={r.readyUrl}>{url}</p>
      <a className={`${s.btnSecondary} ${u.sm}`} href={url} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Open
      </a>
    </div>
  );
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
 * Send an invite, in a sheet: filled from a website application (picked here,
 * or handed in as `applicationId`) or typed by hand. `pickable` is who the
 * picker offers (applicants not invited yet). After it sends, the sheet shows
 * the link (when there is one) until it is closed.
 */
export function InviteFormSheet({
  applications,
  pickable,
  applicationId,
  onClose,
  onCreated,
}: {
  applications: ApplicationRecord[];
  pickable: ApplicationRecord[];
  applicationId?: string | null;
  onClose: () => void;
  onCreated: () => Promise<unknown> | void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // Sent: the sheet shows the result (and the link) instead of the form.
  const [sent, setSent] = useState(false);

  const fillFromApplication = useCallback(
    (id: string) => {
      const application = applications.find((item) => item.id === id);
      setForm((prev) =>
        application
          ? {
              ...prev,
              applicationId: id,
              candidateName: application.name,
              candidateEmail: application.email,
              candidatePhone: application.phone,
              candidateCity: application.city,
            }
          : { ...prev, applicationId: id }
      );
    },
    [applications]
  );

  // Opened for an applicant: fill from them once, then focus the name.
  useEffect(() => {
    if (applicationId) fillFromApplication(applicationId);
    // AdminSheet focuses Close first; the form wants the name.
    const timer = window.setTimeout(() => document.getElementById('invite-name')?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  const options = [...pickable];
  const filled = applications.find((application) => application.id === form.applicationId);
  if (filled && !options.includes(filled)) options.unshift(filled);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setNotice(null);
    setLatestInviteUrl('');
    try {
      const response = await fetch('/api/portal/recruiting/invites', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      // Server refusals (an email that already has an account is admin-only to
      // re-invite, a role above the inviter's tier) carry their own message.
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to create invite');
      // No link comes back for an email that already has an account: it only
      // ever goes to that inbox.
      setLatestInviteUrl(typeof json.inviteUrl === 'string' ? json.inviteUrl : '');
      setForm(emptyForm);
      setSent(true);
      if (json.emailSent) {
        setNotice({ tone: 'ok', text: `Invite emailed to ${json.invite.candidateEmail} from the onboarding department.` });
      } else if (typeof json.inviteUrl === 'string') {
        setNotice({ tone: 'warn', text: "Invite created, but the email didn't go out. Copy the link below and send it yourself." });
      } else {
        setNotice({ tone: 'warn', text: "Invite created, but the email didn't go out. Use Resend to try again." });
      }
      await onCreated();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to create invite' });
    } finally {
      setSaving(false);
    }
  };

  const copyLatestInvite = async () => {
    if (!latestInviteUrl) return;
    if (shouldShareViaApp()) {
      try {
        await shareLinkViaApp(latestInviteUrl, 'Onboarding invite');
        return;
      } catch {
        // The share sheet didn't open: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(latestInviteUrl);
    } catch {
      setNotice({ tone: 'warn', text: "Couldn't copy the link. Select it and copy it." });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AdminSheet
      title="Send an invite"
      onClose={onClose}
      footer={
        sent ? (
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={onClose}>
            Done
          </button>
        ) : (
          <button type="submit" form="invite-form" className={`${s.btnPrimary} ${r.submit}`} disabled={saving}>
            {saving ? <Loader2 size={20} className={u.spin} aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
            {saving ? 'Sending…' : 'Send invite'}
          </button>
        )
      }
    >
      <div className={u.sheetPad}>
        {notice ? (
          <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
          </AdminNotice>
        ) : null}

        {latestInviteUrl ? (
          <div className={r.ready} role="status">
            <p className={r.readyTitle}>
              <CheckCircle2 size={18} aria-hidden="true" />
              Invite link ready
            </p>
            <p className={r.readyUrl}>{latestInviteUrl}</p>
            <div className={u.btnRow}>
              <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={copyLatestInvite}>
                <Link2 size={18} aria-hidden="true" />
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className={`${s.btnSecondary} ${u.sm}`} href={latestInviteUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                Open
              </a>
            </div>
          </div>
        ) : null}

        {sent ? null : (
          <form id="invite-form" onSubmit={createInvite} className={u.formGrid}>
            {options.length > 0 && (
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
                    {options.map((application) => (
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
                  onChange={(event) => setForm((prev) => ({ ...prev, intendedFieldRole: event.target.value as FieldRole }))}
                >
                  {invitableFieldRolesFor(user?.role, { recruiter: isRecruiter(user) }).map((role) => (
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
          </form>
        )}
      </div>
    </AdminSheet>
  );
}
