import { interestLabels } from '@/lib/forms/applicationInterests';
import type { ApplicationRecord } from '@/types';
import { oldestUpload, personName, timeAgo, type ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';

// To do is one list: one row per thing waiting on you, oldest first, each said
// in one plain sentence. The kinds are what the Hiring badge counts (opsQueues):
// sign-ups with no role, people with documents to check, finished paperwork to
// activate, website applicants to invite.

export interface Signup {
  uid: string;
  name: string;
  createdAt: Date | null;
}

interface RowBase {
  key: string;
  name: string;
  line: string;
  /** When the wait started (ms), for oldest-first; null sorts last. */
  since: number | null;
}

export type TodoRow = RowBase &
  (
    | { kind: 'signup' }
    | { kind: 'documents'; userId: string }
    | { kind: 'activate'; invite: InviteView }
    | { kind: 'applicant'; applicationId: string }
  );

export interface TodoSources {
  signups?: Signup[] | null;
  people?: ChecklistPerson[] | null;
  /** Invites with status 'submitted'. */
  ready?: InviteView[] | null;
  /** Applications with status 'applied'. */
  applied?: ApplicationRecord[] | null;
}

function millis(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

const sentence = (...parts: string[]) => parts.filter(Boolean).join(' · ');

export function buildTodoRows(sources: TodoSources, now = Date.now()): TodoRow[] {
  const rows: TodoRow[] = [];
  for (const signup of sources.signups ?? []) {
    const ago = timeAgo(signup.createdAt, now);
    rows.push({
      kind: 'signup',
      key: `signup-${signup.uid}`,
      name: signup.name,
      line: sentence(ago ? `Signed up ${ago}` : 'Signed up', 'needs a role'),
      since: millis(signup.createdAt),
    });
  }
  for (const person of sources.people ?? []) {
    if (person.toReview <= 0) continue;
    const since = oldestUpload(person);
    const count = person.toReview;
    rows.push({
      kind: 'documents',
      key: `documents-${person.userId}`,
      userId: person.userId,
      name: personName(person),
      line: sentence(`Uploaded ${count} document${count === 1 ? '' : 's'} to check`, timeAgo(since, now)),
      since: millis(since),
    });
  }
  for (const invite of sources.ready ?? []) {
    rows.push({
      kind: 'activate',
      key: `activate-${invite.id}`,
      invite,
      name: invite.candidateName,
      line: sentence('Finished their paperwork', timeAgo(invite.submittedAt, now)),
      since: millis(invite.submittedAt),
    });
  }
  for (const application of sources.applied ?? []) {
    const ago = timeAgo(application.createdAt, now);
    const wants = interestLabels(application.interests);
    rows.push({
      kind: 'applicant',
      key: `applicant-${application.id}`,
      applicationId: application.id,
      name: application.name,
      line: sentence(ago ? `Applied ${ago}` : 'Applied', wants ? `wants ${wants}` : ''),
      since: millis(application.createdAt),
    });
  }
  // Oldest wait first; anything without a date goes last.
  return rows.sort((a, b) => (a.since ?? Number.MAX_SAFE_INTEGER) - (b.since ?? Number.MAX_SAFE_INTEGER));
}
