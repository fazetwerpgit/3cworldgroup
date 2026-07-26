import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const updates: Array<{ userId: string; data: Record<string, unknown> }> = [];
  const adminDb = {
    collection: vi.fn((collectionName: string) => {
      if (collectionName !== 'users') throw new Error(`Unexpected collection: ${collectionName}`);
      return {
        doc: (userId: string) => ({
          get: vi.fn(async () => {
            const data = users.get(userId);
            return {
              exists: !!data,
              get: (field: string) => data?.[field],
              data: () => data,
            };
          }),
          update: vi.fn(async (data: Record<string, unknown>) => {
            updates.push({ userId, data });
            users.set(userId, { ...(users.get(userId) ?? {}), ...data });
          }),
        }),
      };
    }),
  };
  const adminAuth = {
    updateUser: vi.fn(async () => undefined),
  };
  return { adminAuth, adminDb, users, updates };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb, adminAuth: firestore.adminAuth }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__') },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));
vi.mock('@/lib/validation/address', () => ({
  validateAddress: vi.fn(() => ({ ok: true, clean: {} })),
}));
vi.mock('@/lib/alerts/alertTasks', () => ({
  resolveAlertTasks: vi.fn(async () => undefined),
}));
vi.mock('@/lib/alerts/dispatch', () => ({
  dispatchToUser: vi.fn(async () => undefined),
}));
vi.mock('@/lib/esign/autoSend', () => ({
  sendPendingEsignDocs: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: vi.fn(() => 'http://localhost:3005'),
  checklistReadyEmail: vi.fn(() => ({ subject: 'Checklist ready', html: 'Checklist ready' })),
}));
vi.mock('@/lib/chat/restampAuthor', () => ({ restampAuthor: vi.fn(async () => undefined) }));
vi.mock('@/lib/users/restampDisplayName', () => ({ restampDisplayName: vi.fn(async () => undefined) }));

import { PUT } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { resolveAlertTasks } from '@/lib/alerts/alertTasks';

const mockGate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const mockResolveAlertTasks = resolveAlertTasks as unknown as ReturnType<typeof vi.fn>;

function request(fieldRole: string) {
  return new NextRequest('http://localhost/api/portal/auth/users/pending-user', {
    method: 'PUT',
    body: JSON.stringify({ fieldRole }),
  });
}

function params() {
  return { params: Promise.resolve({ id: 'pending-user' }) };
}

beforeEach(() => {
  firestore.users.clear();
  firestore.updates.length = 0;
  vi.clearAllMocks();
  mockGate.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
});

describe('PUT /api/portal/auth/users/[id] role assignment', () => {
  it('kicks off onboarding and does not activate a pending l1 manager', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      displayName: 'Pending Manager',
    });

    const response = await PUT(request('l1_manager'), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({ fieldRole: 'l1_manager' });
    expect(firestore.updates[0]?.data).not.toHaveProperty('status');
    expect(mockResolveAlertTasks).toHaveBeenCalledWith('pending-user', ['pending_assignment']);
  });

  it('still activates a pending general manager immediately', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      displayName: 'Pending General Manager',
    });

    const response = await PUT(request('general_manager'), params());

    expect(response.status).toBe(200);
    expect(firestore.updates[0]?.data).toMatchObject({
      fieldRole: 'general_manager',
      status: 'active',
    });
  });

  it('does not re-kick onboarding when the user already holds that role', async () => {
    firestore.users.set('pending-user', {
      status: 'pending',
      fieldRole: 'l1_manager',
      displayName: 'Pending Manager',
    });

    const response = await PUT(request('l1_manager'), params());

    expect(response.status).toBe(200);
    expect(mockResolveAlertTasks).not.toHaveBeenCalled();
    expect(firestore.updates[0]?.data).not.toHaveProperty('status');
  });
});
