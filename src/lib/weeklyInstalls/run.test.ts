import { describe, expect, it } from 'vitest';
import { ONLY_TO_INVALID, runWeeklyInstallsEmail, weeklyRunConfig } from './run';
import { createFakeDb } from './fakeDb';
import { FIXTURE_WEEK, fixtureSale } from './fixtures';
import { canReclaim, MAX_SEND_ATTEMPTS, sendLogId, STALE_SENDING_MS } from './sendLog';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('weeklyRunConfig', () => {
  it('is live to every rep only with ENABLED=true and no ONLY_TO', () => {
    expect(weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true' }))).toMatchObject({
      enabled: true,
      onlyTo: null,
      configError: null,
    });
    expect(
      weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: '   ' }))
    ).toMatchObject({ enabled: true, onlyTo: null, configError: null });
  });

  it('redirects every send to a valid ONLY_TO', () => {
    expect(
      weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: ' jmyers@3cworldgroup.com ' }))
    ).toMatchObject({ enabled: true, onlyTo: 'jmyers@3cworldgroup.com', configError: null });
  });

  it('refuses to send (dry run) when ONLY_TO is set but not one valid address', () => {
    for (const value of ['jmyers', 'jmyers@', '@3cworldgroup.com', 'jmyers@3cworldgroup', 'a@b.com,c@d.com', 'a@b.com c@d.com']) {
      expect(
        weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: value }))
      ).toMatchObject({ enabled: false, onlyTo: null, configError: ONLY_TO_INVALID });
    }
  });
});

// --- Resumable run (backup slot sends what the first run left behind) ---

describe('runWeeklyInstallsEmail resumability', () => {
  const config = { enabled: true, onlyTo: null, baseUrl: 'https://example.com', configError: null };
  const now = new Date('2026-09-21T13:00:00Z');
  const seed = () => {
    const users: Record<string, Record<string, unknown>> = {};
    const sales: Record<string, Record<string, unknown>> = {};
    for (const uid of ['a', 'b', 'c']) {
      users[uid] = { status: 'active', displayName: uid.toUpperCase(), fieldRole: 'entry_level_rep', email: `${uid}@example.com` };
      sales[`s-${uid}`] = { ...fixtureSale({ id: `s-${uid}`, salesRepId: uid, installDay: '2026-09-15', soldDay: '2026-09-04' }) };
    }
    return { users, sales, fiberOrders: {} };
  };

  it('a throw for one rep does not end the loop; the backup run sends only the rest', async () => {
    const fake = createFakeDb(seed());
    const sent: string[] = [];
    const flaky = async (input: { to: string }) => {
      if (input.to === 'b@example.com') throw new Error('socket hang up');
      sent.push(input.to);
      return { ok: true };
    };
    const first = await runWeeklyInstallsEmail({ db: fake.db, now, config, send: flaky, week: FIXTURE_WEEK });
    expect(first.sent).toBe(2);
    expect(first.failed).toBe(1);
    // b's claim is stuck at `sending` (the throw came before the result).
    expect(fake.docs('weeklyInstallEmails').get(sendLogId(FIXTURE_WEEK.last.from, 'b', null))?.status).toBe('sending');

    // The 9 AM resume pass, after the stale window: only b goes out.
    const later = new Date(now.getTime() + STALE_SENDING_MS + 1000);
    const resend: string[] = [];
    const second = await runWeeklyInstallsEmail({
      db: fake.db,
      now: later,
      config,
      send: async (input) => (resend.push(input.to), { ok: true }),
      week: FIXTURE_WEEK,
    });
    expect(resend).toEqual(['b@example.com']);
    expect(second).toMatchObject({ sent: 1, retried: 1, alreadySent: 2 });
    expect(fake.docs('weeklyInstallEmails').get(sendLogId(FIXTURE_WEEK.last.from, 'b', null))).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('a Postmark failure is retried by the next run; a sent rep never is', async () => {
    const fake = createFakeDb(seed());
    await runWeeklyInstallsEmail({
      db: fake.db,
      now,
      config,
      send: async (input) => (input.to === 'c@example.com' ? { ok: false, error: 'timeout' } : { ok: true }),
      week: FIXTURE_WEEK,
    });
    const resend: string[] = [];
    await runWeeklyInstallsEmail({ db: fake.db, now, config, send: async (i) => (resend.push(i.to), { ok: true }), week: FIXTURE_WEEK });
    expect(resend).toEqual(['c@example.com']);
  });

  it('canReclaim: failed or stale sending, under the attempt cap; never sent or fresh sending', () => {
    const t = new Date('2026-09-21T14:00:00Z');
    const old = new Date(t.getTime() - STALE_SENDING_MS).toISOString();
    const fresh = new Date(t.getTime() - 60_000).toISOString();
    expect(canReclaim({ status: 'sent', attempts: 1 }, t)).toBe(false);
    expect(canReclaim({ status: 'failed' }, t)).toBe(true);
    expect(canReclaim({ status: 'failed', attempts: MAX_SEND_ATTEMPTS }, t)).toBe(false);
    expect(canReclaim({ status: 'sending', claimedAt: old, attempts: 1 }, t)).toBe(true);
    expect(canReclaim({ status: 'sending', claimedAt: fresh, attempts: 1 }, t)).toBe(false);
    expect(canReclaim(undefined, t)).toBe(false);
  });
});
