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
// Wrap the real resolver so one test can supply an admin override list.
vi.mock('@/lib/forms/resolveFormOptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/forms/resolveFormOptions')>();
  return { ...actual, getResolvedFormOptions: vi.fn(actual.getResolvedFormOptions) };
});

import { POST } from './route';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { OPTION_VALUE_MAX } from '@/lib/forms/formOptionsRegistry';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';

const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitFormRecord as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/forms/payroll-dispute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@x.com' };
const VALID = {
  contractorName: 'Jane Doe',
  contractorEmail: 'jane@x.com',
  campaign: 'T-Fiber',
  typeOfOrder: 'Fiber install',
  dateOfInstall: '01/15/2026',
};

beforeEach(() => {
  mockGate.mockReset();
  mockSubmit.mockClear();
});

describe('POST /api/portal/forms/payroll-dispute', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('writes a valid submission to the payrollDisputes collection, stamped with the verified caller', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [collection, rep, fields] = mockSubmit.mock.calls[0];
    expect(collection).toBe('payrollDisputes');
    expect(rep).toEqual({ uid: 'u1', name: 'Rep One', email: 'rep@x.com' });
    expect(fields).toMatchObject({ contractorName: 'Jane Doe', campaign: 'T-Fiber' });
  });

  it('rejects a submission missing required fields', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, contractorName: '' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects an invalid campaign', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, campaign: 'NotACampaign' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a contractor email that is not an email', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, contractorEmail: 'x' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('accepts an admin-saved campaign as long as the options editor allows', async () => {
    const LONG = 'Brightspeed Fiber (Quantum) - Midwest Region'.padEnd(OPTION_VALUE_MAX, '.');
    mockGate.mockResolvedValue(VERIFIED);
    const mockOptions = getResolvedFormOptions as unknown as ReturnType<typeof vi.fn>;
    mockOptions.mockResolvedValueOnce({ payrollCampaigns: [LONG] });
    const res = await POST(req({ ...VALID, campaign: LONG }));
    expect(res.status).toBe(200);
    expect(mockSubmit.mock.calls[0][2]).toMatchObject({ campaign: LONG });
  });
});
