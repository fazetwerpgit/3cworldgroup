import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// "Not a fit" and its undo. Runs the real recruiting gate against mocked
// users docs, so the recruiter grant and a plain rep are checked end to end.
const verifyIdToken = vi.fn();
const userDocs = new Map<string, Record<string, unknown>>();
const applications = new Map<string, Record<string, unknown>>();
const updateMock = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__') },
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: (...args: unknown[]) => verifyIdToken(...args) },
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: async () => {
          const data = (name === 'users' ? userDocs : applications).get(id);
          return { exists: data !== undefined, data: () => data };
        },
        update: async (patch: Record<string, unknown>) => {
          updateMock(name, id, patch);
          const current = applications.get(id) ?? {};
          const next = { ...current, ...patch };
          for (const [key, value] of Object.entries(patch)) if (value === '__DELETE__') delete next[key];
          applications.set(id, next);
        },
      })),
    })),
  },
}));

import { PATCH } from './route';

const RECRUITER = { status: 'active', fieldRole: 'general_manager', displayName: 'Mason', recruiter: true };
const OPS = { status: 'active', role: 'operations', displayName: 'Olive' };
const REP = { status: 'active', fieldRole: 'entry_level_rep', displayName: 'Rory' };

function call(action: unknown, id = 'app1') {
  const request = new NextRequest(`http://localhost/api/portal/recruiting/applications/${id}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  userDocs.clear();
  applications.clear();
  updateMock.mockReset();
  verifyIdToken.mockReset();
  verifyIdToken.mockResolvedValue({ uid: 'u1' });
  applications.set('app1', { name: 'Brenden', status: 'applied' });
});

describe('PATCH /api/portal/recruiting/applications/[id]', () => {
  it('refuses a plain rep and writes nothing', async () => {
    userDocs.set('u1', REP);
    const response = await call('not_fit');
    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses a request with no token', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad token'));
    userDocs.set('u1', OPS);
    const response = await call('not_fit');
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('lets the recruiter grant mark an applicant not a fit, stamped with who and when', async () => {
    userDocs.set('u1', RECRUITER);
    const response = await call('not_fit');
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      'applications',
      'app1',
      expect.objectContaining({
        status: 'not_selected',
        statusBeforeNotSelected: 'applied',
        notSelectedBy: 'u1',
        notSelectedByName: 'Mason',
        notSelectedAt: expect.any(Date),
      })
    );
    expect(applications.get('app1')?.name).toBe('Brenden');
  });

  it('lets management restore it to the status it had', async () => {
    userDocs.set('u1', OPS);
    applications.set('app1', { name: 'B', status: 'contacted' });
    await call('not_fit');
    const response = await call('restore');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'contacted' });
    expect(applications.get('app1')).toEqual(expect.objectContaining({ status: 'contacted' }));
    expect(applications.get('app1')).not.toHaveProperty('notSelectedAt');
  });

  it('will not turn down someone already invited, or restore someone not archived', async () => {
    userDocs.set('u1', OPS);
    applications.set('app1', { status: 'invited' });
    expect((await call('not_fit')).status).toBe(409);
    expect((await call('restore')).status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing application and 400 for an unknown action', async () => {
    userDocs.set('u1', OPS);
    expect((await call('not_fit', 'nope')).status).toBe(404);
    expect((await call('delete')).status).toBe(400);
  });
});
