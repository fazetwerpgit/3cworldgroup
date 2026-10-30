import { describe, expect, it } from 'vitest';
import type { ApplicationRecord, PipelineRep } from '@/types';
import type { ChecklistItem, ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';
import {
  inFilter,
  matchesPerson,
  mergePeople,
  parseFilter,
  peopleExportRow,
  personActions,
  personLine,
  personTimeline,
  rowAction,
  sheetActions,
  stageCounts,
  type PeopleCaps,
  type Person,
} from './peopleList';

const NOW = new Date('2026-10-29T12:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function application(overrides: { [K in keyof ApplicationRecord]?: unknown } = {}): ApplicationRecord {
  return {
    id: 'a1',
    name: 'Maya Torres',
    phone: '(512) 555-0101',
    email: 'maya@example.com',
    city: 'Austin, TX',
    interests: ['fiber'],
    status: 'applied',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    ...overrides,
  } as unknown as ApplicationRecord;
}

function invite(overrides: Partial<InviteView> = {}): InviteView {
  return {
    id: 'i1',
    candidateName: 'Maya Torres',
    candidateEmail: 'maya@example.com',
    candidatePhone: '(512) 555-0101',
    candidateCity: 'Austin, TX',
    intendedFieldRole: 'entry_level_rep',
    isIBO: false,
    status: 'invited',
    linkSaved: true,
    ownerName: 'Jacob Myers',
    applicationId: null,
    convertedUserId: null,
    expiresAt: daysAgo(-10),
    submittedAt: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

function rep(overrides: Partial<PipelineRep> = {}): PipelineRep {
  return {
    uid: 'u1',
    displayName: 'Maya Torres',
    email: 'maya@example.com',
    fieldRole: 'entry_level_rep',
    isIBO: false,
    stage: 'processing',
    onboarding: { approved: 3, total: 7 },
    channelsCleared: 0,
    channelsSubmitted: 0,
    approvedSales: 0,
    carrierOrders: 0,
    lastSignInAt: null,
    createdAt: daysAgo(1),
    activatedAt: null,
    ...overrides,
  };
}

function checklist(userId: string, toReview: number, items: Partial<ChecklistItem>[] = []): ChecklistPerson {
  return {
    userId,
    userName: 'Maya Torres',
    toReview,
    items: items.map((item, index) => ({
      id: `${userId}_${index}`,
      userId,
      itemId: `item${index}`,
      itemLabel: `Item ${index}`,
      category: 'documents',
      sensitive: false,
      adminOnly: false,
      referenceKind: 'storage',
      reference: null,
      files: [],
      status: 'submitted',
      onHold: false,
      submittedAt: daysAgo(1),
      reviewedAt: null,
      reviewerName: null,
      rejectionReason: null,
      esignEnvelopeId: null,
      hasSignedPdf: false,
      manualCompletion: null,
      ...item,
    })) as ChecklistItem[],
  };
}

const ADMIN: PeopleCaps = { canSeeTeam: true, canArchive: true, canDecommission: true };
const RECRUITER: PeopleCaps = { canSeeTeam: true, canArchive: true, canDecommission: false };
const FIELD_MANAGER: PeopleCaps = { canSeeTeam: false, canArchive: false, canDecommission: false };

const one = (sources: Parameters<typeof mergePeople>[0]): Person => {
  const people = mergePeople(sources, NOW);
  expect(people).toHaveLength(1);
  return people[0];
};

describe('merging records into people', () => {
  it('joins an application, its invite and the account it made into one person', () => {
    const person = one({
      applications: [application({ status: 'invited', convertedUserId: 'u1' })],
      invites: [invite({ status: 'submitted', applicationId: 'a1', convertedUserId: 'u1', submittedAt: daysAgo(1) })],
      reps: [rep()],
      checklists: [checklist('u1', 2)],
    });
    expect(person.key).toBe('rep:u1');
    expect(person.application?.id).toBe('a1');
    expect(person.invite?.id).toBe('i1');
    expect(person.rep?.uid).toBe('u1');
    expect(person.toCheck).toBe(2);
    expect(personLine(person)).toBe('Paperwork · 3 of 7 done · 2 to check');
  });

  it('joins by the links even when the emails differ', () => {
    const person = one({
      applications: [application({ email: 'maya.t@gmail.com' })],
      invites: [invite({ applicationId: 'a1', candidateEmail: 'maya@work.com', convertedUserId: 'u1', status: 'submitted' })],
      reps: [rep({ email: 'maya@work.com', inviteId: 'i1' })],
    });
    expect(person.applications).toHaveLength(1);
  });

  it('joins an account to its invite through users.onboardingInviteId', () => {
    const person = one({
      applications: [],
      invites: [invite({ candidateEmail: 'old@example.com', status: 'submitted' })],
      reps: [rep({ email: 'new@example.com', inviteId: 'i1' })],
    });
    expect(person.invite?.id).toBe('i1');
  });

  it('treats the same email (any case, stray spaces) as one person', () => {
    const person = one({
      applications: [application({ email: ' MAYA@Example.com ' })],
      invites: [invite({ candidateEmail: 'maya@example.com' })],
    });
    expect(person.stage).toBe('invited');
    expect(person.application?.id).toBe('a1');
  });

  it('keeps different people apart', () => {
    const people = mergePeople(
      {
        applications: [application(), application({ id: 'a2', name: 'Leo Park', email: 'leo@example.com' })],
        invites: [invite({ id: 'i9', candidateName: 'Ola Berg', candidateEmail: 'ola@example.com' })],
        reps: [rep({ uid: 'u7', displayName: 'Sam Cole', email: 'sam@example.com', stage: 'active', approvedSales: 4 })],
      },
      NOW
    );
    expect(people.map((p) => p.name).sort()).toEqual(['Leo Park', 'Maya Torres', 'Ola Berg', 'Sam Cole']);
  });

  it('keeps the invite waiting on Activate over a newer one, and lists every invite', () => {
    const person = one({
      applications: [],
      invites: [
        invite({ id: 'old', status: 'submitted', submittedAt: daysAgo(3), createdAt: daysAgo(9) }),
        invite({ id: 'new', status: 'invited', createdAt: daysAgo(1) }),
      ],
    });
    expect(person.invite?.id).toBe('old');
    expect(person.invites.map((i) => i.id)).toEqual(['new', 'old']);
    expect(person.stage).toBe('ready');
  });

  it('does without the team for a field manager (no accounts)', () => {
    const person = one({
      applications: [application({ status: 'converted' })],
      invites: [invite({ status: 'converted', applicationId: 'a1' })],
      reps: null,
    });
    expect(person.stage).toBe('selling');
    expect(person.detail).toBe('Joined the team');
    expect(person.rep).toBeNull();
  });
});

describe('stages', () => {
  const stageOf = (sources: Parameters<typeof mergePeople>[0]) => {
    const person = one(sources);
    return [person.stage, person.detail];
  };

  it('applied: what they want and where, or contacted', () => {
    expect(stageOf({ applications: [application()], invites: [] })).toEqual(['applied', 'Fiber · Austin, TX']);
    expect(stageOf({ applications: [application({ status: 'contacted' })], invites: [] })).toEqual([
      'applied',
      'Contacted · Fiber · Austin, TX',
    ]);
  });

  it('invited: not opened, email trouble, link ran out, or invited by someone else', () => {
    expect(stageOf({ applications: [], invites: [invite()] })).toEqual(['invited', "Hasn't opened the link"]);
    expect(stageOf({ applications: [], invites: [invite({ emailStatus: 'bounced' })] })).toEqual(['invited', 'Email bounced']);
    expect(stageOf({ applications: [], invites: [invite({ expiresAt: daysAgo(1) })] })).toEqual(['invited', 'Link ran out']);
    expect(stageOf({ applications: [application({ status: 'invited' })], invites: [] })).toEqual([
      'invited',
      'Invited by another manager',
    ]);
  });

  it('paperwork: opened the link, or an account with items left', () => {
    expect(stageOf({ applications: [], invites: [invite({ status: 'in_progress' })] })).toEqual([
      'paperwork',
      'Opened the link, not sent back yet',
    ]);
    expect(stageOf({ applications: [], invites: [], reps: [rep()] })).toEqual(['paperwork', '3 of 7 done']);
  });

  it('ready: every item approved, or paperwork sent back (when the account is not visible)', () => {
    expect(stageOf({ applications: [], invites: [], reps: [rep({ onboarding: { approved: 7, total: 7 } })] })).toEqual([
      'ready',
      'All paperwork approved',
    ]);
    expect(stageOf({ applications: [], invites: [invite({ status: 'submitted', submittedAt: daysAgo(1) })] })).toEqual([
      'ready',
      'Paperwork sent back',
    ]);
  });

  it('selling: activated, by what they have done since', () => {
    expect(stageOf({ applications: [], invites: [], reps: [rep({ stage: 'need_logins' })] })).toEqual(['selling', 'Never signed in']);
    expect(stageOf({ applications: [], invites: [], reps: [rep({ stage: 'cleared_to_sell' })] })).toEqual([
      'selling',
      'Signed in, no sales yet',
    ]);
    expect(stageOf({ applications: [], invites: [], reps: [rep({ stage: 'active', approvedSales: 4, carrierOrders: 2 })] })).toEqual([
      'selling',
      '4 sales · 2 carrier orders',
    ]);
  });

  it('not a fit: marked on the application, or the paperwork rejected', () => {
    expect(stageOf({ applications: [application({ status: 'not_selected', notSelectedByName: 'Jacob Myers' })], invites: [] })).toEqual([
      'notFit',
      'Marked by Jacob Myers',
    ]);
    // Reject at Activate turns the account off; they never sold, so they were not a fit.
    expect(
      stageOf({
        applications: [],
        invites: [invite({ status: 'rejected', convertedUserId: 'u1' })],
        reps: [rep({ stage: 'decommissioned' })],
      })
    ).toEqual(['notFit', 'Paperwork turned down']);
  });

  it('deactivated: a rep decommissioned, with the reason', () => {
    expect(
      stageOf({
        applications: [],
        invites: [],
        reps: [
          rep({
            stage: 'decommissioned',
            activatedAt: daysAgo(90),
            decommission: { reason: 'non_activity', decommissionedBy: 'x', decommissionedAt: new Date(daysAgo(3)) },
          }),
        ],
      })
    ).toEqual(['deactivated', 'Non-Activity']);
  });

  it('a new application after a rejected invite starts them over at applied', () => {
    expect(
      stageOf({
        applications: [application({ createdAt: daysAgo(1) })],
        invites: [invite({ status: 'rejected', createdAt: daysAgo(40), updatedAt: daysAgo(30) })],
      })
    ).toEqual(['applied', 'Fiber · Austin, TX']);
  });
});

describe('filters and search', () => {
  const people = mergePeople(
    {
      applications: [
        application(),
        application({ id: 'old', name: 'Old Applicant', email: 'old@example.com', createdAt: daysAgo(45) }),
      ],
      invites: [invite({ id: 'i2', candidateName: 'Ivy Chen', candidateEmail: 'ivy@example.com', candidatePhone: '972-555-0106' })],
      reps: [
        rep({ uid: 'fresh', displayName: 'New Seller', email: 'n@example.com', stage: 'need_logins', activatedAt: daysAgo(3) }),
        rep({ uid: 'vet', displayName: 'Vet Seller', email: 'v@example.com', stage: 'active', approvedSales: 9, activatedAt: daysAgo(200), managerName: 'Dana Ruiz' }),
      ],
    },
    NOW
  );
  const names = (filter: Parameters<typeof inFilter>[1]) =>
    people.filter((p) => inFilter(p, filter, NOW)).map((p) => p.name).sort();

  it('Now: everyone on the way in, fresh applicants, and anyone who moved in the last 14 days', () => {
    expect(names('current')).toEqual(['Ivy Chen', 'Maya Torres', 'New Seller']);
    expect(names('all')).toHaveLength(5);
    expect(names('selling')).toEqual(['New Seller', 'Vet Seller']);
  });

  it('counts each stage', () => {
    const counts = stageCounts(people, NOW);
    expect(counts).toMatchObject({ current: 3, all: 5, applied: 2, invited: 1, selling: 2, ready: 0 });
  });

  it('searches name, email, manager and phone digits', () => {
    const find = (q: string) => people.filter((p) => matchesPerson(p, q)).map((p) => p.name);
    expect(find('IVY')).toEqual(['Ivy Chen']);
    expect(find('9725550106')).toEqual(['Ivy Chen']);
    expect(find('dana')).toEqual(['Vet Seller']);
    expect(find('nobody')).toEqual([]);
  });

  it('reads ?stage=, falling back to Now', () => {
    expect(parseFilter('all')).toBe('all');
    expect(parseFilter('ready')).toBe('ready');
    expect(parseFilter('bogus')).toBe('current');
    expect(parseFilter(null)).toBe('current');
  });
});

describe('actions and who gets them', () => {
  const person = (sources: Parameters<typeof mergePeople>[0]) => one(sources);

  it('applicant: Invite on the row; Not a fit only for management and recruiters', () => {
    const p = person({ applications: [application()], invites: [] });
    expect(rowAction(p, ADMIN, NOW)).toBe('invite');
    expect(personActions(p, ADMIN, NOW)).toEqual(['invite', 'notFit']);
    expect(personActions(p, FIELD_MANAGER, NOW)).toEqual(['invite']);
  });

  it('not a fit: Restore for those who can archive', () => {
    const p = person({ applications: [application({ status: 'not_selected' })], invites: [] });
    expect(personActions(p, RECRUITER, NOW)).toEqual(['restore']);
    expect(personActions(p, FIELD_MANAGER, NOW)).toEqual([]);
    expect(rowAction(p, ADMIN, NOW)).toBeNull();
  });

  it('invited: Copy link and Resend in the sheet; Resend on the row only when stuck', () => {
    const fine = person({ applications: [], invites: [invite()] });
    expect(personActions(fine, FIELD_MANAGER, NOW)).toEqual(['copyLink', 'resend', 'cancelInvite']);
    expect(rowAction(fine, FIELD_MANAGER, NOW)).toBeNull();
    const expired = person({ applications: [], invites: [invite({ expiresAt: daysAgo(1) })] });
    expect(personActions(expired, FIELD_MANAGER, NOW)).toEqual(['resend', 'cancelInvite']);
    expect(rowAction(expired, FIELD_MANAGER, NOW)).toBe('resend');
    // An account-holder's link only ever goes to their inbox.
    const existing = person({ applications: [], invites: [invite({ existingAccount: true })] });
    expect(personActions(existing, ADMIN, NOW)).toEqual(['resend', 'cancelInvite']);
  });

  it('paperwork sent back: Activate and Reject (any recruiting role), team actions only for the team', () => {
    const sources = {
      applications: [],
      invites: [invite({ status: 'submitted', convertedUserId: 'u1', submittedAt: daysAgo(1) })],
    };
    expect(personActions(person(sources), FIELD_MANAGER, NOW)).toEqual(['activate', 'reject']);
    const withTeam = person({ ...sources, reps: [rep()], checklists: [checklist('u1', 1, [{}])] });
    // Uploads waiting on a check: checking comes first.
    expect(personActions(withTeam, RECRUITER, NOW)).toEqual(['review', 'activate', 'reject', 'fieldTrain', 'channels']);
    const checked = person({ ...sources, reps: [rep()], checklists: [checklist('u1', 0, [{ status: 'approved' }])] });
    expect(personActions(checked, RECRUITER, NOW)[0]).toBe('activate');
    expect(personActions(withTeam, ADMIN, NOW)).toContain('decommission');
    expect(rowAction(withTeam, RECRUITER, NOW)).toBe('review');
  });

  it('all approved, no invite: Activate through the account', () => {
    const p = person({ applications: [], invites: [], reps: [rep({ onboarding: { approved: 7, total: 7 } })] });
    expect(rowAction(p, RECRUITER, NOW)).toBe('activate');
  });

  it('selling: field train and channels; decommission for management only, never the recruiter grant', () => {
    const p = person({ applications: [], invites: [], reps: [rep({ stage: 'active', approvedSales: 2 })] });
    expect(personActions(p, ADMIN, NOW)).toEqual(['fieldTrain', 'channels', 'decommission']);
    expect(personActions(p, RECRUITER, NOW)).toEqual(['fieldTrain', 'channels']);
    expect(rowAction(p, ADMIN, NOW)).toBeNull();
  });

  it('deactivated: Reinstate for management only', () => {
    const p = person({
      applications: [],
      invites: [],
      reps: [rep({ stage: 'decommissioned', activatedAt: daysAgo(50) })],
    });
    expect(personActions(p, ADMIN, NOW)).toEqual(['reinstate']);
    expect(personActions(p, RECRUITER, NOW)).toEqual([]);
  });
});

describe('timeline and export', () => {
  it('tells what happened, oldest first', () => {
    const p = one({
      applications: [application({ createdAt: daysAgo(10), referredBy: 'Jordan Reyes' })],
      invites: [
        invite({
          status: 'converted',
          applicationId: 'a1',
          convertedUserId: 'u1',
          createdAt: daysAgo(8),
          submittedAt: daysAgo(6),
          emailStatus: 'delivered',
        }),
      ],
      reps: [rep({ stage: 'cleared_to_sell', activatedAt: daysAgo(4) })],
    });
    expect(personTimeline(p, NOW).map((entry) => entry.text)).toEqual([
      'Applied on the website · referred by Jordan Reyes',
      'Invited by Jacob Myers · email delivered',
      'Sent their paperwork back',
      'Activated',
    ]);
    expect(p.since).toBe(Date.parse(daysAgo(4)));
  });

  it('exports the stage in words', () => {
    const p = one({ applications: [application()], invites: [] });
    expect(peopleExportRow(p)).toMatchObject({ name: 'Maya Torres', stage: 'Applied', detail: 'Fiber · Austin, TX' });
  });
});

describe('the person sheet: one lead action, quiet rows, destructive last', () => {
  const submitted = { applications: [], invites: [invite({ status: 'submitted', convertedUserId: 'u1', submittedAt: daysAgo(1) })] };

  it('uploads to check: Review leads and Activate waits, with the reason', () => {
    const p = one({ ...submitted, reps: [rep()], checklists: [checklist('u1', 1, [{}])] });
    expect(sheetActions(p, personActions(p, ADMIN, NOW))).toEqual({
      primary: 'review',
      secondary: null,
      more: ['fieldTrain', 'channels'],
      danger: ['reject', 'decommission'],
      activateNote: 'Activate once every document is checked.',
    });
  });

  it('all checked: Activate leads, documents move to More', () => {
    const p = one({ ...submitted, reps: [rep()], checklists: [checklist('u1', 0, [{ status: 'approved' }])] });
    const sheet = sheetActions(p, personActions(p, RECRUITER, NOW));
    expect(sheet.primary).toBe('activate');
    expect(sheet.more).toEqual(['review', 'fieldTrain', 'channels']);
    expect(sheet.danger).toEqual(['reject']);
    expect(sheet.activateNote).toBeNull();
  });

  it('applicant: Invite with Not a fit beside it', () => {
    const p = one({ applications: [application()], invites: [] });
    expect(sheetActions(p, personActions(p, ADMIN, NOW))).toMatchObject({ primary: 'invite', secondary: 'notFit', more: [], danger: [] });
  });

  it('invited: Resend beside nothing, Copy link under More', () => {
    const p = one({ applications: [], invites: [invite()] });
    expect(sheetActions(p, personActions(p, FIELD_MANAGER, NOW))).toMatchObject({
      primary: null,
      secondary: 'resend',
      more: ['copyLink'],
      danger: ['cancelInvite'],
    });
  });

  it('selling: no lead, team rows, Decommission last', () => {
    const p = one({ applications: [], invites: [], reps: [rep({ stage: 'active', approvedSales: 2 })] });
    expect(sheetActions(p, personActions(p, ADMIN, NOW))).toMatchObject({
      primary: null,
      secondary: null,
      more: ['fieldTrain', 'channels'],
      danger: ['decommission'],
    });
  });
});

describe('a cancelled invite', () => {
  const cancelled = (overrides: Partial<InviteView> = {}) =>
    invite({ status: 'cancelled', cancelledAt: daysAgo(1), cancelledByName: 'Dana Ruiz', ...overrides });

  it('is offered in the sheet (red, last) while the invite is open, and never once it is back or closed', () => {
    const opened = one({ applications: [], invites: [invite({ status: 'in_progress' })] });
    expect(personActions(opened, FIELD_MANAGER, NOW)).toContain('cancelInvite');
    expect(sheetActions(opened, personActions(opened, FIELD_MANAGER, NOW)).danger).toEqual(['cancelInvite']);
    for (const status of ['submitted', 'rejected', 'cancelled'] as const) {
      const p = one({ applications: [], invites: [invite({ status, convertedUserId: status === 'submitted' ? 'u1' : null })] });
      expect(personActions(p, ADMIN, NOW)).not.toContain('cancelInvite');
    }
    // Paperwork made an account: Reject, not Cancel.
    const withAccount = one({ applications: [], invites: [invite({ status: 'in_progress', convertedUserId: 'u1' })], reps: [rep()] });
    expect(personActions(withAccount, ADMIN, NOW)).not.toContain('cancelInvite');
  });

  it('typed in by hand: Not a fit with "Invite cancelled", in All and Not a fit but never in Now', () => {
    const p = one({ applications: [], invites: [cancelled()] });
    expect(p.stage).toBe('notFit');
    expect(personLine(p)).toBe('Not a fit · Invite cancelled');
    expect(inFilter(p, 'current', NOW)).toBe(false);
    expect(inFilter(p, 'all', NOW)).toBe(true);
    expect(inFilter(p, 'notFit', NOW)).toBe(true);
    expect(stageCounts([p], NOW)).toMatchObject({ current: 0, all: 1, notFit: 1, invited: 0 });
    expect(personActions(p, ADMIN, NOW)).toEqual([]);
    expect(rowAction(p, ADMIN, NOW)).toBeNull();
  });

  it('from an application: the application (back to applied) leads, with Invite again', () => {
    const p = one({
      applications: [application({ status: 'applied', createdAt: daysAgo(5) })],
      invites: [cancelled({ applicationId: 'a1', createdAt: daysAgo(3) })],
    });
    expect(p.stage).toBe('applied');
    expect(inFilter(p, 'current', NOW)).toBe(true);
    expect(rowAction(p, ADMIN, NOW)).toBe('invite');
  });

  it('a new invite after the cancelled one decides the stage', () => {
    const p = one({
      applications: [],
      invites: [cancelled({ createdAt: daysAgo(3) }), invite({ id: 'i2', createdAt: daysAgo(1) })],
    });
    expect(p.stage).toBe('invited');
    expect(p.invite?.id).toBe('i2');
  });

  it('shows in the timeline with who cancelled it', () => {
    const p = one({ applications: [], invites: [cancelled()] });
    expect(personTimeline(p, NOW).map((entry) => entry.text)).toContain('Invite cancelled · by Dana Ruiz');
  });
});
