import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => null }));

import { CalloutNudgeLine } from './CalloutNudge';

/** 6 PM Friday Oct 9 in Chicago. */
const EVENING = new Date('2026-10-09T23:00:00Z');

describe('CalloutNudgeLine', () => {
  it('says how many were called out and logged, why it matters, and links to log one', () => {
    const html = renderToStaticMarkup(
      <CalloutNudgeLine status={{ day: '2026-10-09', callouts: 2, logged: 1, gap: 1 }} now={EVENING} />
    );
    expect(html).toContain('You called out 2 sales today · 1 logged');
    expect(html).toContain('Logged sales count on the board, show in your pay estimate and get install reminders.');
    expect(html).toContain('href="/portal/sales/new"');
    expect(html).toContain('Log sale');
  });

  it('opens the bulk logger when more than one is missing', () => {
    const html = renderToStaticMarkup(
      <CalloutNudgeLine status={{ day: '2026-10-09', callouts: 4, logged: 0, gap: 4 }} now={EVENING} />
    );
    expect(html).toContain('href="/portal/sales/new/bulk"');
  });

  it('shows nothing once they are logged, once the day is over, or without a count', () => {
    expect(
      renderToStaticMarkup(<CalloutNudgeLine status={{ day: '2026-10-09', callouts: 2, logged: 2, gap: 0 }} now={EVENING} />)
    ).toBe('');
    // 12:10 AM Saturday in Chicago.
    expect(
      renderToStaticMarkup(
        <CalloutNudgeLine status={{ day: '2026-10-09', callouts: 2, logged: 1, gap: 1 }} now={new Date('2026-10-10T05:10:00Z')} />
      )
    ).toBe('');
    expect(renderToStaticMarkup(<CalloutNudgeLine status={null} now={EVENING} />)).toBe('');
  });
});
