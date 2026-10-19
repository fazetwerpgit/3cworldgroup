import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { permissionsFor } from '@/types/auth';
import { chicagoMonthBounds, formatMonthParam, parseLeaderboardMonth, periodBounds } from '@/lib/leaderboard/periods';
import { createDemoRedactor, redactPeople } from '@/lib/demo/redact';
import {
  bookingLeadId,
  countedBookings,
  firstBookedMonth,
  rankSolarBoard,
  recentConsults,
  unrankedSolarReps,
} from '@/lib/solar/leaderboard';

// The most ranked rows one request returns (the fiber board's rep cap).
const LIMIT_CAP = 100;
// ?include=team: the solar team at 0, bounded like the fiber board's.
const UNRANKED_CAP = 200;

type Data = Record<string, unknown>;

/**
 * GET /api/portal/solar/leaderboard?period=week|month|year|all[&month=YYYY-MM][&limit=N][&include=team]
 *
 * The solar board: reps ranked by booked consults (non-cancelled solarBookings,
 * credited to the lead's rep, counted by when they were booked). solar:read
 * only (a solar role, or admin/owner): 403 for everyone else. Same periods and
 * month stepper as GET /api/portal/leaderboard.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!permissionsFor(gate).includes('solar:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const params = request.nextUrl.searchParams;
    const raw = params.get('period');
    const period = raw === 'week' || raw === 'year' || raw === 'all' ? raw : 'month';
    const parsedLimit = parseInt(params.get('limit') || '100', 10);
    const limit = Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100), LIMIT_CAP);

    const now = new Date();
    let monthView: { key: { year: number; month: number }; current: boolean } | null = null;
    if (period === 'month') {
      const parsed = parseLeaderboardMonth(params.get('month'), now);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      monthView = { key: parsed.month, current: parsed.current };
    }
    const pastMonth = monthView !== null && !monthView.current;
    const bounds = monthView ? chicagoMonthBounds(monthView.key) : periodBounds(period, now);

    const [bookingsSnap, usersSnap] = await Promise.all([
      db.collection('solarBookings').get(),
      db.collection('users').where('status', '==', 'active').get(),
    ]);
    const bookings = bookingsSnap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Data }));
    const users = usersSnap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Data }));
    const names = new Map(
      users
        .map(({ id, data }) => [id, typeof data.displayName === 'string' ? data.displayName.trim() : ''] as const)
        .filter(([, name]) => !!name)
    );

    // A booking without its own repUid is credited through its lead.
    const leadIds = [
      ...new Set(
        bookings
          .filter(({ data }) => data.status !== 'cancelled' && !(typeof data.repUid === 'string' && data.repUid))
          .map(({ data }) => bookingLeadId(data))
          .filter(Boolean)
      ),
    ];
    const leadSnaps = await Promise.all(leadIds.map((id) => db.collection('solarLeads').doc(id).get()));
    const leadRepUid = new Map<string, string>();
    leadSnaps.forEach((snap, index) => {
      const repUid = snap.exists ? snap.get('repUid') : null;
      if (typeof repUid === 'string' && repUid) leadRepUid.set(leadIds[index], repUid);
    });

    const counted = countedBookings(bookings, leadRepUid, names);
    const ranked = rankSolarBoard(
      counted,
      { start: bounds?.start ?? null, end: bounds?.end ?? null },
      { now, withHistory: !pastMonth }
    );

    // A demo account (App Review) sees aliases for everyone but itself.
    const redact = createDemoRedactor({ uid: gate.uid, demoAccount: gate.demoAccount === true });
    const leaderboard = redactPeople(ranked.slice(0, limit), redact, { idKey: 'uid', nameKey: 'name' });
    const mine = ranked.find((row) => row.uid === gate.uid) ?? null;

    let team: { unranked: { uid: string; name: string }[]; recent: { repName: string; plan: string; at: string }[] } | null = null;
    if (params.get('include') === 'team' && !pastMonth) {
      team = { unranked: [], recent: [] };
      if (ranked.length <= limit) {
        team.unranked = redactPeople(
          unrankedSolarReps(users, new Set(ranked.map((row) => row.uid))).slice(0, UNRANKED_CAP),
          redact,
          { idKey: 'uid', nameKey: 'name' }
        );
      }
      team.recent = recentConsults(counted).map(({ repKey, ...consult }) => ({
        ...consult,
        repName: redact.active ? redact.name(repKey ?? null, consult.repName) : consult.repName,
      }));
    }

    return NextResponse.json({
      period,
      metric: 'booked',
      startDate: bounds?.start ?? new Date(0),
      ...(monthView && bounds
        ? { month: formatMonthParam(monthView.key), firstMonth: firstBookedMonth(counted), endDate: bounds.end }
        : {}),
      leaderboard,
      totalRanked: ranked.length,
      currentUser: mine,
      ...(team ?? {}),
    });
  } catch (error) {
    console.error('Error fetching the solar leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch the solar leaderboard' }, { status: 500 });
  }
}
