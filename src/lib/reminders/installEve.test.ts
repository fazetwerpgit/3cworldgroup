import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { fixtureOrder, fixtureSale, product } from '@/lib/weeklyInstalls/fixtures';
import { isReminderHour, reminderPush, tomorrowInstalls, type EveInstall } from './installEve';

/** Noon in Chicago (CDT), the way an install date lands whatever the server's zone. */
const chicagoNoon = (day: string) => new Date(`${day}T17:00:00Z`);

const sale = (id: string, installDay: string, extra: Partial<Sale> = {}) =>
  fixtureSale({
    id,
    salesRepId: 'rep-1',
    customerName: 'Jane Doe',
    customerPhone: '(214) 555-0101',
    installDate: chicagoNoon(installDay),
    ...extra,
  });

const ids = (installs: EveInstall[]) => installs.map((install) => install.saleId);

describe('tomorrowInstalls', () => {
  const sales = [sale('on-24', '2026-09-24'), sale('on-25', '2026-09-25')];
  const none = new Map<string, FiberOrder>();

  it('means tomorrow in Chicago, not in UTC', () => {
    // 6 PM CDT on the 23rd.
    expect(ids(tomorrowInstalls(sales, none, new Date('2026-09-23T23:00:00Z')))).toEqual(['on-24']);
    // 7:30 PM on the 23rd is already the 24th in UTC.
    expect(ids(tomorrowInstalls(sales, none, new Date('2026-09-24T00:30:00Z')))).toEqual(['on-24']);
    // 11:30 PM on the 23rd: still the evening before the 24th.
    expect(ids(tomorrowInstalls(sales, none, new Date('2026-09-24T04:30:00Z')))).toEqual(['on-24']);
    // 12:30 AM on the 24th: the 24th is today now, tomorrow is the 25th.
    expect(ids(tomorrowInstalls(sales, none, new Date('2026-09-24T05:30:00Z')))).toEqual(['on-25']);
  });

  it('skips sales that will not install tomorrow', () => {
    const now = new Date('2026-09-23T23:00:00Z');
    // fiberBySale is keyed by sale id directly; the address join is matchSales' job.
    const order = (id: string, extra: Partial<FiberOrder>) =>
      [id, fixtureOrder({ id: `o-${id}`, address: '100 Main St', ...extra })] as const;
    const book = [
      sale('live', '2026-09-24'),
      sale('cancelled', '2026-09-24', { status: 'cancelled' }),
      sale('rejected', '2026-09-24', { status: 'rejected' }),
      sale('carrier-cancel', '2026-09-24'),
      sale('churned', '2026-09-24'),
      sale('activated', '2026-09-24'),
      sale('still-missed', '2026-09-24'),
      sale('rebooked', '2026-09-24'),
      sale('moved', '2026-09-26'),
      sale('no-date', '2026-09-24', { installDate: undefined }),
    ];
    const fiberBySale = new Map<string, FiberOrder>([
      order('carrier-cancel', { status: 'cancelled' }),
      order('churned', { status: 'churned' }),
      order('activated', { status: 'active', activationDate: '2026-09-22' }),
      // Broke at the door on the 24th's date itself (sale never moved): missed.
      order('still-missed', { status: 'breakage', estInstallDate: '2026-09-24' }),
      // Broke on the 19th, rebooked for the 24th: a live install again.
      order('rebooked', { status: 'breakage', estInstallDate: '2026-09-19' }),
    ]);
    expect(ids(tomorrowInstalls(book, fiberBySale, now))).toEqual(['live', 'rebooked']);
  });

  it('names the customer First L. and the carrier with its plan', () => {
    const [install] = tomorrowInstalls(
      [sale('a', '2026-09-24', { customerName: 'JANE Q DOE', products: [product('tfiber-1gig')] })],
      new Map(),
      new Date('2026-09-23T23:00:00Z')
    );
    expect(install).toMatchObject({ customer: 'Jane D.', plan: 'T-Fiber 1 Gig' });
  });
});

describe('the 6 PM gate', () => {
  it('passes exactly one of the two UTC runs, summer and winter', () => {
    expect(isReminderHour(new Date('2026-09-23T23:00:00Z'))).toBe(true); // CDT slot
    expect(isReminderHour(new Date('2026-09-24T00:00:00Z'))).toBe(false);
    expect(isReminderHour(new Date('2026-01-15T00:00:00Z'))).toBe(true); // CST slot
    expect(isReminderHour(new Date('2026-01-14T23:00:00Z'))).toBe(false);
  });
});

describe('copy', () => {
  const install = (customer: string, plan: string, saleId = 's1') => ({ saleId, customer, plan }) as EveInstall;
  const ask = 'Make sure someone will be home.';

  it('names one install with its plan and opens that sale', () => {
    expect(reminderPush([install('Jane D.', 'AT&T 500')])).toEqual({
      title: 'Install tomorrow',
      message: `Jane D. · AT&T 500. ${ask}`,
      link: '/portal/sales/s1',
    });
    expect(reminderPush([install('Jane D.', '')]).message).toBe(`Jane D. ${ask}`);
  });

  it('names two, then two and a count, and opens Sales', () => {
    expect(reminderPush([install('Jane D.', 'a'), install('Sam R.', 'b')])).toEqual({
      title: '2 installs tomorrow',
      message: `Jane D. and Sam R. ${ask}`,
      link: '/portal/sales',
    });
    expect(reminderPush([install('Jane D.', ''), install('Sam R.', ''), install('12 Oak Ave', ''), install('Ana P.', '')]).message).toBe(
      `Jane D., Sam R. and 2 more. ${ask}`
    );
  });
});
