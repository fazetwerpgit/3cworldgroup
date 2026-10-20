import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { resolveSubject } from '@/lib/auth/viewAs';
import { permissionsFor } from '@/types/auth';
import { chicagoMonthBounds, formatMonthParam, parseLeaderboardMonth, periodBounds } from '@/lib/leaderboard/periods';
import { createDemoRedactor, redactPeople } from '@/lib/demo/redact';
import {
  bookingEvents,
  bookingLeadId,
  countedBookings,
  firstBookedMonth,
  leadEvents,
  parseSolarMetric,
  rankSolarBoard,
  recentConsults,
  unrankedSolarReps,
  type SolarEvent,
} from '@/lib/solar/leaderboard';
import { SOLAR_LEAD_STAGES } from '@/lib/solar/leadStage';
import { LEGACY_CLOSED_STATUSES, leadMilestones } from '@/lib/solar/leadMilestones';

// The most ranked rows one request returns (the fiber board's rep cap).
const LIMIT_CAP = 100;
// ?include=team: the solar team at 0, bounded like the fiber board's.
const UNRANKED_CAP = 200;

type Data = Record<string, unknown>;
type Db = NonNullable<typeof adminDb>;
type Doc = { id: string; data: Data };

const docsOf = (snap: { docs: { id: string; data: () => Data | undefined }[] }): Doc[] =>
  snap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Data }));

/** Booked consults: every solarBookings doc, credited to its lead's owner (booking.repUid only without one). */
async function setEvents(db: Db, names: Promise<ReadonlyMap<string, string>>): Promise<SolarEvent[]> {
  const bookings = docsOf(await db.collection('solarBookings').get());
  const leadIds = [
    ...new Set(
      bookings
        .filter(({ data }) => data.status !== 'cancelled')
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
  return bookingEvents(countedBookings(bookings, leadRepUid, await names));
}

/**
 * Demoed or Closed: only the leads at or past the demo are read (two
 * single-field `in` queries: a stage at/after the demo, or an old sold/lost
 * status), never the whole solarLeads collection.
 */
async function stageEvents(db: Db, metric: 'demoed' | 'closed', names: Promise<ReadonlyMap<string, string>>): Promise<SolarEvent[]> {
  const leadsRef = db.collection('solarLeads');
  const [byStage, byStatus] = await Promise.all([
    leadsRef.where('stage', 'in', [...SOLAR_LEAD_STAGES]).get(),
    leadsRef.where('status', 'in', [...LEGACY_CLOSED_STATUSES]).get(),
  ]);
  const leads = new Map<string, Doc>();
  for (const doc of [...docsOf(byStage), ...docsOf(byStatus)]) leads.set(doc.id, doc);
  return leadEvents([...leads.values()], metric, await names, leadMilestones);
}

/**
 * GET /api/portal/solar/leaderboard?period=week|month|year|all[&metric=set|demoed|closed][&month=YYYY-MM][&limit=N][&include=team]
 *
 * The solar board, by `metric` (default set):
 *  - set: booked consults (non-cancelled solarBookings, credited to the lead's
 *    rep, counted by when they were booked);
 *  - demoed: leads that reached the demo, any outcome;
 *  - closed: leads whose demo outcome is a sale;
 * Demoed and Closed credit the lead's rep (the setter) and count by when the
 * lead got there. solar:read only (a solar role, or admin/owner): 403 for
 * everyone else. Same periods and month stepper as GET /api/portal/leaderboard.
 * Each row carries `count` (and `booked`, the same number, on the Set board).
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!permissionsFor(gate).includes('solar:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // View as rep (owner only, a dual-role rep): "you" is the rep, as on the fiber board.
    const subject = await resolveSubject(request, gate);
    if (!subject.ok) return NextResponse.json({ error: subject.error }, { status: subject.status });
    const youUid = subject.uid;
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const params = request.nextUrl.searchParams;
    const metric = parseSolarMetric(params.get('metric'));
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

    // Users and the board's own reads go out together; names join at the end.
    const usersRead = db.collection('users').where('status', '==', 'active').get().then(docsOf);
    const namesRead = usersRead.then(
      (list) =>
        new Map(
          list
            .map(({ id, data }) => [id, typeof data.displayName === 'string' ? data.displayName.trim() : ''] as const)
            .filter(([, name]) => !!name)
        )
    );
    // A failed users read surfaces through usersRead; don't also leave this one unhandled.
    namesRead.catch(() => {});
    const [users, counted] = await Promise.all([
      usersRead,
      metric === 'set' ? setEvents(db, namesRead) : stageEvents(db, metric, namesRead),
    ]);
    const rankedRows = rankSolarBoard(
      counted,
      { start: bounds?.start ?? null, end: bounds?.end ?? null },
      { now, withHistory: !pastMonth }
    );
    // `booked` stays on the Set board's rows for clients that read it. Closed
    // has no mix line: every close is a sale.
    const ranked =
      metric === 'set'
        ? rankedRows.map((row) => ({ ...row, booked: row.count }))
        : metric === 'closed'
          ? rankedRows.map((row) => ({ ...row, mix: [] }))
          : rankedRows;

    // A demo account (App Review) sees aliases for everyone but itself.
    const redact = createDemoRedactor({ uid: youUid, demoAccount: gate.demoAccount === true });
    const leaderboard = redactPeople(ranked.slice(0, limit), redact, { idKey: 'uid', nameKey: 'name' });
    const mine = ranked.find((row) => row.uid === youUid) ?? null;

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
      metric: metric === 'set' ? 'booked' : metric,
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
