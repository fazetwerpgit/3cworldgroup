import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeLeadDb } from '@/lib/knock/fakeLeadDb';
import { leadSeed } from '@/lib/knock/leadTestCsv';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const mockGate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const req = () => new NextRequest('http://localhost/api/portal/knock/leads');

beforeEach(() => {
  mockGate.mockReset();
  holder.db = createFakeLeadDb(leadSeed()).db;
  delete process.env.KNOCK_LEAD_IMPORT_LIVE;
});

describe('GET /api/portal/knock/leads', () => {
  it('is owner only', async () => {
    mockGate.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false });
    expect((await GET(req())).status).toBe(403);
  });

  it('lists campaigns and active people by name, the switch and the limits', async () => {
    mockGate.mockResolvedValue({ ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      campaigns: [
        { id: 'camp-2', name: 'Other Fiber', type: 'fiber' },
        { id: 'camp-1', name: 'Test Fiber', type: 'fiber' },
      ],
      people: [
        { uid: 'owner-1', name: 'Owner' },
        { uid: 'rep-1', name: 'Rep One' },
      ],
      live: false,
      maxBytes: 10 * 1024 * 1024,
      maxRows: 20_000,
    });
  });

  it('never offers a demo or test account', async () => {
    const seed = leadSeed();
    seed.users = {
      ...seed.users,
      qa: { status: 'active', displayName: 'Test Rep', email: 'qa@example.test', testAccount: true },
      demo: { status: 'active', displayName: 'App Review', email: 'demo@example.test', demoAccount: true },
    };
    holder.db = createFakeLeadDb(seed).db;
    mockGate.mockResolvedValue({ ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true });
    const body = await (await GET(req())).json();
    expect(body.people.map((p: { uid: string }) => p.uid)).toEqual(['owner-1', 'rep-1']);
  });
});
