/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  AREA_PACK_LAT_DEG,
  NAL_COLUMNS,
  parcelFromNal,
  planAreaImport,
  splitCondoUnit,
  type AreaImportPlan,
  type AreaPlanOptions,
  type NalRecord,
  type ParcelRow,
} from './areaImport';
import type { House } from './types';

// Synthetic rows only (made-up parcel ids, streets and towns).

const BASE = { lat: 30.3, lng: -81.65 };

function row(id: string, over: Partial<ParcelRow> = {}): ParcelRow {
  const i = Number(id.replace(/\D/g, '')) || 0;
  return {
    parcelId: `99-${id}`,
    address: `${100 + i} TEST ST`,
    city: 'TESTVILLE',
    zip: '00001',
    useCode: '001',
    homestead: false,
    lat: BASE.lat + i * 0.0001,
    lng: BASE.lng,
    ...over,
  };
}

function plan(parcels: ParcelRow[], over: Partial<AreaPlanOptions> = {}): AreaImportPlan {
  return planAreaImport(parcels, { campaignId: 'solar', zips: ['00001'], existing: [], now: 1, ...over });
}

const skippedOf = (p: AreaImportPlan) => Object.fromEntries(p.skipped.map((s) => [s.reason, s.count]));

/** Every row is a door, a condo unit, or skipped; every mapped door is new or a duplicate. */
function assertAccounted(p: AreaImportPlan): void {
  const skipped = p.skipped.reduce((n, s) => n + s.count, 0);
  assert.equal(p.rows, p.rowsBreakdown.houseRows + p.rowsBreakdown.unitRows + skipped);
  assert.equal(p.houses.length + p.duplicates, p.rowsBreakdown.houseRows + p.rowsBreakdown.buildings);
  assert.equal(p.packs.reduce((n, pack) => n + pack.count, 0), p.houses.length);
}

describe('parcelFromNal', () => {
  const rec = (over: Partial<NalRecord> = {}): NalRecord => ({
    ...(Object.fromEntries(NAL_COLUMNS.map((c) => [c, ''])) as NalRecord),
    CO_NO: '26',
    PARCEL_ID: ' 0000010005R ',
    DOR_UC: '1',
    PHY_ADDR1: '12  OAK   ST',
    PHY_CITY: ' TESTVILLE ',
    PHY_ZIPCD: '00001-1234',
    ...over,
  });

  test('maps the columns; centroid or null', () => {
    assert.deepEqual(parcelFromNal(rec(), { lat: 30.1, lng: -81.2 }), {
      parcelId: '26-0000010005R',
      address: '12 OAK ST',
      city: 'TESTVILLE',
      zip: '00001',
      useCode: '001',
      homestead: false,
      lat: 30.1,
      lng: -81.2,
    });
    const none = parcelFromNal(rec({ PHY_ADDR2: 'UNIT 4' }), undefined);
    assert.equal(none.lat, null);
    assert.equal(none.lng, null);
    assert.equal(none.address, '12 OAK ST UNIT 4');
  });

  test('homestead from the homestead just value or the homestead exemption', () => {
    assert.equal(parcelFromNal(rec({ JV_HMSTD: '250000' }), null).homestead, true);
    assert.equal(parcelFromNal(rec({ EXMPT_01: '25000' }), null).homestead, true);
    assert.equal(parcelFromNal(rec({ JV_HMSTD: '0', EXMPT_01: '' }), null).homestead, false);
  });
});

describe('splitCondoUnit', () => {
  test('building + unit; null without a unit or a street', () => {
    assert.deepEqual(splitCondoUnit('1 TEST AVE 101'), { building: '1 TEST AVE', unit: '101' });
    assert.deepEqual(splitCondoUnit('7 PALM WAY g-41'), { building: '7 PALM WAY', unit: 'G-41' });
    assert.deepEqual(splitCondoUnit('12 OAK ST UNIT 4'), { building: '12 OAK ST', unit: '4' });
    assert.deepEqual(splitCondoUnit('3 S 1ST ST B'), { building: '3 S 1ST ST', unit: 'B' });
    assert.equal(splitCondoUnit('12 OAK ST'), null);
    assert.equal(splitCondoUnit('12 101'), null);
    assert.equal(splitCondoUnit('OAK ST 4'), null);
  });
});

describe('planAreaImport', () => {
  test('default: single family only; other homes need includeUseCodes; non-homes never', () => {
    const rows = [
      row('1'),
      row('2', { useCode: '002' }),
      row('3', { useCode: '004', address: '103 TEST ST' }),
      row('4', { useCode: '008' }),
      row('5', { useCode: '011' }),
      row('6', { useCode: '000' }),
    ];
    const p = plan(rows);
    assert.deepEqual(
      p.houses.map((h) => h.propertyType),
      ['single-family'],
    );
    assert.deepEqual(skippedOf(p), { 'not-residential': 2, 'type-not-included': 3 });
    assertAccounted(p);

    const all = plan(rows, { includeUseCodes: ['001', '002', '004', '008'] });
    assert.deepEqual(
      all.houses.map((h) => h.propertyType),
      ['single-family', 'mobile-home', 'condo', 'multi-family'],
    );
    assert.ok(all.houses.every((h) => h.unitOrder === null && h.units === null));
    assert.deepEqual(skippedOf(all), { 'not-residential': 2 });
    assertAccounted(all);
  });

  test('homestead -> ownerOccupied; ownerOccupiedOnly skips the rest', () => {
    const rows = [row('1', { homestead: true }), row('2'), row('3', { homestead: true })];
    const p = plan(rows);
    assert.deepEqual(
      p.houses.map((h) => h.ownerOccupied),
      [true, false, true],
    );
    const only = plan(rows, { ownerOccupiedOnly: true });
    assert.equal(only.houses.length, 2);
    assert.ok(only.houses.every((h) => h.ownerOccupied));
    assert.deepEqual(skippedOf(only), { 'not-owner-occupied': 1 });
    assertAccounted(only);
  });

  test('zip filter: only the requested zips', () => {
    const rows = [row('1'), row('2', { zip: '00002' }), row('3', { zip: '00003' })];
    const p = plan(rows);
    assert.equal(p.houses.length, 1);
    assert.deepEqual(skippedOf(p), { 'other-zip': 2 });
    const two = plan(rows, { zips: ['00001', '00002'] });
    assert.equal(two.houses.length, 2);
    assert.deepEqual(two.zips, ['00001', '00002']);
    assertAccounted(two);
  });

  test('no street number, no coordinates, repeated parcel or address', () => {
    const p = plan([
      row('1'),
      row('2', { address: 'TEST ST' }),
      row('3', { lat: null, lng: null }),
      row('1'),
      row('4', { address: '101 Test Street' }),
    ]);
    assert.equal(p.houses.length, 1);
    assert.deepEqual(skippedOf(p), { 'no-street-number': 1, 'no-coordinates': 1, repeated: 2 });
    assertAccounted(p);
  });

  test('unassigned, unknocked docs with campaign-scoped ids and titled addresses', () => {
    const [h] = plan([row('7', { homestead: true })]).houses;
    assert.deepEqual(h, {
      id: 'solar__area-99-7',
      campaignId: 'solar',
      packId: h.packId,
      packName: h.packName,
      address: '107 Test St',
      city: 'Testville',
      lat: BASE.lat + 7 * 0.0001,
      lng: BASE.lng,
      assignedRepId: null,
      managerId: null,
      last: null,
      notHomeCount: 0,
      unitOrder: null,
      units: null,
      movedBy: null,
      createdBy: null,
      updatedAt: 1,
      ownerOccupied: true,
      propertyType: 'single-family',
    });
    assert.equal(plan([row('7')], { campaignId: 'other' }).houses[0].id, 'other__area-99-7');
  });

  test('re-import is all duplicates; other campaigns never count', () => {
    const rows = [row('1'), row('2'), row('3')];
    const first = plan(rows);
    const again = plan(rows, { existing: first.houses });
    assert.equal(again.houses.length, 0);
    assert.equal(again.duplicates, 3);
    assertAccounted(again);
    const elsewhere: House[] = first.houses.map((h) => ({ ...h, id: h.id.replace('solar__', 'fiber__'), campaignId: 'fiber' }));
    assert.equal(plan(rows, { existing: elsewhere }).houses.length, 3);
  });

  test('packs: ~2 km cells per zip, biggest first; a later import keeps names and numbers on', () => {
    const far = BASE.lat + 2 * AREA_PACK_LAT_DEG;
    const rows = [
      row('1'),
      row('2'),
      row('3', { lat: far }),
      row('4', { zip: '00002', address: '9 OTHER RD' }),
    ];
    const p = plan(rows, { zips: ['00001', '00002'] });
    assert.deepEqual(
      p.packs.map((pack) => [pack.name, pack.count, pack.isNew]),
      [
        ['00001 Testville 1', 2, true],
        ['00001 Testville 2', 1, true],
        ['00002 Testville 1', 1, true],
      ],
    );
    assert.ok(p.packs.every((pack) => /^area-\d{5}-\d+_-\d+$/.test(pack.packId)));
    // The zip's two near houses share a pack; the zip 00002 house next to them has its own.
    assert.equal(new Set(p.houses.filter((h) => h.lat < far && h.address !== '9 Other Rd').map((h) => h.packId)).size, 1);

    const later = plan([...rows, row('5'), row('6', { lat: far + 2 * AREA_PACK_LAT_DEG })], {
      zips: ['00001', '00002'],
      existing: p.houses,
    });
    assert.deepEqual(
      later.packs.map((pack) => [pack.name, pack.count, pack.isNew]),
      [
        ['00001 Testville 1', 1, false],
        ['00001 Testville 3', 1, true],
      ],
    );
    assertAccounted(later);
  });

  test('condos of one building become one MDU door; a lone unit stays a plain door', () => {
    const condo = (id: string, address: string, homestead: boolean, lat: number) =>
      row(id, { useCode: '004', address, homestead, lat, lng: BASE.lng });
    const p = plan(
      [
        condo('12', '5 BAY ST 10', true, 30.3),
        condo('11', '5 BAY ST 2', true, 30.3002),
        condo('13', '5 BAY ST 1', false, 30.3004),
        condo('14', '5 BAY ST 2', false, 30.3),
        condo('20', '8 LONE CT 3', false, 30.31),
        condo('21', '9 TOWN WAY', true, 30.32),
      ],
      { includeUseCodes: ['004'] },
    );
    const mdu = p.houses.find((h) => h.unitOrder);
    assert.deepEqual(mdu, {
      id: 'solar__area-mdu-99-11',
      campaignId: 'solar',
      packId: mdu?.packId,
      packName: mdu?.packName,
      address: '5 Bay St',
      city: 'Testville',
      lat: 30.3002,
      lng: BASE.lng,
      assignedRepId: null,
      managerId: null,
      last: null,
      notHomeCount: 0,
      unitOrder: ['1', '2', '10'],
      units: {},
      movedBy: null,
      createdBy: null,
      updatedAt: 1,
      ownerOccupied: true,
      propertyType: 'condo',
    });
    assert.deepEqual(
      p.houses.filter((h) => !h.unitOrder).map((h) => [h.id, h.address]),
      [
        ['solar__area-99-20', '8 Lone Ct 3'],
        ['solar__area-99-21', '9 Town Way'],
      ],
    );
    assert.deepEqual(skippedOf(p), { repeated: 1 });
    assert.deepEqual(p.rowsBreakdown, { houseRows: 2, unitRows: 3, buildings: 1 });
    assert.equal(p.mdus, 1);
    assert.equal(p.units, 3);
    assertAccounted(p);
  });

  test('a building with a minority of homesteaded units is not owner-occupied', () => {
    const p = plan(
      [
        row('1', { useCode: '004', address: '5 BAY ST 1', homestead: true }),
        row('2', { useCode: '004', address: '5 BAY ST 2' }),
      ],
      { includeUseCodes: ['004'] },
    );
    assert.equal(p.houses[0].ownerOccupied, false);
  });
});
