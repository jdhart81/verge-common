// Corridor progress: how far a woodland co-op has come toward its one aim, a branching
// old-growth corridor along streams, valleys and ridges, joined woodlot by woodlot. Each
// woodlot is a node: it connects when its holder records it, its boundary is reviewed and the
// holder's consent is reviewed. This module reads records and stores nothing. Server and test
// side only (it uses Turf); the browser renders what memberView attaches.
//
// Invariants (tests in tests/woodland-progress.test.mjs):
//   CP1 Read-only and engine-free. Progress is derived from the current reviewed layers, the
//       parcels of the project, their latest boundary and their latest consent. It writes
//       nothing, runs no analysis, and a project without woodland records gets no entry.
//   CP2 Privacy, as WS8. A steward gets a row for every woodlot. Any other member gets rows
//       only for woodlots they recorded; of the rest they learn four counts and nothing else:
//       no id, name, place or geometry of a neighbour's woodlot.
//   CP3 Joined means exactly what the engine counts as committed: the same test as
//       consentParcels (reviewed parcel, reviewed latest boundary, current reviewed consent).
//   CP4 "On the corridor" is a statement about the maps only: the woodlot's reviewed boundary
//       touches a retained corridor or core area of the current reviewed layers. It is not a
//       claim about habitat, species movement, regulatory compliance or old-growth condition.
//   CP5 One next step. The stages are ordered (map, branches, woodlots, joining, whole) and the
//       result names the first one not yet reached.
//   CP6 Never in the way. Geometry that cannot be tested gives onCorridor null for that
//       woodlot; it never throws into the member view.
import { booleanIntersects } from '@turf/boolean-intersects';
import { parcelConsentIsCurrent } from './readiness.mjs';

export const PROGRESS_STAGES = Object.freeze([
  'map',
  'branches',
  'woodlots',
  'joining',
  'whole',
]);

function bbox(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const walk = (c) => {
    if (typeof c?.[0] === 'number') {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry?.coordinates);
  return [minX, minY, maxX, maxY];
}
const overlap = (a, b) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Whether a boundary touches any retained corridor or core area (CP4, CP6). */
function touchesCorridor(geometry, habitat) {
  try {
    const box = bbox(geometry);
    if (!Number.isFinite(box[0])) return null;
    return habitat.some(
      (h) => overlap(box, h.box) && booleanIntersects(geometry, h.geometry),
    );
  } catch {
    return null;
  }
}

/** The branching pattern recorded in a reviewed layers version, as counts. */
export function spinePattern(layers) {
  const kinds = { ridge: 0, valley: 0, saddle: 0 };
  for (const f of layers?.connectors ?? [])
    if (f?.properties?.kind in kinds) kinds[f.properties.kind] += 1;
  const orders = (layers?.streams ?? [])
    .map((f) => Number(f?.properties?.stream_order))
    .filter((n) => Number.isInteger(n) && n > 0);
  return {
    coreAreas: layers?.coreAreas?.length ?? 0,
    retained: layers?.retained?.length ?? 0,
    streams: layers?.streams?.length ?? 0,
    maxStreamOrder: orders.length ? Math.max(...orders) : 0,
    ...kinds,
  };
}

/**
 * Progress for one woodland project as one viewer may see it (CP2).
 * @returns {object|null} null when the project is not a woodland project
 */
export function corridorProgress(s, projectId, { userId, steward }) {
  const project = (s.projects ?? []).find((p) => p.id === projectId);
  if (!project || project.kind !== 'woodland') return null;
  const versions = (s.woodlandLayers ?? []).filter(
    (v) => v.projectId === projectId,
  );
  const current = [...versions].reverse().find((v) => v.status === 'reviewed');
  const layers = current?.layers;
  const habitat = [...(layers?.retained ?? []), ...(layers?.coreAreas ?? [])]
    .filter((f) => f?.geometry)
    .map((f) => ({ geometry: f.geometry, box: bbox(f.geometry) }));
  const pattern = spinePattern(layers);
  const all = (s.parcels ?? [])
    .filter((p) => p.projectId === projectId && p.status !== 'withdrawn')
    .map((parcel) => {
      const boundary = parcel.boundaries?.at(-1);
      const reviewed = boundary?.status === 'reviewed';
      return {
        mine: parcel.createdBy === userId,
        row: {
          parcelId: parcel.id,
          name: parcel.name ?? '',
          boundary: reviewed ? 'reviewed' : boundary ? 'submitted' : 'none',
          onCorridor:
            reviewed && current
              ? touchesCorridor(boundary.geometry, habitat)
              : null,
          joined: parcelConsentIsCurrent(parcel),
        },
      };
    });
  const mapped = all.filter((x) => x.row.boundary === 'reviewed');
  const counts = {
    woodlots: mapped.length,
    joined: mapped.filter((x) => x.row.joined).length,
    onCorridor: mapped.filter((x) => x.row.onCorridor).length,
    onCorridorJoined: mapped.filter((x) => x.row.onCorridor && x.row.joined)
      .length,
  };
  const reached = {
    map: !!current,
    branches: !!current && pattern.streams + pattern.ridge + pattern.valley + pattern.saddle > 0,
    woodlots: counts.woodlots > 0,
    joining: counts.joined > 0,
    whole: counts.onCorridor > 0 && counts.onCorridorJoined === counts.onCorridor,
  };
  return {
    projectId,
    layers: current ? 'reviewed' : versions.length ? 'submitted' : 'none',
    pattern,
    ...counts,
    reached,
    // CP5: stages are cumulative, so the next step is the first one not reached.
    next: PROGRESS_STAGES.find((stage) => !reached[stage]) ?? null,
    rows: all.filter((x) => steward || x.mine).map((x) => x.row),
  };
}

/** Progress for every woodland project, keyed by project id; undefined when there is none. */
export function corridorProgressByProject(s, viewer) {
  const out = {};
  for (const p of s.projects ?? []) {
    if (p.kind !== 'woodland') continue;
    const progress = corridorProgress(s, p.id, viewer);
    if (progress) out[p.id] = progress;
  }
  return Object.keys(out).length ? out : undefined;
}
