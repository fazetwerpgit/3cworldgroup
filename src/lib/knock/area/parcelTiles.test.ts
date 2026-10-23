/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { ParcelRow } from './areaImport';
import { geohashEncode } from './geohash';
import {
  buildCountyTiles,
  countySlug,
  FL_COUNTY_NUMBERS,
  mergeParcelIndex,
  parseParcelTile,
  resolveCountyFields,
  tilePath,
  tileRecordFromParcel,
} from './parcelTiles';

// Synthetic rows only (made-up parcel ids, streets, owners).

function row(id: string, over: Partial<ParcelRow> = {}): ParcelRow {
  return {
    parcelId: `99-${id}`,
    address: '100 TEST ST',
    city: 'TESTVILLE',
    zip: '00001',
    useCode: '001',
    homestead: true,
    lat: 30.3,
    lng: -81.65,
    ...over,
  };
}

const META = { state: 'fl', county: 'testy', countyNo: '99', roll: '2026F', builtAt: '2026-10-21T00:00:00.000Z' };

describe('parcelTiles', () => {
  test('county numbers and slugs', () => {
    assert.equal(FL_COUNTY_NUMBERS.alachua, '11');
    assert.equal(FL_COUNTY_NUMBERS.duval, '26');
    assert.equal(FL_COUNTY_NUMBERS['miami-dade'], '23');
    assert.equal(FL_COUNTY_NUMBERS.washington, '77');
    assert.equal(Object.keys(FL_COUNTY_NUMBERS).length, 67);
    assert.equal(countySlug('St. Johns'), 'st-johns');
    assert.equal(countySlug('Saint Lucie'), 'st-lucie');
    assert.equal(countySlug('Miami-Dade'), 'miami-dade');
    assert.equal(countySlug('Palm Beach'), 'palm-beach');
    assert.equal(tilePath('fl', 'duval', 'djmqx'), 'parcels/fl/duval/djmqx.json.gz');
  });

  test('a record keeps homes with a street number and a point, rounded, owner cleaned', () => {
    const rec = tileRecordFromParcel(row('1', { lat: 30.123456789, lng: -81.987654321, address: ' 12  OAK  ST ' }), '  SMITH   JOHN A ');
    assert.deepEqual(rec, {
      id: '99-1',
      lat: 30.123457,
      lng: -81.987654,
      address: '12 OAK ST',
      city: 'TESTVILLE',
      zip: '00001',
      use: '001',
      homestead: true,
      owner: 'SMITH JOHN A',
    });
    assert.equal(tileRecordFromParcel(row('2', { useCode: '003' }), ''), 'not-home'); // 10+ units
    assert.equal(tileRecordFromParcel(row('3', { useCode: '010' }), ''), 'not-home');
    assert.equal(tileRecordFromParcel(row('4', { address: 'N US 301 HWY' }), ''), 'no-street-number');
    assert.equal(tileRecordFromParcel(row('5', { lat: null, lng: null }), ''), 'no-coordinates');
    for (const use of ['002', '004', '008']) assert.equal(typeof tileRecordFromParcel(row('6', { useCode: use }), ''), 'object');
  });

  test('county build: one tile per geohash-5 cell, sorted records, counts, manifest', () => {
    const rows = [
      { row: row('b', { lat: 30.3, lng: -81.65 }), owner: 'B' },
      { row: row('a', { lat: 30.3001, lng: -81.6501, homestead: false }), owner: '' },
      { row: row('c', { lat: 30.5, lng: -81.4, useCode: '004', address: '9 BAY RD 101' }), owner: 'C' },
      { row: row('a', { lat: 30.3001, lng: -81.6501 }), owner: 'dup' },
      { row: row('d', { useCode: '010' }), owner: 'D' },
      { row: row('e', { address: 'MAIN ST' }), owner: 'E' },
      { row: row('f', { lat: null, lng: null }), owner: 'F' },
    ];
    const built = buildCountyTiles(rows, META);
    assert.equal(built.rows, 7);
    assert.deepEqual(built.skipped, { 'not-home': 1, 'no-street-number': 1, 'no-coordinates': 1, repeated: 1 });
    assert.deepEqual(built.byUse, { '001': 2, '002': 0, '004': 1, '008': 0 });
    assert.equal(built.homestead, 2);
    assert.equal(built.withOwner, 2);
    const near = geohashEncode(30.3, -81.65, 5);
    const far = geohashEncode(30.5, -81.4, 5);
    assert.deepEqual(built.tiles.map((t) => t.geohash), [near, far].sort());
    const tile = built.tiles.find((t) => t.geohash === near);
    assert.deepEqual(tile?.records.map((r) => r.id), ['99-a', '99-b']);
    assert.equal(tile?.county, 'testy');
    assert.equal(built.manifest.homes, 3);
    assert.deepEqual(built.manifest.tiles, { [near]: 2, [far]: 1 });
    assert.deepEqual(built.manifest.bbox, { minLat: 30.3, minLng: -81.6501, maxLat: 30.5, maxLng: -81.4 });
    // Round trip through JSON, as the portal reads it.
    assert.deepEqual(parseParcelTile(JSON.parse(JSON.stringify(tile))), tile);
  });

  test('parseParcelTile: wrong version throws, bad records dropped', () => {
    assert.throws(() => parseParcelTile({ v: 2, geohash: 'x', county: 'y', records: [] }), /Not a parcel tile/);
    assert.throws(() => parseParcelTile(null), /Not a parcel tile/);
    const ok = { id: '1', lat: 1, lng: 2, address: '1 A ST', city: '', zip: '', use: '001', homestead: false, owner: '' };
    const t = parseParcelTile({ v: 1, geohash: 'djmqx', county: 'duval', records: [ok, { ...ok, use: '010' }, { ...ok, lat: 'x' }, null] });
    assert.deepEqual(t.records, [ok]);
  });

  test('statewide index: counties per cell, a cell on a county line lists both', () => {
    const a = buildCountyTiles([{ row: row('1'), owner: '' }], { ...META, county: 'duval', countyNo: '26' }).manifest;
    const b = buildCountyTiles(
      [
        { row: row('2'), owner: '' },
        { row: row('3', { lat: 29.0, lng: -81.0 }), owner: '' },
      ],
      { ...META, county: 'clay', countyNo: '20' },
    ).manifest;
    const index = mergeParcelIndex('fl', [a, b], META.builtAt);
    const shared = geohashEncode(30.3, -81.65, 5);
    assert.deepEqual(index.cells[shared], ['clay', 'duval']);
    assert.deepEqual(index.cells[geohashEncode(29.0, -81.0, 5)], ['clay']);
    assert.deepEqual(Object.keys(index.counties), ['clay', 'duval']);
    assert.equal(index.counties.clay.homes, 2);
    assert.equal(index.counties.clay.tiles, 2);
  });
});

describe('resolveCountyFields', () => {
  test('absent or malformed = the Florida default', () => {
    assert.deepEqual(resolveCountyFields(undefined), { ownerOccupied: 'exemption', ownerNames: true });
    assert.deepEqual(resolveCountyFields(null), { ownerOccupied: 'exemption', ownerNames: true });
    assert.deepEqual(resolveCountyFields('x'), { ownerOccupied: 'exemption', ownerNames: true });
    assert.deepEqual(resolveCountyFields({ ownerOccupied: 'bogus' }), { ownerOccupied: 'exemption', ownerNames: true });
  });

  test("accepts 'exemption', 'mailing-match' and 'none'", () => {
    assert.deepEqual(resolveCountyFields({ ownerOccupied: 'mailing-match', ownerNames: true }), { ownerOccupied: 'mailing-match', ownerNames: true });
    assert.deepEqual(resolveCountyFields({ ownerOccupied: 'none', ownerNames: false }), { ownerOccupied: 'none', ownerNames: false });
    assert.deepEqual(resolveCountyFields({ ownerOccupied: 'exemption', ownerNames: false }), { ownerOccupied: 'exemption', ownerNames: false });
  });
});
