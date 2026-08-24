import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { configGetMock, userGetMock, gateMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  userGetMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({ get: name === 'config' ? configGetMock : userGetMock })),
    })),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: gateMock,
  requireVerifiedAdmin: vi.fn(),
}));

import { GET } from './route';
import { DEFAULT_COMMISSION } from '@/types';

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
