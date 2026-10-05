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
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(async () => ({ ok: true, uid: 'caller', name: 'Caller' })),
}));
vi.mock('@/lib/onboarding/sensitiveFields', () => ({
  revealSensitive: vi.fn(() => ({ ssn: '123456789', dlNumber: 'D1234567' })),
}));

import { GET } from './route';

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

  it("still lets an admin reveal a rep's SSN/DL", async () => {
    db.users.set('caller', { role: 'admin' });

    const response = await reveal('rep-1');

    expect(response.status).toBe(200);
    expect(db.logAdd).toHaveBeenCalledOnce();
  });
});
