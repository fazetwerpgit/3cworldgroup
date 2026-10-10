// The rep's status line (Sales list, sale sheet, sale page). An install day
// the carrier report has not caught up to reads neutral, never "reschedule"
// (Noah, 2026-10-10).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { rowStatus } from '@/lib/dashboard/repSummary';
import { InstallStatusLine } from './InstallStatusLine';

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const today = new Date();
const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12, 0, 0);
const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 12, 0, 0);
const sale = { id: 's1', status: 'approved', installDate: yesterday } as unknown as Sale;
const pending = { status: 'pending_install', estInstallDate: dayKey(yesterday) } as FiberOrder;

function line(reportAsOf: string | null) {
  const status = rowStatus(sale, pending, new Date(), reportAsOf);
  return renderToStaticMarkup(<InstallStatusLine sale={sale} order={pending} status={status} reportAsOf={reportAsOf} />);
}

describe('InstallStatusLine', () => {
  it('reads "Install day passed · waiting on carrier" in the scheduled style while the report is behind', () => {
    const html = line(dayKey(twoDaysAgo));
    expect(html).toContain('Install day passed · waiting on carrier');
    expect(html).not.toMatch(/reschedule|overdue/i);
  });

  it('reads "Install overdue · reschedule" once the report covers the day', () => {
    expect(line(dayKey(yesterday))).toContain('Install overdue · reschedule');
  });
});
