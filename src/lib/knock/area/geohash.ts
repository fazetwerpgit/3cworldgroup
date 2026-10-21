/**
 * Geohash (base-32, Niemeyer) for the parcel tiles of the drawn-area import
 * (docs/AREA_IMPORT_API.md): a tile holds the homes whose point falls in one geohash-5 cell.
 *
 * Pure and dependency-free so the portal can copy it unchanged.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface GeoBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * The geohash of a point, `precision` characters long. A point on a cell edge belongs to the
 * cell above / to the right (the standard: each bisection sends `>= mid` to the upper half).
 */
export function geohashEncode(lat: number, lng: number, precision = 5): string {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let hash = '';
  let bits = 0;
  let value = 0;
  let evenBit = true; // even bits are longitude
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) {
        value = value * 2 + 1;
        lngLo = mid;
      } else {
        value *= 2;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latLo = mid;
      } else {
        value *= 2;
        latHi = mid;
      }
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** The cell a geohash names. Throws on a character outside the geohash alphabet. */
export function geohashBounds(hash: string): GeoBox {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let evenBit = true;
  for (const ch of hash.toLowerCase()) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error(`Not a geohash: ${hash}`);
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1;
      if (evenBit) {
        const mid = (lngLo + lngHi) / 2;
        if (bit) lngLo = mid;
        else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid;
        else latHi = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { minLat: latLo, minLng: lngLo, maxLat: latHi, maxLng: lngHi };
}

/** Cell size in degrees at `precision` (lat, lng). Precision 5: 0.0439° x 0.0439° (~4.9 km x 4.2 km at 30°N). */
export function geohashCellSize(precision: number): { lat: number; lng: number } {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { lat: 180 / 2 ** latBits, lng: 360 / 2 ** lngBits };
}

/**
 * Every geohash cell of `precision` that overlaps `box` (edges included), sorted. `limit` stops
 * early: when the box needs more cells than that, returns null (the caller answers too_big without
 * enumerating a huge area).
 */
export function geohashesCoveringBox(box: GeoBox, precision = 5, limit = Infinity): string[] | null {
  const size = geohashCellSize(precision);
  const row0 = Math.floor((box.minLat + 90) / size.lat);
  const row1 = Math.floor((Math.min(box.maxLat, 90 - 1e-12) + 90) / size.lat);
  const col0 = Math.floor((box.minLng + 180) / size.lng);
  const col1 = Math.floor((Math.min(box.maxLng, 180 - 1e-12) + 180) / size.lng);
  if (row1 < row0 || col1 < col0) return [];
  if ((row1 - row0 + 1) * (col1 - col0 + 1) > limit) return null;
  const out: string[] = [];
  for (let r = row0; r <= row1; r++) {
    for (let c = col0; c <= col1; c++) {
      // The centre of the cell: no rounding doubt about which cell it falls in.
      out.push(geohashEncode(-90 + (r + 0.5) * size.lat, -180 + (c + 0.5) * size.lng, precision));
    }
  }
  return out.sort();
}
