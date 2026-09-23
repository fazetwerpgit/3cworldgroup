import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from '@/lib/weeklyInstalls/fakeDb';
import { busyWeekInput, lightWeekInput, fixtureSale } from '@/lib/weeklyInstalls/fixtures';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail }));

import { GET } from './route';

const SECRET = 'test-cron-secret';
const MONDAY_8AM_CDT = new Date('2026-09-21T13:00:00Z');
const MONDAY_9AM_CDT = new Date('2026-09-21T14:00:00Z');

function seed(): FakeDb {
  const busy = busyWeekInput();
  const light = lightWeekInput();
  const toDocs = <T extends { id?: string }>(rows: T[]) =>
    Object.fromEntries(rows.map(({ id, ...rest }) => [id ?? '', rest as Record<string, unknown>]));
  return createFakeDb({
    users: {
      'rep-braeden': { status: 'active', email: 'braeden@example.com', displayName: 'Braeden Carter', fieldRole: 'ae_tier_1' },
      // Legacy capital-E address field.
      'rep-jasmine': { status: 'active', Email: 'jasmine@example.com', displayName: 'Jasmine Reed', fieldRole: 'ae_tier_1' },
      // Has a sale, but nothing in this week's email.
      'rep-quiet': { status: 'active', email: 'quiet@example.com', displayName: 'Quiet Rep', fieldRole: 'ae_tier_1' },
      // Decommissioned: never emailed, whatever they sold.
      'rep-gone': { status: 'inactive', email: 'gone@example.com', displayName: 'Gone Rep', fieldRole: 'ae_tier_1' },
    },
    sales: toDocs([
      ...busy.sales,
      ...light.sales,
      fixtureSale({ id: 'q1', salesRepId: 'rep-quiet', installDay: '2026-08-20' }),
      fixtureSale({ id: 'g1', salesRepId: 'rep-gone', installDay: '2026-09-15' }),
    ]),
    fiberOrders: toDocs(busy.orders),
  });
}

function request(options: { auth?: string | null; query?: string } = {}) {
  const headers = new Headers();
  const auth = options.auth === undefined ? `Bearer ${SECRET}` : options.auth;
  if (auth) headers.set('authorization', auth);
  return new Request(`http://localhost/api/cron/weekly-installs${options.query ?? ''}`, { headers });
}

let fake: FakeDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MONDAY_8AM_CDT);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', '');
  vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ONLY_TO', '');
  vi.stubEnv('APP_BASE_URL', 'https://www.3cworldgroup.com');
  sendEmail.mockClear();
  fake = seed();
  holder.db = fake.db;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/weekly-installs', () => {
  it('rejects a missing or wrong secret, and refuses to run without one configured', async () => {
    expect((await GET(request({ auth: null }))).status).toBe(401);
    expect((await GET(request({ auth: 'Bearer nope' }))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does nothing outside 8 AM Chicago on a Monday', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    vi.setSystemTime(MONDAY_9AM_CDT);
    const body = await (await GET(request())).json();
    expect(body.skipped).toBe('not_send_hour');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
  });

  it('with the kill switch off, sends nothing and writes nothing (dry run)', async () => {
    for (const value of ['', 'TRUE', '1', 'yes']) {
      vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', value);
      const body = await (await GET(request())).json();
      expect(body).toMatchObject({ enabled: false, eligible: 2, sent: 0 });
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
  });

  it('never mass-sends when ONLY_TO is set but malformed: dry run with a clear error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    for (const value of ['jmyers', 'jmyers@', 'a@b.com, c@d.com']) {
      vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ONLY_TO', value);
      const body = await (await GET(request())).json();
      expect(body).toMatchObject({ enabled: false, redirectedTo: null, eligible: 2, sent: 0 });
      expect(body.configError).toContain('WEEKLY_INSTALLS_EMAIL_ONLY_TO');
      // force=1 cannot skip the hour gate for it either.
      vi.setSystemTime(MONDAY_9AM_CDT);
      expect(await (await GET(request({ query: '?force=1' }))).json()).toMatchObject({ skipped: 'not_send_hour' });
      vi.setSystemTime(MONDAY_8AM_CDT);
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fake.writes).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('WEEKLY_INSTALLS_EMAIL_ONLY_TO'));
  });

  it('sends each active rep with something to say their own email, awaited, once', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({
      week: { from: '2026-09-13', to: '2026-09-19' },
      enabled: true,
      considered: 3,
      empty: 1,
      sent: 2,
      alreadySent: 0,
      failed: 0,
    });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const calls = sendEmail.mock.calls as unknown as [{ to: string; subject: string; htmlBody: string; textBody: string }][];
    const byTo = Object.fromEntries(calls.map(([input]) => [input.to, input]));
    expect(Object.keys(byTo).sort()).toEqual(['braeden@example.com', 'jasmine@example.com']);
    expect(byTo['braeden@example.com'].subject).toBe('Your installs last week: 4 installed · est. $471');
    expect(byTo['braeden@example.com'].htmlBody).toContain('Maria Lopez');
    expect(byTo['braeden@example.com'].htmlBody).not.toContain('Gloria Santos');
    expect(byTo['jasmine@example.com'].htmlBody).toContain('Gloria Santos');
    expect(byTo['jasmine@example.com'].htmlBody).not.toContain('Maria Lopez');
    expect(byTo['jasmine@example.com'].textBody).toContain('est. $97.50');

    const log = fake.docs('weeklyInstallEmails');
    expect([...log.keys()].sort()).toEqual(['2026-09-13_rep-braeden', '2026-09-13_rep-jasmine']);
    expect(log.get('2026-09-13_rep-braeden')).toMatchObject({ status: 'sent', to: 'braeden@example.com' });
  });

  it('never double-sends when the cron fires again for the same week', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    await GET(request({ query: '?slot=cdt' }));
    const again = await (await GET(request({ query: '?slot=cdt' }))).json();
    expect(again).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('records a failed send and does not retry it on a repeat trigger', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    sendEmail.mockResolvedValueOnce({ ok: false, error: 'postmark_422' } as never);
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ sent: 1, failed: 1 });
    const statuses = [...fake.docs('weeklyInstallEmails').values()].map((doc) => doc.status).sort();
    expect(statuses).toEqual(['failed', 'sent']);
  });

  it('redirects every send to ONLY_TO without using up the reps’ real send', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ONLY_TO', 'owner@example.com');
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ redirectedTo: 'owner@example.com', sent: 2 });
    const calls = sendEmail.mock.calls as unknown as [{ to: string; subject: string }][];
    expect(calls.map(([input]) => input.to)).toEqual(['owner@example.com', 'owner@example.com']);
    expect(calls.map(([input]) => input.subject).sort()).toEqual([
      '[Test: Braeden Carter] Your installs last week: 4 installed · est. $471',
      '[Test: Jasmine Reed] Your installs last week: 1 installed · est. $97.50',
    ]);

    // The live run afterwards still reaches the reps.
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ONLY_TO', '');
    const live = await (await GET(request())).json();
    expect(live).toMatchObject({ redirectedTo: null, sent: 2, alreadySent: 0 });
  });

  it('lets force=1 skip the hour gate only for a redirected test run', async () => {
    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ENABLED', 'true');
    vi.setSystemTime(new Date('2026-09-23T18:00:00Z')); // a Wednesday afternoon
    const blocked = await (await GET(request({ query: '?force=1' }))).json();
    expect(blocked.skipped).toBe('not_send_hour');
    expect(sendEmail).not.toHaveBeenCalled();

    vi.stubEnv('WEEKLY_INSTALLS_EMAIL_ONLY_TO', 'owner@example.com');
    const forced = await (await GET(request({ query: '?force=1' }))).json();
    expect(forced).toMatchObject({ sent: 2, redirectedTo: 'owner@example.com' });
    const calls = sendEmail.mock.calls as unknown as [{ to: string }][];
    expect(calls.every(([input]) => input.to === 'owner@example.com')).toBe(true);
  });
});
