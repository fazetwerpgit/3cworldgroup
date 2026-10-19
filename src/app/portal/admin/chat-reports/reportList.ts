import type { ChatReportView } from '@/app/api/portal/admin/chat-reports/route';

export type ReportView = 'open' | 'resolved';
export type ReportPage = { reports: ChatReportView[]; nextCursor: string | null };

// A refresh never follows more pages than this, whatever was on screen.
const MAX_REFRESH_PAGES = 20;

/**
 * Loads one tab of the Chat reports queue: the first page, then (for a refresh
 * of a list that had "Load more" pages) the next pages until at least
 * `atLeast` rows are back, so the refresh keeps as much of the list as was on
 * screen. Resolves null when the tab changed while it loaded: that response
 * belongs to a tab no longer shown and must not replace the current one.
 */
export async function loadReportList({
  which,
  atLeast = 0,
  fetchPage,
  currentView,
}: {
  which: ReportView;
  atLeast?: number;
  fetchPage: (cursor: string | null) => Promise<ReportPage>;
  currentView: () => ReportView;
}): Promise<ReportPage | null> {
  const first = await fetchPage(null);
  const reports = [...first.reports];
  let nextCursor = first.nextCursor;
  for (let page = 1; nextCursor && reports.length < atLeast && page < MAX_REFRESH_PAGES; page++) {
    if (currentView() !== which) return null;
    const more = await fetchPage(nextCursor);
    // A row that moved between pages is shown once.
    const seen = new Set(reports.map((row) => row.id));
    reports.push(...more.reports.filter((row) => !seen.has(row.id)));
    nextCursor = more.nextCursor;
  }
  if (currentView() !== which) return null;
  return { reports, nextCursor };
}
