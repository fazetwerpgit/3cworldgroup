import { interestLabels } from '@/lib/forms/applicationInterests';
import { sourceLabel } from '@/lib/forms/applicationSource';
import { isFreshApplicant } from '@/lib/recruiting/applicantAging';
import { DecommissionReasonLabels, type ApplicationRecord, type OnboardingInviteStatus, type PipelineRep } from '@/types';
import type { ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';

// Hiring > People: everyone in hiring as one list, one row per person, from
// the three places a person shows up:
//   - website applications (applications/{id}),
//   - invites (onboardingInvites/{id}), linked to the application they came
//     from by `applicationId`, and to the account they made by
//     `convertedUserId` (set when the paperwork is sent back),
//   - accounts with a field role (the pipeline API), which carry the invite
//     that made them (`users.onboardingInviteId`); an application points at
//     the account too (`convertedUserId`) once its invite is sent back.
// Records joined by those links, or sharing an email (trimmed, lower case),
// are one person. The person's stage is the furthest any of their records got.

export type PeopleStage = 'applied' | 'invited' | 'paperwork' | 'ready' | 'selling' | 'notFit' | 'deactivated';

export const PEOPLE_STAGES: readonly PeopleStage[] = [
  'applied',
  'invited',
  'paperwork',
  'ready',
  'selling',
  'notFit',
  'deactivated',
];

/** The stage as the row's first words. */
export const STAGE_LABEL: Record<PeopleStage, string> = {
  applied: 'Applied',
  invited: 'Invited',
  paperwork: 'Paperwork',
  ready: 'Ready to activate',
  selling: 'Selling',
  notFit: 'Not a fit',
  deactivated: 'Deactivated',
};

/** The filter's short names. */
export const STAGE_FILTER_LABEL: Record<PeopleStage, string> = { ...STAGE_LABEL, ready: 'Ready' };

/**
 * 'current' (the default): everyone on the way in (invited, paperwork, ready,
 * and applicants from the last 30 days, the To do rule), plus anyone who
 * reached selling, not a fit or deactivated in the last 14 days.
 */
export type PeopleFilter = 'current' | 'all' | PeopleStage;

export const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

export interface Person {
  key: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  stage: PeopleStage;
  /** What the stage means for them: "3 of 7 done · 2 to check". */
  detail: string;
  /** When they reached this stage (ms), null when no record says. */
  since: number | null;
  /** Their newest application, and all of them newest first. */
  application: ApplicationRecord | null;
  applications: ApplicationRecord[];
  /** The invite that decides the stage (one waiting on Activate, else the newest), and all newest first. */
  invite: InviteView | null;
  invites: InviteView[];
  /** Their account, when the viewer can see the team (management and recruiters). */
  rep: PipelineRep | null;
  /** Their onboarding checklist, when the viewer can see it. */
  checklist: ChecklistPerson | null;
  /** Uploads waiting on this viewer (the checklist's toReview). */
  toCheck: number;
}

export interface PeopleSources {
  applications: ApplicationRecord[];
  invites: InviteView[];
  /** null when the viewer can't see the team (field managers). */
  reps?: PipelineRep[] | null;
  checklists?: ChecklistPerson[] | null;
}

export function toMs(value: unknown): number | null {
  if (!value) return null;
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export const normalEmail = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();

/** The stored status turns 'expired' only when the recruit opens a stale link; the date tells first. */
export function shownStatus(invite: InviteView, now = Date.now()): OnboardingInviteStatus {
  const expires = toMs(invite.expiresAt);
  const pastExpiry = expires !== null && expires < now;
  return pastExpiry && (invite.status === 'invited' || invite.status === 'in_progress') ? 'expired' : invite.status;
}

/** The invite email bounced or never went out: they need the link by hand. */
export function emailProblem(invite: InviteView | null): boolean {
  return invite?.status === 'invited' && (invite.emailStatus === 'failed' || invite.emailStatus === 'bounced');
}

/** A link only an older invite has (not saved), already opened: a new one replaces it, so it asks first. */
export function opensLegacyLink(invite: InviteView): boolean {
  return !invite.linkSaved && invite.status === 'in_progress';
}

/** Copy link works on a saved link that isn't tied to an existing account and hasn't run out. */
export function canCopyLink(invite: InviteView, now = Date.now()): boolean {
  const status = shownStatus(invite, now);
  return invite.linkSaved && !invite.existingAccount && (status === 'invited' || status === 'in_progress');
}

/** Resend works while the invite is still open (sent, opened or run out). */
export function canResend(invite: InviteView, now = Date.now()): boolean {
  const status = shownStatus(invite, now);
  return status === 'invited' || status === 'in_progress' || status === 'expired';
}

// ---------- joining records into people ----------

class Links {
  private parent = new Map<string, string>();

  find(node: string): string {
    let root = node;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression.
    let at = node;
    while (at !== root) {
      const next = this.parent.get(at)!;
      this.parent.set(at, root);
      at = next;
    }
    if (!this.parent.has(root)) this.parent.set(root, root);
    return root;
  }

  join(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

const newestFirst = <T>(at: (item: T) => unknown) => (a: T, b: T) => (toMs(at(b)) ?? 0) - (toMs(at(a)) ?? 0);

/** The invite that decides where someone is: the one waiting on Activate, else the newest. */
function currentInvite(invites: InviteView[]): InviteView | null {
  return invites.find((invite) => invite.status === 'submitted') ?? invites[0] ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What they want to sell, then where: "Fiber, Solar · Austin, TX". */
function wantsAndWhere(application: ApplicationRecord | null): string {
  if (!application) return '';
  return [interestLabels(application.interests), application.city?.trim() ?? ''].filter(Boolean).join(' · ');
}

function latestReview(checklist: ChecklistPerson | null): number | null {
  let latest: number | null = null;
  for (const item of checklist?.items ?? []) {
    const at = toMs(item.reviewedAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

interface Placed {
  stage: PeopleStage;
  detail: string;
  since: number | null;
}

/** Where a person is, from the furthest of their records. */
export function placePerson(
  records: {
    application: ApplicationRecord | null;
    invite: InviteView | null;
    rep: PipelineRep | null;
    checklist: ChecklistPerson | null;
  },
  now = Date.now()
): Placed {
  const { application, invite, rep, checklist } = records;
  const toCheck = checklist?.toReview ?? 0;

  if (rep) {
    if (rep.stage === 'decommissioned') {
      // A recruit rejected at Activate never sold: not a fit, not a rep let go.
      if (invite?.status === 'rejected' && !rep.activatedAt) {
        return { stage: 'notFit', detail: 'Paperwork turned down', since: toMs(invite.updatedAt) };
      }
      const record = rep.decommission;
      return {
        stage: 'deactivated',
        detail: record ? DecommissionReasonLabels[record.reason] : 'Account turned off',
        since: toMs(record?.decommissionedAt),
      };
    }
    if (rep.stage === 'processing') {
      const done = rep.onboarding;
      if (done && done.total > 0 && done.approved >= done.total) {
        return {
          stage: 'ready',
          detail: 'All paperwork approved',
          since: latestReview(checklist) ?? toMs(invite?.submittedAt) ?? toMs(rep.createdAt),
        };
      }
      const parts = [done && done.total > 0 ? `${done.approved} of ${done.total} done` : 'Not finished'];
      if (toCheck > 0) parts.push(`${toCheck} to check`);
      return {
        stage: 'paperwork',
        detail: parts.join(' · '),
        since: toMs(invite?.submittedAt) ?? toMs(rep.createdAt),
      };
    }
    const since = toMs(rep.activatedAt) ?? toMs(rep.hireDate);
    if (rep.stage === 'need_logins') return { stage: 'selling', detail: 'Never signed in', since };
    if (rep.stage === 'cleared_to_sell') return { stage: 'selling', detail: 'Signed in, no sales yet', since };
    const sold: string[] = [];
    if (rep.approvedSales > 0 || rep.carrierOrders === 0) sold.push(plural(rep.approvedSales, 'sale'));
    if (rep.carrierOrders > 0) sold.push(plural(rep.carrierOrders, 'carrier order'));
    return { stage: 'selling', detail: sold.join(' · '), since };
  }

  // Re-applied after an invite that went nowhere: the new application leads.
  const reapplied =
    !!invite &&
    !!application &&
    (invite.status === 'rejected' || shownStatus(invite, now) === 'expired') &&
    (application.status === 'applied' || application.status === 'contacted') &&
    (toMs(application.createdAt) ?? 0) > (toMs(invite.createdAt) ?? 0);

  if (invite && !reapplied) {
    switch (shownStatus(invite, now)) {
      case 'invited':
        return {
          stage: 'invited',
          detail:
            invite.emailStatus === 'failed'
              ? "Email didn't go out"
              : invite.emailStatus === 'bounced'
                ? 'Email bounced'
                : "Hasn't opened the link",
          since: toMs(invite.createdAt),
        };
      case 'expired':
        return { stage: 'invited', detail: 'Link ran out', since: toMs(invite.createdAt) };
      case 'in_progress':
        return { stage: 'paperwork', detail: 'Opened the link, not sent back yet', since: toMs(invite.updatedAt) ?? toMs(invite.createdAt) };
      case 'submitted':
        return { stage: 'ready', detail: 'Paperwork sent back', since: toMs(invite.submittedAt) };
      case 'approved':
      case 'converted':
        return { stage: 'selling', detail: 'Joined the team', since: toMs(invite.updatedAt) };
      case 'rejected':
        return { stage: 'notFit', detail: 'Paperwork turned down', since: toMs(invite.updatedAt) };
    }
  }

  if (application) {
    switch (application.status) {
      case 'not_selected':
        return {
          stage: 'notFit',
          detail: application.notSelectedByName ? `Marked by ${application.notSelectedByName}` : wantsAndWhere(application) || 'Applied on the website',
          since: toMs(application.notSelectedAt) ?? toMs(application.updatedAt),
        };
      case 'invited':
        return { stage: 'invited', detail: 'Invited by another manager', since: toMs(application.updatedAt) };
      case 'converted':
        return { stage: 'selling', detail: 'Joined the team', since: toMs(application.updatedAt) };
      default: {
        const wants = wantsAndWhere(application) || 'Applied on the website';
        return {
          stage: 'applied',
          detail: application.status === 'contacted' ? `Contacted · ${wants}` : wants,
          since: toMs(application.createdAt),
        };
      }
    }
  }

  return { stage: 'applied', detail: '', since: null };
}

/** Everyone, one row per person, most recently moved first. */
export function mergePeople(sources: PeopleSources, now = Date.now()): Person[] {
  const links = new Links();
  const emailNode = (email: string) => `e:${email}`;
  const linkEmail = (node: string, email: string | null | undefined) => {
    const key = normalEmail(email);
    if (key) links.join(node, emailNode(key));
  };

  const reps = sources.reps ?? [];
  for (const application of sources.applications) {
    const node = `a:${application.id}`;
    links.find(node);
    linkEmail(node, application.email);
    if (application.convertedUserId) links.join(node, `r:${application.convertedUserId}`);
  }
  for (const invite of sources.invites) {
    const node = `i:${invite.id}`;
    links.find(node);
    linkEmail(node, invite.candidateEmail);
    if (invite.applicationId) links.join(node, `a:${invite.applicationId}`);
    if (invite.convertedUserId) links.join(node, `r:${invite.convertedUserId}`);
  }
  for (const rep of reps) {
    const node = `r:${rep.uid}`;
    links.find(node);
    linkEmail(node, rep.email);
    if (rep.inviteId) links.join(node, `i:${rep.inviteId}`);
  }

  interface Group {
    applications: ApplicationRecord[];
    invites: InviteView[];
    reps: PipelineRep[];
  }
  const groups = new Map<string, Group>();
  const groupOf = (node: string) => {
    const root = links.find(node);
    let group = groups.get(root);
    if (!group) {
      group = { applications: [], invites: [], reps: [] };
      groups.set(root, group);
    }
    return group;
  };
  for (const application of sources.applications) groupOf(`a:${application.id}`).applications.push(application);
  for (const invite of sources.invites) groupOf(`i:${invite.id}`).invites.push(invite);
  for (const rep of reps) groupOf(`r:${rep.uid}`).reps.push(rep);

  const checklistByUser = new Map((sources.checklists ?? []).map((person) => [person.userId, person]));

  const people: Person[] = [];
  for (const group of groups.values()) {
    const applications = [...group.applications].sort(newestFirst((a) => a.createdAt));
    const invites = [...group.invites].sort(newestFirst((invite) => invite.createdAt));
    // Two accounts on one email can't happen (one login per email); keep the newest if it ever does.
    const rep = [...group.reps].sort(newestFirst((r) => r.createdAt))[0] ?? null;
    const application = applications[0] ?? null;
    const invite = currentInvite(invites);
    const checklist = rep ? (checklistByUser.get(rep.uid) ?? null) : null;
    const placed = placePerson({ application, invite, rep, checklist }, now);
    const key = rep ? `rep:${rep.uid}` : invite ? `invite:${invite.id}` : `application:${application!.id}`;
    people.push({
      key,
      name:
        rep?.displayName?.trim() ||
        invite?.candidateName?.trim() ||
        application?.name?.trim() ||
        rep?.email ||
        'Unnamed',
      email: rep?.email || invite?.candidateEmail || application?.email || '',
      phone: invite?.candidatePhone || application?.phone || '',
      city: invite?.candidateCity || application?.city || '',
      ...placed,
      application,
      applications,
      invite,
      invites,
      rep,
      checklist,
      toCheck: checklist?.toReview ?? 0,
    });
  }
  return people.sort((a, b) => (b.since ?? 0) - (a.since ?? 0));
}

// ---------- filtering ----------

const ON_THE_WAY: ReadonlySet<PeopleStage> = new Set(['invited', 'paperwork', 'ready']);

export function inFilter(person: Person, filter: PeopleFilter, now = Date.now()): boolean {
  if (filter === 'all') return true;
  if (filter !== 'current') return person.stage === filter;
  if (ON_THE_WAY.has(person.stage)) return true;
  if (person.stage === 'applied') return isFreshApplicant(person.application?.createdAt ?? null, now);
  return person.since !== null && now - person.since <= RECENT_DAYS * DAY_MS;
}

export function stageCounts(people: Person[], now = Date.now()): Record<PeopleFilter, number> {
  const counts = { current: 0, all: people.length } as Record<PeopleFilter, number>;
  for (const stage of PEOPLE_STAGES) counts[stage] = 0;
  for (const person of people) {
    counts[person.stage] += 1;
    if (inFilter(person, 'current', now)) counts.current += 1;
  }
  return counts;
}

const FILTERS: readonly string[] = ['current', 'all', ...PEOPLE_STAGES];

/** A ?stage= value, or the default. */
export function parseFilter(value: string | null | undefined): PeopleFilter {
  return value && FILTERS.includes(value) ? (value as PeopleFilter) : 'current';
}

/** Case-insensitive on name, email, city and manager; digits also match the phone without its punctuation. */
export function matchesPerson(person: Person, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const fields = [person.name, person.email, person.city, person.phone, person.rep?.managerName ?? ''];
  if (fields.some((value) => (value ?? '').toLowerCase().includes(needle))) return true;
  const digits = needle.replace(/\D/g, '');
  return digits.length >= 3 && person.phone.replace(/\D/g, '').includes(digits);
}

/** The row's text after the name: "Paperwork · 3 of 7 done". */
export function personLine(person: Person): string {
  return [STAGE_LABEL[person.stage], person.detail].filter(Boolean).join(' · ');
}

// ---------- the timeline in the person sheet ----------

export interface TimelineEntry {
  key: string;
  at: number | null;
  text: string;
}

function emailWord(invite: InviteView): string {
  switch (invite.emailStatus) {
    case 'failed':
      return "email didn't go out";
    case 'bounced':
      return 'email bounced';
    case 'delivered':
      return 'email delivered';
    default:
      return '';
  }
}

/** What happened to them, oldest first. Only what a record says happened. */
export function personTimeline(person: Person, now = Date.now()): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const add = (key: string, at: unknown, ...parts: string[]) =>
    entries.push({ key, at: toMs(at), text: parts.filter(Boolean).join(' · ') });

  for (const application of person.applications) {
    const source = sourceLabel(application.source);
    add(
      `applied-${application.id}`,
      application.createdAt,
      'Applied on the website',
      source ? (application.source?.channel === 'direct' ? 'came in direct' : `via ${source}`) : '',
      application.referredBy?.trim() ? `referred by ${application.referredBy.trim()}` : ''
    );
    if (application.status === 'not_selected') {
      add(
        `notfit-${application.id}`,
        application.notSelectedAt,
        'Marked not a fit',
        application.notSelectedByName ? `by ${application.notSelectedByName}` : ''
      );
    }
  }
  for (const invite of person.invites) {
    add(`invited-${invite.id}`, invite.createdAt, `Invited by ${invite.ownerName || 'a manager'}`, emailWord(invite));
    const status = shownStatus(invite, now);
    if (status === 'expired') add(`expired-${invite.id}`, invite.expiresAt, 'The link ran out');
    if (invite.submittedAt) add(`sent-${invite.id}`, invite.submittedAt, 'Sent their paperwork back');
    if (invite.status === 'rejected') add(`rejected-${invite.id}`, invite.updatedAt, 'Paperwork turned down');
  }
  const { rep } = person;
  if (rep?.activatedAt) add('activated', rep.activatedAt, 'Activated');
  if (rep?.decommission) {
    add(
      'decommissioned',
      rep.decommission.decommissionedAt,
      'Deactivated',
      DecommissionReasonLabels[rep.decommission.reason],
      rep.decommission.decommissionedByName ? `by ${rep.decommission.decommissionedByName}` : ''
    );
  }
  return entries.sort((a, b) => (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER));
}

// ---------- export ----------

export const PEOPLE_EXPORT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
  { key: 'detail', label: 'Detail' },
  { key: 'since', label: 'Since' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'manager', label: 'Manager' },
  { key: 'referredBy', label: 'Referred by' },
  { key: 'interestedIn', label: 'Interested in' },
  { key: 'source', label: 'Source' },
];

export function peopleExportRow(person: Person): Record<string, unknown> {
  return {
    id: person.key,
    name: person.name,
    stage: STAGE_LABEL[person.stage],
    detail: person.detail,
    since: person.since ? new Date(person.since).toISOString() : '',
    city: person.city,
    phone: person.phone,
    email: person.email,
    manager: person.rep?.managerName ?? '',
    referredBy: person.application?.referredBy ?? '',
    interestedIn: interestLabels(person.application?.interests),
    source: sourceLabel(person.application?.source),
  };
}

// ---------- actions ----------

/** What the viewer may do, from their role (People reads these from useAuth). */
export interface PeopleCaps {
  /** Management or the recruiter grant: the team (accounts, paperwork, channels, field training). */
  canSeeTeam: boolean;
  /** Not a fit / Restore on an application: management or the recruiter grant. */
  canArchive: boolean;
  /** Decommission / Reinstate: management only (never the recruiter grant). */
  canDecommission: boolean;
}

export type PersonAction =
  | 'invite'
  | 'notFit'
  | 'restore'
  | 'copyLink'
  | 'resend'
  | 'activate'
  | 'reject'
  | 'review'
  | 'channels'
  | 'fieldTrain'
  | 'decommission'
  | 'reinstate';

/** Every action the person sheet offers for this person, primary first. */
export function personActions(person: Person, caps: PeopleCaps, now = Date.now()): PersonAction[] {
  const { application, invite, rep, stage } = person;
  const actions: PersonAction[] = [];
  const onTheWay = stage === 'paperwork' || stage === 'ready';

  if (stage === 'applied' && application && (application.status === 'applied' || application.status === 'contacted')) {
    actions.push('invite');
    if (caps.canArchive && application.status === 'applied') actions.push('notFit');
  }
  if (stage === 'notFit' && application?.status === 'not_selected' && caps.canArchive && !invite) {
    actions.push('restore');
  }
  if (invite?.status === 'submitted' && onTheWay) {
    actions.push('activate', 'reject');
  } else if (stage === 'ready' && rep && caps.canSeeTeam) {
    actions.push('activate');
  }
  if (invite && !rep && (stage === 'invited' || stage === 'paperwork') && canResend(invite, now)) {
    if (canCopyLink(invite, now)) actions.push('copyLink');
    actions.push('resend');
  }
  if (rep && caps.canSeeTeam && person.checklist && person.checklist.items.length > 0) actions.push('review');
  if (rep && caps.canSeeTeam && rep.stage !== 'decommissioned') actions.push('fieldTrain', 'channels');
  if (rep && caps.canDecommission) actions.push(rep.stage === 'decommissioned' ? 'reinstate' : 'decommission');
  // Uploads still waiting on a check: checking them comes before Activate.
  if (stage === 'paperwork' && person.toCheck > 0 && actions.includes('review')) {
    return ['review', ...actions.filter((action) => action !== 'review')];
  }
  return actions;
}

/** The one action on the row, when the person is waiting on the viewer for it. */
export function rowAction(person: Person, caps: PeopleCaps, now = Date.now()): PersonAction | null {
  const actions = personActions(person, caps, now);
  const has = (action: PersonAction) => actions.includes(action);
  switch (person.stage) {
    case 'applied':
      return has('invite') ? 'invite' : null;
    case 'invited': {
      const { invite } = person;
      if (!invite || opensLegacyLink(invite)) return null;
      const stuck = shownStatus(invite, now) === 'expired' || emailProblem(invite);
      return stuck && has('resend') ? 'resend' : null;
    }
    case 'paperwork':
      return person.toCheck > 0 && has('review') ? 'review' : null;
    case 'ready':
      return has('activate') ? 'activate' : null;
    default:
      return null;
  }
}
