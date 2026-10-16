// TEST-ONLY synthetic lead files (made-up streets in a made-up town, never customer data) and the
// campaign/user seed the lead-list route tests share. Nothing in the app imports it.

const ATT_HEADER = [
  'Living Unit ID',
  'Street Number',
  'Street Prefix',
  'Street Name',
  'Street Type',
  'Street Suffix',
  'Unit Number',
  'City',
  'Latitude',
  'Longitude',
  'Door Knock Allowed',
  'PSA',
];

function csv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\r\n');
}

/**
 * An AT&T list of 11 rows whose plan into campaign `camp-1` is: 4 doors (three houses in pack
 * 1111PA, one two-unit apartment building in 2222PB), 1 already in the campaign (L8), one row
 * each not allowed to knock, without a map location and without a pack, and 2 listed twice (L1
 * again, and apartment 2 of 200 Elm again). L9 is also a door of `camp-2`, which doesn't matter:
 * lead ids are campaign-scoped.
 */
export const ATT_CSV = csv([
  ATT_HEADER,
  ['L1', '100', '', 'OAK', 'ST', '', '', 'TESTVILLE', '35.1000', '-97.1000', 'Y', 'null,1111PA'],
  ['L2', '102', 'N', 'OAK', 'ST', '', '', 'TESTVILLE', '35.1010', '-97.1000', 'Y', '1111PA'],
  ['L3', '200', '', 'ELM', 'AVE', '', '1', 'TESTVILLE', '35.1100', '-97.1100', 'Y', '2222PB'],
  ['L4', '200', '', 'ELM', 'AVE', '', '2', 'TESTVILLE', '35.1100', '-97.1100', 'Y', '2222PB'],
  ['L5', '300', '', 'PINE', 'RD', '', '', 'TESTVILLE', '35.1200', '-97.1200', 'N', '1111PA'],
  ['L6', '302', '', 'PINE', 'RD', '', '', 'TESTVILLE', '', '', 'Y', '1111PA'],
  ['L7', '304', '', 'PINE', 'RD', '', '', 'TESTVILLE', '35.1300', '-97.1300', 'Y', 'null'],
  ['L8', '400', '', 'MAPLE', 'DR', '', '', 'TESTVILLE', '35.1400', '-97.1400', 'Y', '1111PA'],
  ['L9', '500', '', 'BIRCH', 'LN', '', '', 'TESTVILLE', '35.1500', '-97.1500', 'Y', '1111PA'],
  ['L1', '100', '', 'OAK', 'ST', '', '', 'TESTVILLE', '35.1000', '-97.1000', 'Y', 'null,1111PA'],
  ['L4b', '200', '', 'ELM', 'AVE', '', '2', 'TESTVILLE', '35.1100', '-97.1100', 'Y', '2222PB'],
]);

/** `count` door-knock-allowed houses in pack 1111PA, ~110 m apart (no duplicates among them). */
export function bigAttCsv(count: number): string {
  const rows = Array.from({ length: count }, (_, i) => [
    `N${i}`,
    String(1000 + i),
    '',
    `TEST ${Math.floor(i / 50)}`,
    'ST',
    '',
    '',
    'TESTVILLE',
    (35 + Math.floor(i / 100) * 0.001).toFixed(6),
    (-97 + (i % 100) * 0.001).toFixed(6),
    'Y',
    '1111PA',
  ]);
  return csv([ATT_HEADER, ...rows]);
}

/** A SalesRabbit export: two houses ~550 m apart near OKC (one ~2 km pack), one with a first name. */
export const SR_CSV = csv([
  ['First Name', 'Apt/Suite', 'Latitude', 'Longitude'],
  ['TESTER', '', '35.470000', '-97.520000'],
  ['', '', '35.475000', '-97.520000'],
]);

/**
 * A SalesRabbit+ style file (made-up people on made-up streets) of 7 rows:
 * 1. address only, located exactly, "Not Home 3", rep1, a contact and a note;
 * 2. address only, located approximately, "Go Back" with an appointment, rep1, a contact;
 * 3. address only, no geocoder match (not located), stranger;
 * 4. coordinates only, "Sold" with an unreadable appointment, REP1 in capitals;
 * 5. address with neither city nor ZIP (can't be looked up: not located);
 * 6. coordinates only, "Knock" (no such result), stranger.
 * 7. coordinates only, no status, nobody.
 */
export const SR_PLUS_CSV = csv([
  ['First Name', 'Last Name', 'Phone', 'Address', 'City', 'State', 'Zip', 'Apt/Suite', 'Latitude', 'Longitude', 'Status', 'Assigned to (email)', 'Appointment', 'Notes'],
  ['ANN', 'TEST', '555-0100', '10 Test Ln', 'Testville', 'OK', '73000', '', '', '', 'Not Home 3', 'rep1@example.test', '', 'Dog in yard'],
  ['bo', 'sample', '', '12 Test Ln', 'Testville', 'OK', '73000', '', '', '', 'Go Back', 'rep1@example.test', '2026-11-01T15:00:00Z', ''],
  ['', '', '', '99 Nowhere Rd', 'Testville', 'OK', '73000', '', '', '', '', 'stranger@example.test', '', ''],
  ['', '', '', '', '', '', '', '', '35.470000', '-97.520000', 'Sold', 'REP1@EXAMPLE.TEST', 'tomorrow', ''],
  ['', '', '', '5 Lost Way', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '35.472000', '-97.520000', 'Knock', 'stranger@example.test', '', ''],
  ['', '', '', '', '', '', '', '', '35.474000', '-97.520000', '', '', '', ''],
]);

/** Where the fake Census geocoder finds SR_PLUS_CSV's streets (others: No_Match). */
export const SR_PLUS_POINTS: Record<string, { lat: number; lng: number; exact: boolean }> = {
  '10 Test Ln': { lat: 35.401, lng: -97.501, exact: true },
  '12 Test Ln': { lat: 35.402, lng: -97.501, exact: false },
};

/**
 * A stand-in for the Census batch endpoint (geocode.ts posts a multipart CSV of
 * `"id","street","city","state","zip"` rows): answers each row from `points` by street, in the
 * Census answer format. Never touches the network.
 */
export function fakeCensusFetch(points: Record<string, { lat: number; lng: number; exact: boolean }>) {
  return async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const rows = [...String(init?.body ?? '').matchAll(/^"(\d+)","([^"]*)",/gm)];
    const answer = rows.map(([, id, street]) => {
      const p = points[street];
      return p
        ? `"${id}","${street}","Match","${p.exact ? 'Exact' : 'Non_Exact'}","${street.toUpperCase()}","${p.lng},${p.lat}","1","L"`
        : `"${id}","${street}","No_Match"`;
    });
    return new Response(answer.join('\n'), { status: 200 });
  };
}

function disposition(id: string, label: string, extra: Record<string, unknown> = {}) {
  return { id, label, color: '#888888', glyph: 'check', contact: false, notes: false, appointment: false, sale: false, everyCampaign: false, kind: null, ...extra };
}

/** Firestore seed: campaigns, users and the two houses ATT_CSV runs into. */
export function leadSeed(): Record<string, Record<string, Record<string, unknown>>> {
  const house = (campaignId: string, packId: string, packName: string, address: string, lat: number, lng: number) => ({
    campaignId,
    packId,
    packName,
    address,
    city: 'Testville',
    lat,
    lng,
    assignedRepId: null,
    managerId: null,
    last: null,
    notHomeCount: 0,
    unitOrder: null,
    units: null,
    movedBy: null,
    createdBy: null,
    updatedAt: 1,
  });
  return {
    campaigns: {
      'camp-1': {
        name: 'Test Fiber',
        type: 'fiber',
        dispositions: [
          disposition('not_home', 'Not Home', { kind: 'notHome' }),
          disposition('go_back', 'Go Back', { contact: true, appointment: true }),
          disposition('sold', 'Sold', { contact: true, sale: true }),
        ],
      },
      'camp-2': { name: 'Other Fiber', type: 'fiber', dispositions: [] },
    },
    users: {
      'owner-1': { status: 'active', displayName: 'Owner', role: 'owner', email: 'owner@example.test' },
      'rep-1': { status: 'active', displayName: 'Rep One', managerId: 'mgr-1', email: 'rep1@example.test' },
      'rep-gone': { status: 'inactive', displayName: 'Former Rep', email: 'gone@example.test' },
    },
    houses: {
      'camp-1__att-l8': house('camp-1', 'att-1111pa', '1111PA', '400 Maple Dr', 35.14, -97.14),
      'camp-2__att-l9': house('camp-2', 'att-9999pz', '9999PZ', '500 Birch Ln', 35.15, -97.15),
    },
  };
}
