import type { ApplicationRecord, OnboardingInviteStatus } from '@/types';
import { interestLabels } from '@/lib/forms/applicationInterests';
import type { InviteView } from './Invites';

// The Recruits list: website applications and invites as one list, one row per
// person. A person with an invite shows the invite (it is further along); an
// application nobody has invited shows on its own. Each row says where the
// person is in one plain sentence.

export type RecruitState =
  /** Applied (or was contacted); no invite yet. */
  | 'new'
  /** The application says invited, but the invite isn't in this list (someone else's). */
  | 'invitedElsewhere'
  /** Invite sent; the link isn't opened yet. */
  | 'invited'
  /** Opened the link; paperwork under way. */
  | 'started'
  /** The link ran out before they finished. */
  | 'expired'
  /** Paperwork sent back: Activate or Reject. */
  | 'finished'
  | 'approved'
  | 'joined'
  | 'notSelected';

export interface RecruitRow {
  key: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  state: RecruitState;
  application: ApplicationRecord | null;
  invite: InviteView | null;
  /** When the person last moved (applied, invited or finished), for newest-first order. */
  at: number;
}

const NEEDS_ACTION: Record<RecruitState, boolean> = {
  new: true,
  invitedElsewhere: false,
  invited: true,
  started: true,
  expired: true,
  finished: true,
  approved: false,
  joined: false,
  notSelected: false,
};

/** Rows waiting on the owner: invite them, nudge them, or activate them. */
export function needsAction(row: RecruitRow): boolean {
  return NEEDS_ACTION[row.state];
}

/** The stored status turns 'expired' only when the recruit opens a stale link; the date tells first. */
export function shownStatus(invite: InviteView): OnboardingInviteStatus {
  const pastExpiry = !!invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now();
  return pastExpiry && (invite.status === 'invited' || invite.status === 'in_progress') ? 'expired' : invite.status;
}

const INVITE_STATE: Record<OnboardingInviteStatus, RecruitState> = {
  invited: 'invited',
  in_progress: 'started',
  expired: 'expired',
  submitted: 'finished',
  approved: 'approved',
  converted: 'joined',
  rejected: 'notSelected',
};

function applicationState(application: ApplicationRecord): RecruitState {
  if (application.status === 'invited') return 'invitedElsewhere';
  if (application.status === 'converted') return 'joined';
  if (application.status === 'not_selected') return 'notSelected';
  return 'new';
}

const personKey = (email: string | undefined) => (email ?? '').trim().toLowerCase();

function toMs(value: unknown): number {
  const ms = value ? new Date(value as string).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Applications are newest first and invites newest first, as the recruiting API sends them. */
export function recruitRows(applications: ApplicationRecord[], invites: InviteView[]): RecruitRow[] {
  // One invite per person: the one waiting on Activate if there is one, else the newest.
  const invitesByPerson = new Map<string, InviteView>();
  for (const invite of invites) {
    const key = personKey(invite.candidateEmail) || `invite:${invite.id}`;
    const kept = invitesByPerson.get(key);
    if (!kept || (invite.status === 'submitted' && kept.status !== 'submitted')) invitesByPerson.set(key, invite);
  }
  const applicationsById = new Map(applications.map((application) => [application.id, application]));
  const newestApplication = new Map<string, ApplicationRecord>();
  for (const application of applications) {
    const key = personKey(application.email);
    if (key && !newestApplication.has(key)) newestApplication.set(key, application);
  }
  const invitedApplicationIds = new Set(invites.map((invite) => invite.applicationId).filter(Boolean));

  const rows: RecruitRow[] = [];
  for (const [key, invite] of invitesByPerson) {
    const application =
      (invite.applicationId ? applicationsById.get(invite.applicationId) : undefined) ??
      newestApplication.get(key) ??
      null;
    rows.push({
      key: `invite:${invite.id}`,
      name: invite.candidateName,
      city: invite.candidateCity || application?.city || '',
      phone: invite.candidatePhone || application?.phone || '',
      email: invite.candidateEmail,
      state: INVITE_STATE[shownStatus(invite)] ?? 'invited',
      application,
      invite,
      at: toMs(invite.submittedAt ?? invite.createdAt),
    });
  }
  for (const application of applications) {
    const key = personKey(application.email);
    if (invitedApplicationIds.has(application.id)) continue;
    if (key && (invitesByPerson.has(key) || newestApplication.get(key) !== application)) continue;
    rows.push({
      key: `application:${application.id}`,
      name: application.name,
      city: application.city,
      phone: application.phone,
      email: application.email,
      state: applicationState(application),
      application,
      invite: null,
      at: toMs(application.createdAt),
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

/** "Oct 6", with the year once it isn't this year. */
function shortDate(value: unknown, now: number): string {
  const ms = toMs(value);
  if (!ms) return '';
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "today", "yesterday", "3 days ago", then "on Oct 6". */
function ago(value: unknown, now: number): string {
  const ms = toMs(value);
  if (!ms) return '';
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${shortDate(ms, now)}`;
}

const sentence = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(' · ');

/** Where the person is, in one plain sentence ("Invited Oct 6 · hasn't opened the link"). */
export function recruitSentence(row: RecruitRow, now = Date.now()): string {
  const { application, invite } = row;
  const applied = `Applied ${ago(application?.createdAt, now)}`;
  const invited = `Invited ${shortDate(invite?.createdAt, now)}`;
  switch (row.state) {
    case 'new': {
      const wants = interestLabels(application?.interests);
      return sentence(
        applied,
        application?.status === 'contacted' ? 'contacted, not invited yet' : 'not invited yet',
        wants ? `wants ${wants}` : ''
      );
    }
    case 'invitedElsewhere':
      return sentence(applied, 'already invited');
    case 'invited':
      return sentence(invited, "hasn't opened the link");
    case 'started':
      return sentence(invited, 'started their paperwork');
    case 'expired':
      return sentence(invited, 'the link ran out');
    case 'finished':
      return sentence(`Finished their paperwork ${shortDate(invite?.submittedAt, now)}`, 'ready to activate');
    case 'approved':
      return 'Paperwork approved';
    case 'joined':
      return 'Joined the team';
    case 'notSelected':
      return 'Not selected';
  }
}

/** Case-insensitive match on name, city, email or phone. Digits also match the
 * phone ignoring its punctuation, so "5125550100" finds "(512) 555-0100". */
export function matchesSearch(row: RecruitRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if ([row.name, row.city, row.email, row.phone].some((value) => (value ?? '').toLowerCase().includes(needle))) {
    return true;
  }
  const digits = needle.replace(/\D/g, '');
  return digits.length >= 3 && (row.phone ?? '').replace(/\D/g, '').includes(digits);
}

export const EXPORT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'referredBy', label: 'Referred by' },
  { key: 'interestedIn', label: 'Interested in' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Submitted' },
];

const STATE_WORD: Record<RecruitState, string> = {
  new: 'Not invited yet',
  invitedElsewhere: 'Invited',
  invited: 'Invited',
  started: 'Started',
  expired: 'Link ran out',
  finished: 'Finished',
  approved: 'Approved',
  joined: 'Joined',
  notSelected: 'Not selected',
};

export function exportRow(row: RecruitRow): Record<string, unknown> {
  return {
    id: row.key,
    name: row.name,
    city: row.city,
    phone: row.phone,
    email: row.email,
    referredBy: row.application?.referredBy ?? '',
    interestedIn: interestLabels(row.application?.interests),
    status: STATE_WORD[row.state],
    createdAt: row.application?.createdAt ?? row.invite?.createdAt ?? '',
  };
}
