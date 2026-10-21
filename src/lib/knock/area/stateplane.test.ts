/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { forwardLambertConformalConic, inverseLambertConformalConic, inverseProject, parsePrj, type LambertConformalConic } from './stateplane';

const US_FT = 0.30480060960121924;

// Florida North, as FDOR's north-zone parcel maps (e.g. Leon) write it.
const FL_NORTH =
  'PROJCS["NAD_1983_HARN_StatePlane_Florida_North_FIPS_0903_Feet",GEOGCS["GCS_North_American_1983_HARN",DATUM["D_North_American_1983_HARN",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",1968500.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-84.5],PARAMETER["Standard_Parallel_1",29.58333333333333],PARAMETER["Standard_Parallel_2",30.75],PARAMETER["Latitude_Of_Origin",29.0],UNIT["Foot_US",0.3048006096012192]]';

// Duval's .prj (Florida East).
const FL_EAST =
  'PROJCS["NAD_1983_HARN_StatePlane_Florida_East_FIPS_0901_Feet",GEOGCS["GCS_North_American_1983_HARN",DATUM["D_North_American_1983_HARN",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",656166.66666666651],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-81.0],PARAMETER["Scale_Factor",0.99994117647058822],PARAMETER["Latitude_Of_Origin",24.333333333333332],UNIT["Foot_US",0.30480060960121924]]';

describe('stateplane', () => {
  test('EPSG Guidance Note 7-2 worked example (LCC 2SP, NAD27 Texas South Central)', () => {
    const p: Omit<LambertConformalConic, 'kind'> = {
      a: 6378206.4,
      invF: 294.978698213898,
      unitM: US_FT,
      falseEasting: 2000000,
      falseNorthing: 0,
      centralMeridian: -99,
      latitudeOfOrigin: 27 + 50 / 60,
      scaleFactor: 1,
      standardParallel1: 28 + 23 / 60,
      standardParallel2: 30 + 17 / 60,
    };
    const xy = forwardLambertConformalConic(p, 28.5, -96);
    assert.ok(Math.abs(xy.x - 2963503.91) < 0.05, `x ${xy.x}`);
    assert.ok(Math.abs(xy.y - 254759.8) < 0.05, `y ${xy.y}`);
    const ll = inverseLambertConformalConic(p, 2963503.91, 254759.8);
    assert.ok(Math.abs(ll.lat - 28.5) < 1e-7 && Math.abs(ll.lng + 96) < 1e-7, JSON.stringify(ll));
  });

  test('Florida North .prj: origin, round trip over Tallahassee', () => {
    const p = parsePrj(FL_NORTH);
    assert.equal(p.kind, 'lambert-conformal-conic');
    const origin = inverseProject(p, 1968500, 0);
    assert.ok(Math.abs(origin.lat - 29) < 1e-9 && Math.abs(origin.lng + 84.5) < 1e-9);
    if (p.kind !== 'lambert-conformal-conic') return;
    for (const [lat, lng] of [
      [30.4383, -84.2807],
      [30.9, -87.4],
      [29.6, -82.3],
    ]) {
      const xy = forwardLambertConformalConic(p, lat, lng);
      const back = inverseProject(p, xy.x, xy.y);
      assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lng - lng) < 1e-9, `${lat},${lng}`);
    }
    // Tallahassee's capitol is ~2.0 M ft east, ~0.52 M ft north in this zone.
    const tlh = forwardLambertConformalConic(p, 30.4383, -84.2807);
    assert.ok(tlh.x > 2_000_000 && tlh.x < 2_100_000 && tlh.y > 500_000 && tlh.y < 540_000, JSON.stringify(tlh));
  });

  test('Florida East .prj (Duval) still reads as Transverse Mercator', () => {
    const p = parsePrj(FL_EAST);
    assert.equal(p.kind, 'transverse-mercator');
    const origin = inverseProject(p, 656166.66666666651, 0);
    assert.ok(Math.abs(origin.lat - 24.333333333) < 1e-6 && Math.abs(origin.lng + 81) < 1e-9);
    // Downtown Jacksonville lands in Duval.
    const jax = inverseProject(p, 443_000, 2_180_000);
    assert.ok(jax.lat > 30.1 && jax.lat < 30.6 && jax.lng > -81.9 && jax.lng < -81.3, JSON.stringify(jax));
  });

  test('other projections throw', () => {
    assert.throws(() => parsePrj('PROJCS["x",PROJECTION["Albers"]]'), /Unsupported parcel projection/);
  });
});
