import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  sync: vi.fn(),
  notices: vi.fn(),
  overdue: vi.fn(),
  nudges: vi.fn(),
  dirty: vi.fn(async () => {}),
}));

vi.mock('@/lib/sales/installDateSync', () => ({ syncInstallDatesFromOrders: m.sync }));
vi.mock('@/lib/fiberReport/carrierNotices', () => ({ sendCarrierNotices: m.notices }));
vi.mock('@/lib/alerts/installOverdueAlerts', () => ({ runOverdueInstallAlerts: m.overdue }));
vi.mock('@/lib/alerts/unloggedOrderNudges', () => ({ runUnloggedOrderNudges: m.nudges }));
vi.mock('@/lib/leaderboard/snapshotStore', () => ({ markLeaderboardDirty: m.dirty }));

import { runReportFollowUps } from '@/lib/fiberReport/reportFollowUps';

const db = {} as FirebaseFirestore.Firestore;
const stored = new Map();

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.sync.mockResolvedValue({ changes: [], orderSales: new Map(), moved: 1, orderNumbersFilled: 0, orderNumberSkippedConflict: 0 });
  m.notices.mockResolvedValue({ sent: 2 });
  m.overdue.mockResolvedValue({ counts: { rep: 3 } });
  m.nudges.mockResolvedValue({ counts: { nudged: 4 } });
});

describe('runReportFollowUps', () => {
  it('records each stage as it lands, in order, ending with done', async () => {
    const stages: Array<[string, unknown]> = [];
    const result = await runReportFollowUps({
      db,
      orders: [],
      storedOrders: stored,
      progress: async (stage, values) => {
        stages.push([stage, values]);
      },
    });
    expect(stages.map(([stage]) => stage)).toEqual(['installDateSync', 'carrierNotices', 'overdueAlerts', 'unloggedOrderNudges', 'done']);
    expect(stages[1][1]).toEqual({ carrierNotices: { sent: 2 } });
    expect(result).toMatchObject({ carrierNotices: { sent: 2 }, overdueAlerts: { rep: 3 }, unloggedOrderNudges: { nudged: 4 } });
    expect(m.dirty).toHaveBeenCalledTimes(1);
  });

  it('a failing step neither stops the others nor loses its stage', async () => {
    m.sync.mockRejectedValue(new Error('sync down'));
    m.overdue.mockRejectedValue(new Error('overdue down'));
    const stages: string[] = [];
    const result = await runReportFollowUps({ db, orders: [], storedOrders: stored, progress: async (s) => void stages.push(s) });
    expect(stages).toEqual(['installDateSync', 'carrierNotices', 'overdueAlerts', 'unloggedOrderNudges', 'done']);
    expect(result.installDateSync).toBeNull();
    expect(result.overdueAlerts).toBeNull();
    expect(result.unloggedOrderNudges).toEqual({ nudged: 4 });
  });

  it('a failed log write never fails the run, and no stored orders skips the notices', async () => {
    const result = await runReportFollowUps({
      db,
      orders: [],
      storedOrders: null,
      progress: async () => {
        throw new Error('log down');
      },
    });
    expect(m.notices).not.toHaveBeenCalled();
    expect(result.unloggedOrderNudges).toEqual({ nudged: 4 });
  });
});
