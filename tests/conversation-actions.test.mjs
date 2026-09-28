import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationActions } from '../lib/conversation-actions.mjs';
import { applyCommand, memberView, newWorkspace } from '../lib/network.mjs';

const owner = { id: 'owner' };
const reviewer = { id: 'reviewer' };
const neighbor = { id: 'neighbor' };
const representative = { id: 'representative' };
const now = Date.now();
const panels = new Set([
  'projects',
  'members',
  'parcels',
  'monitoring',
  'pooling',
  'organizations',
  'agreements',
  'authority',
  'evidence',
  'governance',
  'ledger',
]);
function fixture() {
  let state = newWorkspace(
    {
      name: 'Synthetic chat co-op',
      region: 'Test region',
      summary: 'Fictional workflow test',
      displayName: 'Founding steward',
    },
    owner,
    now,
    'coop',
  );
  let counter = 0;
  const call = (op, payload = {}, actor = owner, time = now) => {
    const id = `record-${++counter}`;
    state = applyCommand(state, actor, { op, payload }, time, id);
    return id;
  };
  call('update_coop', {
    name: state.name,
    region: state.region,
    summary: state.summary,
    visibility: 'public',
  });
  const join = (actor, role = 'member') => {
    const id = call('request_membership', { name: actor.id }, actor);
    call('member_status', { id, status: 'active' });
    if (role === 'steward') call('member_role', { id, role });
    return id;
  };
  join(reviewer, 'steward');
  join(neighbor);
  join(representative);
  const project = () =>
    call('create_project', {
      name: 'Shared place',
      region: 'Synthetic region',
      summary: 'Conservation work',
      kind: 'restoration',
    });
  const view = (actor = neighbor) => memberView(state, actor.id);
  const actions = (actor = neighbor, options = {}) => {
    const projected = view(actor);
    return conversationActions(projected.state, {
      steward: projected.role === 'steward',
      memberId: projected.memberId,
      now,
      ...options,
    });
  };
  return {
    call,
    join,
    project,
    view,
    actions,
    get state() {
      return state;
    },
  };
}
const find = (actions, id) => actions.find((action) => action.id === id);
function addParcel(f, projectId, actor = neighbor) {
  return f.call(
    'record_parcel',
    {
      projectId,
      name: 'Private parcel',
      landReference: 'PRIVATE-DEED-DO-NOT-SHOW',
      areaSquareMetres: 12364,
      consentReference: 'Private intake reference',
    },
    actor,
  );
}
function prepareLand(f, projectId, actor = neighbor) {
  const parcelId = addParcel(f, projectId, actor);
  f.call('review_parcel', { id: parcelId, decision: 'approve' }, reviewer);
  const boundaryId = f.call(
    'save_boundary',
    {
      parcelId,
      consentReference: 'Private boundary reference',
      externalSearchAllowed: false,
      geometry: {
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
      },
    },
    actor,
  );
  f.call(
    'review_boundary',
    { parcelId, id: boundaryId, decision: 'approve' },
    reviewer,
  );
  const consentId = f.call(
    'record_parcel_consent',
    {
      parcelId,
      holder: 'Synthetic holder',
      authority: 'Fictional authority',
      reference: 'Private consent reference',
      scope: 'Specified land and current boundary',
      attested: true,
    },
    actor,
  );
  f.call(
    'review_parcel_consent',
    {
      parcelId,
      id: consentId,
      decision: 'approve',
      note: 'Independently reviewed test records',
    },
    reviewer,
  );
  return { parcelId, boundaryId, consentId };
}
function partner(f, projectId) {
  const evidenceId = f.call('submit_evidence', {
    projectId,
    title: 'Partner agreement evidence',
    method: 'Document review',
    period: 'Synthetic',
    reference: 'https://example.org/evidence',
    notes: 'Test only',
  });
  f.call(
    'review_evidence',
    {
      id: evidenceId,
      decision: 'approve',
      note: 'Synthetic independent review',
    },
    reviewer,
  );
  const partnerId = f.call('record_partnership', {
    projectId,
    evidenceId,
    name: 'Synthetic trust',
    website: 'https://example.org',
    role: 'Conservation advice',
    agreementReference: 'PRIVATE-PARTNER-CONTRACT',
  });
  f.call(
    'review_partnership',
    { id: partnerId, decision: 'approve' },
    reviewer,
  );
  const invitationId = f.call('invite_partner_representative', {
    id: partnerId,
    memberId: f.view(representative).memberId,
  });
  return { partnerId, invitationId };
}
function proposal(f) {
  const shares = f.state.members
    .filter((member) => member.status === 'active')
    .map((member) => ({ id: member.id, shareBps: 2500 }));
  return f.call('propose_charter', {
    title: 'Benefit sharing',
    text: 'A fictional policy for testing',
    shares,
    stewardshipBps: 2000,
    treasuryBps: 1000,
    days: 1,
  });
}

await test('cards require active projected identity and cannot elevate a member from the role option', () => {
  const f = fixture(),
    projected = f.view();
  assert.deepEqual(conversationActions(projected.state), []);
  assert.deepEqual(
    conversationActions(projected.state, {
      memberId: f.view(owner).memberId,
      steward: true,
    }),
    [],
  );
  assert.deepEqual(
    conversationActions(f.state, { memberId: projected.memberId }),
    [],
  );
  assert.ok(
    !f
      .actions(neighbor, { steward: true })
      .some((action) => action.id.startsWith('steward-')),
  );
  const changed = structuredClone(projected.state);
  changed.members.find((member) => member.isYou).status = 'removed';
  assert.deepEqual(
    conversationActions(changed, { memberId: projected.memberId }),
    [],
  );
});

await test('starting a group offers project creation and steward invitations without invented progress', () => {
  const f = fixture();
  assert.equal(find(f.actions(), 'project').actionLabel, 'Create a project');
  assert.equal(find(f.actions(owner), 'steward-circle').panel, 'members');
  assert.equal(
    find(f.actions(owner), 'steward-governance').panel,
    'governance',
  );
  assert.ok(!f.actions().some((action) => action.panel === 'parcels'));
  f.project();
  assert.equal(find(f.actions(), 'member-land').actionLabel, 'Record a parcel');
  assert.equal(find(f.actions(), 'member-evidence').panel, 'evidence');
  assert.equal(find(f.actions(owner), 'steward-evidence').panel, 'evidence');
  assert.equal(find(f.actions(owner), 'steward-pooling').panel, 'pooling');
  assert.equal(
    find(f.actions(owner), 'steward-agreements').panel,
    'agreements',
  );
  assert.equal(find(f.actions(owner), 'steward-authority').panel, 'authority');
  assert.ok(!find(f.actions(), 'member-agreements'));
});

await test('private neighboring land does not alter a member’s suggestions or imply whole-co-op readiness', () => {
  const f = fixture(),
    projectId = f.project();
  prepareLand(f, projectId);
  const before = f.actions();
  addParcel(f, projectId, owner);
  assert.deepEqual(f.actions(), before);
  assert.equal(f.view().state.parcels.length, 1);
  assert.equal(find(before, 'member-land').status, 'Your land');
  assert.match(
    find(before, 'member-land').description,
    /do not establish readiness for the whole co-op/,
  );
  assert.ok(
    !before.some((action) =>
      ['pooling', 'authority', 'members', 'organizations'].includes(
        action.panel,
      ),
    ),
  );
  assert.equal(
    find(before, 'member-agreements').status,
    'Your agreement records',
  );
  assert.ok(!JSON.stringify(before).includes('PRIVATE-DEED'));
  assert.equal(find(f.actions(owner), 'steward-land').status, 'Needs review');
});

await test('land, map, and evidence destinations remain available through explicit consent and a boundary revision', () => {
  const f = fixture(),
    projectId = f.project();
  const { parcelId } = prepareLand(f, projectId);
  assert.equal(find(f.actions(), 'member-mapping').panel, 'monitoring');
  assert.equal(find(f.actions(), 'member-land').panel, 'parcels');
  const boundaryId = f.call(
    'save_boundary',
    {
      parcelId,
      consentReference: 'Updated boundary permission',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.002, 0],
            [0.002, 0.001],
            [0, 0.001],
            [0, 0],
          ],
        ],
      },
    },
    neighbor,
  );
  assert.equal(find(f.actions(), 'member-land').status, 'Consent review');
  assert.equal(find(f.actions(), 'member-mapping').panel, 'monitoring');
  f.call(
    'review_boundary',
    { parcelId, id: boundaryId, decision: 'approve' },
    reviewer,
  );
  assert.equal(find(f.actions(), 'member-land').status, 'Consent review');
  assert.match(
    find(f.actions(), 'member-land').description,
    /chat reply does not grant consent/,
  );
});

await test('parcel owners retain their agreement history after consent withdrawal without seeing steward legal authority', () => {
  const f = fixture(),
    projectId = f.project();
  const { parcelId, consentId } = prepareLand(f, projectId);
  const agreementId = f.call(
    'submit_agreement',
    {
      projectId,
      parcelIds: [parcelId],
      kind: 'enrollment',
      jurisdiction: 'Synthetic',
      holder: 'Synthetic holder',
      notes: 'Fictional test document',
      reference: 'https://example.org/agreement',
    },
    neighbor,
  );
  f.call(
    'revoke_parcel_consent',
    { parcelId, id: consentId, reason: 'Withdraw test consent' },
    neighbor,
  );
  assert.equal(find(f.actions(), 'member-agreements').panel, 'agreements');
  assert.equal(f.view().state.agreements[0].id, agreementId);
  assert.ok(!find(f.actions(), 'steward-authority'));
  assert.ok(!find(f.actions(representative), 'member-agreements'));
});

await test('only the named representative receives partner actions and an expired invitation cannot appear open', () => {
  const f = fixture(),
    projectId = f.project();
  const { partnerId, invitationId } = partner(f, projectId);
  assert.equal(
    find(f.actions(representative), 'member-partner').status,
    'Invitation open',
  );
  assert.ok(!find(f.actions(neighbor), 'member-partner'));
  assert.ok(
    !JSON.stringify(f.actions(representative)).includes(
      'PRIVATE-PARTNER-CONTRACT',
    ),
  );
  const expiry =
    f.view(representative).state.partnerships[0].representative.expiresAt;
  assert.equal(
    find(f.actions(representative, { now: expiry }), 'member-partner').status,
    'Your participation',
  );
  f.call(
    'respond_partner_invitation',
    {
      id: partnerId,
      invitationId,
      decision: 'accept',
      roleTitle: 'Coordinator',
      authorityReference: 'Fictional authority',
    },
    representative,
  );
  assert.equal(
    find(f.actions(representative), 'member-partner').actionLabel,
    'View your participation',
  );
  f.call(
    'end_partner_participation',
    { id: partnerId, invitationId, reason: 'Ending test participation' },
    representative,
  );
  assert.equal(
    find(f.actions(representative), 'member-partner').status,
    'Your participation',
  );
});

await test('voting cards respect frozen membership, exact deadlines, and a member’s existing vote', () => {
  const f = fixture(),
    proposalId = proposal(f);
  assert.equal(find(f.actions(), 'member-vote').actionLabel, 'Review and vote');
  f.call('vote', { id: proposalId, choice: 'approve' }, neighbor);
  assert.equal(
    find(f.actions(), 'member-vote').actionLabel,
    'Review your vote',
  );
  const late = { id: 'late-neighbor' };
  f.join(late);
  assert.ok(!find(f.actions(late), 'member-vote'));
  assert.equal(
    find(f.actions(late), 'member-governance').actionLabel,
    'View benefit sharing',
  );
  const deadline = f.state.proposals[0].closesAt;
  assert.ok(!find(f.actions(neighbor, { now: deadline }), 'member-vote'));
  assert.ok(!find(f.actions(neighbor, { now: NaN }), 'member-vote'));
  assert.ok(!find(f.actions(neighbor, { now: 0 }), 'member-vote'));
  f.call('close_proposal', { id: proposalId }, owner, deadline);
  assert.ok(!find(f.actions(), 'member-vote'));
});

await test('the first card leads to a current decision or unfinished land step without clock-tick churn', () => {
  const f = fixture();
  assert.equal(f.actions()[0].id, 'project');
  const projectId = f.project();
  assert.equal(f.actions()[0].id, 'member-land');
  const parcelId = addParcel(f, projectId);
  assert.equal(f.actions()[0].id, 'member-mapping');
  f.call('review_parcel', { id: parcelId, decision: 'approve' }, reviewer);
  partner(f, projectId);
  assert.equal(f.actions(representative)[0].id, 'member-partner');
  assert.notEqual(
    f.actions(representative, { now: 0 })[0].id,
    'member-partner',
  );
  proposal(f);
  assert.equal(f.actions()[0].id, 'member-vote');
  assert.deepEqual(
    f.actions(neighbor, { now: now + 1 }),
    f.actions(neighbor, { now: now + 1000 }),
  );
});

await test('archived and capacity-paused cards preserve reading and withdrawal without inviting growth', () => {
  const f = fixture(),
    projectId = f.project();
  prepareLand(f, projectId);
  partner(f, projectId);
  proposal(f);
  const verify = (actor, options, expectedStatus) => {
    const actions = f.actions(actor, options);
    assert.ok(actions.length > 0);
    assert.ok(actions.every((action) => action.status === expectedStatus));
    assert.ok(
      actions.every((action) => /^(View|Review) /.test(action.actionLabel)),
    );
    assert.ok(!find(actions, 'member-vote'));
    return actions;
  };
  for (const actor of [owner, neighbor, representative])
    verify(actor, { growthPaused: true }, 'Activity paused');
  assert.match(
    find(f.actions(neighbor, { growthPaused: true }), 'member-land')
      .description,
    /withdrawal remain safety actions/,
  );
  f.call('archive');
  for (const actor of [owner, neighbor, representative])
    verify(actor, {}, 'Archived');
  assert.equal(find(f.actions(), 'member-mapping').panel, 'monitoring');
  const empty = fixture();
  empty.call('archive');
  assert.equal(find(empty.actions(), 'project').actionLabel, 'View projects');
  assert.ok(!find(empty.actions(), 'member-land'));
});

await test('allocation cards depend on the member’s own row and never convert receipt records to money-sent claims', () => {
  const f = fixture();
  f.project();
  const projected = f.view(),
    ownId = projected.memberId;
  const actions = (state) =>
    conversationActions(state, { memberId: ownId, now });
  projected.state.allocations = [
    {
      status: 'approved',
      amounts: { members: [{ id: 'another-member', cents: 999999 }] },
      payments: [
        {
          memberId: 'another-member',
          status: 'reviewed',
          reference: 'PRIVATE-PAYMENT',
        },
      ],
    },
  ];
  assert.ok(!find(actions(projected.state), 'member-allocation'));
  projected.state.allocations[0].amounts.members.push({
    id: ownId,
    cents: 56000,
  });
  const before = find(actions(projected.state), 'member-allocation');
  assert.equal(before.status, 'Recorded allocation');
  projected.state.allocations[0].payments.push({
    memberId: ownId,
    status: 'reviewed',
    cents: 56000,
  });
  assert.deepEqual(find(actions(projected.state), 'member-allocation'), before);
  assert.match(before.description, /not confirmation that money arrived/);
  assert.ok(!JSON.stringify(actions(projected.state)).includes('56000'));
  assert.match(
    find(f.actions(owner), 'steward-ledger').description,
    /does not issue credits, execute sales, or send money/,
  );
});

await test('cards do not mutate the projection and have unique stable IDs and supported destinations', () => {
  const f = fixture(),
    projectId = f.project();
  prepareLand(f, projectId);
  partner(f, projectId);
  proposal(f);
  for (const actor of [owner, neighbor, representative]) {
    const projected = f.view(actor),
      before = structuredClone(projected);
    const actions = conversationActions(projected.state, {
      memberId: projected.memberId,
      steward: projected.role === 'steward',
      now,
    });
    assert.deepEqual(projected, before);
    assert.equal(
      new Set(actions.map((action) => action.id)).size,
      actions.length,
    );
    for (const action of actions) {
      assert.ok(panels.has(action.panel));
      assert.deepEqual(Object.keys(action), [
        'id',
        'title',
        'description',
        'actionLabel',
        'panel',
        'status',
      ]);
      assert.ok(
        Object.values(action).every(
          (value) => typeof value === 'string' && value.length > 0,
        ),
      );
    }
  }
});
