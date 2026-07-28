import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const gateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));

import { POST } from './route';

it('rejects a direct invite POST for a non-invitable field role', async () => {
  gateMock.mockResolvedValue({ ok: true, uid: 'manager-1', name: 'Manager', email: 'm@example.com' });
  const request = new NextRequest('http://localhost/api/portal/recruiting/invites', {
    method: 'POST',
    body: JSON.stringify({
      candidateName: 'Candidate',
      candidateEmail: 'candidate@example.com',
      candidatePhone: '555-0100',
      intendedFieldRole: 'general_manager',
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await POST(request);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'Invalid field role' });
});
