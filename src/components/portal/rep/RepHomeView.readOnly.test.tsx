import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NeedsDateRow } from '@/lib/dashboard/repSummary';
import { RepHomeView, type RepHomeViewProps } from './RepDashboard';

// The owner viewing as a rep gets the rep's Home without its writes: the
// "Needs date" rows still show, but not as an "Add date" / "Reschedule" action.
const row = (id: string, missed: boolean): NeedsDateRow => ({
  id,
  customer: `Customer ${id}`,
  plan: '1 Gig',
  missed,
  missedDay: null,
  soldDate: new Date(2026, 9, 1),
});

function props(over: Partial<RepHomeViewProps>): RepHomeViewProps {
  return {
    firstName: 'Noah',
    payStatus: 'ready',
    pay: null,
    hasPlan: true,
    zeroSales: false,
    canLog: false,
    carrierFailed: false,
    standing: { status: 'loading' },
    challenge: { status: 'loading' },
    timeLeft: '2d',
    rows: [],
    todayItems: [
      { kind: 'date', row: row('a', false) },
      { kind: 'date', row: row('b', true) },
    ],
    todayLoading: false,
    extraDates: 0,
    callsFailed: false,
    onHelp: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe('RepHomeView read only', () => {
  it('the rep: date rows are actions', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({ onSetDate: vi.fn() })} />);
    expect(html).toContain('Add date');
    expect(html).toContain('Reschedule');
  });

  it('viewing as the rep: the rows show, the actions do not', () => {
    const html = renderToStaticMarkup(<RepHomeView {...props({ onSetDate: undefined })} />);
    expect(html).toContain('Customer a');
    expect(html).toContain('Customer b');
    expect(html).not.toContain('Add date');
    expect(html).not.toContain('Reschedule');
    expect(html).not.toMatch(/<button[^>]*>[^]*Customer a/);
  });
});
