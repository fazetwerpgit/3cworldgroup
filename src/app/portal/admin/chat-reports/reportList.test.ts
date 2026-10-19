import { describe, it, expect } from 'vitest';
import type { ChatReportView } from '@/app/api/portal/admin/chat-reports/route';
import { loadReportList, type ReportPage, type ReportView } from './reportList';

const row = (id: string) => ({ id }) as ChatReportView;
const page = (ids: string[], nextCursor: string | null): ReportPage => ({ reports: ids.map(row), nextCursor });

describe('loadReportList', () => {
  it('drops a response that lands after the admin switched tabs', async () => {
    let view: ReportView = 'open';
    let release!: () => void;
    const pending = loadReportList({
      which: 'open',
      fetchPage: () => new Promise<ReportPage>((resolve) => (release = () => resolve(page(['a'], null)))),
      currentView: () => view,
    });
    view = 'resolved';
    release();
    expect(await pending).toBeNull();
  });

  it('returns the first page for a fresh load', async () => {
    const cursors: Array<string | null> = [];
    const list = await loadReportList({
      which: 'open',
      fetchPage: async (cursor) => {
        cursors.push(cursor);
        return page(['a', 'b'], 'b');
      },
      currentView: () => 'open',
    });
    expect(list).toEqual(page(['a', 'b'], 'b'));
    expect(cursors).toEqual([null]);
  });

  it('a refresh follows pages until the rows loaded with "Load more" are back', async () => {
    const pages: Record<string, ReportPage> = {
      first: page(['a', 'b'], 'b'),
      b: page(['b', 'c', 'd'], 'd'),
      d: page(['e', 'f'], 'f'),
    };
    const cursors: Array<string | null> = [];
    const list = await loadReportList({
      which: 'open',
      atLeast: 4,
      fetchPage: async (cursor) => {
        cursors.push(cursor);
        return pages[cursor ?? 'first'];
      },
      currentView: () => 'open',
    });
    expect(cursors).toEqual([null, 'b']);
    expect(list).toEqual(page(['a', 'b', 'c', 'd'], 'd'));
  });

  it('stops at the end of the queue', async () => {
    const list = await loadReportList({
      which: 'resolved',
      atLeast: 100,
      fetchPage: async (cursor) => (cursor ? page(['c'], null) : page(['a', 'b'], 'b')),
      currentView: () => 'resolved',
    });
    expect(list).toEqual(page(['a', 'b', 'c'], null));
  });
});
