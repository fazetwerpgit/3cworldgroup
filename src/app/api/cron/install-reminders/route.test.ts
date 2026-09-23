import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from '@/lib/weeklyInstalls/fakeDb';
import { fixtureSale } from '@/lib/weeklyInstalls/fixtures';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const dispatchToUser = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser }));

import { GET } from './route';

const SECRET = 'test-cron-secret';
/** 6 PM CDT Wed Sep 23: the 23:00 UTC run. */
const WED_6PM = new Date('2026-09-23T23:00:00Z');
/** The 00:00 UTC run the same evening: 7 PM, not the send hour. */
const WED_7PM = new Date('2026-09-24T00:00:00Z');
const THU_6PM = new Date('2026-09-24T23:00:00Z');

/** fixtureSale's default product, as the push labels it. */
const PLAN = 'T-Fiber 1 Gig';

const chicagoNoon = (day: string) => new Date(`${day}T17:00:00Z`);

function seed(): FakeDb {
  const sale = (id: string, salesRepId: string, day: string, customerName: string) =>
    [
      id,
      fixtureSale({
        id,
        salesRepId,
        customerName,
        customerPhone: '214-555-0101',
        customerAddress: `${100 + Number(id.slice(1))} Oak Ave, Dallas, TX 75201`,
        installDate: chicagoNoon(day),
      }) as unknown as Record<string, unknown>,
    ] as const;
  return createFakeDb({
    users: {
      'rep-one': { status: 'active', email: 'one@example.com', displayName: 'One Rep' },
      'rep-two': { status: 'active', email: 'two@example.com', displayName: 'Two Rep' },
    },
    sales: Object.fromEntries([
      sale('s1', 'rep-one', '2026-09-24', 'Jane Doe'),
      sale('s2', 'rep-two', '2026-09-24', 'Sam Roe'),
      sale('s3', 'rep-two', '2026-09-24', 'Ana Poe'),
      sale('s4', 'rep-two', '2026-09-28', 'Later Loe'),
    ]),
  });
}

function request(query = '') {
  return new Request(`http://localhost/api/cron/install-reminders${query}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

let fake: FakeDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WED_6PM);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('INSTALL_REMINDERS_OFF', '');
  vi.stubEnv('INSTALL_REMINDERS_ONLY_TO', '');
  dispatchToUser.mockClear();
  fake = seed();
  holder.db = fake.db;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/install-reminders', () => {
  it('rejects a missing or wrong secret', async () => {
    expect((await GET(new Request('http://localhost/api/cron/install-reminders'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(500);
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('does nothing outside 6 PM Chicago', async () => {
    vi.setSystemTime(WED_7PM);
    expect(await (await GET(request('?slot=cst'))).json()).toMatchObject({ skipped: 'not_send_hour' });
    expect(dispatchToUser).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
  });

  it('with INSTALL_REMINDERS_OFF=true, reports what it would send and writes nothing', async () => {
    {
      vi.stubEnv('INSTALL_REMINDERS_OFF', 'true');
      const body = await (await GET(request('?slot=cdt'))).json();
      expect(body).toMatchObject({ forDate: '2026-09-24', enabled: false, reps: 2, installs: 3, sent: 0 });
      expect(body.pushes).toEqual([
        expect.objectContaining({ uid: 'rep-one', title: 'Install tomorrow', message: `Jane D. · ${PLAN}. Make sure someone will be home.` }),
        expect.objectContaining({ uid: 'rep-two', title: '2 installs tomorrow', message: 'Sam R. and Ana P. Make sure someone will be home.' }),
      ]);
    }
    expect(dispatchToUser).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
  });

  it('never mass-sends when ONLY_TO is malformed, and force cannot skip the hour for it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const value of ['a@b.com, c@d.com', 'one rep', 'x']) {
      vi.stubEnv('INSTALL_REMINDERS_ONLY_TO', value);
      const body = await (await GET(request())).json();
      expect(body).toMatchObject({ enabled: false, onlyTo: null, sent: 0 });
      expect(body.configError).toContain('INSTALL_REMINDERS_ONLY_TO');
      vi.setSystemTime(WED_7PM);
      expect(await (await GET(request('?force=1'))).json()).toMatchObject({ skipped: 'not_send_hour' });
      vi.setSystemTime(WED_6PM);
    }
    expect(dispatchToUser).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
    error.mockRestore();
  });

  it('ONLY_TO (uid or email) reminds just that rep, and may be forced off-hour', async () => {
    vi.stubEnv('INSTALL_REMINDERS_ONLY_TO', 'TWO@example.com');
    vi.setSystemTime(WED_7PM);
    const body = await (await GET(request('?force=1'))).json();
    expect(body).toMatchObject({ considered: 1, sent: 1 });
    expect(dispatchToUser).toHaveBeenCalledTimes(1);
    expect(dispatchToUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rep-two' }));

    vi.stubEnv('INSTALL_REMINDERS_ONLY_TO', 'rep-one');
    expect(await (await GET(request('?force=1'))).json()).toMatchObject({ considered: 1, sent: 1 });
    expect(dispatchToUser).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'rep-one' }));
  });

  it('sends one push per rep, once a night, and again for a new date', async () => {
    const first = await (await GET(request('?slot=cdt'))).json();
    expect(first).toMatchObject({ sent: 2, alreadySent: 0 });
    expect(dispatchToUser).toHaveBeenCalledWith({
      userId: 'rep-one',
      type: 'install_reminder',
      title: 'Install tomorrow',
      message: `Jane D. · ${PLAN}. Make sure someone will be home.`,
      link: '/portal/sales/s1',
      metadata: { forDate: '2026-09-24', saleIds: ['s1'] },
    });
    expect(fake.docs('sales').get('s1')?.installReminder).toEqual({ forDate: '2026-09-24', at: WED_6PM.toISOString() });

    // A retry the same night: every sale is claimed, nothing goes out.
    dispatchToUser.mockClear();
    expect(await (await GET(request('?slot=cdt'))).json()).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(dispatchToUser).not.toHaveBeenCalled();

    // Jane's install broke and was rebooked for Friday: Thursday evening reminds again.
    fake.docs('sales').set('s1', { ...fake.docs('sales').get('s1'), installDate: chicagoNoon('2026-09-25') });
    vi.setSystemTime(THU_6PM);
    expect(await (await GET(request('?slot=cdt'))).json()).toMatchObject({ forDate: '2026-09-25', sent: 1 });
    expect(dispatchToUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rep-one' }));
  });
});
