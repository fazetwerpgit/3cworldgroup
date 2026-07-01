import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-auth gate so we control who the caller is.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedFieldManagerOrManagement: vi.fn(),
}));
// Mock the shared writer so we can assert WHICH collection + fields a submission lands in.
vi.mock('@/lib/forms/submitForm', () => ({
  submitFormRecord: vi.fn(async () => ({ id: 'doc123' })),
}));
// Mock dynamic admin-configured options so validation accepts the values used here.
vi.mock('@/lib/forms/resolveFormOptions', () => ({
  getResolvedFormOptions: vi.fn(async () => ({
    providers: ['T-Fiber'],
    hireManagers: ['Jacob Myers'],
    hireJobPositions: ['Account Executive'],
    hireMarkets: ['Dallas TX'],
  })),
}));

import { POST } from './route';
import { requireVerifiedFieldManagerOrManagement } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';

const mockGate = requireVerifiedFieldManagerOrManagement as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitFormRecord as unknown as ReturnType<typeof vi.fn>;
const mockOptions = getResolvedFormOptions as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/forms/manager-interview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@x.com' };
const VALID = {
  provider: 'T-Fiber',
  jobPosition: 'Account Executive',
  hiringManager: 'Jacob Myers',
  hiringManagerEmail: 'jacob@x.com',
  candidateFirstName: 'Jane',
  candidateLastName: 'Doe',
  candidateEmail: 'jane@x.com',
  market: 'Dallas TX',
  rating: 5,
  didShow: true,
  extendOffer: false,
  signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
};

beforeEach(() => {
  mockGate.mockReset();
  mockSubmit.mockClear();
  mockOptions.mockClear();
});

describe('POST /api/portal/forms/manager-interview', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('writes a valid submission to the managerInterviews collection, stamped with the verified caller', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [collection, rep, fields] = mockSubmit.mock.calls[0];
    expect(collection).toBe('managerInterviews');
    expect(rep).toEqual({ uid: 'u1', name: 'Rep One', email: 'rep@x.com' });
    expect(fields).toMatchObject({
      provider: 'T-Fiber',
      jobPosition: 'Account Executive',
      hiringManager: 'Jacob Myers',
      candidateEmail: 'jane@x.com',
      didShow: true,
      extendOffer: false,
    });
  });

  it('rejects a submission missing required decision fields', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const { didShow, extendOffer, ...body } = VALID;
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a submission with an invalid email', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, candidateEmail: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
