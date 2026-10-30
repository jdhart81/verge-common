// Woodland (DFM) projects. Each test names the invariant in lib/woodland.mjs it checks.
import { newWorkspace, applyCommand } from '../lib/network.mjs';

const owner = { id: 'owner' },
  reviewer = { id: 'reviewer' },
  member = { id: 'member' };
// Fictional geometry at the equator in local meters (Turf sphere: 111,195.08 m per degree).
const M = 111195.0802335329;
const pt = (x, y) => [x / M, y / M];
const rect = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [[pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)]],
});
const F = (geometry, properties = {}) => ({
  type: 'Feature',
  geometry,
  properties,
});
const layers = (corridorWidth = 120) => ({
  coreAreas: [
    F(rect(100, 300, 400, 700), {
      dfm_id: 'core-A',
      core_class: 'old-growth-candidate',
    }),
    F(rect(1600, 300, 1900, 700), {
      dfm_id: 'core-B',
      core_class: 'riparian-core',
    }),
  ],
  retained: [
    F(rect(400, 500 - corridorWidth / 2, 1600, 500 + corridorWidth / 2), {
      dfm_id: 'corridor-1',
    }),
  ],
  roads: [
    F(
      { type: 'LineString', coordinates: [pt(1000, 0), pt(1000, 1000)] },
      { dfm_id: 'road-1' },
    ),
  ],
  water: [],
  crossings: [
    F(
      { type: 'Point', coordinates: pt(1000, 500) },
      { dfm_id: 'crossing-1', passage: 'verified' },
    ),
  ],
});
const params = {
  minWidthM: 100,
  minWidthSource: 'Co-op woodland policy (fixture)',
  roadWidthM: 6,
};
const cut = F(rect(700, 300, 800, 800), {
  dfm_id: 'harvest-3',
  intensity: 'clearcut',
});
const away = F(rect(1200, 750, 1500, 950), {
  dfm_id: 'harvest-1',
  intensity: 'shelterwood',
});

function setup() {
  let s = newWorkspace(
    {
      name: 'Woodland co-op',
      region: 'Synthetic',
      summary: 'Synthetic test only',
      displayName: 'Founding steward',
    },
    owner,
    1,
    'coop',
  );
  let n = 1;
  const f = {
    get s() {
      return s;
    },
    run(op, payload = {}, actor = owner, now = 100) {
      const id = `record-${n++}`;
      s = applyCommand(s, actor, { op, payload }, now, id);
      return id;
    },
  };
  f.run('update_coop', {
    name: s.name,
    region: s.region,
    summary: s.summary,
    visibility: 'public',
  });
  const r = f.run('request_membership', { name: 'Review steward' }, reviewer);
  f.run('member_status', { id: r, status: 'active' });
  f.run('member_role', { id: r, role: 'steward' });
  const m = f.run('request_membership', { name: 'Member' }, member);
  f.run('member_status', { id: m, status: 'active' });
  f.project = f.run('create_project', {
    name: 'North woodlot',
    summary: 'Keep old-growth candidates linked.',
    region: 'Synthetic',
    kind: 'woodland',
  });
  return f;
}
function reviewedLayers(f, corridorWidth) {
  const id = f.run('save_woodland_layers', {
    projectId: f.project,
    layers: layers(corridorWidth),
    params,
    notes: 'Fixture',
  });
  f.run(
    'review_woodland_layers',
    { id, decision: 'approve', note: 'Checked against field map' },
    reviewer,
  );
  return id;
}
const plan = (f, treatments, actor = member) =>
  f.run(
    'submit_treatment_plan',
    {
      projectId: f.project,
      name: 'Winter 2027 harvest',
      period: '2027',
      treatments,
    },
    actor,
  );
const byId = (f, id) => f.s.treatmentPlans.find((p) => p.id === id);

export {
  setup,
  reviewedLayers,
  layers,
  params,
  cut,
  away,
  plan,
  byId,
  owner,
  reviewer,
  member,
  pt,
  rect,
  F,
};
