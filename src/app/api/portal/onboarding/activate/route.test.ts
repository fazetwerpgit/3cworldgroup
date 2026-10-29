import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ userId: string; data: Record<string, unknown> }> = [];

  const adminDb = {
    doc: vi.fn((path: string) => {
      const userId = path.replace('users/', '');
      return {
        get: vi.fn(async () => {
          const data = users.get(userId);
          return {
            exists: !!data,
            get: (field: string) => data?.[field],
          };
        }),
        update: vi.fn(async (data: Record<string, unknown>) => {
          updates.push({ userId, data });
          users.set(userId, { ...(users.get(userId) ?? {}), ...data });
        }),
      };
    }),
  };

  return { adminDb, users, updates };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__'), serverTimestamp: vi.fn(() => '__SERVER_TS__') },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRecruiting: vi.fn(),
}));
const { packetOnceMock, afterMock } = vi.hoisted(() => ({
  packetOnceMock: vi.fn<(userId: string) => Promise<boolean>>(async () => true),
  afterMock: vi.fn((callback: () => unknown) => void callback()),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: afterMock,
}));
vi.mock('@/lib/onboarding/activation', () => ({
  activateUser: vi.fn(),
  getActivationReadiness: vi.fn(),
  sendOnboardingPacketOnce: packetOnceMock,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: vi.fn(async () => undefined) }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/templates', () => ({ activationEmail: vi.fn(() => ({ subject: 'Welcome', html: 'Welcome' })) }));

import { POST } from './route';
import { requireVerifiedRecruiting } from '@/lib/auth/requireVerifiedAdmin';
import { activateUser, getActivationReadiness } from '@/lib/onboarding/activation';

const mockGate = requireVerifiedRecruiting as unknown as ReturnType<typeof vi.fn>;
const mockReadiness = getActivationReadiness as unknown as ReturnType<typeof vi.fn>;
const mockActivateUser = activateUser as unknown as ReturnType<typeof vi.fn>;

function req(userId: string) {
  return new NextRequest('http://localhost/api/portal/onboarding/activate', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

beforeEach(() => {
  firestore.users.clear();
  firestore.updates.length = 0;
  mockGate.mockReset();
  mockReadiness.mockReset();
  mockActivateUser.mockReset();
  mockGate.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
  mockReadiness.mockResolvedValue({ ready: true, missing: [] });
  packetOnceMock.mockClear();
  afterMock.mockClear();
});

describe('POST /api/portal/onboarding/activate', () => {
  it('sends the owner packet once, after the response, when the activation makes it due', async () => {
    mockActivateUser.mockResolvedValue({ alreadyActive: false, packetDue: true });

    const res = await POST(req('hire-1'));

    expect(res.status).toBe(200);
    expect(afterMock).toHaveBeenCalledOnce();
    expect(packetOnceMock).toHaveBeenCalledTimes(1);
    expect(packetOnceMock).toHaveBeenCalledWith('hire-1');
  });

  it('sends no packet for an already-active user or one with no checklist', async () => {
    mockActivateUser.mockResolvedValueOnce({ alreadyActive: true });
    await POST(req('already-active'));
    mockActivateUser.mockResolvedValueOnce({ alreadyActive: false, packetDue: false });
    await POST(req('no-checklist'));

    expect(afterMock).not.toHaveBeenCalled();
    expect(packetOnceMock).not.toHaveBeenCalled();
  });

  it('activates an invited L1 manager without demoting the field role', async () => {
    firestore.users.set('l1-manager', { status: 'pending', fieldRole: 'l1_manager', displayName: 'Manager' });
    mockActivateUser.mockResolvedValue({ alreadyActive: false });

    const res = await POST(req('l1-manager'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockActivateUser).toHaveBeenCalledWith('l1-manager', { deferPacket: true });
  });

  it('does not add a field role when the target has none', async () => {
    firestore.users.set('no-field-role', { status: 'pending', displayName: 'Pending User' });
    mockActivateUser.mockResolvedValue({ alreadyActive: false });

    const res = await POST(req('no-field-role'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockActivateUser).toHaveBeenCalledWith('no-field-role', { deferPacket: true });
  });

  it('returns alreadyActive when the helper reports an already-active user', async () => {
    mockActivateUser.mockResolvedValue({ alreadyActive: true });

    const res = await POST(req('already-active'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, alreadyActive: true });
    expect(mockActivateUser).toHaveBeenCalledWith('already-active', { deferPacket: true });
  });

  it('returns 404 when the helper cannot find the target user', async () => {
    mockActivateUser.mockResolvedValue(null);

    const res = await POST(req('missing-user'));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'user not found' });
    expect(mockActivateUser).toHaveBeenCalledWith('missing-user', { deferPacket: true });
  });

  it('preserves the readiness response and does not activate an incomplete hire', async () => {
    firestore.users.set('incomplete', { status: 'pending', fieldRole: 'l1_manager' });
    mockReadiness.mockResolvedValue({ ready: false, missing: ['contract'] });

    const res = await POST(req('incomplete'));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'not ready', missing: ['contract'] });
    expect(firestore.updates).toHaveLength(0);
  });
});
