import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  logAdd: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      add: db.logAdd,
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => {
          const data =
            name === 'userSensitive'
              ? { ssnEncrypted: 'enc-ssn', dlNumberEncrypted: 'enc-dl', ssnLast4: '6789', dlLast4: '4567' }
              : db.users.get(id);
          return { exists: !!data, data: () => data, get: (field: string) => data?.[field] };
        }),
      })),
    })),
  },
}));
// The real gate admits admin-level callers only (admin, owner); managers and
// reps get 403 before any read.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(async () => {
    const role = db.users.get('caller')?.role;
    return role === 'admin' || role === 'owner'
      ? { ok: true, uid: 'caller', name: 'Caller' }
      : { ok: false, error: 'Forbidden: admin access required', status: 403 };
  }),
}));
vi.mock('@/lib/onboarding/sensitiveFields', () => ({
  revealSensitive: vi.fn((doc: { ssnEncrypted?: string; dlNumberEncrypted?: string }) => ({
    ssn: doc.ssnEncrypted ? '123456789' : undefined,
    dlNumber: doc.dlNumberEncrypted ? 'D1234567' : undefined,
  })),
}));

import { GET } from './route';

function masked(uid: string) {
  return GET(new NextRequest(`http://localhost/api/portal/admin/sensitive/${uid}`), {
    params: Promise.resolve({ uid }),
  });
}

function reveal(uid: string) {
  return GET(new NextRequest(`http://localhost/api/portal/admin/sensitive/${uid}?reveal=true`), {
    params: Promise.resolve({ uid }),
  });
}

beforeEach(() => {
  db.users.clear();
  vi.clearAllMocks();
  db.users.set('owner-1', { role: 'owner' });
  db.users.set('rep-1', { fieldRole: 'entry_rep' });
});

describe('GET /api/portal/admin/sensitive/[uid]?reveal=true', () => {
  it("refuses an admin revealing the owner's SSN/DL and logs nothing", async () => {
    db.users.set('caller', { role: 'admin' });

    const response = await reveal('owner-1');

    expect(response.status).toBe(403);
    expect(db.logAdd).not.toHaveBeenCalled();
  });

  it("lets an owner reveal another owner's SSN/DL, and logs it", async () => {
    db.users.set('caller', { role: 'owner' });

    const response = await reveal('owner-1');

    expect(response.status).toBe(200);
    expect((await response.json()).ssn).toBe('123456789');
    expect(db.logAdd).toHaveBeenCalledWith(expect.objectContaining({ targetUid: 'owner-1', revealedBy: 'caller' }));
  });

  it("lets an admin reveal a rep's DL# but never the SSN", async () => {
    db.users.set('caller', { role: 'admin' });

    const response = await reveal('rep-1');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dlNumber).toBe('D1234567');
    expect(body).not.toHaveProperty('ssn');
    expect(body).not.toHaveProperty('ssnLast4');
    expect(body.ssnOnFile).toBe(true);
    expect(db.logAdd).toHaveBeenCalledWith(expect.objectContaining({ fields: ['dlNumber'] }));
  });

  it("lets an owner reveal a rep's full SSN", async () => {
    db.users.set('caller', { role: 'owner' });

    const body = await (await reveal('rep-1')).json();

    expect(body.ssn).toBe('123456789');
    expect(body.ssnLast4).toBe('6789');
    expect(db.logAdd).toHaveBeenCalledWith(expect.objectContaining({ fields: ['ssn', 'dlNumber'] }));
  });

  it.each(['l1_manager', 'entry_rep'])('denies a %s (403) and logs nothing', async (fieldRole) => {
    db.users.set('caller', { fieldRole });

    const response = await reveal('rep-1');

    expect(response.status).toBe(403);
    expect(db.logAdd).not.toHaveBeenCalled();
  });

  it('denies operations (403)', async () => {
    db.users.set('caller', { role: 'operations' });
    expect((await reveal('rep-1')).status).toBe(403);
  });
});

describe('GET /api/portal/admin/sensitive/[uid] (masked)', () => {
  it('gives an owner the SSN last 4', async () => {
    db.users.set('caller', { role: 'owner' });

    const body = await (await masked('rep-1')).json();

    expect(body).toMatchObject({ ssnLast4: '6789', ssn: null, dlLast4: '4567', ssnOnFile: true });
  });

  it('gives an admin no SSN field at all, only that one is on file', async () => {
    db.users.set('caller', { role: 'admin' });

    const body = await (await masked('rep-1')).json();

    expect(body).not.toHaveProperty('ssnLast4');
    expect(body).not.toHaveProperty('ssn');
    expect(body).toMatchObject({ ssnOnFile: true, dlLast4: '4567' });
    expect(db.logAdd).not.toHaveBeenCalled();
  });

  it.each(['l1_manager', 'entry_rep'])('denies a %s (403)', async (fieldRole) => {
    db.users.set('caller', { fieldRole });
    expect((await masked('rep-1')).status).toBe(403);
  });
});
