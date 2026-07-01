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
// Mock resolved options because expedite-order validates reason against expedite reason options.
vi.mock('@/lib/forms/resolveFormOptions', () => ({
  getResolvedFormOptions: vi.fn(async () => ({ expediteReasons: ['Install too far out'] })),
}));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';

const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitFormRecord as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/forms/expedite-order', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@x.com' };
const VALID = {
  customerName: 'Jane Customer',
  customerPhone: '555-123-4567',
  customerEmail: 'jane@x.com',
  address: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
  orderNumber: 'ORD-789',
  expediteDates: '01/15/2026 - 01/16/2026',
  reason: 'Install too far out',
};

beforeEach(() => {
  mockGate.mockReset();
  mockSubmit.mockClear();
});

describe('POST /api/portal/forms/expedite-order', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('writes a valid submission to the expediteOrders collection, stamped with the verified caller', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [collection, rep, fields] = mockSubmit.mock.calls[0];
    expect(collection).toBe('expediteOrders');
    expect(rep).toEqual({ uid: 'u1', name: 'Rep One', email: 'rep@x.com' });
    expect(fields).toMatchObject({
      customerName: 'Jane Customer',
      address: '123 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
      orderNumber: 'ORD-789',
      reason: 'Install too far out',
    });
  });

  it('rejects a submission missing required fields', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, orderNumber: '' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects an invalid reason', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ ...VALID, reason: 'NotAReason' }));
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
