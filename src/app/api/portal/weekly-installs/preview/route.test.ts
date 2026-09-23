import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, type FakeDb } from '@/lib/weeklyInstalls/fakeDb';
import { busyWeekInput } from '@/lib/weeklyInstalls/fixtures';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail }));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const mockManagement = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;

function request(query: string) {
  return new NextRequest(`http://localhost/api/portal/weekly-installs/preview${query}`);
}

const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };
let fake: FakeDb;

beforeEach(() => {
  mockManagement.mockReset();
  sendEmail.mockClear();
  const busy = busyWeekInput();
  fake = createFakeDb({
    users: {
      'rep-braeden': { status: 'active', email: 'braeden@example.com', displayName: 'Braeden Carter', fieldRole: 'ae_tier_1' },
    },
    sales: Object.fromEntries(busy.sales.map(({ id, ...rest }) => [id as string, rest as Record<string, unknown>])),
    fiberOrders: Object.fromEntries(busy.orders.map(({ id, ...rest }) => [id, rest as Record<string, unknown>])),
  });
  holder.db = fake.db;
});

describe('GET /api/portal/weekly-installs/preview', () => {
  it('passes an auth failure straight through', async () => {
    mockManagement.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await GET(request('?repId=rep-braeden'))).status).toBe(401);
  });

  it('is 403 for a rep (not management)', async () => {
    mockManagement.mockResolvedValue({ ok: false, error: 'Forbidden: management access required', status: 403 });
    expect((await GET(request('?repId=rep-braeden'))).status).toBe(403);
  });

  it('is 403 for an admin or operations user who is not the owner', async () => {
    mockManagement.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false });
    const res = await GET(request('?repId=rep-braeden'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: owner access required' });
  });

  it('validates its input', async () => {
    mockManagement.mockResolvedValue(OWNER);
    expect((await GET(request(''))).status).toBe(400);
    expect((await GET(request('?repId=rep-braeden&week=09/13/2026'))).status).toBe(400);
    expect((await GET(request('?repId=nobody&week=2026-09-13'))).status).toBe(404);
  });

  it('renders the chosen rep’s week for the owner, and never sends or writes', async () => {
    mockManagement.mockResolvedValue(OWNER);
    const res = await GET(request('?repId=rep-braeden&week=2026-09-13'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      repId: 'rep-braeden',
      week: { from: '2026-09-13', to: '2026-09-19' },
      empty: false,
      subject: 'Your installs last week: 4 installed · est. $471',
    });
    expect(body.html).toContain('Maria Lopez');
    expect(body.text).toContain('Est. payout Sep 28–Oct 3');

    const html = await GET(request('?repId=rep-braeden&week=2026-09-16&format=html'));
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(await html.text()).toContain('Week of Sep 13–19');

    expect(sendEmail).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
  });
});
