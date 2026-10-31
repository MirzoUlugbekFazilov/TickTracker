/**
 * Turning a city name into a map position.
 *
 * The API gives us `location: "Manchester"` and nothing more. Plotting all 72
 * Manchester records on the exact same pixel would render them as a single
 * marker and throw away the fact that there are 72 of them, so each sighting is
 * offset from its city centroid by a small, *deterministic* amount derived from
 * its own id.
 *
 * Two properties matter here:
 *
 *  1. Deterministic — the same sighting lands on the same spot on every load and
 *     in every browser. A `Math.random()` jitter would make markers jump between
 *     renders, which would look like a bug and would break deep links.
 *  2. Honest in scale — the offset is bounded to roughly a 6 km radius, i.e. the
 *     footprint of the city itself. The source data is only city-accurate, so the
 *     offset must never imply street-level precision. The UI states this, and the
 *     detail panel reports the city rather than a coordinate.
 */

import { findCity, UK_FALLBACK_CENTRE } from './cities.js';

/**
 * FNV-1a, 32-bit. A small non-cryptographic string hash: we need an integer that
 * is well distributed across ids, nothing more. Chosen over a hand-rolled
 * `charCodeAt` sum because that clusters badly on the API's similar-looking ids.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 16777619, via shifts to stay in 32-bit integer range.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derives two independent, uniform values in [0, 1) from one id. */
function hashToUnitPair(id: string): [number, number] {
  const a = hashString(id);
  const b = hashString(`${id}#salt`);
  return [a / 0x100000000, b / 0x100000000];
}

/** Maximum offset from the city centre, in kilometres. */
const JITTER_RADIUS_KM = 6;
const KM_PER_DEGREE_LAT = 110.574;

export interface ResolvedPosition {
  lat: number;
  lng: number;
  cityLat: number;
  cityLng: number;
  /** False when the city name was not in our centroid table. */
  mapped: boolean;
}

/**
 * Resolves a sighting to a position. The offset uses a square-root radius so
 * points spread evenly over the disc rather than bunching at the centre, which
 * is what a naive `radius * random()` produces.
 */
export function resolvePosition(location: string, id: string): ResolvedPosition {
  const city = findCity(location);
  const centre = city ?? UK_FALLBACK_CENTRE;

  const [u, v] = hashToUnitPair(id);
  const radiusKm = JITTER_RADIUS_KM * Math.sqrt(u);
  const angle = 2 * Math.PI * v;

  const deltaLat = (radiusKm * Math.sin(angle)) / KM_PER_DEGREE_LAT;
  // A degree of longitude shortens with latitude, so scale by cos(lat).
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((centre.lat * Math.PI) / 180);
  const deltaLng = (radiusKm * Math.cos(angle)) / kmPerDegreeLng;

  return {
    lat: round6(centre.lat + deltaLat),
    lng: round6(centre.lng + deltaLng),
    cityLat: centre.lat,
    cityLng: centre.lng,
    mapped: city !== undefined,
  };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Great-circle distance in km, for the "nearby sightings" count. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}
