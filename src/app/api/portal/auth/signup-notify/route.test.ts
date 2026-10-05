import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock, userGetMock, createAlertTaskMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  userGetMock: vi.fn(),
  createAlertTaskMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: { doc: vi.fn((path: string) => ({ get: () => userGetMock(path), update: vi.fn() })) },
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: createAlertTaskMock }));

import { POST } from './route';
import { signupNotifyLimiter } from '@/lib/auth/teamCode';

const TEAM_CODE = '3cteam';

function pendingUser(data: Record<string, unknown>) {
  return { exists: true, get: (key: string) => data[key] };
}

function request(init: { token?: string; body?: unknown; ip?: string } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': init.ip ?? '203.0.113.5' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return new Request('http://localhost/api/portal/auth/signup-notify', {
    method: 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signupNotifyLimiter.reset();
  vi.stubEnv('PORTAL_TEAM_CODE', TEAM_CODE);
  verifyIdTokenMock.mockImplementation(async (token: string) => {
    if (token === 'token-new-user') return { uid: 'new-user', firebase: { sign_in_provider: 'password' } };
    if (token === 'token-google-user') return { uid: 'new-user', firebase: { sign_in_provider: 'google.com' } };
    throw new Error('bad token');
  });
  userGetMock.mockResolvedValue(
    pendingUser({ status: 'pending', email: 'new.hire@gmail.com', displayName: 'New Hire' })
  );
  createAlertTaskMock.mockResolvedValue('task-1');
});

describe('POST /api/portal/auth/signup-notify', () => {
  it('refuses a body-supplied uid with no token', async () => {
    const response = await POST(request({ body: { uid: 'victim' } }));

    expect(response.status).toBe(401);
    expect(userGetMock).not.toHaveBeenCalled();
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('refuses an invalid token', async () => {
    const response = await POST(request({ token: 'forged', body: { uid: 'victim' } }));

    expect(response.status).toBe(401);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('raises the alert for the token holder, ignoring any uid in the body', async () => {
    const response = await POST(
      request({ token: 'token-new-user', body: { uid: 'victim', code: ` ${TEAM_CODE.toUpperCase()} ` } })
    );

    expect(response.status).toBe(200);
    expect(userGetMock).toHaveBeenCalledWith('users/new-user');
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pending_assignment', subjectUserId: 'new-user' })
    );
  });

  it('raises no alert for a password signup without a valid team code', async () => {
    for (const body of [undefined, {}, { code: 'wrong' }]) {
      const response = await POST(request({ token: 'token-new-user', body }));
      expect(response.status).toBe(403);
    }
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('fails closed when PORTAL_TEAM_CODE is unset', async () => {
    vi.stubEnv('PORTAL_TEAM_CODE', '');
    const response = await POST(request({ token: 'token-new-user', body: { code: TEAM_CODE } }));

    expect(response.status).toBe(403);
    expect(createAlertTaskMock).not.toHaveBeenCalled();
  });

  it('accepts a Google first sign-in without a code', async () => {
    const response = await POST(request({ token: 'token-google-user' }));

    expect(response.status).toBe(200);
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pending_assignment', subjectUserId: 'new-user' })
    );
  });

  it('rate-limits one IP', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(request({ token: 'token-google-user', ip: '198.51.100.7' }))).status).toBe(200);
    }
    const limited = await POST(request({ token: 'token-google-user', ip: '198.51.100.7' }));
    expect(limited.status).toBe(429);
    expect((await POST(request({ token: 'token-google-user', ip: '198.51.100.8' }))).status).toBe(200);
  });
});
