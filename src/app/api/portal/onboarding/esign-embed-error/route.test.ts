import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireVerifiedUserMock, createAlertTaskMock } = vi.hoisted(() => ({
  requireVerifiedUserMock: vi.fn(),
  createAlertTaskMock: vi.fn(),
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: requireVerifiedUserMock,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: createAlertTaskMock }));
vi.mock('@/types/onboarding', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract' },
    { id: 'direct_deposit', label: 'Direct Deposit' },
  ],
}));

import { POST } from './route';

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@example.com' };

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/onboarding/esign-embed-error', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireVerifiedUserMock.mockReset();
  createAlertTaskMock.mockReset();
  createAlertTaskMock.mockResolvedValue('alert_1');
});

describe('POST /api/portal/onboarding/esign-embed-error', () => {
  it('returns the gate status when the caller is not verified', async () => {
    requireVerifiedUserMock.mockResolvedValue({
      ok: false,
      error: 'Missing authentication token',
      status: 401,
    });

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Missing authentication token' });
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the gate rejects for account status', async () => {
    requireVerifiedUserMock.mockResolvedValue({
      ok: false,
      error: 'Account is not active',
      status: 403,
    });

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(403);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown itemId', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);

    const res = await POST(req({ itemId: 'not-a-real-item' }));

    expect(res.status).toBe(400);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('raises a review_needed alert for the caller and returns ok', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(createAlertTaskMock).toHaveBeenCalledOnce();
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'review_needed',
        subjectUserId: 'u1',
        title: 'In-portal signing failed to load',
      })
    );
  });
});
