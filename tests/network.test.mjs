import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorkspace,
  applyCommand,
  memberView,
  publicWorkspace,
  allocateCents,
} from '../lib/network.mjs';
const owner = { id: 'owner' },
  reviewer = { id: 'reviewer' },
  stranger = { id: 'stranger' };
function setup() {
  let s = newWorkspace(
    {
      name: 'Test conservation co-op',
      region: 'Test region',
      summary: 'Synthetic test only',
      displayName: 'Founding steward',
    },
    owner,
    1,
    'coop',
  );
  let n = 1;
  return {
    get s() {
      return s;
    },
    run(op, payload = {}, actor = owner, now = 100) {
      const id = `record-${n++}`;
      s = applyCommand(s, actor, { op, payload }, now, id);
      return id;
    },
  };
}
function twoStewards() {
  const f = setup();
  f.run('update_coop', {
    name: f.s.name,
    region: f.s.region,
    summary: f.s.summary,
    visibility: 'public',
  });
  const memberId = f.run(
    'request_membership',
    { name: 'Review steward' },
    reviewer,
  );
  f.run('member_status', { id: memberId, status: 'active' });
  f.run('member_role', { id: memberId, role: 'steward' });
  return f;
}
function prepared() {
  const f = twoStewards();
  const project = f.run('create_project', {
    name: 'Test EcoHedge',
    summary: 'Test purpose',
    region: 'Test area',
    kind: 'ecohedge',
  });
  const evidence = f.run('submit_evidence', {
    projectId: project,
    title: 'External record fixture',
    method: 'Test method',
    period: '2030',
    reference: 'https://example.org/test-receipt',
    notes: 'Synthetic evidence for automated tests',
  });
  f.run(
    'review_evidence',
    { id: evidence, decision: 'approve', note: 'Test review' },
    reviewer,
  );
  f.run('record_authority', {
    legalName: 'Fixture entity',
    jurisdiction: 'Test only',
    reference: 'fixture-formation',
    evidenceId: evidence,
  });
  f.run('review_authority', { decision: 'approve' }, reviewer);
  const parcel = f.run('record_parcel', {
    projectId: project,
    name: 'Test parcel',
    landReference: 'private-land',
    areaSquareMetres: 10000,
    consentReference: 'fixture-consent',
  });
  f.run('review_parcel', { id: parcel, decision: 'approve' }, reviewer);
  for (const kind of ['enrollment', 'carbon_rights']) {
    const id = f.run('submit_agreement', {
      projectId: project,
      kind,
      jurisdiction: 'Test',
      holder: 'Test counterparty',
      notes: 'Test rights',
    });
    f.run(
      'review_agreement',
      { id, status: 'reviewed', note: 'Test reviewed' },
      reviewer,
    );
    f.run(
      'review_agreement',
      {
        id,
        status: 'execution_recorded',
        note: 'Fixture only',
        executionReference: `execution-${kind}`,
      },
      reviewer,
    );
  }
  return { f, project, evidence };
}
test('private workspace requires membership and starts without invented data', () => {
  const f = setup();
  assert.equal(f.s.visibility, 'private');
  assert.equal(f.s.projects.length, 0);
  assert.throws(() => memberView(f.s, stranger.id), /membership/);
  assert.throws(
    () => f.run('request_membership', { name: 'Stranger' }, stranger),
    /not accepting/,
  );
});
test('membership requests cannot self-approve or escalate roles', () => {
  const f = setup();
  f.run('update_coop', {
    name: 'Co-op',
    region: 'Region',
    summary: 'Summary',
    visibility: 'public',
  });
  const id = f.run('request_membership', { name: 'Applicant' }, reviewer);
  assert.throws(
    () => f.run('member_status', { id, status: 'active' }, reviewer),
    /membership/,
  );
  f.run('member_status', { id, status: 'active' });
  assert.throws(
    () => f.run('member_role', { id, role: 'steward' }, reviewer),
    /founding/,
  );
});
test('public projection exposes only opted-in projects and updates', () => {
  const { f, project, evidence } = prepared();
  f.run('post_update', {
    projectId: project,
    text: 'Private note',
    visibility: 'members',
  });
  f.run('post_update', {
    projectId: project,
    text: 'Public update',
    visibility: 'public',
  });
  assert.equal(publicWorkspace(f.s).updates.length, 0);
  f.run('project_status', {
    id: project,
    status: 'active',
    visibility: 'public',
  });
  const p = publicWorkspace(f.s);
  assert.equal(p.updates.length, 1);
  assert.ok(!JSON.stringify(p).includes('private-land'));
  assert.ok(!JSON.stringify(p).includes(evidence));
  assert.ok(!JSON.stringify(p).includes('owner'));
  assert.equal(p.projects.length, 1);
});
test('evidence and agreements require an independent reviewer', () => {
  const f = twoStewards();
  const project = f.run('create_project', {
    name: 'P',
    summary: 'S',
    region: 'R',
    kind: 'landscape',
  });
  const e = f.run('submit_evidence', {
    projectId: project,
    title: 'E',
    method: 'M',
    period: 'Y',
    reference: 'https://example.org/e',
    notes: 'N',
  });
  assert.throws(
    () => f.run('review_evidence', { id: e, decision: 'approve', note: 'N' }),
    /Another steward/,
  );
  f.run('review_evidence', { id: e, decision: 'approve', note: 'N' }, reviewer);
  assert.throws(
    () =>
      f.run(
        'review_evidence',
        { id: e, decision: 'reject', note: 'N' },
        reviewer,
      ),
    /already/,
  );
});
test('unreviewed legal and land records block issued holding records', () => {
  const f = twoStewards();
  const project = f.run('create_project', {
    name: 'P',
    summary: 'S',
    region: 'R',
    kind: 'ecohedge',
  });
  assert.throws(
    () => f.run('record_lot', { projectId: project }),
    /legal authority/,
  );
});
test('governance freezes electorate and prevents early or duplicate tally', () => {
  const f = twoStewards();
  const members = f.s.members;
  const p = f.run('propose_charter', {
    title: 'Policy',
    text: 'Test policy',
    shares: members.map((m) => ({ id: m.id, shareBps: 5000 })),
    stewardshipBps: 1500,
    treasuryBps: 1000,
    days: 1,
  });
  assert.throws(() => f.run('close_proposal', { id: p }), /deadline/);
  f.run('vote', { id: p, choice: 'approve' });
  f.run('vote', { id: p, choice: 'approve' }, reviewer);
  f.run('close_proposal', { id: p });
  assert.equal(f.s.charters.length, 1);
  assert.throws(() => f.run('close_proposal', { id: p }), /already/);
  assert.throws(() => f.run('vote', { id: p, choice: 'oppose' }), /closed/);
});
test('full receipt workflow preserves cents, custody caps and reviewer separation', () => {
  const { f, project, evidence } = prepared();
  const lot = f.run('record_lot', {
    projectId: project,
    evidenceId: evidence,
    registry: 'test',
    program: 'test',
    serialPrefix: 'TEST-2030',
    serialStart: 1,
    serialEnd: 10,
    vintage: '2030',
    method: 'Test method',
    reference: 'issuance-fixture',
  });
  assert.throws(
    () => f.run('review_lot', { id: lot, decision: 'approve' }),
    /Another steward/,
  );
  f.run('review_lot', { id: lot, decision: 'approve' }, reviewer);
  assert.throws(
    () =>
      f.run('record_lot', {
        projectId: project,
        evidenceId: evidence,
        registry: 'test',
        program: 'test',
        serialPrefix: 'TEST-2030',
        serialStart: 8,
        serialEnd: 12,
        vintage: '2030',
        method: 'Test method',
        reference: 'duplicate',
      }),
    /overlaps/,
  );
  const settlement = f.run('record_settlement', {
    lotId: lot,
    units: 7,
    cents: 10001,
    reference: 'bank-fixture',
    evidenceId: evidence,
  });
  assert.throws(
    () =>
      f.run('record_settlement', {
        lotId: lot,
        units: 4,
        cents: 100,
        reference: 'other',
        evidenceId: evidence,
      }),
    /enough/,
  );
  f.run('review_settlement', { id: settlement, decision: 'approve' }, reviewer);
  const proposal = f.run('propose_charter', {
    title: 'Payout policy',
    text: 'Test policy',
    shares: f.s.members.map((m, i) => ({
      id: m.id,
      shareBps: i ? 6667 : 3333,
    })),
    stewardshipBps: 1500,
    treasuryBps: 1000,
    days: 1,
  });
  f.run('vote', { id: proposal, choice: 'approve' });
  f.run('vote', { id: proposal, choice: 'approve' }, reviewer);
  f.run('close_proposal', { id: proposal });
  const allocation = f.run('create_allocation', {
    settlementId: settlement,
    charterId: proposal,
  });
  assert.throws(
    () =>
      f.run('create_allocation', {
        settlementId: settlement,
        charterId: proposal,
      }),
    /already/,
  );
  assert.throws(
    () => f.run('approve_allocation', { id: allocation }),
    /Another steward/,
  );
  f.run('approve_allocation', { id: allocation }, reviewer);
  const a = f.s.allocations[0];
  assert.equal(
    a.amounts.members.reduce((n, m) => n + m.cents, 0) +
      a.amounts.stewardshipCents +
      a.amounts.treasuryCents,
    10001,
  );
  const memberId = a.amounts.members[0].id;
  const payment = f.run('record_payment', {
    id: allocation,
    memberId,
    reference: 'payment-fixture',
    evidenceId: evidence,
  });
  assert.throws(
    () =>
      f.run('record_payment', {
        id: allocation,
        memberId,
        reference: 'duplicate',
        evidenceId: evidence,
      }),
    /already/,
  );
  f.run(
    'review_payment',
    { id: allocation, paymentId: payment, decision: 'approve' },
    reviewer,
  );
  assert.equal(f.s.allocations[0].payments[0].status, 'reviewed');
  const retirement = f.run('record_retirement', {
    settlementId: settlement,
    units: 7,
    beneficiary: 'Test beneficiary',
    reference: 'retirement-fixture',
    evidenceId: evidence,
  });
  f.run('review_retirement', { id: retirement, decision: 'approve' }, reviewer);
  assert.throws(
    () =>
      f.run('record_retirement', {
        settlementId: settlement,
        units: 1,
        beneficiary: 'B',
        reference: 'more',
        evidenceId: evidence,
      }),
    /exceeds/,
  );
  assert.equal(f.s.audit.at(-1).action, 'review_retirement');
});
test('failed commands do not partially mutate previous state', () => {
  const f = twoStewards();
  const before = structuredClone(f.s);
  assert.throws(() =>
    f.run('propose_charter', {
      title: 'Bad',
      text: 'Bad',
      shares: [],
      days: 1,
      stewardshipBps: 0,
      treasuryBps: 0,
    }),
  );
  assert.deepEqual(f.s, before);
});
test('a regular member cannot read another member’s private land and evidence', () => {
  const { f } = prepared();
  const member = f.s.members.find((m) => m.userId === reviewer.id);
  f.run('member_role', { id: member.id, role: 'member' });
  const view = memberView(f.s, reviewer.id);
  assert.equal(view.state.parcels.length, 0);
  assert.equal(view.state.agreements.length, 0);
  assert.equal(view.state.evidence.length, 0);
  assert.ok(view.state.members.every((m) => !('userId' in m)));
});
test('archiving blocks further mutations and hides discovery via visibility', () => {
  const f = twoStewards();
  f.run('archive');
  assert.equal(f.s.visibility, 'archived');
  assert.throws(
    () =>
      f.run('create_project', {
        name: 'P',
        summary: 'S',
        region: 'R',
        kind: 'ecohedge',
      }),
    /archived/,
  );
});
test('money allocation rejects noninteger amounts and conserves every cent', () => {
  assert.throws(() =>
    allocateCents(1.2, [{ id: 'a', name: 'A', shareBps: 10000 }], 0, 0),
  );
  for (let n = 0; n < 500; n++) {
    const r = allocateCents(
      n,
      [
        { id: 'a', name: 'A', shareBps: 3333 },
        { id: 'b', name: 'B', shareBps: 6667 },
      ],
      1500,
      1000,
    );
    assert.equal(
      r.members.reduce((s, m) => s + m.cents, 0) +
        r.stewardshipCents +
        r.treasuryCents,
      n,
    );
  }
});
test('evidence links reject executable schemes and embedded credentials', () => {
  const f = twoStewards();
  const project = f.run('create_project', {
    name: 'P',
    summary: 'S',
    region: 'R',
    kind: 'ecohedge',
  });
  for (const reference of [
    'javascript:alert(1)',
    'http://example.org',
    'https://user:pass@example.org',
  ])
    assert.throws(() =>
      f.run('submit_evidence', {
        projectId: project,
        title: 'E',
        method: 'M',
        period: 'Y',
        notes: 'N',
        reference,
      }),
    );
});

test('private invitations are single-use, expiring, revocable and require approval', () => {
  const f = setup(),
    tokenHash = 'a'.repeat(64);
  const invitation = f.run('create_invitation', {
    label: 'A neighbor',
    tokenHash,
  });
  assert.equal(
    memberView(f.s, owner.id).state.invitations[0].tokenHash,
    undefined,
  );
  assert.equal(publicWorkspace(f.s).invitations, undefined);
  assert.throws(
    () =>
      f.run(
        'accept_invitation',
        { name: 'Neighbor', tokenHash: 'b'.repeat(64) },
        stranger,
      ),
    /unavailable/,
  );
  const member = f.run(
    'accept_invitation',
    { name: 'Neighbor', tokenHash },
    stranger,
  );
  assert.throws(() => memberView(f.s, stranger.id), /membership/);
  assert.throws(
    () =>
      f.run(
        'accept_invitation',
        { name: 'Second neighbor', tokenHash },
        reviewer,
      ),
    /unavailable/,
  );
  f.run('member_status', { id: member, status: 'active' });
  assert.equal(memberView(f.s, stranger.id).state.invitations.length, 0);
  assert.throws(
    () =>
      f.run(
        'create_invitation',
        { label: 'No permission', tokenHash },
        stranger,
      ),
    /steward/,
  );
  f.run('revoke_invitation', { id: invitation });
  const token2 = 'c'.repeat(64);
  f.run('create_invitation', { label: 'Expires', tokenHash: token2 });
  assert.throws(
    () =>
      f.run(
        'accept_invitation',
        { name: 'Late', tokenHash: token2 },
        reviewer,
        8 * 86400000,
      ),
    /expired/,
  );
  const revoked = f.run('create_invitation', {
    label: 'Revoked',
    tokenHash: 'd'.repeat(64),
  });
  f.run('revoke_invitation', { id: revoked });
  assert.throws(
    () =>
      f.run(
        'accept_invitation',
        { name: 'No', tokenHash: 'd'.repeat(64) },
        reviewer,
      ),
    /unavailable/,
  );
});

test('organization profile is opt-in and self-reported, with HTTPS references only', () => {
  const f = setup();
  const profile = {
    name: 'Synthetic group',
    kind: 'nonprofit',
    website: 'https://example.org',
    region: 'Test county',
    services: 'Restoration workdays',
    visibility: 'members',
  };
  f.run('update_organization', profile);
  assert.equal(publicWorkspace(f.s).organization, null);
  f.run('update_organization', { ...profile, visibility: 'public' });
  assert.equal(publicWorkspace(f.s).organization.relationship, 'self_reported');
  assert.throws(
    () =>
      f.run('update_organization', {
        ...profile,
        website: 'javascript:alert(1)',
      }),
    /HTTPS/,
  );
});

test('pooling assessments freeze reviewed parcels and require independent review', () => {
  const f = twoStewards();
  const projectId = f.run('create_project', {
    name: 'Test forest',
    summary: 'Synthetic only',
    region: 'Test',
    kind: 'landscape',
  });
  const assessment = {
    projectId,
    program: 'Example program',
    methodology: 'Example v1',
    source: 'https://example.org/method',
    minimumSquareMetres: 500,
    criteria: 'Compatibility checked by organizer, not certified',
    gaps: 'External validation needed',
  };
  assert.throws(() => f.run('record_assessment', assessment), /review/);
  const parcel = f.run('record_parcel', {
    projectId,
    name: 'Test parcel',
    landReference: 'Private boundary',
    areaSquareMetres: 1000,
    consentReference: 'Consent only for test',
  });
  f.run('review_parcel', { id: parcel, decision: 'approve' }, reviewer);
  const id = f.run('record_assessment', assessment);
  assert.equal(f.s.assessments[0].areaSquareMetres, 1000);
  assert.throws(
    () => f.run('review_assessment', { id, decision: 'approve' }),
    /Another steward/,
  );
  f.run('review_assessment', { id, decision: 'approve' }, reviewer);
  assert.equal(f.s.assessments[0].status, 'reviewed');
  assert.equal(f.s.lots.length, 0);
  assert.equal(publicWorkspace(f.s).assessments, undefined);
});
