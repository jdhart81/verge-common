import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingProgress } from '../lib/onboarding.mjs';
import { parcelSnapshot } from '../lib/readiness.mjs';
import { validateBoundary } from '../lib/monitoring.mjs';

function fixture() {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
        [0, 0],
      ],
    ],
  };
  const state = {
    members: [{ id: 'founder', role: 'steward', status: 'active' }],
    projects: [{ id: 'project' }],
    parcels: [
      {
        id: 'parcel',
        projectId: 'project',
        status: 'reviewed',
        areaSquareMetres: validateBoundary(geometry).areaSquareMetres,
        landReference: 'synthetic-land',
        consentReference: 'synthetic-consent',
        boundaries: [{ id: 'boundary', status: 'reviewed', geometry }],
      },
    ],
  };
  state.assessments = [
    {
      projectId: 'project',
      status: 'reviewed',
      areaMethod: 'turf-geodesic-v1',
      parcelSnapshot: parcelSnapshot(state, 'project'),
    },
  ];
  return state;
}

await test('circle progress requires two active stewards, not two members or an inactive steward', () => {
  const state = fixture();
  assert.equal(onboardingProgress(state).circle, false);
  const neighbor = { id: 'neighbor', role: 'member', status: 'active' };
  state.members.push(neighbor);
  assert.equal(onboardingProgress(state).circle, false);
  neighbor.role = 'steward';
  assert.equal(onboardingProgress(state).circle, true);
  for (const status of ['pending', 'removed']) {
    neighbor.status = status;
    assert.equal(onboardingProgress(state).circle, false);
  }
});

await test('pathway progress requires the latest reviewed assessment to match current land records', () => {
  assert.equal(onboardingProgress(fixture()).assessment, true);
  for (const change of [
    (state) => {
      state.parcels[0].consentReference = 'new-consent';
    },
    (state) => {
      state.parcels[0].boundaries.push({
        id: 'new-boundary',
        status: 'submitted',
      });
    },
    (state) => {
      state.parcels.push({
        ...state.parcels[0],
        id: 'new-parcel',
        status: 'submitted',
      });
    },
    (state) => {
      state.assessments.push({ ...state.assessments[0], status: 'submitted' });
    },
    (state) => {
      state.assessments.push({ ...state.assessments[0], status: 'rejected' });
    },
    (state) => {
      delete state.assessments[0].parcelSnapshot;
    },
    (state) => {
      state.projects = [];
    },
    (state) => {
      state.assessments = [];
    },
  ]) {
    const state = fixture();
    change(state);
    assert.equal(onboardingProgress(state).assessment, false);
  }
});
