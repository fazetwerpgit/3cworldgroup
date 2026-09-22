import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { setMock, createUserMock, deleteUserMock, gateMock, kickoffMock } = vi.hoisted(() => ({
  setMock: vi.fn(async () => undefined),
  createUserMock: vi.fn(async () => ({ uid: 'new-user' })),
  deleteUserMock: vi.fn(async () => undefined),
  gateMock: vi.fn(),
  kickoffMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { createUser: createUserMock, deleteUser: deleteUserMock },
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: setMock })) })) },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/validation/address', () => ({
  validateAddress: vi.fn(() => ({ ok: true, clean: {} })),
}));
vi.mock('@/lib/onboarding/kickoff', () => ({ kickoffOnboardingChecklist: kickoffMock }));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/auth/create-user', {
    method: 'POST',
    body: JSON.stringify({ email: 'rep@example.com', password: 'secret123', displayName: 'New Rep', ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false });
});

describe('POST /api/portal/auth/create-user', () => {
  it.each(['entry_rep', 'entry_level_rep', 'ae_tier_1'])(
    'creates a %s as pending and starts the onboarding checklist',
    async (fieldRole) => {
      const response = await POST(request({ fieldRole }));

      expect(response.status).toBe(200);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ fieldRole, status: 'pending' }));
      expect(kickoffMock).toHaveBeenCalledWith('new-user', 'New Rep', '[create-user]');
    }
  );

  it('keeps a non-onboarding field role active with no checklist', async () => {
    const response = await POST(request({ fieldRole: 'general_manager' }));

    expect(response.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(kickoffMock).not.toHaveBeenCalled();
  });

  it('keeps a platform role active with no checklist', async () => {
    const response = await POST(request({ role: 'operations' }));

    expect(response.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'operations', status: 'active' }));
    expect(kickoffMock).not.toHaveBeenCalled();
  });

  it('does not kick off onboarding when the profile write fails', async () => {
    setMock.mockRejectedValueOnce(new Error('write failed'));

    const response = await POST(request({ fieldRole: 'entry_rep' }));

    expect(response.status).toBe(500);
    expect(deleteUserMock).toHaveBeenCalledWith('new-user');
    expect(kickoffMock).not.toHaveBeenCalled();
  });
});
