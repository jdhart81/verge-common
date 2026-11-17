// Where a boundary map opens.
//
// A member drawing the first woodlot of a co-op used to get a map of the whole world and
// had to find their land by hand. These rules pick the closest honest starting view from
// what the browser already holds.
//
// Invariants
//   MS1 Precedence: corners being drawn, then the saved boundary, then another place this
//       co-op has already mapped (`near`), then the region of the browser's time zone, then
//       the world.
//   MS2 Nothing is asked for and nothing is sent: no network request, no permission prompt,
//       no storage. The time zone is read from the browser's own settings and stays there.
//   MS3 Zoom follows confidence: 16 on a boundary, 13 near the co-op's other land, a
//       country-scale view (never closer than 6) for a time zone, 1 for the world.
//   MS4 A missing, malformed or out-of-range value is skipped, never thrown on.
//   MS5 A time-zone view is a region, not a location: it is labelled as such (`source`),
//       so the screen can tell the member to find their land.

const lngLat = (p) =>
  Array.isArray(p) &&
  p.length >= 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90
    ? [p[0], p[1]]
    : null;

/** The first [longitude, latitude] pair found anywhere in a GeoJSON-like value, or null. */
export function firstCoordinate(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    if (typeof value[0] === 'number') return lngLat(value);
    for (const item of value) {
      const found = firstCoordinate(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of ['coordinates', 'geometry', 'geometries', 'features']) {
    const found = firstCoordinate(value[key], depth + 1);
    if (found) return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if (['coordinates', 'geometry', 'geometries', 'features'].includes(key)) continue;
    const found = firstCoordinate(item, depth + 1);
    if (found) return found;
  }
  return null;
}

// Region views: [longitude, latitude, zoom]. Specific zones first, then the zone's area.
const ZONES = {
  'America/New_York': [-77, 38.5, 5],
  'America/Detroit': [-85, 44, 6],
  'America/Toronto': [-79, 45, 6],
  'America/Halifax': [-63.5, 45, 6],
  'America/St_Johns': [-56, 49, 6],
  'America/Chicago': [-92, 40, 5],
  'America/Winnipeg': [-98, 52, 5],
  'America/Denver': [-108, 42, 5],
  'America/Boise': [-115, 44.5, 6],
  'America/Edmonton': [-114, 54, 5],
  'America/Phoenix': [-111.5, 34, 6],
  'America/Los_Angeles': [-120, 41, 5],
  'America/Vancouver': [-124, 52, 5],
  'America/Anchorage': [-150, 63, 4],
  'Pacific/Honolulu': [-157, 20.5, 6],
  'America/Mexico_City': [-100, 21, 5],
  'America/Bogota': [-74, 4.5, 5],
  'America/Lima': [-75.5, -10, 5],
  'America/Santiago': [-71.5, -36, 4],
  'America/Sao_Paulo': [-49, -18, 4],
  'America/Argentina/Buenos_Aires': [-64, -36, 4],
  'Europe/London': [-2.5, 54, 5],
  'Europe/Dublin': [-8, 53.3, 6],
  'Europe/Lisbon': [-8.5, 39.6, 6],
  'Europe/Madrid': [-3.7, 40.2, 5],
  'Europe/Paris': [2.4, 46.6, 5],
  'Europe/Brussels': [4.6, 50.6, 6],
  'Europe/Amsterdam': [5.4, 52.2, 6],
  'Europe/Berlin': [10.4, 51.1, 5],
  'Europe/Zurich': [8.2, 46.8, 6],
  'Europe/Vienna': [14.2, 47.6, 6],
  'Europe/Rome': [12.5, 42.6, 5],
  'Europe/Copenhagen': [10.2, 56, 6],
  'Europe/Oslo': [10, 62, 4],
  'Europe/Stockholm': [16, 61, 4],
  'Europe/Helsinki': [26, 64, 4],
  'Europe/Warsaw': [19.3, 52, 5],
  'Europe/Prague': [15.4, 49.8, 6],
  'Europe/Budapest': [19.4, 47.2, 6],
  'Europe/Bucharest': [25, 45.9, 6],
  'Europe/Athens': [23, 39, 5],
  'Europe/Kyiv': [31.3, 49, 5],
  'Europe/Istanbul': [35, 39, 5],
  'Europe/Moscow': [40, 56, 4],
  'Africa/Lagos': [8, 9.5, 5],
  'Africa/Accra': [-1.2, 7.9, 6],
  'Africa/Nairobi': [37.9, 0.3, 5],
  'Africa/Addis_Ababa': [39.6, 9, 5],
  'Africa/Johannesburg': [25, -29, 5],
  'Africa/Cairo': [30.8, 27, 5],
  'Africa/Casablanca': [-7, 31.8, 5],
  'Asia/Kolkata': [79, 22, 4],
  'Asia/Kathmandu': [84, 28.3, 6],
  'Asia/Dhaka': [90.3, 23.8, 6],
  'Asia/Karachi': [69.4, 30, 5],
  'Asia/Colombo': [80.7, 7.8, 6],
  'Asia/Bangkok': [101, 15, 5],
  'Asia/Ho_Chi_Minh': [106, 16, 5],
  'Asia/Jakarta': [110, -7, 5],
  'Asia/Manila': [122, 12.5, 5],
  'Asia/Singapore': [103.8, 1.35, 6],
  'Asia/Kuala_Lumpur': [102, 4, 6],
  'Asia/Shanghai': [105, 35, 3],
  'Asia/Tokyo': [138, 37, 5],
  'Asia/Seoul': [127.8, 36.3, 6],
  'Asia/Dubai': [54, 24, 6],
  'Asia/Jerusalem': [35, 31.4, 6],
  'Australia/Sydney': [147, -33, 5],
  'Australia/Melbourne': [144.5, -37, 6],
  'Australia/Brisbane': [146, -22, 4],
  'Australia/Adelaide': [135, -30, 4],
  'Australia/Darwin': [133, -19, 4],
  'Australia/Perth': [122, -26, 4],
  'Australia/Hobart': [146.6, -42, 6],
  'Pacific/Auckland': [173, -41, 5],
};
const AREAS = {
  America: [-95, 15, 2],
  Europe: [12, 52, 3],
  Africa: [20, 2, 2],
  Asia: [95, 30, 2],
  Australia: [134, -26, 3],
  Pacific: [175, -10, 2],
  Atlantic: [-25, 35, 2],
  Indian: [70, -15, 2],
  Arctic: [15, 78, 3],
};
// Names browsers still report for zones that were renamed.
const RENAMED = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Montreal': 'America/Toronto',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
};

/** A region view for an IANA time zone name, or null when the name says nothing (MS4). */
export function zoneRegion(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length > 64) return null;
  const name = Object.hasOwn(RENAMED, timeZone) ? RENAMED[timeZone] : timeZone;
  const hit = Object.hasOwn(ZONES, name) ? ZONES[name] : null;
  const area = name.split('/')[0];
  const view = hit ?? (Object.hasOwn(AREAS, area) ? AREAS[area] : null);
  return view ? { center: [view[0], view[1]], zoom: Math.min(view[2], 6) } : null;
}

/** The browser's own time zone name, or '' where it is unavailable. Read locally (MS2). */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * Where the map opens (MS1, MS3).
 * @param {{points?: unknown, reference?: unknown, near?: unknown, timeZone?: unknown}} input
 * @returns {{center: number[], zoom: number, source: 'points'|'reference'|'near'|'region'|'world'}}
 */
export function mapStart(input = {}) {
  for (const source of ['points', 'reference']) {
    const list = Array.isArray(input[source]) ? input[source] : [];
    const first = list.map(lngLat).find(Boolean);
    if (first) return { center: first, zoom: 16, source };
  }
  const near = lngLat(input.near);
  if (near) return { center: near, zoom: 13, source: 'near' };
  const region = zoneRegion(input.timeZone);
  if (region) return { ...region, source: 'region' };
  return { center: [0, 20], zoom: 1, source: 'world' };
}
