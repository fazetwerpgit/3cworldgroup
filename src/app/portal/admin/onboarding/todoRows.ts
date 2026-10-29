import { interestLabels } from '@/lib/forms/applicationInterests';
import { isFreshApplicant, isWaitingApplication } from '@/lib/recruiting/applicantAging';
import type { ApplicationRecord } from '@/types';
import { oldestUpload, personName, timeAgo, type ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';

// To do is a short stack of sections, most urgent first: sign-ups to approve,
// documents to check, paperwork to activate, new website applicants. The
// waiting count is exactly what the Hiring badge counts (opsQueues): applicants
// older than 30 days fold into "Older applicants" and count nowhere, and
// applicants marked "Not a fit" sit in "Archived".

export interface Signup {
  uid: string;
  name: string;
  createdAt: Date | null;
}

interface RowBase {
  key: string;
  name: string;
  /** What is waiting: "2 documents to check", "Fiber, Solar · Austin, TX". */
  detail: string;
  /** How long it has waited: "3 days ago" ('' when unknown). */
  when: string;
  /** detail · when, the one line under the name on a phone. */
  line: string;
  /** When the wait started (ms); null sorts last. */
  since: number | null;
}

export type TodoRow = RowBase &
  (
    | { kind: 'signup' }
    | { kind: 'documents'; userId: string }
    | { kind: 'activate'; invite: InviteView }
    | { kind: 'applicant'; application: ApplicationRecord }
  );

export type ApplicantRow = Extract<TodoRow, { kind: 'applicant' }>;

export interface TodoSources {
  signups?: Signup[] | null;
  people?: ChecklistPerson[] | null;
  /** Invites with status 'submitted'. */
  ready?: InviteView[] | null;
  /** Every website application the recruiting API sent (any status). */
  applications?: ApplicationRecord[] | null;
}

export interface TodoSections {
  signups: TodoRow[];
  documents: TodoRow[];
  activate: TodoRow[];
  /** Waiting applicants from the last 30 days, newest first. */
  applicants: ApplicantRow[];
  /** Waiting applicants older than 30 days (or undated), newest first. Not counted. */
  older: ApplicantRow[];
  /** Marked "Not a fit", most recently archived first. Not counted. */
  archived: ApplicantRow[];
  /** Things waiting on you: the To do tab count and the Hiring badge. */
  waiting: number;
}

function millis(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

const sentence = (...parts: string[]) => parts.filter(Boolean).join(' · ');
const oldestFirst = (a: RowBase, b: RowBase) =>
  (a.since ?? Number.MAX_SAFE_INTEGER) - (b.since ?? Number.MAX_SAFE_INTEGER);
const newestFirst = (a: RowBase, b: RowBase) => (b.since ?? 0) - (a.since ?? 0);

/** The text of a row: what is waiting, how long, and both as one line. */
const facts = (detail: string, when: string) => ({ detail, when, line: sentence(detail, when) });

/** What they want to sell, then where they are: "Fiber, Solar · Austin, TX". */
export function applicantHeadline(application: ApplicationRecord): string {
  return sentence(interestLabels(application.interests), application.city?.trim() ?? '');
}

function applicantRow(application: ApplicationRecord, now: number): ApplicantRow {
  return {
    kind: 'applicant',
    key: `applicant-${application.id}`,
    application,
    name: application.name || 'Unnamed applicant',
    // What they want to sell and where: what triage needs. Contact and source live in the sheet.
    ...facts(applicantHeadline(application) || 'Applied on the website', timeAgo(application.createdAt, now)),
    since: millis(application.createdAt),
  };
}

export function buildTodoSections(sources: TodoSources, now = Date.now()): TodoSections {
  const signups: TodoRow[] = (sources.signups ?? []).map((signup) => {
    return {
      kind: 'signup',
      key: `signup-${signup.uid}`,
      name: signup.name,
      ...facts('Needs a role', timeAgo(signup.createdAt, now)),
      since: millis(signup.createdAt),
    };
  });

  const documents: TodoRow[] = [];
  for (const person of sources.people ?? []) {
    if (person.toReview <= 0) continue;
    const since = oldestUpload(person);
    const count = person.toReview;
    documents.push({
      kind: 'documents',
      key: `documents-${person.userId}`,
      userId: person.userId,
      name: personName(person),
      ...facts(`${count} document${count === 1 ? '' : 's'} to check`, timeAgo(since, now)),
      since: millis(since),
    });
  }

  const activate: TodoRow[] = (sources.ready ?? []).map((invite) => ({
    kind: 'activate',
    key: `activate-${invite.id}`,
    invite,
    name: invite.candidateName,
    ...facts('Finished their paperwork', timeAgo(invite.submittedAt, now)),
    since: millis(invite.submittedAt),
  }));

  const applicants: ApplicantRow[] = [];
  const older: ApplicantRow[] = [];
  const archived: ApplicantRow[] = [];
  for (const application of sources.applications ?? []) {
    if (application.status === 'not_selected') {
      const row = applicantRow(application, now);
      archived.push({ ...row, since: millis(application.notSelectedAt) ?? row.since });
    } else if (isWaitingApplication(application)) {
      (isFreshApplicant(application.createdAt, now) ? applicants : older).push(applicantRow(application, now));
    }
  }

  signups.sort(oldestFirst);
  documents.sort(oldestFirst);
  activate.sort(oldestFirst);
  applicants.sort(newestFirst);
  older.sort(newestFirst);
  archived.sort(newestFirst);

  return {
    signups,
    documents,
    activate,
    applicants,
    older,
    archived,
    waiting: signups.length + documents.length + activate.length + applicants.length,
  };
}
