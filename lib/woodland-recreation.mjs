// Recreation along the old-growth corridor: a walking trail, a bike trail, a disc golf course
// or another shared use that a woodland co-op may adopt on a mapped stretch of its corridor.
// This module holds the engine-free parts shared by the server and the browser: the record's
// shape, cleaning, the adoption rules and what each viewer may see. Geometry (the ground a use
// clears and the woodlots it crosses) is in lib/woodland-recreation-geo.mjs.
//
// Invariants (tests in tests/woodland-recreation.test.mjs):
//   RC1 Natural is the default. A corridor has no recreation use until the co-op adopts one,
//       and a project with no adopted use stores, checks and projects exactly as before.
//   RC2 A use is a mapped proposal: trail lines, each with the width of ground cleared of trees
//       (0 when only a tread is worn under standing trees), and polygons of cleared ground
//       such as a fairway. Every member sees the whole proposal before voting on it.
//   RC3 The corridor comes first. The cleared ground is removed from retained habitat and the
//       corridor check runs on what is left, against the current reviewed layers, the co-op's
//       consents and every use already adopted. A use that loses or pinches a link between core
//       areas, or whose check is incomplete, is stored as 'blocked' and cannot be agreed, voted
//       on or adopted. There is no override vote for recreation: route it again.
//   RC4 Each holder agrees. A use needs the recorded agreement of whoever recorded each woodlot
//       it crosses. Pooling consent is not agreement to people on the land. One refusal ends
//       the proposal. A use that crosses no recorded woodlot cannot be proposed.
//   RC5 The co-op votes. Once every holder has agreed, a steward opens a vote: the electorate
//       is frozen to active members, the quorum is two thirds, and the use is adopted only with
//       approval from a majority of the electorate.
//   RC6 An adopted use counts everywhere the corridor is checked: its cleared ground is applied
//       to every later harvest-plan check and spine analysis, so it never counts as retained
//       habitat or toward old-growth age, and a plan that would break a link together with
//       the trail is blocked.
//   RC7 It can always end. A steward, or the holder of any woodlot it crosses, ends an adopted
//       use; from then on the stretch is natural corridor again. Withdrawing a woodlot, or
//       erasing the account that recorded it, ends the uses that cross it.
//   RC8 Privacy. Which woodlots a use crosses is seen by stewards and, for their own woodlots,
//       by the members who recorded them; everyone else sees how many must agree and how many
//       have. No parcel geometry is part of a use.
//   RC9 Bounded: uses per project, features per use and stored bytes are limited.
// What this records is the co-op's decision and the holders' agreement. It does not establish
// a right of way, public access, liability cover, accessibility, trail safety or any permit.

export const RECREATION_OPS = Object.freeze([
  'propose_corridor_use',
  'agree_corridor_use',
  'open_corridor_use_vote',
  'vote_corridor_use',
  'close_corridor_use_vote',
  'end_corridor_use',
]);
export const RECREATION_KINDS = Object.freeze([
  'walking-trail',
  'bike-trail',
  'disc-golf',
  'other',
]);
export const RECREATION_KIND_LABELS = Object.freeze({
  'walking-trail': 'Walking trail',
  'bike-trail': 'Bike trail',
  'disc-golf': 'Disc golf',
  other: 'Other shared use',
});
/** Who the co-op means the use for. A record of intent, not a grant of access. */
export const RECREATION_AUDIENCES = Object.freeze(['members', 'public']);
export const RECREATION_LIMITS = Object.freeze({
  usesPerProject: 20,
  featuresPerUse: 20,
  bytesPerUse: 20_000,
  maxClearedWidthM: 30,
  vertices: 500,
});
/** Statuses in which a use still occupies one of the project's places (RC9). */
export const RECREATION_LIVE = Object.freeze([
  'awaiting_agreement',
  'agreed',
  'voting',
  'adopted',
]);
/** Intensity recorded on the units a use contributes to a check (never corridor-permitted). */
export const RECREATION_INTENSITY = 'recreation-clearing';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const round7 = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
    ),
  );
const position = (c) =>
  Array.isArray(c) &&
  c.length >= 2 &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 85;

/**
 * Clean a proposal's features (RC2): trail lines with `cleared_width_m`, and polygons of
 * cleared ground. Only the geometry, a name and the cleared width are kept; coordinates are
 * rounded to 1e-7 degrees as stored. Throws an Error with a status on anything else.
 */
export function cleanUseFeatures(list) {
  if (!Array.isArray(list) || !list.length)
    fail('Map at least one trail line or cleared area.');
  if (list.length > RECREATION_LIMITS.featuresPerUse)
    fail(`Use at most ${RECREATION_LIMITS.featuresPerUse} lines and areas.`);
  const features = list.map((f, i) => {
    const label = `Feature ${i + 1}`;
    if (f?.type !== 'Feature' || !f.geometry)
      fail(`${label} must be a GeoJSON Feature.`);
    const { type, coordinates } = f.geometry;
    const name =
      typeof f.properties?.name === 'string'
        ? f.properties.name.trim().slice(0, 120)
        : '';
    if (type === 'LineString') {
      if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        coordinates.length > RECREATION_LIMITS.vertices ||
        !coordinates.every(position)
      )
        fail(
          `${label}: a trail is a line of 2 to ${RECREATION_LIMITS.vertices} WGS84 longitude, latitude points.`,
        );
      const width = f.properties?.cleared_width_m;
      if (
        !Number.isFinite(width) ||
        width < 0 ||
        width > RECREATION_LIMITS.maxClearedWidthM
      )
        fail(
          `${label}: record the width cleared of trees in metres, from 0 (a tread under standing trees) to ${RECREATION_LIMITS.maxClearedWidthM}.`,
        );
      return {
        type: 'Feature',
        geometry: { type, coordinates: coordinates.map((c) => [c[0], c[1]]) },
        properties: { ...(name ? { name } : {}), cleared_width_m: width },
      };
    }
    if (type === 'Polygon') {
      const ring = coordinates?.[0];
      if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 1 ||
        !Array.isArray(ring) ||
        ring.length < 4 ||
        ring.length > RECREATION_LIMITS.vertices ||
        !ring.every(position) ||
        ring[0][0] !== ring.at(-1)[0] ||
        ring[0][1] !== ring.at(-1)[1]
      )
        fail(
          `${label}: a cleared area is one closed ring of WGS84 longitude, latitude points, without holes.`,
        );
      return {
        type: 'Feature',
        geometry: { type, coordinates: [ring.map((c) => [c[0], c[1]])] },
        properties: name ? { name } : {},
      };
    }
    return fail(`${label}: use a line for a trail or a polygon for cleared ground.`);
  });
  const stored = round7(features);
  if (
    new TextEncoder().encode(JSON.stringify(stored)).length >
    RECREATION_LIMITS.bytesPerUse
  )
    fail('Simplify the route: fewer points or features.', 413);
  return stored;
}

/** Does the corridor hold with this ground cleared (RC3)? Only a completed check can say yes. */
export function corridorHolds(check) {
  return (
    !!check &&
    (check.status === 'pass' || check.status === 'fail') &&
    Array.isArray(check.lostLinks) &&
    check.lostLinks.length === 0 &&
    Array.isArray(check.pinchedLinks) &&
    check.pinchedLinks.length === 0
  );
}

/** The units every adopted use in a project contributes to checks and analyses (RC6). */
export function adoptedUseUnits(s, projectId) {
  return (s.corridorUses ?? [])
    .filter((u) => u.projectId === projectId && u.status === 'adopted')
    .flatMap((u) => u.units ?? []);
}

/** Close a vote by the co-op's rule (RC5): quorum, and a majority of the whole electorate. */
export function closeUseVote(use, now) {
  const v = use.vote;
  const approvals = v.votes.filter((x) => x.choice === 'approve').length;
  const passed =
    v.votes.length >= v.quorum && approvals > v.electorate.length / 2;
  v.status = passed ? 'adopted' : 'not_adopted';
  v.closedAt = now;
  use.status = passed ? 'adopted' : 'not_adopted';
  if (passed) use.adoptedAt = now;
}

/**
 * What one viewer may see of a use (RC8). Stewards see every woodlot it crosses; any other
 * member sees the woodlots they recorded, and counts.
 */
export function useForViewer(use, { steward, userId, memberId, parcels = [] }) {
  const own = new Set(
    parcels.filter((p) => p.createdBy === userId).map((p) => p.id),
  );
  const { createdBy, ...rest } = use;
  const woodlots = use.woodlots ?? [];
  return {
    ...rest,
    mine: createdBy === userId,
    woodlots: woodlots.filter((w) => steward || own.has(w.parcelId)),
    woodlotCount: woodlots.length,
    agreedCount: woodlots.filter((w) => w.agreedAt).length,
    canAgree:
      use.status === 'awaiting_agreement' &&
      woodlots.some((w) => own.has(w.parcelId) && !w.agreedAt),
    canVote:
      use.status === 'voting' &&
      !!memberId &&
      (use.vote?.electorate ?? []).includes(memberId),
    canEnd:
      use.status === 'adopted' &&
      (steward || woodlots.some((w) => own.has(w.parcelId))),
  };
}

/**
 * RC7: end every use in progress or adopted that crosses a woodlot that was withdrawn or
 * removed. The co-op calls this when a woodlot is withdrawn; account erasure does the same.
 */
export function endUsesCrossing(s, parcelIds, now) {
  const gone = new Set(parcelIds);
  for (const use of s.corridorUses ?? []) {
    if (
      !RECREATION_LIVE.includes(use.status) ||
      !use.woodlots.some((w) => gone.has(w.parcelId))
    )
      continue;
    if (use.vote?.status === 'open') {
      use.vote.status = 'withdrawn';
      use.vote.closedAt = now;
    }
    use.status = use.status === 'adopted' ? 'ended' : 'withdrawn';
    use.endedAt = now;
  }
}
