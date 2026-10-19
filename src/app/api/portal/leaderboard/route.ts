import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { resolveSubject } from '@/lib/auth/viewAs';
import { formatMonthParam, chicagoMonthBounds, parseLeaderboardMonth, periodBounds } from '@/lib/leaderboard/periods';
import { type MonthKey } from '@/lib/sales/monthWindow';
import { unrankedReps, type RecentSale, type UnrankedRep } from '@/lib/leaderboard/team';
import { monthPeriodId, serveBoard } from '@/lib/leaderboard/snapshot';
import { loadBoardPeriod } from '@/lib/leaderboard/snapshotStore';

// How many ranked rows a non-management caller may pull in one request. The
// most any rep-facing view asks for is 100 (dashboard); the mini widget asks 5.
const NON_MANAGEMENT_LIMIT_CAP = 100;
// ?include=team: the team at 0 is bounded like the All Company member list
// (chat members route, MAX_MEMBERS) — the same names every rep already sees
// there.
const UNRANKED_CAP = 200;

// GET /api/portal/leaderboard - Get leaderboard data (points-based)
export async function GET(request: NextRequest) {
  try {
    // Require a verified active login — a pending hire lands on
    // /portal/onboarding and cannot open the dashboard or its leaderboard.
    const caller = await requireVerifiedRequester(request);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
    // View as rep: "you" is the rep, and the rep's row cap applies. Rows never
    // carry dollars for anyone, so nothing more is exposed to the owner.
    const subject = await resolveSubject(request, caller);
    if (!subject.ok) return NextResponse.json({ error: subject.error }, { status: subject.status });
    const gate = subject.viewing ? subject.target : caller;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'month';
    const metric = searchParams.get('metric') || 'totalPoints';
    // `limit` is caller-controlled and each row carries a real uid and name, so
    // an unbounded limit is a roster-enumeration primitive — the same shape that
    // made the requireManagement hole a two-request exploit. Only the two admin
    // pages legitimately ask for the whole company (limit=1000, to join sale
    // counts onto the user table); every rep-facing caller asks for 5 or 100.
    // Cap non-management callers at 100 to keep the rep-facing view bounded.
    const requestedLimit = parseInt(searchParams.get('limit') || '10');
    const limit = gate.isManagement
      ? requestedLimit
      : Math.min(requestedLimit, NON_MANAGEMENT_LIMIT_CAP);
    // 'submitted' also counts pending sales — the weekly challenge tracks
    // sales as reps log them, without waiting on admin approval. Rankings
    // and points stay approved-only (the default).
    const scope = searchParams.get('scope') === 'submitted' ? 'submitted' : 'approved';

    // Calculate date range
    const now = new Date();
    const boardPeriod = period === 'week' || period === 'year' || period === 'all' ? period : 'month';
    // Month view: `month=YYYY-MM` reads a past month, from its snapshot doc
    // (built from every sale); absent is this month. Both are bounded
    // [1st, next 1st) on the office clock. A month not yet begun is refused.
    let monthView: { key: MonthKey; current: boolean } | null = null;
    if (boardPeriod === 'month') {
      const parsed = parseLeaderboardMonth(searchParams.get('month'), now);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      monthView = { key: parsed.month, current: parsed.current };
    }
    const pastMonth = monthView !== null && !monthView.current;
    const bounds = monthView ? chicagoMonthBounds(monthView.key) : periodBounds(boardPeriod, now);
    const startDate = bounds?.start ?? new Date(0);

    // The board comes from the precomputed snapshot (lib/leaderboard/snapshot):
    // every period tallied from EVERY sale (any status, for the carrier join)
    // and every carrier order, rebuilt after sale and order writes at most once
    // per 30 s. Two doc reads here instead of a scan of the whole collection.
    const metricKey = metric === 'totalSales' ? 'totalSales' : 'totalPoints';
    const periodId = monthView ? monthPeriodId(monthView.key) : boardPeriod;
    const board = await loadBoardPeriod({
      now,
      viewerUid: gate.uid,
      scope,
      periodId,
      start: startDate,
      // Every dated period is closed at its end (Chicago clock); only all time is open.
      end: bounds ? bounds.end : null,
      withHistory: !pastMonth,
    });
    const served = serveBoard(board.payload, { metric: metricKey, limit, viewerUid: gate.uid });
    const rankedLeaderboard = served.leaderboard;
    const rawCurrentUser = served.currentUser;

    // Opt-in extras for the leaderboard page (fail-soft, like history):
    // `unranked` — active field reps with nothing on the board this period,
    // only when the whole ranked list fits in `limit` (so rows can follow it);
    // `recent` — the newest standing sales, rep name + plan + time only.
    let team: { unranked: UnrankedRep[]; recent: RecentSale[] } | null = null;
    // A past month skips both: today's roster and today's sales aren't its.
    if (searchParams.get('include') === 'team' && !pastMonth) {
      team = { unranked: [], recent: [] };
      try {
        if (served.totalRanked <= limit) {
          const usersSnapshot = await adminDb.collection('users').where('status', '==', 'active').get();
          const users: Array<{ id: string; data: Record<string, unknown> }> = [];
          usersSnapshot.forEach((doc) => users.push({ id: doc.id, data: doc.data() }));
          team.unranked = unrankedReps(users, new Set(served.rankedIds)).slice(0, UNRANKED_CAP);
        }
      } catch (teamError) {
        console.error('Leaderboard team list failed:', teamError);
      }
      // The newest logged sales that still stand, from the snapshot.
      team.recent = board.recent;
    }

    // The month view's range: the earliest counted sale's month bounds how far
    // back the picker goes (null when nothing has been sold yet).
    let monthFields: { month: string; firstMonth: string | null; endDate: Date } | null = null;
    if (monthView && bounds) {
      monthFields = {
        month: formatMonthParam(monthView.key),
        firstMonth: board.firstMonth[scope] ?? null,
        endDate: bounds.end,
      };
    }

    return NextResponse.json({
      period,
      metric,
      startDate,
      ...(monthFields ?? {}),
      leaderboard: rankedLeaderboard,
      totalRanked: served.totalRanked,
      currentUser: rawCurrentUser,
      ...(team ?? {}),
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
