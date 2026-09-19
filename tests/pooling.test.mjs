import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorkspace,
  applyCommand,
  memberView,
  publicWorkspace,
} from '../lib/network.mjs';
import {
  validateBoundary,
  boundaryOverlapSquareMetres,
} from '../lib/monitoring.mjs';
import {
  landPoolGeometry,
  parcelConsentIsCurrent,
  agreementIsCurrent,
  agreementCoverageSnapshot,
  projectReadiness,
  assessmentIsCurrent,
} from '../lib/readiness.mjs';

const square = (x = 0, y = 0, side = 0.001) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + side, y],
      [x + side, y + side],
      [x, y + side],
      [x, y],
    ],
  ],
});
const owner = { id: 'owner' },
  reviewer = { id: 'reviewer' },
  outsider = { id: 'outsider' };
function fixture() {
  let s = newWorkspace(
    {
      name: 'Synthetic co-op',
      region: 'Test',
      summary: 'Not real land',
      displayName: 'Owner',
    },
    owner,
    1,
    'coop',
  );
  s.members.push({
    id: 'reviewer-member',
    userId: reviewer.id,
    role: 'steward',
    status: 'active',
    name: 'Reviewer',
  });
  let sequence = 0;
  const f = {
    get s() {
      return s;
    },
    run(op, payload, actor = owner) {
      const id = `record-${++sequence}`;
      s = applyCommand(s, actor, { op, payload }, 100, id);
      return id;
    },
    land(
      projectId,
      geometry = square(),
      area = Math.round(validateBoundary(geometry).areaSquareMetres),
    ) {
      const parcelId = f.run('record_parcel', {
        projectId,
        name: `Land ${sequence}`,
        landReference: `title-${sequence}`,
        areaSquareMetres: area,
        consentReference: 'Initial intake reference',
      });
      f.run('review_parcel', { id: parcelId, decision: 'approve' }, reviewer);
      const boundaryId = f.run('save_boundary', {
        parcelId,
        geometry,
        consentReference: 'Boundary consent',
      });
      f.run(
        'review_boundary',
        { parcelId, id: boundaryId, decision: 'approve' },
        reviewer,
      );
      return parcelId;
    },
    consent(parcelId) {
      const id = f.run('record_parcel_consent', {
        parcelId,
        holder: 'Synthetic holder',
        authority: 'Synthetic authority',
        reference: 'Signed consent fixture',
        scope: 'Synthetic conservation pool',
        attested: true,
      });
      f.run(
        'review_parcel_consent',
        {
          parcelId,
          id,
          decision: 'approve',
          note: 'Independent document review fixture',
        },
        reviewer,
      );
      return id;
    },
    agreement(projectId, parcelIds, kind = 'carbon_rights') {
      const id = f.run('submit_agreement', {
        projectId,
        parcelIds,
        kind,
        jurisdiction: 'Synthetic',
        holder: 'Synthetic holder',
        notes: 'Fixture rights',
      });
      f.run(
        'review_agreement',
        { id, status: 'reviewed', note: 'Fixture review' },
        reviewer,
      );
      f.run(
        'review_agreement',
        {
          id,
          status: 'execution_recorded',
          note: 'Fixture external execution record',
          executionReference: 'Signed instrument fixture',
        },
        reviewer,
      );
      return id;
    },
  };
  const projectId = f.run('create_project', {
    name: 'Pool',
    kind: 'landscape',
    summary: 'Synthetic pool',
    region: 'Test',
  });
  return { f, projectId };
}
const assessment = (projectId) => ({
  projectId,
  program: 'Synthetic',
  methodology: 'Example v1',
  source: 'https://example.org/method',
  minimumSquareMetres: 1,
  criteria: 'Synthetic review',
  gaps: 'External verification required',
});

await test('boundary area uses metres and latitude, ignores winding, and rejects holes', () => {
  const equator = validateBoundary(square()).areaSquareMetres;
  assert.ok(Math.abs(equator - 12364.3459) < 0.01);
  const north = validateBoundary(square(0, 60)).areaSquareMetres;
  assert.ok(Math.abs(north / equator - 0.5) < 0.00002);
  const reversed = square();
  reversed.coordinates[0].reverse();
  assert.equal(validateBoundary(reversed).areaSquareMetres, equator);
  const hole = square();
  hole.coordinates.push(square(0.0002, 0.0002, 0.0001).coordinates[0]);
  assert.throws(() => validateBoundary(hole), /without holes/);
});

await test('polygon intersection handles adjacency, containment, duplicates and sub-square-metre overlaps', () => {
  assert.equal(boundaryOverlapSquareMetres(square(), square(0.001)), 0);
  assert.equal(boundaryOverlapSquareMetres(square(), square(0.001, 0.001)), 0);
  assert.equal(boundaryOverlapSquareMetres(square(), square(0.002)), 0);
  assert.ok(
    Math.abs(boundaryOverlapSquareMetres(square(), square()) - 12364.3459) <
      0.01,
  );
  assert.ok(
    Math.abs(
      boundaryOverlapSquareMetres(square(), square(0.0002, 0.0002, 0.0001)) -
        123.6435,
    ) < 0.01,
  );
  const sliver = boundaryOverlapSquareMetres(square(), square(0.001 - 1e-9));
  assert.ok(sliver > 0 && sliver < 1);
  // Bounding boxes overlap, but these two triangles share only their diagonal.
  const a = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0.001, 0],
        [0, 0.001],
        [0, 0],
      ],
    ],
  };
  const b = {
    type: 'Polygon',
    coordinates: [
      [
        [0.001, 0.001],
        [0, 0.001],
        [0.001, 0],
        [0.001, 0.001],
      ],
    ],
  };
  assert.equal(boundaryOverlapSquareMetres(a, b), 0);
});

await test('claimed area mismatch blocks assessments and correction requires independent review without changing ownership', () => {
  const { f, projectId } = fixture();
  const parcelId = f.land(projectId, square(), 1000000);
  assert.equal(landPoolGeometry(f.s, projectId).complete, false);
  assert.equal(
    landPoolGeometry(f.s, projectId).problems[0].reason,
    'declared_area_mismatch',
  );
  assert.throws(
    () => f.run('record_assessment', assessment(projectId)),
    /reconcile recorded areas/,
  );
  f.run('use_boundary_area', { parcelId }, reviewer);
  assert.equal(f.s.parcels[0].createdBy, owner.id);
  assert.equal(f.s.parcels[0].areaRevisions[0].areaSquareMetres, 1000000);
  assert.throws(
    () =>
      f.run('review_parcel', { id: parcelId, decision: 'approve' }, reviewer),
    /Another steward/,
  );
  f.run('review_parcel', { id: parcelId, decision: 'approve' });
  assert.equal(landPoolGeometry(f.s, projectId).complete, true);
  f.run('record_assessment', assessment(projectId));
  assert.ok(Math.abs(f.s.assessments[0].areaSquareMetres - 12364.3459) < 0.01);
});

await test('overlap blocks pooling across projects and withdrawal keeps an audit record', () => {
  const { f, projectId } = fixture();
  f.land(projectId);
  const id = f.run('record_assessment', assessment(projectId));
  const otherProject = f.run('create_project', {
    name: 'Other pool',
    kind: 'landscape',
    summary: 'Synthetic',
    region: 'Test',
  });
  const duplicate = f.land(otherProject);
  assert.equal(landPoolGeometry(f.s, projectId).overlaps.length, 1);
  assert.equal(assessmentIsCurrent(f.s, f.s.assessments[0]), false);
  assert.throws(
    () => f.run('review_assessment', { id, decision: 'approve' }, reviewer),
    /Land records changed/,
  );
  f.run('withdraw_parcel', { parcelId: duplicate, reason: 'Duplicate record' });
  assert.equal(f.s.parcels.length, 2);
  assert.equal(f.s.parcels[1].status, 'withdrawn');
  assert.equal(landPoolGeometry(f.s, projectId).complete, true);
  assert.throws(
    () =>
      f.run('save_boundary', {
        parcelId: duplicate,
        geometry: square(),
        consentReference: 'test',
      }),
    /withdrawn/,
  );
});

await test('parcel consent requires attestation and another steward, and never leaks in public projection', () => {
  const { f, projectId } = fixture();
  const parcelId = f.land(projectId);
  const payload = {
    parcelId,
    holder: 'Private holder',
    authority: 'Private authority',
    reference: 'Private document',
    scope: 'Private project scope',
    attested: true,
  };
  assert.throws(
    () => f.run('record_parcel_consent', { ...payload, attested: false }),
    /Confirm/,
  );
  const id = f.run('record_parcel_consent', payload);
  assert.throws(
    () =>
      f.run('review_parcel_consent', {
        parcelId,
        id,
        decision: 'approve',
        note: 'Self review',
      }),
    /Another steward/,
  );
  f.run(
    'review_parcel_consent',
    { parcelId, id, decision: 'approve', note: 'Independent review' },
    reviewer,
  );
  assert.equal(parcelConsentIsCurrent(f.s.parcels[0]), true);
  assert.equal(
    JSON.stringify(publicWorkspace(f.s)).includes('Private holder'),
    false,
  );
  assert.throws(() => memberView(f.s, outsider.id), /membership/);
  assert.throws(
    () =>
      f.run(
        'revoke_parcel_consent',
        { parcelId, id, reason: 'Unauthorized' },
        outsider,
      ),
    /membership/,
  );
  f.run('revoke_parcel_consent', {
    parcelId,
    id,
    reason: 'Holder withdrew consent',
  });
  assert.equal(parcelConsentIsCurrent(f.s.parcels[0]), false);
  assert.equal(
    f.s.parcels[0].consents[0].revocationReason,
    'Holder withdrew consent',
  );
});

await test('agreement execution requires explicit current parcels, and legacy unscoped records never satisfy rights readiness', () => {
  const { f, projectId } = fixture();
  const parcelId = f.land(projectId);
  const payload = {
    projectId,
    kind: 'carbon_rights',
    jurisdiction: 'Test',
    holder: 'Holder',
    notes: 'Test',
  };
  assert.throws(() => f.run('submit_agreement', payload), /specific parcels/);
  assert.throws(
    () => f.run('submit_agreement', { ...payload, parcelIds: [parcelId] }),
    /pooling consent/,
  );
  f.consent(parcelId);
  assert.throws(
    () =>
      f.run('submit_agreement', {
        ...payload,
        parcelIds: [parcelId, parcelId],
      }),
    /specific parcels/,
  );
  assert.throws(
    () => f.run('submit_agreement', { ...payload, parcelIds: ['elsewhere'] }),
    /specific parcels/,
  );
  f.agreement(projectId, [parcelId]);
  assert.equal(
    projectReadiness(f.s, projectId).checks.find((x) => x.id === 'rights')
      .complete,
    true,
  );
  const legacy = structuredClone(f.s);
  delete legacy.agreements[0].parcelIds;
  delete legacy.agreements[0].parcelSnapshot;
  assert.equal(agreementIsCurrent(legacy, legacy.agreements[0]), false);
  assert.equal(
    projectReadiness(legacy, projectId).checks.find((x) => x.id === 'rights')
      .complete,
    false,
  );
  assert.equal(legacy.agreements[0].status, 'execution_recorded');
  legacy.agreements[0].status = 'reviewed';
  assert.throws(
    () =>
      applyCommand(legacy, reviewer, {
        op: 'review_agreement',
        payload: {
          id: legacy.agreements[0].id,
          status: 'execution_recorded',
          note: 'Test',
          executionReference: 'Test',
        },
      }),
    /current parcel coverage/,
  );
});

await test('new boundary or consent version invalidates executed rights without erasing their receipts', () => {
  for (const change of ['boundary', 'consent', 'revoke']) {
    const { f, projectId } = fixture();
    const parcelId = f.land(projectId);
    const consentId = f.consent(parcelId);
    const id = f.agreement(projectId, [parcelId]);
    assert.equal(agreementIsCurrent(f.s, f.s.agreements[0]), true);
    if (change === 'boundary')
      f.run('save_boundary', {
        parcelId,
        geometry: square(),
        consentReference: 'New boundary version',
      });
    if (change === 'consent') f.consent(parcelId);
    if (change === 'revoke')
      f.run('revoke_agreement', { id, reason: 'Instrument ended externally' });
    const check = projectReadiness(f.s, projectId).checks.find(
      (x) => x.id === 'rights',
    );
    assert.equal(check.complete, false, change);
    assert.equal(
      f.s.agreements[0].executionReference,
      'Signed instrument fixture',
    );
    assert.equal(f.s.parcels[0].consents[0].id, consentId);
  }
});

await test('adding an uncovered parcel blocks rights and stale consent cannot be approved', () => {
  const { f, projectId } = fixture();
  const first = f.land(projectId);
  f.consent(first);
  f.agreement(projectId, [first]);
  const second = f.land(projectId, square(0.002));
  assert.equal(
    projectReadiness(f.s, projectId).checks.find((x) => x.id === 'rights')
      .complete,
    false,
  );
  const consentId = f.run('record_parcel_consent', {
    parcelId: second,
    holder: 'Holder',
    authority: 'Authority',
    reference: 'Signed consent',
    scope: 'Project scope',
    attested: true,
  });
  f.run('save_boundary', {
    parcelId: second,
    geometry: square(0.003),
    consentReference: 'Changed parcel',
  });
  assert.throws(
    () =>
      f.run(
        'review_parcel_consent',
        { parcelId: second, id: consentId, decision: 'approve', note: 'Test' },
        reviewer,
      ),
    /Land records changed/,
  );
});

await test('carbon lot entry rejects stale parcel rights and consent even with reviewed external evidence', () => {
  const { f, projectId } = fixture();
  const parcelId = f.land(projectId);
  const consentId = f.consent(parcelId);
  f.agreement(projectId, [parcelId], 'enrollment');
  f.agreement(projectId, [parcelId], 'carbon_rights');
  const evidence = f.run('submit_evidence', {
    projectId,
    title: 'Synthetic external receipt',
    method: 'Synthetic',
    period: 'Test',
    reference: 'https://example.org/evidence',
    notes: 'Test only',
  });
  f.run(
    'review_evidence',
    { id: evidence, decision: 'approve', note: 'Test' },
    reviewer,
  );
  f.run('record_authority', {
    legalName: 'Fixture',
    jurisdiction: 'Test',
    reference: 'Test',
    evidenceId: evidence,
  });
  f.run('review_authority', { decision: 'approve' }, reviewer);
  f.run('revoke_parcel_consent', {
    parcelId,
    id: consentId,
    reason: 'Withdrawn',
  });
  assert.throws(
    () => f.run('record_lot', { projectId, evidenceId: evidence }),
    /current pooling consent/,
  );
  f.consent(parcelId);
  assert.throws(
    () => f.run('record_lot', { projectId, evidenceId: evidence }),
    /participation agreement covering every current parcel/,
  );
});

await test('coverage snapshots are deterministic and refuse parcels from another project', () => {
  const { f, projectId } = fixture();
  const a = f.land(projectId),
    b = f.land(projectId, square(0.001));
  assert.deepEqual(
    agreementCoverageSnapshot(f.s, projectId, [a, b]),
    agreementCoverageSnapshot(f.s, projectId, [b, a]),
  );
  assert.equal(agreementCoverageSnapshot(f.s, 'other-project', [a]), null);
  assert.equal(landPoolGeometry(f.s, projectId).overlaps.length, 0);
});
