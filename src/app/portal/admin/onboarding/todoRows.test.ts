import { describe, expect, it } from 'vitest';
import type { ApplicationRecord } from '@/types';
import type { ChecklistItem, ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';
import { applyApplicationOverrides, buildTodoSections } from './todoRows';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function upload(userId: string, submittedAt: string): ChecklistItem {
  return {
    id: `${userId}_dl_photos`,
    userId,
    itemId: 'dl_photos',
    itemLabel: "Driver's License",
    category: 'paperwork',
    sensitive: true,
    adminOnly: false,
    referenceKind: 'storage',
    reference: null,
    files: [],
    status: 'submitted',
    onHold: false,
    submittedAt,
    reviewedAt: null,
    reviewerName: null,
    rejectionReason: null,
    esignEnvelopeId: null,
    hasSignedPdf: false,
    manualCompletion: null,
  };
}

const person = (userId: string, toReview: number, submittedAt: string): ChecklistPerson => ({
  userId,
  userName: userId,
  items: toReview ? [upload(userId, submittedAt)] : [],
  toReview,
});

const app = (id: string, days: number | null, status = 'applied', extra: Partial<ApplicationRecord> = {}) =>
  ({
    id,
    name: id.toUpperCase(),
    status,
    createdAt: (days === null ? null : daysAgo(days)) as unknown as Date,
    ...extra,
  }) as ApplicationRecord;

describe('buildTodoSections', () => {
  it('splits the waiting things into sections, each oldest first', () => {
    const sections = buildTodoSections(
      {
        signups: [
          { uid: 's1', name: 'Sam', createdAt: new Date(daysAgo(1)) },
          { uid: 's2', name: 'Sue', createdAt: new Date(daysAgo(3)) },
        ],
        people: [person('p1', 2, daysAgo(4)), person('p2', 0, daysAgo(9))],
        ready: [{ id: 'i1', candidateName: 'Ida', submittedAt: daysAgo(2) } as InviteView],
        applications: [app('a1', 6)],
      },
      NOW
    );
    expect(sections.signups.map((row) => row.key)).toEqual(['signup-s2', 'signup-s1']);
    expect(sections.documents.map((row) => row.key)).toEqual(['documents-p1']);
    expect(sections.documents[0].line).toBe('2 documents to check · 4 days ago');
    expect(sections.activate.map((row) => row.key)).toEqual(['activate-i1']);
    expect(sections.applicants.map((row) => row.key)).toEqual(['applicant-a1']);
    expect(sections.waiting).toBe(5);
  });

  it('folds applicants older than 30 days (or undated) away and leaves them out of the count', () => {
    const sections = buildTodoSections(
      { applications: [app('fresh', 2), app('edge', 30), app('old', 31), app('ancient', 115), app('undated', null)] },
      NOW
    );
    expect(sections.applicants.map((row) => row.application.id)).toEqual(['fresh', 'edge']);
    expect(sections.older.map((row) => row.application.id)).toEqual(['old', 'ancient', 'undated']);
    expect(sections.waiting).toBe(2);
  });

  it('keeps invited, joined and archived applicants out of the waiting lists', () => {
    const sections = buildTodoSections(
      {
        applications: [
          app('inv', 1, 'invited'),
          app('joined', 1, 'converted'),
          app('nf1', 3, 'not_selected', { notSelectedAt: daysAgo(2) as unknown as Date }),
          app('nf2', 40, 'not_selected', { notSelectedAt: daysAgo(1) as unknown as Date }),
        ],
      },
      NOW
    );
    expect(sections.applicants).toEqual([]);
    expect(sections.older).toEqual([]);
    // Most recently archived first, whatever their age.
    expect(sections.archived.map((row) => row.application.id)).toEqual(['nf2', 'nf1']);
    expect(sections.waiting).toBe(0);
  });

  it('says what they want to sell, where, and when they applied', () => {
    const [row] = buildTodoSections(
      {
        applications: [
          app('a1', 3, 'applied', { interests: ['fiber', 'solar'], city: 'Austin, TX' }),
        ],
      },
      NOW
    ).applicants;
    expect(row.detail).toBe('Fiber, Solar · Austin, TX');
    expect(row.when).toBe('3 days ago');
    expect(row.line).toBe('Fiber, Solar · Austin, TX · 3 days ago');
  });

  it('skips sources that are missing', () => {
    const sections = buildTodoSections({ signups: null, people: undefined, ready: null, applications: null }, NOW);
    expect(sections.waiting).toBe(0);
  });
});

describe('applyApplicationOverrides', () => {
  const loaded = [
    { id: 'a1', name: 'Ann', status: 'applied' },
    { id: 'a2', name: 'Ben', status: 'applied' },
  ] as unknown as ApplicationRecord[];
  const notFit = {
    a1: {
      afterLoad: 3,
      patch: { status: 'not_selected' as const, notSelectedAt: new Date(NOW), notSelectedByName: 'Olive' },
    },
  };

  it('shows a Not a fit at once over a list from an older load', () => {
    const shown = applyApplicationOverrides(loaded, notFit, 3);
    expect(shown.map((row) => row.status)).toEqual(['not_selected', 'applied']);
    expect(shown[0].notSelectedByName).toBe('Olive');
  });

  it('lets any load started after the change replace it, e.g. a restore from another device', () => {
    const shown = applyApplicationOverrides(loaded, notFit, 4);
    expect(shown).toEqual(loaded);
  });
});
