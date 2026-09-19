import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorkspace } from '../lib/network.mjs';
import {
  parcelSnapshot,
  assessmentIsCurrent,
  projectReadiness,
} from '../lib/readiness.mjs';
function fixture() {
  const s = newWorkspace(
    {
      name: 'Test',
      region: 'Synthetic',
      summary: 'Test only',
      displayName: 'One',
    },
    { id: 'one' },
    1,
    'c',
  );
  s.projects = [{ id: 'p' }];
  s.members.push({ userId: 'two', status: 'active' });
  s.parcels = ['a', 'b'].map((id) => ({
    id,
    projectId: 'p',
    status: 'reviewed',
    areaSquareMetres: 10000,
    consentReference: `consent-${id}`,
    boundaries: [{ id: `boundary-${id}`, status: 'reviewed' }],
  }));
  s.partnerships = [{ projectId: 'p', status: 'reviewed' }];
  s.authority = { status: 'reviewed' };
  s.charters = [{ id: 'charter' }];
  s.agreements = ['enrollment', 'carbon_rights'].map((kind) => ({
    projectId: 'p',
    kind,
    status: 'execution_recorded',
  }));
  s.assessments = [
    {
      projectId: 'p',
      status: 'reviewed',
      parcelSnapshot: parcelSnapshot(s, 'p'),
      areaSquareMetres: 20000,
      minimumSquareMetres: 10000,
    },
  ];
  return s;
}
test('prepared records remain subject to external review and never imply payment readiness', () => {
  const s = fixture();
  const r = projectReadiness(s, 'p');
  assert.equal(r.status, 'records_prepared_for_external_review');
  assert.equal(
    r.checks.every((c) => c.complete),
    true,
  );
  assert.equal(r.externalRequirements.length, 3);
  s.partnerships[0].status = 'revoked';
  assert.equal(projectReadiness(s, 'p').status, 'preparation_incomplete');
});
test('new boundary versions, changed consent and new assessments invalidate current preparation', () => {
  for (const change of [
    (s) => s.parcels[0].boundaries.push({ id: 'new', status: 'submitted' }),
    (s) => {
      s.parcels[0].consentReference = 'replacement';
    },
    (s) => {
      s.parcels[0].areaSquareMetres += 1;
    },
  ]) {
    const s = fixture();
    change(s);
    assert.equal(assessmentIsCurrent(s, s.assessments[0]), false);
    assert.equal(projectReadiness(s, 'p').status, 'preparation_incomplete');
  }
  const s = fixture();
  s.assessments.push({ ...s.assessments[0], status: 'rejected' });
  assert.equal(
    projectReadiness(s, 'p').checks.find((c) => c.id === 'assessment').complete,
    false,
  );
});
test('legacy and empty records cannot appear prepared; snapshot order is deterministic', () => {
  const s = fixture();
  const before = parcelSnapshot(s, 'p');
  s.parcels.reverse();
  assert.deepEqual(parcelSnapshot(s, 'p'), before);
  delete s.assessments[0].parcelSnapshot;
  assert.equal(assessmentIsCurrent(s, s.assessments[0]), false);
  s.parcels = [];
  assert.equal(projectReadiness(s, 'p').status, 'preparation_incomplete');
});
