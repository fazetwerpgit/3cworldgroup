import { describe, expect, it } from 'vitest';
import {
  CALLOUT_HOME_WHY,
  CALLOUT_PUSH_TITLE,
  calloutDays,
  calloutHomeLine,
  calloutLogLink,
  calloutPushMessage,
  isSaleCallout,
  shortRepName,
  type CalloutMessage,
  type LoggedSale,
} from './calloutNudge';

describe('isSaleCallout', () => {
  it.each(['1gig', '1 gig', '2 gig', '2gig 🔥', '300 mb', '300mb', '500 mb', '1 gig!!', '🔥🔥 2 gigs 🔥', 'Another 1 gig', '500mbps', '1 GIG'])(
    'counts %j',
    (text) => {
      expect(isSaleCallout(text)).toBe(true);
    }
  );

  it.each([
    'Dead ass just was signing a wife up for a 2gig that was paying 167$ a month for just internet have her husband slam the door on me',
    'Xfinity swo and atnt fiber swo btw',
    'No solicitation sign',
    'Blown away😔',
    '😭 thanks Jacob my bad for the flood',
    '1 gig?',
    'gig',
    '',
    '🔥',
    'call 2145550101',
  ])('does not count %j', (text) => {
    expect(isSaleCallout(text)).toBe(false);
  });

  it('allows five words and not six', () => {
    expect(isSaleCallout('another one 1 gig today')).toBe(true);
    expect(isSaleCallout('another one 1 gig today boys')).toBe(false);
  });
});

/** A Chicago wall-clock time in October (CDT, UTC-5). */
const chicago = (day: string, time: string) => new Date(`${day}T${time}:00-05:00`);
/** How sale dates are stored: noon on the server (UTC on Vercel). */
const saleNoon = (day: string) => new Date(`${day}T12:00:00Z`);

const message = (authorId: string, text: string, createdAt: Date, over: Partial<CalloutMessage> = {}): CalloutMessage => ({
  authorId,
  authorName: authorId === 'miles' ? 'Miles Rivera' : 'Mason Smith',
  text,
  createdAt,
  ...over,
});

describe('calloutDays', () => {
  it("compares a rep's callouts with the sales they logged for that Chicago day", () => {
    const messages = [
      message('miles', '1 gig', chicago('2026-10-09', '14:05')),
      message('miles', '1gig', chicago('2026-10-09', '15:10')),
      message('miles', '2 gig', chicago('2026-10-09', '16:20')),
      message('miles', '2 gig', chicago('2026-10-09', '17:45')),
      message('miles', 'No solicitation sign', chicago('2026-10-09', '18:00')),
      message('mason', '500 mb', chicago('2026-10-09', '12:00')),
    ];
    const sales: LoggedSale[] = [
      { salesRepId: 'mason', saleDate: saleNoon('2026-10-09') },
      // Miles logged one on the 10th: it is not one of the 9th's.
      { salesRepId: 'miles', saleDate: saleNoon('2026-10-10') },
    ];
    expect(calloutDays(messages, sales)).toEqual([
      { repId: 'mason', repName: 'Mason Smith', day: '2026-10-09', callouts: 1, logged: 1, gap: 0 },
      { repId: 'miles', repName: 'Miles Rivera', day: '2026-10-09', callouts: 4, logged: 0, gap: 4 },
    ]);
  });

  it('splits at Chicago midnight, not UTC midnight', () => {
    const messages = [
      // 11:50 PM Friday in Chicago is already Saturday in UTC.
      message('miles', '1 gig', chicago('2026-10-09', '23:50')),
      message('miles', '2 gig', chicago('2026-10-10', '00:10')),
    ];
    const sales: LoggedSale[] = [{ salesRepId: 'miles', saleDate: saleNoon('2026-10-10') }];
    expect(calloutDays(messages, sales)).toEqual([
      { repId: 'miles', repName: 'Miles Rivera', day: '2026-10-09', callouts: 1, logged: 0, gap: 1 },
      { repId: 'miles', repName: 'Miles Rivera', day: '2026-10-10', callouts: 1, logged: 1, gap: 0 },
    ]);
  });

  it('skips deleted messages and counts any existing sale, falling back to createdAt with no sale date', () => {
    const messages = [
      message('miles', '1 gig', chicago('2026-10-09', '10:00')),
      message('miles', '1 gig', chicago('2026-10-09', '11:00'), { deletedAt: chicago('2026-10-09', '11:01') }),
    ];
    const sales: LoggedSale[] = [{ salesRepId: 'miles', createdAt: chicago('2026-10-09', '20:00') }];
    expect(calloutDays(messages, sales)).toEqual([
      { repId: 'miles', repName: 'Miles Rivera', day: '2026-10-09', callouts: 1, logged: 1, gap: 0 },
    ]);
  });

  it('never goes below zero when more were logged than called out', () => {
    const messages = [message('miles', '1 gig', chicago('2026-10-09', '10:00'))];
    const sales: LoggedSale[] = [
      { salesRepId: 'miles', saleDate: saleNoon('2026-10-09') },
      { salesRepId: 'miles', saleDate: saleNoon('2026-10-09') },
    ];
    expect(calloutDays(messages, sales)[0]).toMatchObject({ callouts: 1, logged: 2, gap: 0 });
  });
});

describe('words', () => {
  it('says the home line and why', () => {
    expect(calloutHomeLine(2, 1)).toBe('You called out 2 sales today · 1 logged');
    expect(calloutHomeLine(1, 0)).toBe('You called out 1 sale today · 0 logged');
    expect(CALLOUT_HOME_WHY).toBe('Logged sales count on the board, show in your pay estimate and get install reminders.');
  });

  it('says the push', () => {
    expect(CALLOUT_PUSH_TITLE).toBe("Log today's sales?");
    expect(calloutPushMessage(3, 1)).toBe(
      'You called out 3 sales today and logged 1. Logging puts them on the board, in your pay estimate and on install reminders.'
    );
    expect(calloutPushMessage(1, 0)).toBe(
      'You called out 1 sale today and logged none. Logging puts it on the board, in your pay estimate and on install reminders.'
    );
  });

  it('opens the bulk logger when more than one is missing', () => {
    expect(calloutLogLink(1)).toBe('/portal/sales/new');
    expect(calloutLogLink(2)).toBe('/portal/sales/new/bulk');
  });

  it('shortens a name to first name and last initial', () => {
    expect(shortRepName('Miles Rivera')).toBe('Miles R.');
    expect(shortRepName('Noah')).toBe('Noah');
  });
});
