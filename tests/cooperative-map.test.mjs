import test from 'node:test';
import assert from 'node:assert/strict';
import { cooperativeMap } from '../lib/cooperative-map.mjs';
import { consentLandSnapshot } from '../lib/readiness.mjs';
import { memberView, newWorkspace } from '../lib/network.mjs';

function parcel(id, west = 0, south = 0) {
  return {
    id,
    projectId: 'project',
    name: `Land ${id}`,
    status: 'reviewed',
    createdBy: id,
    areaSquareMetres: 12364,
    landReference: 'private deed',
    boundaries: [
      {
        id: `${id}-boundary`,
        status: 'reviewed',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [west + 0.001, south],
              [west + 0.001, south + 0.001],
              [west, south + 0.001],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

await test('one shared projection preserves neighboring positions and north orientation', () => {
  const left = parcel('left'),
    right = parcel('right', 0.001),
    north = parcel('north', 0, 0.001);
  const map = cooperativeMap([left, right, north], { steward: true });
  assert.deepEqual(map.parcels[0].points[1], map.parcels[1].points[0]);
  assert.deepEqual(map.parcels[0].points[2], map.parcels[1].points[3]);
  assert.ok(map.parcels[2].points[0][1] < map.parcels[0].points[0][1]);
  for (const p of map.parcels)
    for (const [x, y] of p.points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= 31.99 && x <= map.width - 31.99);
      assert.ok(y >= 31.99 && y <= map.height - 31.99);
    }
  assert.equal(map.wideExtent, false);
});

await test('current consent is explicit and becomes false when the latest boundary changes', () => {
  const p = parcel('owner');
  p.consents = [{ status: 'reviewed', landSnapshot: consentLandSnapshot(p) }];
  assert.equal(
    cooperativeMap([p], { steward: true }).parcels[0].consentCurrent,
    true,
  );
  p.boundaries.push({ ...p.boundaries[0], id: 'new-boundary' });
  assert.equal(
    cooperativeMap([p], { steward: true }).parcels[0].consentCurrent,
    false,
  );
});

await test('latest unreviewed, withdrawn and malformed boundaries never fall back to old mapped outlines', () => {
  const revised = parcel('revised'),
    withdrawn = parcel('withdrawn'),
    invalid = parcel('invalid'),
    pending = parcel('pending');
  revised.boundaries.push({ ...revised.boundaries[0], status: 'submitted' });
  withdrawn.status = 'withdrawn';
  invalid.boundaries[0].geometry.coordinates[0][0][0] = NaN;
  pending.status = 'submitted';
  const map = cooperativeMap([revised, withdrawn, invalid, pending], {
    steward: true,
  });
  assert.equal(map.parcels.length, 0);
  assert.deepEqual(
    map.omitted.map((p) => p.id),
    ['revised', 'invalid', 'pending'],
  );
  assert.equal(map.bounds, null);
});

await test('project filtering fits only its visible parcels and high-latitude extent is identified', () => {
  const near = parcel('near'),
    far = parcel('far', 10, 81);
  far.projectId = 'other';
  const filtered = cooperativeMap([near, far], {
    steward: true,
    projectId: 'project',
  });
  assert.deepEqual(
    filtered.parcels.map((p) => p.id),
    ['near'],
  );
  assert.deepEqual(filtered.bounds, [0, 0, 0.001, 0.001]);
  assert.equal(cooperativeMap([near, far], { steward: true }).wideExtent, true);
  assert.equal(cooperativeMap([far], { steward: true }).wideExtent, true);
});

await test('combined map is steward-only and existing member geometry privacy remains unchanged', () => {
  const owner = { id: 'owner' },
    neighbor = { id: 'neighbor' };
  const s = newWorkspace(
    {
      name: 'Test co-op',
      region: 'Test',
      summary: 'Synthetic',
      displayName: 'Owner',
    },
    owner,
    1,
    'coop',
  );
  s.members.push({
    id: 'neighbor-member',
    userId: neighbor.id,
    role: 'member',
    status: 'active',
    name: 'Neighbor',
  });
  s.parcels = [parcel(owner.id), parcel(neighbor.id, 0.002)];
  const member = memberView(s, neighbor.id);
  assert.deepEqual(
    member.state.parcels.map((p) => p.id),
    [neighbor.id],
  );
  const denied = cooperativeMap(s.parcels);
  assert.deepEqual(denied.parcels, []);
  assert.deepEqual(denied.omitted, []);
  assert.equal(denied.bounds, null);
  const map = cooperativeMap(memberView(s, owner.id).state.parcels, {
    steward: true,
  });
  assert.equal(map.parcels.length, 2);
  assert.equal(JSON.stringify(map).includes('private deed'), false);
});
