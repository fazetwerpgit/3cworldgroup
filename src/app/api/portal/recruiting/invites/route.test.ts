import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  gate: vi.fn(),
  requester: { role: 'owner' } as Record<string, unknown> | null,
  applications: [] as Array<Record<string, unknown>>,
}));

// A Firestore stand-in for GET: users/{uid}, onboardingInvites and applications,
// each ordered newest first and honouring .limit().
vi.mock('@/lib/firebase/admin', () => {
  const docsOf = (rows: Array<Record<string, unknown>>) =>
    rows.map((row, index) => ({ id: String(row.id ?? `doc-${index}`), data: () => row }));
  const query = (rows: () => Array<Record<string, unknown>>) => ({
    orderBy: () => ({
      limit: (count: number) => ({
        get: async () => ({ docs: docsOf(rows().slice(0, count)) }),
      }),
    }),
  });
  return {
    adminDb: {
      collection: (name: string) => {
        if (name === 'users') {
          return {
            doc: () => ({
              get: async () => ({ exists: state.requester !== null, data: () => state.requester }),
            }),
          };
        }
        if (name === 'applications') return query(() => state.applications);
        return query(() => []);
      },
    },
  };
});
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: state.gate }));

import { GET, POST } from './route';

const at = (minutesAgo: number) => ({ toDate: () => new Date(Date.UTC(2026, 8, 1) - minutesAgo * 60_000) });

function application(index: number, extra: Record<string, unknown> = {}) {
  return {
    id: `app-${index}`,
    name: `Applicant ${index}`,
    phone: '555-0100',
    email: `a${index}@example.com`,
    city: 'Austin',
    status: 'applied',
    createdAt: at(index),
    ...extra,
  };
}

function getRequest() {
  return new NextRequest('http://localhost/api/portal/recruiting/invites', {
    headers: { authorization: 'Bearer token' },
  });
}

beforeEach(() => {
  state.gate.mockResolvedValue({ ok: true, uid: 'owner-1', name: 'Owner', email: 'o@example.com' });
  state.requester = { role: 'owner' };
  state.applications = [];
});

it('returns every application, not just the newest 50', async () => {
  state.applications = Array.from({ length: 55 }, (_, index) => application(index));

  const response = await GET(getRequest());
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.applications).toHaveLength(55);
  expect(json.applications[54].id).toBe('app-54');
});

it('includes who referred an applicant', async () => {
  state.applications = [
    application(1, { referredBy: 'Jordan Reyes' }),
    application(2),
  ];

  const json = await (await GET(getRequest())).json();
  expect(json.applications.map((row: { referredBy: string }) => row.referredBy)).toEqual(['Jordan Reyes', '']);
});

it('refuses applications to someone who cannot manage recruiting', async () => {
  state.requester = { role: 'rep', fieldRole: 'entry_level_rep' };
  state.applications = [application(1)];

  const response = await GET(getRequest());
  expect(response.status).toBe(403);
});

it('rejects a direct invite POST for a non-invitable field role', async () => {
  const request = new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Candidate',
      candidateEmail: 'candidate@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole: 'general_manager',
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await POST(request);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'Invalid field role' });
});
