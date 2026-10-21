/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { geohashBounds, geohashCellSize, geohashEncode, geohashesCoveringBox } from './geohash';

describe('geohash', () => {
  test('encodes known points (reference values)', () => {
    // Wikipedia's example and the classic test vector.
    assert.equal(geohashEncode(42.6, -5.6, 5), 'ezs42');
    assert.equal(geohashEncode(57.64911, 10.40744, 11), 'u4pruydqqvj');
    // Jacksonville: every cell starts with "dj".
    assert.equal(geohashEncode(30.3322, -81.6557, 5).slice(0, 2), 'dj');
  });

  test('bounds contain the point and match the cell size', () => {
    for (const [lat, lng] of [
      [30.3322, -81.6557],
      [25.7617, -80.1918],
      [-33.86, 151.2],
      [0, 0],
    ]) {
      const gh = geohashEncode(lat, lng, 5);
      const b = geohashBounds(gh);
      assert.ok(b.minLat <= lat && lat < b.maxLat && b.minLng <= lng && lng < b.maxLng, gh);
      const size = geohashCellSize(5);
      assert.ok(Math.abs(b.maxLat - b.minLat - size.lat) < 1e-12);
      assert.ok(Math.abs(b.maxLng - b.minLng - size.lng) < 1e-12);
      assert.equal(geohashEncode((b.minLat + b.maxLat) / 2, (b.minLng + b.maxLng) / 2, 5), gh);
    }
    assert.throws(() => geohashBounds('abc'), /Not a geohash/); // 'a' is not in the alphabet
  });

  test('a box inside one cell is that cell; a box over an edge gets both', () => {
    const b = geohashBounds('djmqx');
    const inner = { minLat: b.minLat + 0.001, minLng: b.minLng + 0.001, maxLat: b.maxLat - 0.001, maxLng: b.maxLng - 0.001 };
    assert.deepEqual(geohashesCoveringBox(inner), ['djmqx']);
    const across = { ...inner, maxLng: b.maxLng + 0.001 };
    const cells = geohashesCoveringBox(across) as string[];
    assert.equal(cells.length, 2);
    assert.ok(cells.includes('djmqx'));
    const east = geohashEncode((b.minLat + b.maxLat) / 2, b.maxLng + 0.0005, 5);
    assert.ok(cells.includes(east));
  });

  test('every point of a box falls in one of its covering cells', () => {
    const box = { minLat: 30.21, minLng: -81.72, maxLat: 30.33, maxLng: -81.55 };
    const cells = new Set(geohashesCoveringBox(box));
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const lat = box.minLat + ((box.maxLat - box.minLat) * i) / 20;
        const lng = box.minLng + ((box.maxLng - box.minLng) * j) / 20;
        assert.ok(cells.has(geohashEncode(lat, lng, 5)), `${lat},${lng}`);
      }
    }
  });

  test('limit: null when the box needs more cells', () => {
    const box = { minLat: 29, minLng: -82, maxLat: 31, maxLng: -80 };
    assert.equal(geohashesCoveringBox(box, 5, 16), null);
    assert.ok((geohashesCoveringBox(box, 5) as string[]).length > 16);
  });
});
