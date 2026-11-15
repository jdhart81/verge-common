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
//
// Corridor facts (tests in tests/woodland-corridor-facts.test.mjs). A corridor is shaped by
// three kinds of record: decisions the co-op makes (the uses above), treatments a member plans
// (lib/woodland.mjs) and facts it has to live with. Facts share this record and its machinery:
//   CF1 A fact is recorded, not decided: a right-of-way that exists on the land (a power line,
//       a road or access easement) or a blowdown that has happened. A steward records it with
//       its source, and it takes effect only after another steward reviews it. Nobody votes on
//       a fact and no holder is asked to agree to it.
//   CF2 A fact is never blocked. A right-of-way is checked against the corridor so the co-op
//       sees which links it breaks or pinches, and it is recorded either way: the map must
//       show the ground as it is.
//   CF3 A reviewed right-of-way's cleared ground is excluded from habitat in every later plan
//       check and spine analysis, like an adopted use (RC6). Its width is the width kept clear.
//   CF4 Blowdown stays habitat: fallen trees are part of an old-growth corridor, and leaving
//       them is the default. Recording one changes no check. Salvage is a treatment plan and
//       meets the corridor check like any harvest. A stand-replacing blowdown does reset the
//       stand's age, which the software cannot map for the co-op: every spine analysis warns
//       until a steward saves stand ages recorded in or after the year of the blowdown.
//   CF5 A steward ends a fact when it no longer holds (a line removed, an easement released).
//   CF6 Privacy and limits are those of a use (RC8, RC9). Without a reviewed fact or an
//       adopted use, a project stores, checks and projects exactly as before (RC1).
//
// Edge bands: agroforestry where a field meets the corridor, after J. Russell Smith's Tree
// Crops (tests in tests/woodland-edge-bands.test.mjs). The corridor itself is native forest
// evolving toward old growth and is never farmed; a band is tree crops beside it.
//   AG1 A band lies outside the corridor, on ground that is not forest today: it may not
//       overlap retained habitat or a core area, so no forest is converted to make one.
//   AG2 A band is a buffer, never corridor. It changes no check and no projection, and counts
//       toward neither the corridor's width, committed forest nor old-growth age.
//   AG3 Native tree crops only: every planted species is recorded native, with the source of
//       that status. A band that lists an introduced species is refused.
//   AG4 The holder decides. A band lies only on woodlots its proposer recorded, and takes
//       effect when a steward has reviewed its map and species. No co-op vote: no shared
//       corridor ground changes.
//   AG5 A band can grow into corridor. Nothing here does that: when its holder consents, a
//       steward adds the stand to the retained layers through the ordinary layers review, as a
//       planted stand that counts by its recorded age (a plantation never counts).
//   AG6 The holder or a steward ends a band; withdrawing its woodlot or erasing its holder's
//       account removes it. A project with no band is unchanged.
//   AG7 Privacy: a band is on one holder's land, so its map, name and species are shown to
//       stewards and its holder. Other members see that a band exists, its kind and its area.
// What this records is the co-op's decision and the holders' agreement. It does not establish
// a right of way, public access, liability cover, accessibility, trail safety or any permit.

export const RECREATION_OPS = Object.freeze([
  'propose_corridor_use',
  'agree_corridor_use',
  'open_corridor_use_vote',
  'vote_corridor_use',
  'close_corridor_use_vote',
  'end_corridor_use',
  'record_corridor_fact',
  'review_corridor_fact',
  'propose_edge_band',
]);
export const RECREATION_KINDS = Object.freeze([
  'walking-trail',
  'bike-trail',
  'ski-trail',
  'motorized-trail',
  'disc-golf',
  'maple-sugaring',
  'forest-farming',
  'other',
]);
/** Agroforestry beside the corridor (AG1-AG7). */
export const EDGE_BAND_KINDS = Object.freeze([
  'tree-crop-edge',
  'alley-cropping',
  'silvopasture',
  'windbreak',
  'riparian-buffer',
]);
/** Facts a steward records (CF1). */
export const FACT_KINDS = Object.freeze(['right-of-way', 'blowdown']);
export const BLOWDOWN_SEVERITIES = Object.freeze(['gaps', 'stand-replacing']);
export const RECREATION_KIND_LABELS = Object.freeze({
  'walking-trail': 'Walking trail',
  'bike-trail': 'Bike trail',
  'ski-trail': 'Ski or snowshoe trail',
  'motorized-trail': 'Snowmobile or ATV trail',
  'disc-golf': 'Disc golf',
  'maple-sugaring': 'Maple sugaring lines',
  'forest-farming': 'Forest farming under the standing canopy',
  other: 'Other shared use',
  'tree-crop-edge': 'Tree-crop edge',
  'alley-cropping': 'Alley cropping',
  silvopasture: 'Silvopasture',
  windbreak: 'Windbreak or hedgerow',
  'riparian-buffer': 'Planted riparian buffer',
  'right-of-way': 'Right-of-way',
  blowdown: 'Blowdown',
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
  'submitted',
  'reviewed',
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
export function cleanUseFeatures(list, { polygonsOnly = false } = {}) {
  if (!Array.isArray(list) || !list.length)
    fail(
      polygonsOnly
        ? 'Map at least one area.'
        : 'Map at least one trail line or cleared area.',
    );
  if (polygonsOnly && list.some((f) => f?.geometry?.type !== 'Polygon'))
    fail('Map a blowdown as one or more polygons.');
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
    .filter(
      (u) =>
        u.projectId === projectId &&
        // RC6 an adopted use; CF3 a reviewed right-of-way.
        (u.status === 'adopted' ||
          (u.status === 'reviewed' && u.kind === 'right-of-way')),
    )
    .flatMap((u) => u.units ?? []);
}

/**
 * CF4: reviewed stand-replacing blowdowns whose year is after the year the project's stand
 * ages were recorded, as warnings for every spine analysis.
 */
export function blowdownWarnings(s, projectId, ageAsOfYear) {
  return (s.corridorUses ?? [])
    .filter(
      (u) =>
        u.projectId === projectId &&
        u.kind === 'blowdown' &&
        u.status === 'reviewed' &&
        u.severity === 'stand-replacing' &&
        u.eventYear > ageAsOfYear,
    )
    .map(
      (u) =>
        `“${u.name}” records a stand-replacing blowdown in ${u.eventYear}, after the stand ages were recorded (${ageAsOfYear}). Stand ages there are too old until a steward saves layers with ages recorded in ${u.eventYear} or later.`,
    );
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
  const { createdBy, reviewedBy: _reviewedBy, ...rest } = use;
  const woodlots = use.woodlots ?? [];
  // AG7: a band is on one holder's land.
  if (use.basis === 'band' && !steward && createdBy !== userId)
    return {
      id: use.id,
      projectId: use.projectId,
      basis: 'band',
      kind: use.kind,
      status: use.status,
      areaM2: use.areaM2,
      hidden: true,
      name: '',
      features: [],
      woodlots: [],
      woodlotCount: woodlots.length,
      agreedCount: 0,
      holds: true,
      clearedM2: 0,
      check: null,
      mine: false,
      canAgree: false,
      canVote: false,
      canEnd: false,
      canReview: false,
    };
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
      (use.status === 'adopted' &&
        (steward || woodlots.some((w) => own.has(w.parcelId)))) ||
      (use.status === 'reviewed' && steward) ||
      // AG6: a band's holder ends it too, reviewed or not.
      (use.basis === 'band' &&
        ['submitted', 'reviewed'].includes(use.status) &&
        (steward || createdBy === userId)),
    // CF1: another steward reviews a recorded fact.
    canReview: steward && use.status === 'submitted' && createdBy !== userId,
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
    // A fact is not undone by a woodlot leaving: the line or the blowdown is still there.
    if (use.basis === 'fact') continue;
    if (use.vote?.status === 'open') {
      use.vote.status = 'withdrawn';
      use.vote.closedAt = now;
    }
    use.status = ['adopted', 'reviewed'].includes(use.status)
      ? 'ended'
      : 'withdrawn';
    use.endedAt = now;
  }
}

/**
 * AG3: a band's species list as stored. Every species is named once and recorded native.
 * Throws an Error with a status otherwise.
 */
export function cleanBandSpecies(list) {
  if (!Array.isArray(list) || !list.length || list.length > 200)
    fail('List the species planted, from 1 to 200.');
  const species = list.map((sp) => {
    const name = typeof sp?.name === 'string' ? sp.name.trim().slice(0, 300) : '';
    if (!name) fail('Name every species.');
    if (sp.native !== true)
      fail(
        `An edge band is native tree crops only: ${name} is not recorded as native here.`,
      );
    return { name, native: true };
  });
  if (new Set(species.map((sp) => sp.name.toLowerCase())).size !== species.length)
    fail('List each species once.');
  return species;
}

/**
 * A shape drawn on the corridor map as the feature the commands take: a trail line with its
 * cleared width, or a closed area. Null until it has enough points (2 for a line, 3 for an area).
 */
export function drawnFeature(shape, points, width) {
  if (shape === 'line')
    return points.length < 2
      ? null
      : {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: points },
          properties: { cleared_width_m: width },
        };
  return points.length < 3
    ? null
    : {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] },
        properties: {},
      };
}
