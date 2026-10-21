import { NextRequest, NextResponse } from 'next/server';
import type { Query } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { resolveSubject } from '@/lib/auth/viewAs';
import { permissionsFor } from '@/types/auth';
import {
  chicagoMonthBounds,
  formatMonthParam,
  parseLeaderboardMonth,
  parseLeaderboardRange,
  periodBounds,
} from '@/lib/leaderboard/periods';
import { createDemoRedactor, redactPeople } from '@/lib/demo/redact';
import { solarRecordVisibleTo } from '@/lib/solar/testAccount';
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
// ?include=team: how many of the newest consults it lists.
const RECENT_COUNT = 5;
// ?campaignId=: the 3C Doors campaign id, capped as POST leads stores it.
const CAMPAIGN_ID_MAX = 128;

type Data = Record<string, unknown>;
type Db = NonNullable<typeof adminDb>;
type Doc = { id: string; data: Data };

const docsOf = (snap: { docs: { id: string; data: () => Data | undefined }[] }): Doc[] =>
  snap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Data }));

/** The lead's 3C Doors campaign, as POST leads stores it ('' when none). */
const campaignOf = (data: Data): string => (typeof data.campaignId === 'string' ? data.campaignId.trim() : '');

/** A createdAt window on solarBookings: [since, until), either end open. */
type BookingWindow = { since: Date | null; until: Date | null };
const ALL_BOOKINGS: BookingWindow = { since: null, until: null };

// The streak walks back at most 365 Chicago days from today (computeStreak):
// 367 days of bookings always cover it.
const STREAK_LOOKBACK_MS = 367 * 24 * 60 * 60 * 1000;
// The oldest bookings read for the month stepper's first month before falling
// back to reading them all.
const FIRST_MONTH_BATCH = 25;

/**
 * The solarBookings docs booked (createdAt) in the window. A single-field
 * range on createdAt: Firestore's automatic index serves it, no composite one.
 */
async function bookingDocs(db: Db, window: BookingWindow, viewer: string): Promise<Doc[]> {
  let query: Query = db.collection('solarBookings');
  if (window.since) query = query.where('createdAt', '>=', window.since);
  if (window.until) query = query.where('createdAt', '<', window.until);
  return visibleTo(docsOf(await query.get()), viewer);
}

/** Drops a test account's stamped bookings/leads, except for that account itself (lib/solar/testAccount). */
function visibleTo(docs: Doc[], viewer: string): Doc[] {
  return docs.filter(({ data }) => solarRecordVisibleTo(data, viewer));
}

/**
 * Booked consults among these bookings, credited to the lead's owner
 * (booking.repUid only without one). With a campaign, only bookings whose lead
 * was created under it (a booking with no lead doc is left out).
 */
async function bookingDocEvents(
  db: Db,
  all: Doc[],
  names: Promise<ReadonlyMap<string, string>>,
  campaignId: string | null
): Promise<SolarEvent[]> {
  const leadIds = [
    ...new Set(
      all
        .filter(({ data }) => data.status !== 'cancelled')
        .map(({ data }) => bookingLeadId(data))
        .filter(Boolean)
    ),
  ];
  const leadSnaps = await Promise.all(leadIds.map((id) => db.collection('solarLeads').doc(id).get()));
  const leadRepUid = new Map<string, string>();
  const leadCampaign = new Map<string, string>();
  leadSnaps.forEach((snap, index) => {
    const repUid = snap.exists ? snap.get('repUid') : null;
    if (typeof repUid === 'string' && repUid) leadRepUid.set(leadIds[index], repUid);
    if (snap.exists) leadCampaign.set(leadIds[index], campaignOf({ campaignId: snap.get('campaignId') }));
  });
  const bookings = campaignId ? all.filter(({ data }) => leadCampaign.get(bookingLeadId(data)) === campaignId) : all;
  return bookingEvents(countedBookings(bookings, leadRepUid, await names));
}

/** Booked consults in the window (default: every booking). */
async function setEvents(
  db: Db,
  names: Promise<ReadonlyMap<string, string>>,
  campaignId: string | null,
  viewer: string,
  window: BookingWindow = ALL_BOOKINGS
): Promise<SolarEvent[]> {
  return bookingDocEvents(db, await bookingDocs(db, window, viewer), names, campaignId);
}

/**
 * The Set board's first month (the month stepper's floor) without reading
 * every booking: the oldest few by createdAt, whose earliest counted one is
 * the earliest overall. Only when none of a full batch counts (all cancelled,
 * or off the campaign) does it read them all.
 */
async function firstSetMonth(db: Db, campaignId: string | null, viewer: string): Promise<string | null> {
  const noNames = Promise.resolve(new Map<string, string>());
  const batch = docsOf(await db.collection('solarBookings').orderBy('createdAt').limit(FIRST_MONTH_BATCH).get());
  const events = await bookingDocEvents(db, visibleTo(batch, viewer), noNames, campaignId);
  if (events.length > 0 || batch.length < FIRST_MONTH_BATCH) return firstBookedMonth(events);
  return firstBookedMonth(await setEvents(db, noNames, campaignId, viewer));
}

/**
 * The leads at or past the demo, for Demoed and Closed: two single-field `in`
 * queries (a stage at/after the demo, or an old sold/lost status), never the
 * whole solarLeads collection.
 */
async function stageLeads(db: Db, campaignId: string | null, viewer: string): Promise<Doc[]> {
  const leadsRef = db.collection('solarLeads');
  const [byStage, byStatus] = await Promise.all([
    leadsRef.where('stage', 'in', [...SOLAR_LEAD_STAGES]).get(),
    leadsRef.where('status', 'in', [...LEGACY_CLOSED_STATUSES]).get(),
  ]);
  const leads = new Map<string, Doc>();
  for (const doc of visibleTo([...docsOf(byStage), ...docsOf(byStatus)], viewer)) {
    // The campaign filter runs here, in memory: no extra index.
    if (!campaignId || campaignOf(doc.data) === campaignId) leads.set(doc.id, doc);
  }
  return [...leads.values()];
}

/** Demoed or Closed: one event per lead that stands there (see stageLeads). */
async function stageEvents(
  db: Db,
  metric: 'demoed' | 'closed',
  names: Promise<ReadonlyMap<string, string>>,
  campaignId: string | null,
  viewer: string
): Promise<SolarEvent[]> {
  return leadEvents(await stageLeads(db, campaignId, viewer), metric, await names, leadMilestones);
}

/** The viewer's own count in the window, counted exactly as their row on that board (rankSolarBoard). */
function countFor(uid: string, events: SolarEvent[], window: { start: Date | null; end: Date | null }, now: Date): number {
  return rankSolarBoard(events, window, { now, withHistory: false }).find((row) => row.uid === uid)?.count ?? 0;
}

/**
 * GET /api/portal/solar/leaderboard?period=week|month|year|all[&metric=set|demoed|closed][&month=YYYY-MM][&limit=N][&include=team]
 *   [&from=YYYY-MM-DD&to=YYYY-MM-DD][&campaignId=ID]
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
 *
 * `&view=mine` answers only the viewer's own Set, Demoed and Closed counts for
 * the period, in one request ({ period, mine: { set, demoed, closed } }), each
 * the number their row on that board shows (Home's solar numbers).
 *
 * `from` + `to` (both or neither, office clock: America/Chicago) replace
 * `period` with a custom range: Chicago midnight starting `from` through the end
 * of `to`, at most 366 days, `from` not after today. The answer then reads
 * period 'range' with `from` and `to` echoed (no month stepper). `campaignId`
 * counts only leads created under that 3C Doors campaign (Set: bookings on
 * such leads). Both apply to every metric and to view=mine.
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
    const parsedRange = parseLeaderboardRange(params.get('from'), params.get('to'), now);
    if (!parsedRange.ok) return NextResponse.json({ error: parsedRange.error }, { status: 400 });
    const range = parsedRange.range;
    const rawCampaign = params.get('campaignId');
    const campaignId = rawCampaign === null ? null : rawCampaign.trim();
    if (campaignId !== null && (!campaignId || campaignId.length > CAMPAIGN_ID_MAX)) {
      return NextResponse.json({ error: `campaignId must be 1 to ${CAMPAIGN_ID_MAX} characters` }, { status: 400 });
    }

    let monthView: { key: { year: number; month: number }; current: boolean } | null = null;
    if (!range && period === 'month') {
      const parsed = parseLeaderboardMonth(params.get('month'), now);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      monthView = { key: parsed.month, current: parsed.current };
    }
    // A board that is over (a past month, a range ended before now) has no movement, spark or team.
    const pastMonth = (monthView !== null && !monthView.current) || (range !== null && range.end <= now);
    const bounds = range
      ? { start: range.start, end: range.end }
      : monthView
        ? chicagoMonthBounds(monthView.key)
        : periodBounds(period, now);
    const echo = {
      period: range ? ('range' as const) : period,
      ...(range ? { from: range.from, to: range.to } : {}),
      ...(campaignId ? { campaignId } : {}),
    };

    if (params.get('view') === 'mine') {
      // Names never change a count: no users read.
      const noNames = Promise.resolve(new Map<string, string>());
      const window = { start: bounds?.start ?? null, end: bounds?.end ?? null };
      // Only the window's bookings: a booking outside it never counts here.
      const [setList, leads] = await Promise.all([
        setEvents(db, noNames, campaignId, youUid, { since: window.start, until: window.end }),
        stageLeads(db, campaignId, youUid),
      ]);
      return NextResponse.json({
        ...echo,
        mine: {
          set: countFor(youUid, setList, window, now),
          demoed: countFor(youUid, leadEvents(leads, 'demoed', new Map(), leadMilestones), window, now),
          closed: countFor(youUid, leadEvents(leads, 'closed', new Map(), leadMilestones), window, now),
        },
      });
    }

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
    // The Set board reads only the bookings it can show: a finished board its
    // window; a live one from the window's start or the year back the streak
    // walks, whichever is earlier, with no upper bound (the newest consults).
    const wantTeam = params.get('include') === 'team' && !pastMonth;
    const setWindow: BookingWindow = !bounds?.start
      ? ALL_BOOKINGS
      : pastMonth
        ? { since: bounds.start, until: bounds.end ?? null }
        : { since: new Date(Math.min(bounds.start.getTime(), now.getTime() - STREAK_LOOKBACK_MS)), until: null };
    const [users, counted] = await Promise.all([
      usersRead,
      metric === 'set' ? setEvents(db, namesRead, campaignId, youUid, setWindow) : stageEvents(db, metric, namesRead, campaignId, youUid),
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
    if (wantTeam) {
      team = { unranked: [], recent: [] };
      if (ranked.length <= limit) {
        team.unranked = redactPeople(
          unrankedSolarReps(users, new Set(ranked.map((row) => row.uid))).slice(0, UNRANKED_CAP),
          redact,
          { idKey: 'uid', nameKey: 'name' }
        );
      }
      // Fewer consults since the window's start than the list holds: older ones fill it.
      const recentPool =
        metric === 'set' && setWindow.since && counted.length < RECENT_COUNT ? await setEvents(db, namesRead, campaignId, youUid) : counted;
      team.recent = recentConsults(recentPool, RECENT_COUNT).map(({ repKey, ...consult }) => ({
        ...consult,
        repName: redact.active ? redact.name(repKey ?? null, consult.repName) : consult.repName,
      }));
    }

    return NextResponse.json({
      ...echo,
      metric: metric === 'set' ? 'booked' : metric,
      startDate: bounds?.start ?? new Date(0),
      ...(range ? { endDate: range.end } : {}),
      ...(monthView && bounds
        ? {
            month: formatMonthParam(monthView.key),
            firstMonth: metric === 'set' ? await firstSetMonth(db, campaignId, youUid) : firstBookedMonth(counted),
            endDate: bounds.end,
          }
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
