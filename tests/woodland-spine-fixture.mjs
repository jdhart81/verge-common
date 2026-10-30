// A woodland co-op built from the DFM watershed fixture through ordinary co-op commands:
// three stewards' worth of review, nine woodlots with reviewed boundaries, consent on three of
// them (reviewed in 2024, 2025 and 2026) and planned join years on four. Synthetic only.
import { newWorkspace, applyCommand } from '../lib/network.mjs';
import { cleanLayers } from '../lib/woodland-input.mjs';
import {
  watershed,
  withAges,
  PARCELS,
  AS_OF,
} from './dfm-watershed-fixture.mjs';
import { deriveSpine } from '@viridis/dfm-core';

export const owner = { id: 'owner' },
  reviewer = { id: 'reviewer' },
  member = { id: 'member' },
  outsider = { id: 'outsider' };
export const NOW = Date.UTC(2026, 9, 4, 12);
const at = (year, month = 5) => Date.UTC(year, month, 1, 12);

/** The fixture's spine lines, cores, roads and crossings plus its derived corridors with ages. */
export function watershedLayers() {
  const input = watershed();
  const derived = deriveSpine(input);
  if (derived.status !== 'ok') throw new Error(derived.reasons.join(' '));
  return {
    layers: {
      coreAreas: input.coreAreas,
      retained: withAges(derived.features),
      roads: input.roads,
      water: input.water,
      crossings: input.crossings,
      streams: input.streams,
      connectors: input.connectors,
    },
    params: { ...input.params },
    input,
  };
}

export function spineCoop({ consents = true, planned = true } = {}) {
  let s = newWorkspace(
    {
      name: 'Watershed co-op',
      region: 'Synthetic',
      summary: 'Synthetic test only',
      displayName: 'Founding steward',
    },
    owner,
    at(2024, 0),
    'coop',
  );
  let n = 1;
  const f = {
    get s() {
      return s;
    },
    run(op, payload = {}, actor = owner, now = NOW, id = `record-${n++}`) {
      s = applyCommand(s, actor, { op, payload }, now, id);
      return id;
    },
  };
  f.run(
    'update_coop',
    { name: s.name, region: s.region, summary: s.summary, visibility: 'public' },
    owner,
    at(2024, 0),
  );
  const r = f.run('request_membership', { name: 'Review steward' }, reviewer, at(2024, 0));
  f.run('member_status', { id: r, status: 'active' }, owner, at(2024, 0));
  f.run('member_role', { id: r, role: 'steward' }, owner, at(2024, 0));
  const m = f.run('request_membership', { name: 'Woodlot member' }, member, at(2024, 0));
  f.run('member_status', { id: m, status: 'active' }, owner, at(2024, 0));
  f.project = f.run(
    'create_project',
    {
      name: 'Watershed spine',
      summary: 'Keep the old-growth spine linked.',
      region: 'Synthetic',
      kind: 'woodland',
    },
    owner,
    at(2024, 0),
  );
  // Woodlots 4 and 5 are recorded by the member; stewards record the rest.
  for (const [parcelId, , consent, years] of PARCELS) {
    const id = /** @type {string} */ (parcelId);
    const ownerOf = ['woodlot-4', 'woodlot-5'].includes(id) ? member : owner;
    const geometry = watershed().parcels.find(
      (p) => p.properties.dfm_id === id,
    ).geometry;
    f.run(
      'record_parcel',
      {
        projectId: f.project,
        name: `Woodlot ${id.split('-')[1]}`,
        landReference: `Synthetic land ${id}`,
        areaSquareMetres: 1,
        consentReference: 'Synthetic holder statement',
      },
      ownerOf,
      at(2024, 1),
      id,
    );
    f.run('review_parcel', { id, decision: 'approve' }, reviewer, at(2024, 1));
    const b = f.run(
      'save_boundary',
      {
        parcelId: id,
        geometry,
        consentReference: 'Synthetic boundary statement',
      },
      ownerOf,
      at(2024, 2),
    );
    f.run(
      'review_boundary',
      { parcelId: id, id: b, decision: 'approve' },
      reviewer,
      at(2024, 2),
    );
    if (consents && consent === 'covered') {
      const c = f.run(
        'record_parcel_consent',
        {
          parcelId: id,
          holder: 'Synthetic holder',
          authority: 'Synthetic authority',
          reference: 'Synthetic consent',
          scope: 'Pooling this woodlot',
          attested: true,
        },
        ownerOf,
        at(years.consent_year, 2),
      );
      f.run(
        'review_parcel_consent',
        { parcelId: id, id: c, decision: 'approve', note: 'Synthetic review' },
        reviewer,
        at(years.consent_year, 3),
      );
    }
    if (planned && years.planned_year)
      f.run(
        'plan_parcel_join',
        { parcelId: id, year: years.planned_year },
        ownerOf,
        at(AS_OF, 4),
      );
  }
  return f;
}

/** Save the watershed layers as a steward and have another steward review them. */
export function reviewWatershedLayers(f, change = (x) => x) {
  const { layers, params } = watershedLayers();
  const id = f.run(
    'save_woodland_layers',
    {
      projectId: f.project,
      ...change({ layers: cleanLayers(layers), params }),
      notes: 'Synthetic',
    },
    owner,
    NOW,
  );
  f.run(
    'review_woodland_layers',
    { id, decision: 'approve', note: 'Independent synthetic review' },
    reviewer,
    NOW,
  );
  return id;
}
