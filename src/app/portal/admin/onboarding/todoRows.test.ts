import { describe, expect, it } from 'vitest';
import type { ApplicationRecord } from '@/types';
import type { ChecklistItem, ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';
import { buildTodoRows } from './todoRows';

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

describe('buildTodoRows', () => {
  it('lists one row per thing waiting, oldest first', () => {
    const rows = buildTodoRows(
      {
        signups: [{ uid: 's1', name: 'Sam', createdAt: new Date(daysAgo(1)) }],
        people: [person('p1', 2, daysAgo(4)), person('p2', 0, daysAgo(9))],
        ready: [{ id: 'i1', candidateName: 'Ida', submittedAt: daysAgo(2) } as InviteView],
        applied: [{ id: 'a1', name: 'Al', createdAt: daysAgo(6) as unknown as Date } as ApplicationRecord],
      },
      NOW
    );
    expect(rows.map((row) => [row.kind, row.key])).toEqual([
      ['applicant', 'applicant-a1'],
      ['documents', 'documents-p1'],
      ['activate', 'activate-i1'],
      ['signup', 'signup-s1'],
    ]);
  });

  it('puts anything without a date last and skips sources that are missing', () => {
    const rows = buildTodoRows(
      {
        signups: [{ uid: 's1', name: 'Sam', createdAt: null }],
        people: null,
        ready: [{ id: 'i1', candidateName: 'Ida', submittedAt: daysAgo(1) } as InviteView],
        applied: undefined,
      },
      NOW
    );
    expect(rows.map((row) => row.key)).toEqual(['activate-i1', 'signup-s1']);
  });
});
