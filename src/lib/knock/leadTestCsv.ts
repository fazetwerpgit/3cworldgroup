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
 * An AT&T list in campaign `camp-1` whose plan is: 3 doors (two houses in pack 1111PA, one
 * two-unit apartment building in 2222PB), 1 already in the campaign (att-l8), and one row each
 * not allowed to knock, without a map location, without a pack, and already in another campaign
 * (att-l9).
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
      'camp-1': { name: 'Test Fiber', type: 'fiber', dispositions: [] },
      'camp-2': { name: 'Other Fiber', type: 'fiber', dispositions: [] },
    },
    users: {
      'owner-1': { status: 'active', displayName: 'Owner', role: 'owner' },
      'rep-1': { status: 'active', displayName: 'Rep One', managerId: 'mgr-1' },
      'rep-gone': { status: 'inactive', displayName: 'Former Rep' },
    },
    houses: {
      'att-l8': house('camp-1', 'att-1111pa', '1111PA', '400 Maple Dr', 35.14, -97.14),
      'att-l9': house('camp-2', 'att-9999pz', '9999PZ', '500 Birch Ln', 35.15, -97.15),
    },
  };
}
