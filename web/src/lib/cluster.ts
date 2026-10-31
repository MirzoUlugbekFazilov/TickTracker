/**
 * Marker clustering.
 *
 * WHY HAND-ROLLED
 * ---------------
 * `react-leaflet-markercluster` / `leaflet.markercluster` is the usual answer,
 * but it has no React 19 support, it mutates the DOM outside React's knowledge,
 * and its icons are built from HTML strings — which means the app's design
 * tokens cannot reach them and every cluster would need a hard-coded hex.
 *
 * The clustering this app actually needs is also narrower than the general case:
 * the source data is city-accurate, so points are already grouped into 14 tight
 * knots rather than spread continuously. A grid cluster over the current zoom
 * level handles that in about sixty lines, renders through normal React
 * components, and inherits theming for free.
 *
 * The algorithm is a single pass that buckets points into a square grid whose
 * cell size is expressed in screen pixels and converted to degrees for the
 * current zoom. That keeps clusters visually even at every zoom level, which a
 * fixed-degree grid does not: a 0.5-degree cell is sensible at zoom 6 and
 * absurd at zoom 12.
 */

import type { Sighting } from '../types/sighting';

export interface Cluster {
  /** Stable key for React, derived from the grid cell. */
  key: string;
  lat: number;
  lng: number;
  sightings: Sighting[];
}

/** Target cell size on screen. Tuned so clusters stay separable by eye. */
const CELL_PIXELS = 58;

/** Zoom at and above which every point is drawn individually. */
export const CLUSTER_MAX_ZOOM = 11;

/**
 * Degrees of longitude per pixel at a given zoom, for the standard 256px Web
 * Mercator tile scheme: the world is 256 * 2^zoom pixels wide and spans 360
 * degrees.
 */
function degreesPerPixel(zoom: number): number {
  return 360 / (256 * 2 ** zoom);
}

export function clusterSightings(
  sightings: readonly Sighting[],
  zoom: number,
): { clusters: Cluster[]; singles: Sighting[] } {
  if (zoom >= CLUSTER_MAX_ZOOM || sightings.length === 0) {
    return { clusters: [], singles: [...sightings] };
  }

  const cellDegrees = degreesPerPixel(zoom) * CELL_PIXELS;
  const buckets = new Map<string, Sighting[]>();

  for (const sighting of sightings) {
    // Latitude cells are scaled by the Mercator stretch so a cell stays
    // roughly square on screen rather than becoming tall near Scotland.
    const latScale = Math.max(0.2, Math.cos((sighting.lat * Math.PI) / 180));
    const col = Math.floor(sighting.lng / cellDegrees);
    const row = Math.floor(sighting.lat / (cellDegrees * latScale));
    const key = `${row}:${col}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(sighting);
    else buckets.set(key, [sighting]);
  }

  const clusters: Cluster[] = [];
  const singles: Sighting[] = [];

  for (const [key, bucket] of buckets) {
    // A "cluster" of one is just a marker, and drawing it as a numbered bubble
    // would hide its species and severity for no benefit.
    const first = bucket[0];
    if (bucket.length === 1 && first !== undefined) {
      singles.push(first);
      continue;
    }

    // Centroid rather than cell centre, so the bubble sits over the actual
    // points instead of floating in an arbitrary corner of its cell.
    let latSum = 0;
    let lngSum = 0;
    for (const sighting of bucket) {
      latSum += sighting.lat;
      lngSum += sighting.lng;
    }

    clusters.push({
      key,
      lat: latSum / bucket.length,
      lng: lngSum / bucket.length,
      sightings: bucket,
    });
  }

  return { clusters, singles };
}

/** Bounding box of a cluster's points, for zoom-to-fit on click. */
export function clusterBounds(cluster: Cluster): [[number, number], [number, number]] {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const sighting of cluster.sightings) {
    if (sighting.lat < minLat) minLat = sighting.lat;
    if (sighting.lat > maxLat) maxLat = sighting.lat;
    if (sighting.lng < minLng) minLng = sighting.lng;
    if (sighting.lng > maxLng) maxLng = sighting.lng;
  }

  // Pad a degenerate box (all points at one spot) so fitBounds does not zoom to
  // maximum depth on a single coordinate.
  const pad = 0.01;
  return [
    [minLat - pad, minLng - pad],
    [maxLat + pad, maxLng + pad],
  ];
}

/** Dominant severity in a cluster, used only for its accessible description. */
export function clusterSummary(cluster: Cluster): string {
  const cities = new Set(cluster.sightings.map((sighting) => sighting.location));
  const cityText =
    cities.size === 1 ? [...cities][0] : `${cities.size} nearby locations`;
  return `${cluster.sightings.length} sightings in ${cityText}`;
}
