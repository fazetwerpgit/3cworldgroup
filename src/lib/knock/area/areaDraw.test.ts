/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  AREA_MAX_POLYGON_POINTS,
  areaHomes,
  areaHomeStatus,
  areaImportDocs,
  areaPreviewCounts,
  formatOwnerName,
  isUntouchedDoor,
  splitForRemove,
  markInCampaign,
  pointInPolygon,
  polygonBox,
  validateAreaPolygon,
  type AreaHome,
  type LatLng,
} from './areaDraw';
import type { ParcelTileRecord } from './parcelTiles';

// Portal port: the app's lasso pointInPolygon (3c-knock src/lib/turf.ts), inlined as the reference
// implementation so this test needs none of the app's map modules.
function lassoPointInPolygon(p: LatLng, polygon: readonly LatLng[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let winding = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const side = (b.lng - a.lng) * (p.lat - a.lat) - (p.lng - a.lng) * (b.lat - a.lat);
    if (a.lat <= p.lat) {
      if (b.lat > p.lat && side > 0) winding += 1;
    } else if (b.lat <= p.lat && side < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}
import type { House } from './types';

// Synthetic records only (made-up parcel ids, streets and owners).

const LAT = 30.3;
const LNG = -81.65;
/** A ~1.1 km square around (LAT, LNG). */
const SQUARE: LatLng[] = [
  { lat: LAT - 0.005, lng: LNG - 0.005 },
  { lat: LAT - 0.005, lng: LNG + 0.005 },
  { lat: LAT + 0.005, lng: LNG + 0.005 },
  { lat: LAT + 0.005, lng: LNG - 0.005 },
];

function rec(n: number, over: Partial<ParcelTileRecord> = {}): ParcelTileRecord {
  return {
    id: `99-${String(n).padStart(4, '0')}`,
    lat: LAT + n * 0.0001,
    lng: LNG,
    address: `${100 + n} TEST ST`,
    city: 'TESTVILLE',
    zip: '00001',
    use: '001',
    homestead: true,
    owner: `OWNER NUMBER ${n}`,
    ...over,
  };
}

function existing(id: string, over: Partial<House> = {}): House {
  return {
    id,
    campaignId: 'solar',
    packId: 'p',
    packName: 'P',
    address: '1 Elsewhere Rd',
    city: 'Testville',
    lat: LAT + 0.004,
    lng: LNG + 0.004,
    assignedRepId: null,
    managerId: null,
    last: null,
    notHomeCount: 0,
    unitOrder: null,
    units: null,
    movedBy: null,
    createdBy: null,
    updatedAt: 0,
    ...over,
  };
}

const ON = { housesOnly: true, ownerOccupiedOnly: true };
const OFF = { housesOnly: false, ownerOccupiedOnly: false };

describe('areaDraw polygon', () => {
  test('validate: closes, bounds, minimum and maximum points, zero area', () => {
    assert.deepEqual(validateAreaPolygon([...SQUARE, SQUARE[0]]), SQUARE);
    assert.equal(validateAreaPolygon(SQUARE.slice(0, 2)), null);
    assert.equal(validateAreaPolygon([...SQUARE.slice(0, 2), { lat: 91, lng: 0 }]), null);
    assert.equal(validateAreaPolygon([...SQUARE.slice(0, 3), { lat: 'x', lng: 0 }]), null);
    assert.equal(validateAreaPolygon('nope'), null);
    assert.equal(
      validateAreaPolygon([
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ]),
      null,
    );
    const many = Array.from({ length: AREA_MAX_POLYGON_POINTS + 1 }, (_, i) => ({
      lat: LAT + 0.01 * Math.sin((2 * Math.PI * i) / (AREA_MAX_POLYGON_POINTS + 1)),
      lng: LNG + 0.01 * Math.cos((2 * Math.PI * i) / (AREA_MAX_POLYGON_POINTS + 1)),
    }));
    assert.equal(validateAreaPolygon(many), null);
    assert.equal(validateAreaPolygon(many.slice(1))?.length, AREA_MAX_POLYGON_POINTS);
  });

  test('box', () => {
    assert.deepEqual(polygonBox(SQUARE), { minLat: LAT - 0.005, minLng: LNG - 0.005, maxLat: LAT + 0.005, maxLng: LNG + 0.005 });
  });

  test('point in polygon agrees with the app lasso, self-crossing loops included', () => {
    // A figure-eight and a loop drawn twice round (winding 2).
    const eight: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    const twice = [...SQUARE, ...SQUARE];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const poly of [SQUARE, eight, twice]) {
      const box = polygonBox(poly);
      for (let i = 0; i < 400; i++) {
        const p = { lat: box.minLat - 0.1 * (box.maxLat - box.minLat) + rnd() * 1.2 * (box.maxLat - box.minLat), lng: box.minLng - 0.1 * (box.maxLng - box.minLng) + rnd() * 1.2 * (box.maxLng - box.minLng) };
        assert.equal(pointInPolygon(p, poly), lassoPointInPolygon(p, poly));
      }
    }
    assert.ok(pointInPolygon({ lat: LAT, lng: LNG }, twice));
  });
});

describe('areaDraw homes', () => {
  test('inside only, homes only, one door per parcel, sorted, display case, owner names', () => {
    const records = [
      rec(3),
      rec(1),
      rec(2, { use: '010' as ParcelTileRecord['use'] }), // not a home: never in a tile, ignored if one is
      rec(4, { lat: LAT + 0.02 }), // outside
      rec(1), // same record from a second tile
      rec(5, { address: '101 TEST ST' }), // same address as rec(1): dropped
    ];
    const homes = areaHomes(records, SQUARE, 'solar');
    assert.deepEqual(
      homes.map((h) => h.id),
      ['solar__area-99-0001', 'solar__area-99-0003'],
    );
    assert.equal(homes[0].address, '101 Test St');
    assert.equal(homes[0].city, 'Testville');
    assert.equal(homes[0].ownerName, 'Owner Number 1');
    assert.deepEqual(homes[0].parcelIds, ['99-0001']);
    assert.equal(homes[0].propertyType, 'single-family');
    assert.equal(homes[0].inCampaign, false);
  });

  test('condo units of one building are one MDU door; a lone unit stays plain', () => {
    const records = [
      rec(10, { use: '004', address: '9 BAY RD 2', homestead: true, owner: 'A' }),
      rec(11, { use: '004', address: '9 BAY RD 10', homestead: false, owner: '' }),
      rec(12, { use: '004', address: '9 BAY RD 1', homestead: true, owner: 'C LLC' }),
      rec(13, { use: '004', address: '9 BAY RD 1', owner: 'repeat' }), // same unit again
      rec(14, { use: '004', address: '7 COVE LN 5', homestead: false }),
    ];
    const homes = areaHomes(records, SQUARE, 'solar');
    const mdu = homes.find((h) => h.unitOrder) as AreaHome;
    assert.equal(mdu.id, 'solar__area-mdu-99-0010');
    assert.equal(mdu.address, '9 Bay Rd');
    assert.deepEqual(mdu.unitOrder, ['1', '2', '10']);
    assert.deepEqual(mdu.unitOwnerNames, { '1': 'C LLC', '2': 'A' });
    assert.equal(mdu.ownerName, null);
    assert.equal(mdu.homestead, true); // 2 of 3
    assert.equal(mdu.propertyType, 'condo');
    assert.equal(mdu.useType, '004');
    const lone = homes.find((h) => !h.unitOrder) as AreaHome;
    assert.equal(lone.id, 'solar__area-99-0014');
    assert.equal(lone.address, '7 Cove Ln 5');
  });

  test('owner name display', () => {
    assert.equal(formatOwnerName('SMITH JOHN A & SMITH JANE'), 'Smith John A & Smith Jane');
    assert.equal(formatOwnerName('ABC HOMES LLC'), 'Abc Homes LLC');
    assert.equal(formatOwnerName('DOE JOHN III'), 'Doe John III');
    assert.equal(formatOwnerName('  '), null);
  });
});

describe('areaDraw classification', () => {
  const homes = areaHomes(
    [
      rec(1), // owner-occupied single family
      rec(2, { homestead: false }), // rented
      rec(3, { use: '008' }), // multi-family
      rec(4, { use: '002', homestead: false }), // rented mobile home
      rec(5), // already in the campaign by id
      rec(6), // already by address
      rec(7), // already within 4 m
      rec(8, { use: '004', homestead: false }), // rented condo AND already: already wins
    ],
    SQUARE,
    'solar',
  );
  const marked = markInCampaign(
    homes,
    [
      existing('solar__area-99-0005'),
      existing('x1', { address: '106 Test St', city: 'Testville' }),
      existing('x2', { address: '', city: '', lat: LAT + 7 * 0.0001 + 0.00002, lng: LNG }),
      existing('x3', { address: '108 Test St', city: 'Testville' }),
      existing('other', { campaignId: 'fiber', address: '101 Test St', city: 'Testville' }), // other campaign: ignored
    ],
    'solar',
  );

  test('dedupe rules mark already-in-campaign', () => {
    assert.deepEqual(
      marked.filter((h) => h.inCampaign).map((h) => h.parcelIds[0]),
      ['99-0005', '99-0006', '99-0007', '99-0008'],
    );
  });

  test('status order: already, then type, then rented', () => {
    const status = (n: number, s = ON) => areaHomeStatus(marked.find((h) => h.parcelIds[0] === `99-000${n}`) as AreaHome, s);
    assert.equal(status(1), 'add');
    assert.equal(status(2), 'skip-rented');
    assert.equal(status(3), 'skip-type');
    assert.equal(status(4), 'skip-rented'); // mobile home counts as a house
    assert.equal(status(8), 'already-in-campaign');
    assert.equal(status(3, OFF), 'add');
    assert.equal(status(2, { housesOnly: true, ownerOccupiedOnly: false }), 'add');
  });

  test('counts per switch setting', () => {
    assert.deepEqual(areaPreviewCounts(marked, ON), { inside: 8, add: 1, skipRented: 2, skipType: 1, alreadyInCampaign: 4 });
    assert.deepEqual(areaPreviewCounts(marked, OFF), { inside: 8, add: 4, skipRented: 0, skipType: 0, alreadyInCampaign: 4 });
  });

  test('import docs: added homes only, unassigned, unknocked, stamped, packed', () => {
    const { houses, packs } = areaImportDocs(marked, OFF, { campaignId: 'solar', areaImportId: 'ai_req1', now: 42, existingPacks: [] });
    assert.equal(houses.length, 4);
    const h = houses.find((d) => d.id === 'solar__area-99-0001') as House;
    assert.deepEqual(h, {
      id: 'solar__area-99-0001',
      campaignId: 'solar',
      packId: h.packId,
      packName: '00001 Testville 1',
      address: '101 Test St',
      city: 'Testville',
      lat: LAT + 0.0001,
      lng: LNG,
      assignedRepId: null,
      managerId: null,
      last: null,
      notHomeCount: 0,
      unitOrder: null,
      units: null,
      movedBy: null,
      createdBy: null,
      updatedAt: 42,
      ownerOccupied: true,
      propertyType: 'single-family',
      areaImportId: 'ai_req1',
      homestead: true,
      useType: '001',
      ownerName: 'Owner Number 1',
    });
    assert.match(h.packId, /^area-00001-\d+_-?\d+$/);
    assert.deepEqual(packs, [{ packId: h.packId, name: '00001 Testville 1', count: 4 }]);
    // A cell the campaign already has keeps its name.
    const again = areaImportDocs(marked, OFF, { campaignId: 'solar', areaImportId: 'ai_req2', now: 42, existingPacks: [{ packId: h.packId, packName: '00001 Testville 7' }] });
    assert.equal(again.packs[0].name, '00001 Testville 7');
  });

  test('import docs: a condo building carries unit owner names, no ownerName', () => {
    const condo = areaHomes(
      [rec(20, { use: '004', address: '9 BAY RD 1', owner: 'A' }), rec(21, { use: '004', address: '9 BAY RD 2', owner: '' })],
      SQUARE,
      'solar',
    );
    const [doc] = areaImportDocs(condo, OFF, { campaignId: 'solar', areaImportId: 'ai', now: 1, existingPacks: [] }).houses;
    assert.deepEqual(doc.unitOrder, ['1', '2']);
    assert.deepEqual(doc.units, {});
    assert.deepEqual(doc.unitOwnerNames, { '1': 'A' });
    assert.equal('ownerName' in doc, false);
  });
});

describe('areaDraw remove', () => {
  const isUntouchedDoorX = (d: Partial<House>) => isUntouchedDoor(d, false);
  test('untouched = no result, count, imported result, note or sign on the door or a unit', () => {
    const blank = existing('d');
    assert.equal(isUntouchedDoorX(blank), true);
    assert.equal(isUntouchedDoorX({ ...blank, assignedRepId: 'rep1', managerId: 'm1' }), true); // assignment does not matter
    assert.equal(isUntouchedDoorX({}), true);
    const mark = { dispositionId: 'go-back', at: 1, repId: 'r', knockId: 'k' };
    assert.equal(isUntouchedDoorX({ ...blank, last: mark }), false);
    assert.equal(isUntouchedDoorX({ ...blank, last: { ...mark, appointmentAt: 5 } }), false);
    assert.equal(isUntouchedDoorX({ ...blank, notHomeCount: 1 }), false);
    assert.equal(isUntouchedDoorX({ ...blank, importedMark: { mark, notHomeCount: 0 } }), false);
    assert.equal(isUntouchedDoorX({ ...blank, doorNote: { text: 'dog', by: 'r', at: 1 } }), false);
    assert.equal(isUntouchedDoorX({ ...blank, noSoliciting: { by: 'r', at: 1 } as unknown as House['noSoliciting'] }), false);
    const units = { '1': { last: null, notHomeCount: 0 }, '2': { last: null, notHomeCount: 0 } };
    assert.equal(isUntouchedDoorX({ ...blank, unitOrder: ['1', '2'], units }), true);
    assert.equal(isUntouchedDoorX({ ...blank, unitOrder: ['1', '2'], units: { ...units, '2': { last: mark, notHomeCount: 0 } } }), false);
    assert.equal(isUntouchedDoorX({ ...blank, unitOrder: ['1', '2'], units, unitNotes: { '1': { text: 'x', by: 'r', at: 1 } } }), false);
    assert.equal(isUntouchedDoorX({ ...blank, unitNotes: {} }), true);
  });

  test('any knock history keeps the door, even a result reset to blank', () => {
    const blank = existing('d');
    assert.equal(isUntouchedDoor(blank, true), false);
    const { removable, kept } = splitForRemove(
      [existing('a'), existing('b'), existing('c', { notHomeCount: 2 })],
      new Set(['b']),
    );
    assert.deepEqual(removable, ['a']);
    assert.deepEqual(kept, ['b', 'c']);
  });
});
