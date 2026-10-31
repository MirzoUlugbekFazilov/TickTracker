/**
 * City centroids for the 14 UK locations present in the Elanco dataset.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `GET /data/tick-sightings` returns `location` as a bare city name and gives no
 * coordinates at all. A map needs latitude and longitude, so we resolve the name
 * against this table. The alternative — calling a live geocoding service on load
 * — would add an API key, a rate limit and a network dependency to render the
 * core view, for a set of place names that is fixed and known in advance.
 *
 * Coordinates are city-centre reference points (the conventional centroid used
 * by ONS / OpenStreetMap for each settlement), rounded to 4dp (~11 m), which is
 * far finer than the city-level precision the source data actually carries.
 */

export interface City {
  name: string;
  lat: number;
  lng: number;
  /** ITL1 region, or constituent nation where that reads more naturally. */
  region: string;
}

export const CITIES: readonly City[] = [
  { name: 'London', lat: 51.5072, lng: -0.1276, region: 'London' },
  { name: 'Birmingham', lat: 52.4862, lng: -1.8904, region: 'West Midlands' },
  { name: 'Manchester', lat: 53.4808, lng: -2.2426, region: 'North West' },
  { name: 'Liverpool', lat: 53.4084, lng: -2.9916, region: 'North West' },
  { name: 'Leeds', lat: 53.8008, lng: -1.5491, region: 'Yorkshire and the Humber' },
  { name: 'Sheffield', lat: 53.3811, lng: -1.4701, region: 'Yorkshire and the Humber' },
  { name: 'Nottingham', lat: 52.9548, lng: -1.1581, region: 'East Midlands' },
  { name: 'Leicester', lat: 52.6369, lng: -1.1398, region: 'East Midlands' },
  { name: 'Newcastle', lat: 54.9783, lng: -1.6178, region: 'North East' },
  { name: 'Bristol', lat: 51.4545, lng: -2.5879, region: 'South West' },
  { name: 'Southampton', lat: 50.9097, lng: -1.4044, region: 'South East' },
  { name: 'Cardiff', lat: 51.4816, lng: -3.1791, region: 'Wales' },
  { name: 'Edinburgh', lat: 55.9533, lng: -3.1883, region: 'Scotland' },
  { name: 'Glasgow', lat: 55.8642, lng: -4.2518, region: 'Scotland' },
];

const CITY_BY_NAME = new Map<string, City>(
  CITIES.map((city) => [city.name.toLowerCase(), city]),
);

export function findCity(name: string): City | undefined {
  return CITY_BY_NAME.get(name.trim().toLowerCase());
}

/** Alphabetical city names, for filter and form dropdowns. */
export const CITY_NAMES: readonly string[] = CITIES.map((c) => c.name)
  .slice()
  .sort((a, b) => a.localeCompare(b, 'en-GB'));

/**
 * Fallback for a `location` we have no centroid for — for example if the API
 * adds a city later, or a user types a free-text location into the report form.
 * Placing it at the geographic centre of Great Britain is obviously wrong as a
 * location, which is the point: it is visible rather than silently dropped, and
 * the UI labels it as unmapped.
 */
export const UK_FALLBACK_CENTRE = { lat: 54.093, lng: -2.8926 } as const;

/** Initial map view: the whole of the UK, framed for a desktop viewport. */
export const UK_MAP_CENTRE: [number, number] = [54.3, -2.6];
export const UK_MAP_ZOOM = 6;
/** Keeps panning within a generous box around the British Isles. */
export const UK_MAX_BOUNDS: [[number, number], [number, number]] = [
  [48.5, -11.5],
  [61.5, 3.5],
];
