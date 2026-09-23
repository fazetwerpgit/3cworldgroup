import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminQueue, queueValue, type QueueRow } from './AdminQueue';

const row = (o: Partial<QueueRow>): QueueRow => ({
  id: 'r1',
  status: 'new',
  person: 'Marcus Hill',
  subject: 'Upload spins',
  secondary: 'Sep 21, 2026',
  evidenceKind: 'none',
  detailFields: [],
  searchText: 'marcus hill upload spins',
  ...o,
});

const render = (props: Partial<Parameters<typeof AdminQueue>[0]>) =>
  renderToStaticMarkup(
    <AdminQueue
      title="Bug Reports"
      columns={['Reported by', 'Issue', 'Submitted']}
      itemNoun="Bug report"
      rows={[]}
      loading={false}
      error=""
      onRetry={() => {}}
      onMarkHandled={async () => {}}
      emptyBody="No bug reports need review right now."
      {...props}
    />
  );

describe('queueValue', () => {
  it('formats blanks, booleans, numbers and dates for display', () => {
    expect(queueValue('')).toBe('—');
    expect(queueValue(null)).toBe('—');
    expect(queueValue(true)).toBe('Yes');
    expect(queueValue(1240)).toBe('1,240');
    expect(queueValue('2026-09-09')).toBe('Sep 9, 2026');
    expect(queueValue(new Date(2026, 8, 21, 18, 42).toISOString())).toMatch(/^Sep 21, 2026 · 6:42\sPM$/);
  });
});

describe('AdminQueue', () => {
  it('shows skeletons and no count while loading', () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(' open</span>');
  });

  it("says Couldn't load with a Retry instead of an empty queue or zero", () => {
    const html = render({ error: 'boom' });
    expect(html).toContain('Couldn&#x27;t load');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Nothing to review');
    expect(html).not.toContain(' open</span>');
  });

  it('shows a short empty state when there is nothing to review', () => {
    const html = render({});
    expect(html).toContain('Nothing to review');
    expect(html).toContain('No bug reports need review right now.');
  });

  it('opens on New: lists only open rows and counts them', () => {
    const html = render({
      rows: [row({}), row({ id: 'r2', person: 'Priya Nair', status: 'handled' })],
      filterLabel: 'Campaign',
      filterOptions: ['T-Fiber DFW'],
    });
    expect(html).toContain('Marcus Hill');
    expect(html).not.toContain('Priya Nair');
    expect(html).toMatch(/<b>1<\/b><span> open<\/span>/);
    expect(html).toContain('All campaigns');
  });

  it('marks New as the selected status and keeps All and Handled one tap away', () => {
    const html = render({ rows: [row({})] });
    const pressed = (label: string) =>
      html.match(new RegExp(`<button[^>]*aria-pressed="(true|false)"[^>]*>${label}`))?.[1];
    expect(pressed('New')).toBe('true');
    expect(pressed('All')).toBe('false');
    expect(pressed('Handled')).toBe('false');
  });

  it('says Nothing waiting, with Show handled, when every row is handled', () => {
    const html = render({ rows: [row({ status: 'handled', person: 'Priya Nair' })] });
    expect(html).toContain('Nothing waiting');
    expect(html).toContain('Every bug report here is handled.');
    expect(html).toContain('Show handled');
    expect(html).not.toContain('Nothing matches');
    expect(html).not.toContain('Priya Nair');
  });
});
