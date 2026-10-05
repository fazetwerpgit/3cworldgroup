import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { configGetMock, configSetMock, userGetMock, gateMock, adminGateMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(async () => undefined),
  userGetMock: vi.fn(),
  gateMock: vi.fn(),
  adminGateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({ get: name === 'config' ? configGetMock : userGetMock, set: configSetMock })),
    })),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: gateMock,
  requireVerifiedAdmin: adminGateMock,
}));
vi.mock('@/lib/audit/adminAudit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeAdminAudit: vi.fn(async () => undefined),
}));

import { GET, PUT } from './route';
import { DEFAULT_COMMISSION } from '@/types';
import { writeAdminAudit } from '@/lib/audit/adminAudit';

function request() {
  return new NextRequest('http://localhost/api/portal/commission');
}

beforeEach(() => {
  vi.clearAllMocks();
  configGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ tiers: DEFAULT_COMMISSION }),
  });
  gateMock.mockResolvedValue({ ok: true, uid: 'caller-1', name: 'Caller', email: 'caller@example.com' });
  userGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
});

describe('GET /api/portal/commission', () => {
  it('hides retired field roles from the all-tier response', async () => {
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('all');
    expect(json.tiers.map((tier: { fieldRole: string }) => tier.fieldRole)).toEqual([
      'entry_rep',
      'ae_tier_1',
      'ae_tier_2',
      'regional_manager',
      'director',
      'internal_rep',
    ]);
  });

  it('keeps a retired field user on their own tier', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ fieldRole: 'l1_manager' }) });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('own');
    expect(json.tiers).toEqual([{ fieldRole: 'l1_manager', baseRate: 0, overrideRate: 0 }]);
  });
});

describe('PUT /api/portal/commission', () => {
  it('writes an audit row naming the tier rate that changed', async () => {
    adminGateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin' });
    const before = DEFAULT_COMMISSION.find((tier) => tier.fieldRole === 'entry_rep')!.baseRate;

    const response = await PUT(
      new NextRequest('http://localhost/api/portal/commission', {
        method: 'PUT',
        body: JSON.stringify({ tiers: [{ fieldRole: 'entry_rep', baseRate: 125 }] }),
      })
    );

    expect(response.status).toBe(200);
    expect(configSetMock).toHaveBeenCalledOnce();
    expect(writeAdminAudit).toHaveBeenCalledWith({
      action: 'commission.update',
      actorUid: 'admin-1',
      actorName: 'Admin',
      details: { tiers: expect.arrayContaining([{ path: 'entry_rep.baseRate', from: before, to: 125 }]) },
    });
  });
});
