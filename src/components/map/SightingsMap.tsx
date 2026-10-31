/**
 * The interactive map.
 *
 * Leaflet via react-leaflet, with OpenStreetMap raster tiles. Chosen over
 * Mapbox / Google Maps because it needs no API key and no billing account —
 * which matters for a submission a reviewer has to be able to clone and run.
 *
 * Markers are `DivIcon`s rather than Leaflet's default image pins. That is what
 * lets severity drive both the fill colour and the diameter from CSS custom
 * properties, so the markers theme with the rest of the app instead of needing
 * a sprite per state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { Sighting } from '../../types/sighting';
import {
  UK_MAP_CENTRE,
  UK_MAP_ZOOM,
  UK_MAX_BOUNDS,
} from '../../data/cities';
import { MARKER_SIZE, clusterSize, severityColor } from '../../lib/colors';
import {
  CLUSTER_MAX_ZOOM,
  clusterBounds,
  clusterSightings,
  clusterSummary,
  type Cluster,
} from '../../lib/cluster';
import { SEVERITY_LABELS } from '../../data/species';
import { formatDateShort } from '../../lib/format';

const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/* -------------------------------------------------------------- Icon build */

/**
 * Builds the icon for a single sighting.
 *
 * Leaflet's icon API takes an HTML string, so the markup is assembled here
 * rather than rendered through React. The alternative, `renderToStaticMarkup`,
 * would pull React's whole server renderer into the browser bundle to produce
 * two `<span>`s — a poor trade for a string this small.
 *
 * Every value interpolated below is derived from our own token maps and a
 * closed set of enum values; no API field or user input reaches the markup, so
 * there is no injection surface here. The sighting's text content lives in the
 * marker's `alt` attribute and the detail panel, both of which React escapes.
 */
function buildSightingIcon(sighting: Sighting, selected: boolean): L.DivIcon {
  const size = MARKER_SIZE[sighting.severity];
  const classes = [
    'tick-marker',
    sighting.isRecent ? 'tick-marker--recent' : '',
    sighting.source === 'local' ? 'tick-marker--local' : '',
    selected ? 'tick-marker--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // `--marker-fill` is consumed by .tick-marker and by its ::after pulse ring.
  const html =
    `<span class="${classes}" style="width:${size}px;height:${size}px;` +
    `--marker-fill:${severityColor(sighting.severity)}"></span>`;

  return L.divIcon({
    html,
    className: '', // Leaflet adds `leaflet-div-icon` styling we do not want.
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function buildClusterIcon(count: number): L.DivIcon {
  const size = clusterSize(count);
  const fontSize = size <= 36 ? 12 : 14;
  const html =
    `<span class="cluster-marker" style="width:${size}px;height:${size}px">` +
    `<span class="cluster-marker__count" style="font-size:${fontSize}px">${count}</span>` +
    `</span>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/* ------------------------------------------------------------ Icon caches */

/**
 * Module-level, deliberately.
 *
 * An icon is a pure function of four discrete inputs — severity, recency,
 * source and selection — and of nothing in React's world: its colours arrive
 * through CSS custom properties, which resolve at paint time, so an icon stays
 * correct across a theme change without being rebuilt. There are at most 32
 * distinct icons however many markers are on screen.
 *
 * Caching here rather than in a ref keeps the cache out of the render cycle
 * entirely (no hook rules to reason about) and shares it across map instances.
 */
const sightingIconCache = new Map<string, L.DivIcon>();
const clusterIconCache = new Map<number, L.DivIcon>();

function sightingIcon(sighting: Sighting, isSelected: boolean): L.DivIcon {
  const key = `${sighting.severity}|${sighting.isRecent}|${sighting.source}|${isSelected}`;
  let icon = sightingIconCache.get(key);
  if (!icon) {
    icon = buildSightingIcon(sighting, isSelected);
    sightingIconCache.set(key, icon);
  }
  return icon;
}

function clusterIcon(count: number): L.DivIcon {
  let icon = clusterIconCache.get(count);
  if (!icon) {
    icon = buildClusterIcon(count);
    clusterIconCache.set(count, icon);
  }
  return icon;
}

/* ---------------------------------------------------------- Zoom tracking */

/** Reports the current zoom up so clustering can respond to it. */
function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

/**
 * Pans to the selected sighting when selection comes from outside the map — a
 * deep link, or a click in the "latest sightings" list. Keeps the existing zoom
 * if the user has already zoomed in past the city view.
 */
function SelectionFocus({ sighting }: { sighting: Sighting | null }) {
  const map = useMap();
  const lastFocusedId = useRef<string | null>(null);

  useEffect(() => {
    if (!sighting) {
      lastFocusedId.current = null;
      return;
    }
    if (lastFocusedId.current === sighting.id) return;
    lastFocusedId.current = sighting.id;

    map.flyTo([sighting.lat, sighting.lng], Math.max(map.getZoom(), 10), {
      duration: 0.7,
    });
  }, [sighting, map]);

  return null;
}

/** Exposes an imperative "reset view" to the toolbar above the map. */
function ViewController({ resetToken }: { resetToken: number }) {
  const map = useMap();
  const previous = useRef(resetToken);

  useEffect(() => {
    if (previous.current === resetToken) return;
    previous.current = resetToken;
    map.flyTo(UK_MAP_CENTRE, UK_MAP_ZOOM, { duration: 0.8 });
  }, [resetToken, map]);

  return null;
}

/**
 * Invalidates Leaflet's cached canvas size when the container resizes.
 *
 * Without this the map renders into a stale box whenever the detail panel opens
 * or the window changes, leaving grey gutters where tiles should be. Leaflet has
 * no internal resize observer for its container, only for the window.
 */
function ResizeHandler({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      // A frame's delay lets the browser finish layout first; calling
      // invalidateSize synchronously inside the observer reads the old box.
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [map, containerRef]);

  return null;
}

/* ------------------------------------------------------------------- Map */

export interface SightingsMapProps {
  sightings: readonly Sighting[];
  selected: Sighting | null;
  onSelect: (sighting: Sighting) => void;
  /** Incremented by the parent to request a view reset. */
  resetToken: number;
}

export function SightingsMap({
  sightings,
  selected,
  onSelect,
  resetToken,
}: SightingsMapProps) {
  const [zoom, setZoom] = useState(UK_MAP_ZOOM);
  const containerRef = useRef<HTMLDivElement>(null);

  const { clusters, singles } = useMemo(
    () => clusterSightings(sightings, zoom),
    [sightings, zoom],
  );

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <MapContainer
        center={UK_MAP_CENTRE}
        zoom={UK_MAP_ZOOM}
        minZoom={5}
        maxZoom={15}
        maxBounds={UK_MAX_BOUNDS}
        maxBoundsViscosity={0.7}
        scrollWheelZoom
        // Leaflet's default zoom control sits top-left, exactly where the app's
        // own toolbar goes. Moved to bottom-right, which is clear of the
        // toolbar, the legend and the detail panel at every breakpoint.
        zoomControl={false}
        attributionControl
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomControl position="bottomright" />
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} detectRetina />

        <ZoomWatcher onZoom={setZoom} />
        <SelectionFocus sighting={selected} />
        <ViewController resetToken={resetToken} />
        <ResizeHandler containerRef={containerRef} />

        {clusters.map((cluster) => (
          <ClusterMarker
            key={`cluster-${cluster.key}-${zoom}`}
            cluster={cluster}
            icon={clusterIcon(cluster.sightings.length)}
          />
        ))}

        {singles.map((sighting) => (
          <SightingMarker
            key={sighting.id}
            sighting={sighting}
            icon={sightingIcon(sighting, selected?.id === sighting.id)}
            onSelect={onSelect}
          />
        ))}
      </MapContainer>
    </div>
  );
}

/* --------------------------------------------------------------- Markers */

function SightingMarker({
  sighting,
  icon,
  onSelect,
}: {
  sighting: Sighting;
  icon: L.DivIcon;
  onSelect: (sighting: Sighting) => void;
}) {
  return (
    <Marker
      position={[sighting.lat, sighting.lng]}
      icon={icon}
      keyboard
      // The accessible name a keyboard or screen-reader user receives when the
      // marker takes focus. Leaflet puts this on the icon's anchor element.
      alt={`${sighting.species} sighting in ${sighting.location}, ${formatDateShort(
        sighting.timestamp,
      )}. Derived risk rating ${SEVERITY_LABELS[sighting.severity]}. Activate to open full details.`}
      eventHandlers={{
        click: () => onSelect(sighting),
        keydown: (event) => {
          // Leaflet makes markers focusable but only binds Enter. Space is the
          // expected activation key for anything that behaves like a button.
          const key = (event.originalEvent as KeyboardEvent).key;
          if (key === ' ' || key === 'Enter') {
            event.originalEvent.preventDefault();
            onSelect(sighting);
          }
        },
      }}
    />
  );
}

function ClusterMarker({ cluster, icon }: { cluster: Cluster; icon: L.DivIcon }) {
  const map = useMap();

  const expand = useCallback(() => {
    map.fitBounds(clusterBounds(cluster), {
      padding: [60, 60],
      maxZoom: CLUSTER_MAX_ZOOM + 1,
    });
  }, [map, cluster]);

  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={icon}
      keyboard
      alt={`${clusterSummary(cluster)}. Activate to zoom in and see them individually.`}
      eventHandlers={{
        click: expand,
        keydown: (event) => {
          const key = (event.originalEvent as KeyboardEvent).key;
          if (key === ' ' || key === 'Enter') {
            event.originalEvent.preventDefault();
            expand();
          }
        },
      }}
    />
  );
}
