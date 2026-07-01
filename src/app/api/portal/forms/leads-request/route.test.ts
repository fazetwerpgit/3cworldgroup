import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-auth gate so we control who the caller is.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));
// Mock the shared writer so we can assert WHICH collection + fields a submission lands in.
vi.mock('@/lib/forms/submitForm', () => ({
  submitFormRecord: vi.fn(async () => ({ id: 'doc123' })),
}));
// Mock resolved dynamic options so the route validates against known option values.
vi.mock('@/lib/forms/resolveFormOptions', () => ({
  getResolvedFormOptions: vi.fn(async () => ({
    providers: ['T-Fiber'],
    hireManagers: ['Jacob Myers'],
    hireJobPositions: ['Account Executive'],
    hireMarkets: ['Dallas TX'],
    leadsCampaigns: ['T-Fiber'],
    leadsManagers: ['Jacob Myers'],
    leadsLocations: ['Des Moines IA'],
  })),
}));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';

const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitFormRecord as unknown as ReturnType<typeof vi.fn>;
const mockOptions = getResolvedFormOptions as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/forms/leads-request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@x.com' };
const VALID = {
  campaign: 'T-Fiber',
  managerName: 'Jacob Myers',
  managerEmail: 'jacob@x.com',
  repFirstName: 'Jane',
  repLastName: 'Doe',
  location: 'Des Moines IA',
};

beforeEach(() => {
  mockGate.mockReset();
  mockSubmit.mockClear();
  mockOptions.mockClear();
});

describe('POST /api/portal/forms/leads-request', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('writes a valid submission to the leadsRequests collection, stamped with the verified caller', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [collection, rep, fields] = mockSubmit.mock.calls[0];
    expect(collection).toBe('leadsRequests');
    expect(rep).toEqual({ uid: 'u1', name: 'Rep One', email: 'rep@x.com' });
    expect(fields).toMatchObject({
      campaign: 'T-Fiber',
      managerName: 'Jacob Myers',
      managerEmail: 'jacob@x.com',
      repFirstName: 'Jane',
      repLastName: 'Doe',
      location: 'Des Moines IA',
    });
  });

  it('rejects a submission missing required fields', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, repFirstName: '' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects an invalid campaign', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, campaign: 'NotACampaign' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
