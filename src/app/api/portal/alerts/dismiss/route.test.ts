import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const gateMock = vi.hoisted(() => vi.fn());
const dismissAlertTaskMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: gateMock,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({
  dismissAlertTask: dismissAlertTaskMock,
}));

import { POST } from './route';

const MANAGEMENT = { ok: true, uid: 'manager-1', name: 'Manager', isAdmin: true };

function request(body: unknown = { taskId: 'task-1' }) {
  return new NextRequest('http://localhost/api/portal/alerts/dismiss', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue(MANAGEMENT);
  dismissAlertTaskMock.mockResolvedValue('dismissed');
});

describe('POST /api/portal/alerts/dismiss', () => {
  it.each([
    [{ ok: false, error: 'Unauthorized', status: 401 }, 401],
    [{ ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
  ])('returns the management gate status', async (gate, status) => {
    gateMock.mockResolvedValue(gate);

    const response = await POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: gate.error });
    expect(dismissAlertTaskMock).not.toHaveBeenCalled();
  });

  it('requires a task id', async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'taskId is required' });
    expect(dismissAlertTaskMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist', async () => {
    dismissAlertTaskMock.mockResolvedValue('not_found');

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
    expect(dismissAlertTaskMock).toHaveBeenCalledWith('task-1', 'manager-1', 'Manager');
  });

  it('dismisses the task for the verified manager', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(dismissAlertTaskMock).toHaveBeenCalledWith('task-1', 'manager-1', 'Manager');
  });
});
