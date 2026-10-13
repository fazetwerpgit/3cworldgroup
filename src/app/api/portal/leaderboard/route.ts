import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import {
  computeHistory,
  dayKey,
  type HistoryEnrichment,
} from '@/lib/leaderboard/history';
import { boardSales, companyFiberBySale, tallyBoard } from '@/lib/leaderboard/board';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import { boardCountedSales } from '@/lib/pay/chargeback';
import type { FiberOrder, Sale } from '@/types';
import { periodBounds } from '@/lib/leaderboard/periods';
import { boardOrder } from '@/lib/leaderboard/order';
import { recentSales, unrankedReps, type RecentSale, type UnrankedRep } from '@/lib/leaderboard/team';

// How many ranked rows a non-management caller may pull in one request. The
// most any rep-facing view asks for is 100 (dashboard); the mini widget asks 5.
const NON_MANAGEMENT_LIMIT_CAP = 100;
// ?include=team: the team at 0 is bounded like the All Company member list
// (chat members route, MAX_MEMBERS) — the same names every rep already sees
// there. The feed scans a small window of the newest sales for 5 that stand.
const UNRANKED_CAP = 200;
const RECENT_SCAN = 25;
const RECENT_COUNT = 5;

// Firestore hands back Timestamps; the carrier join and the tally read Dates.
function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toSale(id: string, data: Record<string, unknown>): Sale {
  return {
    ...data,
    id,
    saleDate: asDate(data.saleDate),
    installDate: asDate(data.installDate),
    createdAt: asDate(data.createdAt),
  } as unknown as Sale;
}

// GET /api/portal/leaderboard - Get leaderboard data (points-based)
export async function GET(request: NextRequest) {
  try {
    // Require a verified active login — a pending hire lands on
    // /portal/onboarding and cannot open the dashboard or its leaderboard.
    const gate = await requireVerifiedRequester(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

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
    const bounds = periodBounds(period === 'week' || period === 'year' || period === 'all' ? period : 'month', now);
    const startDate = bounds?.start ?? new Date(0);

    // EVERY sale, any status: the carrier join below is the owner book's
    // (buildMergedBook over every sale and every order), and which order a sale
    // lands on can depend on the other sales at its door. Status and date are
    // filtered in code (no composite index). The limit bounds memory.
    const [salesSnapshot, statusDoc] = await Promise.all([
      adminDb.collection('sales').limit(5000).get(),
      adminDb.collection('config').doc('fiberReportStatus').get(),
    ]);
    const sales: Sale[] = [];
    const rawById = new Map<string, Record<string, unknown>>();
    salesSnapshot.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      rawById.set(doc.id, data);
      sales.push(toSale(doc.id, data));
    });

    // The carrier report, read once per request (cached per instance against
    // the report stamp). Fail-soft: without it the board still ranks the
    // portal's own counts, as it did before it read the report.
    const status = statusDoc.exists ? statusDoc.data() : undefined;
    const lastReportAt = typeof status?.lastReportAt === 'string' ? status.lastReportAt : null;
    const reportAsOf = typeof status?.lastReportAsOf === 'string' ? status.lastReportAsOf : null;
    let fiberBySale = new Map<string, FiberOrder>();
    try {
      const orders = await getAllFiberOrders(lastReportAt);
      fiberBySale = companyFiberBySale(sales, orders, { now, reportAsOf });
    } catch (carrierError) {
      console.error('Leaderboard carrier report failed:', carrierError);
    }

    // What the estimate counts, less a disconnect within 120 days of install.
    const { totals: leaderboard, allSales, periodSales } = tallyBoard(
      boardSales(sales, fiberBySale, scope),
      startDate.getTime()
    );

    const score = metric === 'totalSales' ? 'totalSales' : 'totalPoints';
    leaderboard.sort((a, b) => boardOrder(
      { score: a[score], name: a.salesRepName, id: a.salesRepId },
      { score: b[score], name: b.salesRepName, id: b.salesRepId },
    ));

    // Rank the FULL sorted list first, so the caller's rank is correct even when
    // they fall below the returned top-N cutoff.
    const fullyRanked = leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));

    // Phase 2: rank history (movement vs yesterday, 7-day spark, streaks).
    // Fail-soft — a history bug must never take down the leaderboard.
    let history: Map<string, HistoryEnrichment> | null = null;
    try {
      history = computeHistory({
        periodSales,
        allSales,
        currentRanks: new Map(fullyRanked.map((e) => [e.salesRepId, e.rank])),
        periodStartKey: dayKey(startDate),
        metric: metric === 'totalSales' ? 'totalSales' : 'totalPoints',
        now: new Date(),
      });
    } catch (historyError) {
      console.error('Leaderboard history enrichment failed:', historyError);
    }

    const withHistory = <T extends { salesRepId: string }>(entry: T) => {
      const h = history?.get(entry.salesRepId);
      return {
        ...entry,
        movement: h?.movement ?? null,
        spark: h?.spark ?? [],
        streakDays: h?.streakDays ?? 0,
      };
    };

    const rankedLeaderboard = fullyRanked.slice(0, limit).map(withHistory);

    // The caller's own standing (null if they have no approved sales this period).
    const rawCurrentUser = fullyRanked.find((e) => e.salesRepId === gate.uid) ?? null;

    // Opt-in extras for the leaderboard page (fail-soft, like history):
    // `unranked` — active field reps with nothing on the board this period,
    // only when the whole ranked list fits in `limit` (so rows can follow it);
    // `recent` — the newest standing sales, rep name + plan + time only.
    let team: { unranked: UnrankedRep[]; recent: RecentSale[] } | null = null;
    if (searchParams.get('include') === 'team') {
      team = { unranked: [], recent: [] };
      try {
        if (fullyRanked.length <= limit) {
          const usersSnapshot = await adminDb.collection('users').where('status', '==', 'active').get();
          const users: Array<{ id: string; data: Record<string, unknown> }> = [];
          usersSnapshot.forEach((doc) => users.push({ id: doc.id, data: doc.data() }));
          team.unranked = unrankedReps(users, new Set(fullyRanked.map((e) => e.salesRepId))).slice(0, UNRANKED_CAP);
        }
      } catch (teamError) {
        console.error('Leaderboard team list failed:', teamError);
      }
      try {
        // The newest logged sales that still stand, from the read above: a
        // carrier cancellation (or a disconnect within 120 days) leaves the
        // feed as it leaves the board.
        const docs = boardCountedSales(sales, fiberBySale)
          .sort((a, b) => (asDate(b.createdAt)?.getTime() ?? 0) - (asDate(a.createdAt)?.getTime() ?? 0))
          .slice(0, RECENT_SCAN)
          .flatMap((sale): Array<Record<string, unknown>> => {
            const raw = rawById.get(sale.id || '');
            return raw ? [raw] : [];
          });
        team.recent = recentSales(docs, RECENT_COUNT);
      } catch (recentError) {
        console.error('Leaderboard recent sales failed:', recentError);
      }
    }

    return NextResponse.json({
      period,
      metric,
      startDate,
      leaderboard: rankedLeaderboard,
      totalRanked: fullyRanked.length,
      currentUser: rawCurrentUser ? withHistory(rawCurrentUser) : null,
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
