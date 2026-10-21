/**
 * State Plane projections of county parcel maps (FDOR "PIN" / "PAR" shapefiles, `.prj` in ESRI
 * WKT) back to lat/lng. Florida uses three zones: East and West are Transverse Mercator, North is
 * Lambert Conformal Conic (two standard parallels). Formulas: Snyder, "Map Projections: A Working
 * Manual" (USGS PP 1395), ch. 8 and 15. The datum shift NAD83(HARN) to WGS84 (about 1 m) is ignored.
 *
 * Pure and dependency-free (used by scripts/parcelShapes.ts; the portal may copy it).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

interface Ellipsoid {
  /** Ellipsoid semi-major axis (m) and inverse flattening. */
  a: number;
  invF: number;
  /** Metres per projected unit (US survey foot: 0.3048006096). */
  unitM: number;
  falseEasting: number;
  falseNorthing: number;
  centralMeridian: number;
  latitudeOfOrigin: number;
  scaleFactor: number;
}

export interface TransverseMercator extends Ellipsoid {
  kind: 'transverse-mercator';
}

export interface LambertConformalConic extends Ellipsoid {
  kind: 'lambert-conformal-conic';
  standardParallel1: number;
  standardParallel2: number;
}

export type Projection = TransverseMercator | LambertConformalConic;

/** Reads a `.prj` (ESRI WKT). Throws for a projection other than Transverse Mercator or Lambert Conformal Conic. */
export function parsePrj(wkt: string): Projection {
  const tm = /PROJECTION\["Transverse_Mercator"\]/i.test(wkt);
  const lcc = /PROJECTION\["Lambert_Conformal_Conic(?:_2SP|_1SP)?"\]/i.test(wkt);
  if (!tm && !lcc) {
    throw new Error(`Unsupported parcel projection (only Transverse Mercator and Lambert Conformal Conic): ${wkt.slice(0, 160)}`);
  }
  const value = (name: string): number | null => {
    const m = new RegExp(`PARAMETER\\["${name}",\\s*(-?[\\d.]+(?:[eE][-+]?\\d+)?)\\]`, 'i').exec(wkt);
    return m ? Number(m[1]) : null;
  };
  const param = (name: string): number => {
    const v = value(name);
    if (v === null) throw new Error(`.prj has no ${name}`);
    return v;
  };
  const spheroid = /SPHEROID\["[^"]*",\s*([\d.]+),\s*([\d.]+)\]/i.exec(wkt);
  // The last UNIT is the projected (linear) unit; the first belongs to GEOGCS.
  const units = [...wkt.matchAll(/UNIT\["[^"]*",\s*([\d.]+)\]/gi)];
  if (!spheroid || units.length < 2) throw new Error('.prj has no SPHEROID or linear UNIT');
  const base: Ellipsoid = {
    a: Number(spheroid[1]),
    invF: Number(spheroid[2]),
    unitM: Number(units[units.length - 1][1]),
    falseEasting: param('False_Easting'),
    falseNorthing: param('False_Northing'),
    centralMeridian: param('Central_Meridian'),
    latitudeOfOrigin: param('Latitude_Of_Origin'),
    scaleFactor: value('Scale_Factor') ?? 1,
  };
  if (tm) return { kind: 'transverse-mercator', ...base };
  const sp1 = value('Standard_Parallel_1') ?? base.latitudeOfOrigin;
  return { kind: 'lambert-conformal-conic', ...base, standardParallel1: sp1, standardParallel2: value('Standard_Parallel_2') ?? sp1 };
}

/** Projected x/y (in the projection's unit) to lat/lng, degrees. */
export function inverseProject(p: Projection, x: number, y: number): LatLng {
  return p.kind === 'transverse-mercator' ? inverseTransverseMercator(p, x, y) : inverseLambertConformalConic(p, x, y);
}

const RAD = Math.PI / 180;

function eccentricity2(invF: number): number {
  const f = 1 / invF;
  return 2 * f - f * f;
}

/** Transverse Mercator, inverse (Snyder eqs. 8-12 to 8-25). */
export function inverseTransverseMercator(p: Omit<TransverseMercator, 'kind'>, x: number, y: number): LatLng {
  const e2 = eccentricity2(p.invF);
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const ep2 = e2 / (1 - e2);
  const meridian = (phi: number) =>
    p.a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const xm = (x - p.falseEasting) * p.unitM;
  const ym = (y - p.falseNorthing) * p.unitM;
  const m = meridian(p.latitudeOfOrigin * RAD) + ym / p.scaleFactor;
  const mu = m / (p.a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const c1 = ep2 * cos1 * cos1;
  const t1 = tan1 * tan1;
  const n1 = p.a / Math.sqrt(1 - e2 * sin1 * sin1);
  const r1 = (p.a * (1 - e2)) / (1 - e2 * sin1 * sin1) ** 1.5;
  const d = xm / (n1 * p.scaleFactor);

  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lng =
    p.centralMeridian * RAD +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) / cos1;
  return { lat: lat / RAD, lng: lng / RAD };
}

/** Lambert Conformal Conic constants (Snyder eqs. 15-8 to 15-11, 14-15). */
function lccConstants(p: Omit<LambertConformalConic, 'kind'>) {
  const e2 = eccentricity2(p.invF);
  const e = Math.sqrt(e2);
  const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
  const phi1 = p.standardParallel1 * RAD;
  const phi2 = p.standardParallel2 * RAD;
  const n = Math.abs(phi1 - phi2) < 1e-12 ? Math.sin(phi1) : (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)));
  const F = m(phi1) / (n * t(phi1) ** n);
  const aFk = p.a * F * p.scaleFactor;
  const rho0 = aFk * t(p.latitudeOfOrigin * RAD) ** n;
  return { e, n, aFk, rho0, t };
}

/** Lambert Conformal Conic, forward (lat/lng degrees to projected units). For tests and checks. */
export function forwardLambertConformalConic(p: Omit<LambertConformalConic, 'kind'>, lat: number, lng: number): { x: number; y: number } {
  const { n, aFk, rho0, t } = lccConstants(p);
  const rho = aFk * t(lat * RAD) ** n;
  const theta = n * (lng - p.centralMeridian) * RAD;
  return {
    x: p.falseEasting + (rho * Math.sin(theta)) / p.unitM,
    y: p.falseNorthing + (rho0 - rho * Math.cos(theta)) / p.unitM,
  };
}

/** Lambert Conformal Conic, inverse (Snyder eqs. 14-10, 15-9, 7-9 iterated). */
export function inverseLambertConformalConic(p: Omit<LambertConformalConic, 'kind'>, x: number, y: number): LatLng {
  const { e, n, aFk, rho0 } = lccConstants(p);
  const dx = (x - p.falseEasting) * p.unitM;
  const dy = rho0 - (y - p.falseNorthing) * p.unitM;
  const sign = n < 0 ? -1 : 1;
  const rho = sign * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(sign * dx, sign * dy);
  const tt = (rho / aFk) ** (1 / n);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 15; i++) {
    const es = e * Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(tt * ((1 - es) / (1 + es)) ** (e / 2));
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }
  return { lat: phi / RAD, lng: theta / n / RAD + p.centralMeridian };
}
