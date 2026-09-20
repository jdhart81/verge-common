import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  applyCommand,
  memberView,
  newWorkspace,
  publicWorkspace,
} from '../lib/network.mjs';
import { landPoolGeometry, projectReadiness } from '../lib/readiness.mjs';
import { validateBoundary } from '../lib/monitoring.mjs';
import { partnerParticipationStatus } from '../lib/partner-participation.mjs';
import { allocationReconciliation } from '../lib/allocation-reconciliation.mjs';

// Offline fixture only. Every state transition below uses the production domain
// command handler; external documents, people and financial facts are fictional.
// This does not exercise HTTP, authentication, storage, browser UI or integrations.
const outputDirectory = fileURLToPath(
  new URL('../outputs/coop-simulation/', import.meta.url),
);
const start = Date.parse('2026-09-19T12:00:00Z');
const people = [
  {
    id: 'fictional-maya',
    name: 'Maya',
    role: 'steward',
    shareBps: 4000,
    parcelName: 'West meadow',
  },
  {
    id: 'fictional-theo',
    name: 'Theo',
    role: 'steward',
    shareBps: 3500,
    parcelName: 'Middle woodland',
  },
  {
    id: 'fictional-nadia',
    name: 'Nadia',
    role: 'member',
    shareBps: 2500,
    parcelName: 'East wetland edge',
  },
  {
    id: 'fictional-lena',
    name: 'Lena',
    role: 'member',
    shareBps: 0,
    representative: true,
  },
];
const [maya, theo, nadia, lena] = people;
const externalNotice =
  'FICTIONAL TEST REFERENCE. No document was signed, registry credit issued, money received, or payment sent.';
let state = newWorkspace(
  {
    name: 'FICTIONAL Three Neighbors Conservation Co-op',
    summary:
      'Offline software rehearsal with synthetic land, people and external receipts. No real conservation or financial activity.',
    region: 'Synthetic grid near zero degrees; not a real property location',
    country: 'Fictional test jurisdiction',
    currency: 'USD',
    displayName: maya.name,
  },
  maya,
  start,
  'fictional-coop',
);
let sequence = 0;
let phase = 'formation';
const commands = [];
const denialChecks = [];
const stages = [];
const transcript = [];
const memberId = (person) =>
  state.members.find((member) => member.userId === person.id).id;
const execute = (person, op, payload = {}) => {
  const id = `simulation-${String(++sequence).padStart(3, '0')}`;
  const now = start + sequence * 60000;
  state = applyCommand(state, person, { op, payload }, now, id);
  commands.push({
    id,
    phase,
    actor: person.name,
    op,
    payload,
    auditSequence: state.audit.at(-1).sequence,
  });
  return id;
};
const deny = (label, person, op, payload, expected) => {
  const before = JSON.stringify(state);
  let caught;
  try {
    applyCommand(
      state,
      person,
      { op, payload },
      start + sequence * 60000,
      'expected-denial',
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: operation unexpectedly succeeded`);
  assert.match(caught.message, expected, label);
  assert.equal(
    JSON.stringify(state),
    before,
    `${label}: rejected command mutated original state`,
  );
  denialChecks.push({
    label,
    actor: person.name,
    op,
    status: caught.status,
    message: caught.message,
    unchangedState: true,
  });
};
const checkpoint = (id, title, meaning) => {
  stages.push({
    id,
    title,
    meaning,
    commandCount: commands.length,
    readiness: projectId ? projectReadiness(state, projectId) : null,
  });
};

for (const person of people.slice(1)) {
  const tokenHash = createHash('sha256')
    .update(`fictional-invitation-${person.name}`)
    .digest('hex');
  execute(maya, 'create_invitation', {
    label: `Private fictional invitation for ${person.name}`,
    tokenHash,
  });
  execute(person, 'accept_invitation', { name: person.name, tokenHash });
  deny(
    `${person.name} cannot approve their pending membership`,
    person,
    'member_status',
    { id: memberId(person), status: 'active' },
    /membership/,
  );
  execute(maya, 'member_status', { id: memberId(person), status: 'active' });
  if (person.role === 'steward')
    execute(maya, 'member_role', { id: memberId(person), role: 'steward' });
}
assert.equal(state.visibility, 'private');
assert.equal(
  state.members.filter((member) => member.status === 'active').length,
  4,
);
const projectId = execute(maya, 'create_project', {
  name: 'FICTIONAL Connected Meadow and Woodland Reserve',
  kind: 'landscape',
  summary:
    'Three neighboring parcels managed together for habitat; carbon finance is a hypothetical external-receipt rehearsal.',
  region: 'Synthetic grid; no real cadastral claim',
});
execute(theo, 'project_status', {
  id: projectId,
  status: 'active',
  visibility: 'members',
});
const discussionId = execute(maya, 'post_update', {
  projectId,
  visibility: 'members',
  text: 'FICTIONAL REHEARSAL: Let us pool our three neighboring reserves. We keep ownership separate and use explicit parcel consent. This thread coordinates the work; structured approvals still happen in the co-op tools.',
});
transcript.push({
  phase,
  actor: maya.name,
  recordId: discussionId,
  surface: 'private project post',
  text: state.updates.at(-1).text,
});
const say = (person, text) => {
  const id = execute(person, 'post_comment', { updateId: discussionId, text });
  transcript.push({
    phase,
    actor: person.name,
    recordId: id,
    surface: 'private project comment',
    text,
  });
};
say(
  theo,
  'I accepted the private invitation. Maya approved my membership and appointed me a second steward so we can review one another’s submissions.',
);
say(
  nadia,
  'I joined as a member. I can map and consent to my own land; I cannot approve financial records or inspect a neighbor’s private land documents.',
);
checkpoint(
  'formed',
  'Four people join a private co-op',
  'Invitation redemption created pending memberships; Maya approved each one, and Theo became the second steward.',
);
deny(
  'Unprepared co-op cannot record an issued lot',
  maya,
  'record_lot',
  { projectId },
  /legal authority/,
);

phase = 'land-pooling';
const parcelIds = [];
for (const [index, person] of people.slice(0, 3).entries()) {
  const west = index * 0.003;
  const east = (index + 1) * 0.003;
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [west, 0],
        [east, 0],
        [east, 0.003],
        [west, 0.003],
        [west, 0],
      ],
    ],
  };
  const areaSquareMetres = Math.round(
    validateBoundary(geometry).areaSquareMetres,
  );
  const reviewer = person === maya ? theo : maya;
  const parcelId = execute(person, 'record_parcel', {
    projectId,
    name: `FICTIONAL ${person.parcelName}`,
    landReference: `FICTIONAL-title-${person.name}`,
    areaSquareMetres,
    consentReference: `FICTIONAL-intake-${person.name}`,
    notes: externalNotice,
  });
  parcelIds.push(parcelId);
  if (person === maya)
    deny(
      'Parcel author cannot approve their own parcel',
      person,
      'review_parcel',
      { id: parcelId, decision: 'approve' },
      /Another steward/,
    );
  execute(reviewer, 'review_parcel', { id: parcelId, decision: 'approve' });
  const boundaryId = execute(person, 'save_boundary', {
    parcelId,
    geometry,
    consentReference: `FICTIONAL-boundary-consent-${person.name}`,
    externalSearchAllowed: false,
  });
  execute(reviewer, 'review_boundary', {
    parcelId,
    id: boundaryId,
    decision: 'approve',
  });
  const consentId = execute(person, 'record_parcel_consent', {
    parcelId,
    holder: `FICTIONAL ${person.name}`,
    authority:
      'FICTIONAL title holder authorization; no real authority attested',
    reference: `FICTIONAL-signed-pooling-consent-${person.name}`,
    scope:
      'FICTIONAL rehearsal scope: current boundary only, voluntary habitat cooperation, separate property ownership.',
    attested: true,
  });
  execute(reviewer, 'review_parcel_consent', {
    parcelId,
    id: consentId,
    decision: 'approve',
    note: 'Fictional separate-account review of synthetic consent fixture.',
  });
  say(
    person,
    `My ${person.parcelName.toLowerCase()} has a private boundary of about ${(areaSquareMetres / 10000).toFixed(3)} hectares. ${reviewer.name} reviewed the boundary and my parcel-specific fictional pooling consent.`,
  );
}
const geometry = landPoolGeometry(state, projectId);
assert.equal(geometry.complete, true);
assert.equal(geometry.overlaps.length, 0);
assert.equal(memberView(state, nadia.id).state.parcels.length, 1);
assert.equal(memberView(state, lena.id).state.parcels.length, 0);
checkpoint(
  'pooled',
  'Three adjacent boundaries form one planning pool',
  'The software checks boundary-derived area, current consent and overlap within this co-op. Ownership is not transferred.',
);

const evidence = (
  person,
  title,
  suffix,
  reviewer = person === maya ? theo : maya,
) => {
  const id = execute(person, 'submit_evidence', {
    projectId,
    title: `FICTIONAL ${title}`,
    method:
      'Offline software rehearsal; not a field, legal, registry or bank verification',
    period: 'FICTIONAL multi-year scenario, compressed for demonstration',
    reference: `https://example.invalid/vergecommon-simulation/${suffix}`,
    notes: externalNotice,
  });
  execute(reviewer, 'review_evidence', {
    id,
    decision: 'approve',
    note: 'Only the fictional test record was reviewed. No external fact was verified.',
  });
  return id;
};

phase = 'conservation-partner';
const partnerEvidenceId = evidence(
  maya,
  'partner agreement',
  'partner-agreement',
);
const partnerId = execute(maya, 'record_partnership', {
  projectId,
  name: 'FICTIONAL Brook and Canopy Conservation Trust',
  website: 'https://example.invalid/fictional-conservation-trust',
  role: 'Fictional habitat planning, stewardship guidance and external legal-review coordination',
  agreementReference: 'FICTIONAL-partner-agreement-001',
  evidenceId: partnerEvidenceId,
});
execute(theo, 'review_partnership', { id: partnerId, decision: 'approve' });
const representativeInvitationId = execute(
  maya,
  'invite_partner_representative',
  { id: partnerId, memberId: memberId(lena) },
);
deny(
  'Another member cannot accept Lena’s representative invitation',
  nadia,
  'respond_partner_invitation',
  {
    id: partnerId,
    invitationId: representativeInvitationId,
    decision: 'accept',
  },
  /invited member/,
);
execute(lena, 'respond_partner_invitation', {
  id: partnerId,
  invitationId: representativeInvitationId,
  decision: 'accept',
  roleTitle: 'Fictional conservation coordinator',
  authorityReference:
    'FICTIONAL-board-authorization-Lena; not an actual nonprofit appointment',
});
const authorityEvidenceId = evidence(
  lena,
  'representative authority letter',
  'lena-authorization',
);
execute(theo, 'review_partner_representative', {
  id: partnerId,
  invitationId: representativeInvitationId,
  decision: 'approve',
  evidenceId: authorityEvidenceId,
  note: 'Independent fictional co-op review; this does not establish real nonprofit status.',
});
assert.equal(
  partnerParticipationStatus(
    state,
    state.partnerships[0],
    start + sequence * 60000,
  ),
  'reviewed',
);
assert.equal(
  state.members.find((member) => member.userId === lena.id).role,
  'member',
);
say(
  lena,
  'I accepted the named partner role and submitted my fictional authorization letter. Theo reviewed it. I am a co-op member with that role recorded; this does not give me steward powers or certify a real nonprofit.',
);
checkpoint(
  'partner',
  'A named conservation representative accepts and is reviewed',
  'Partner participation is real software behavior; the organization and authorization documents in this rehearsal are fictional.',
);

phase = 'legal-and-pathway';
const legalEvidenceId = evidence(
  maya,
  'co-op legal authority',
  'coop-formation',
);
execute(maya, 'record_authority', {
  legalName: 'FICTIONAL Three Neighbors Conservation Co-op',
  jurisdiction: 'Fictional test jurisdiction',
  reference: 'FICTIONAL-formation-and-bank-authority-001',
  evidenceId: legalEvidenceId,
});
execute(theo, 'review_authority', { decision: 'approve' });
deny(
  'Legal authority alone cannot replace land participation agreements',
  maya,
  'record_lot',
  { projectId },
  /participation agreement/,
);
for (const kind of ['enrollment', 'easement', 'carbon_rights']) {
  const id = execute(maya, 'submit_agreement', {
    projectId,
    parcelIds,
    kind,
    jurisdiction: 'Fictional test jurisdiction',
    holder:
      kind === 'easement'
        ? 'FICTIONAL Brook and Canopy Conservation Trust'
        : 'FICTIONAL Three Neighbors Conservation Co-op',
    notes: `${externalNotice} Synthetic agreement covers exactly the three reviewed, consented boundary versions.`,
    reference: `https://example.invalid/vergecommon-simulation/${kind}`,
  });
  execute(theo, 'review_agreement', {
    id,
    status: 'reviewed',
    note: 'Fictional instrument review; actual legal review is external.',
  });
  if (kind === 'easement')
    deny(
      'Easement execution requires a recording reference',
      theo,
      'review_agreement',
      {
        id,
        status: 'execution_recorded',
        note: 'Fictional record',
        executionReference: 'FICTIONAL-execution-easement',
      },
      /Enter text/,
    );
  execute(theo, 'review_agreement', {
    id,
    status: 'execution_recorded',
    note: 'Fictional external execution and recording receipt only.',
    executionReference: `FICTIONAL-execution-${kind}`,
    ...(kind === 'easement'
      ? { recordingReference: 'FICTIONAL-land-record-book-000-page-000' }
      : {}),
  });
}
const assessmentId = execute(maya, 'record_assessment', {
  projectId,
  program: 'FICTIONAL program; no real methodology or eligibility claim',
  methodology:
    'FICTIONAL rehearsal pathway v0; not a carbon quantification method',
  source: 'https://example.invalid/vergecommon-simulation/methodology',
  minimumSquareMetres: 100000,
  criteria:
    'Synthetic threshold is 10 hectares solely to exercise the screen. No carbon quantity is derived from area.',
  gaps: 'All real legal, additionality, permanence, leakage, biodiversity, monitoring, validation, verification, registry, sale and banking requirements remain external and unfulfilled.',
});
execute(theo, 'review_assessment', { id: assessmentId, decision: 'approve' });
say(
  lena,
  'The rehearsal now contains separately reviewed legal, easement and carbon-rights references for all three parcels. In a real project, qualified advisers and the relevant land-recording authority would need to perform and confirm those outside the app. Conserving land does not itself create carbon credits.',
);
checkpoint(
  'prepared',
  'Scoped legal and pathway records are assembled',
  'The records link to the exact parcel and consent versions. Test references stand in for external facts, not real legal work.',
);

phase = 'member-governance';
const charterId = execute(maya, 'propose_charter', {
  title: 'FICTIONAL cooperative proceeds policy',
  text: 'Fictional vote: 20% stewardship reserve, 10% co-op treasury, 70% member pool split Maya 40%, Theo 35%, Nadia 25%, Lena 0%. Zero platform cut. These allocations do not cause payment or establish a real legal distribution policy.',
  shares: people.map((person) => ({
    id: memberId(person),
    shareBps: person.shareBps,
  })),
  stewardshipBps: 2000,
  treasuryBps: 1000,
  days: 7,
});
deny(
  'A steward cannot close voting before the deadline or all votes',
  maya,
  'close_proposal',
  { id: charterId },
  /deadline/,
);
for (const person of people)
  execute(person, 'vote', { id: charterId, choice: 'approve' });
execute(theo, 'close_proposal', { id: charterId });
assert.equal(state.charters.length, 1);
assert.equal(
  projectReadiness(state, projectId).status,
  'records_prepared_for_external_review',
);
say(
  nadia,
  'All four members voted. The charter passed: 20% for stewardship, 10% for treasury, and 70% for landowner distributions. My share of that member pool is 25%. This is a policy record, not a payment instruction.',
);
checkpoint(
  'charter',
  'Members adopt a frozen allocation charter',
  'All four eligible members voted before early closure. The co-op now passes the software preparation checklist; real external review is still required.',
);

phase = 'external-issuance-and-sale';
const issuanceEvidenceId = evidence(
  maya,
  'external issuance receipt',
  'registry-issuance',
);
const lotPayload = {
  projectId,
  evidenceId: issuanceEvidenceId,
  registry: 'FICTIONAL registry',
  program: 'FICTIONAL demonstration program',
  serialPrefix: 'FICTIONAL-ONLY-NOT-TRADEABLE-2030',
  serialStart: 1,
  serialEnd: 100,
  vintage: '2030-FICTIONAL',
  method: 'FICTIONAL externally verified method placeholder',
  reference: 'FICTIONAL-registry-custody-receipt-001',
};
const lotId = execute(maya, 'record_lot', lotPayload);
deny(
  'Lot recorder cannot independently review their own holding',
  maya,
  'review_lot',
  { id: lotId, decision: 'approve' },
  /Another steward/,
);
execute(theo, 'review_lot', { id: lotId, decision: 'approve' });
deny(
  'Duplicate serials cannot create extra holdings',
  maya,
  'record_lot',
  { ...lotPayload, serialStart: 95, serialEnd: 105 },
  /overlaps/,
);
const settlementEvidenceId = evidence(
  maya,
  'sale and cleared bank receipt',
  'settled-sale',
);
const settlementId = execute(maya, 'record_settlement', {
  lotId,
  units: 80,
  cents: 200000,
  evidenceId: settlementEvidenceId,
  reference: 'FICTIONAL-cleared-bank-deposit-USD-2000',
});
deny(
  'Cannot allocate unreviewed sale proceeds',
  maya,
  'create_allocation',
  { settlementId, charterId },
  /settlement receipt/,
);
execute(theo, 'review_settlement', { id: settlementId, decision: 'approve' });
deny(
  'Sold units cannot exceed the recorded holding',
  maya,
  'record_settlement',
  {
    lotId,
    units: 21,
    cents: 52500,
    evidenceId: settlementEvidenceId,
    reference: 'FICTIONAL-oversale-attempt',
  },
  /enough/,
);
say(
  maya,
  'FICTIONAL external receipts now say 100 credits were issued and 80 were sold at an assumed $25 each, with $2,000 cleared. Twenty remain unsold; they are not an official registry buffer. No actual credit issuance, sale or bank transaction happened.',
);
checkpoint(
  'sale-recorded',
  'Assumed external issuance and cleared sale are recorded',
  'The app checks serial duplication, reviewed receipts and available units; it does not issue credits, find buyers, execute a sale or verify the bank.',
);

phase = 'allocation-and-payment-receipts';
const allocationId = execute(maya, 'create_allocation', {
  settlementId,
  charterId,
});
deny(
  'Allocation author cannot approve their own distribution',
  maya,
  'approve_allocation',
  { id: allocationId },
  /Another steward/,
);
execute(theo, 'approve_allocation', { id: allocationId });
deny(
  'A settlement cannot be allocated twice',
  maya,
  'create_allocation',
  { settlementId, charterId },
  /already/,
);
const amounts = state.allocations[0].amounts;
assert.deepEqual(
  [
    amounts.grossCents,
    amounts.stewardshipCents,
    amounts.treasuryCents,
    amounts.memberPoolCents,
    amounts.platformCutCents,
  ],
  [200000, 40000, 20000, 140000, 0],
);
const expectedMemberCents = { Maya: 56000, Theo: 49000, Nadia: 35000, Lena: 0 };
for (const allocation of amounts.members)
  assert.equal(allocation.cents, expectedMemberCents[allocation.name]);
say(
  theo,
  'The approved ledger reserves $400 for stewardship and $200 for treasury. The $1,400 member pool allocates $560 to Maya, $490 to Theo and $350 to Nadia. No platform fee. These are allocation records until separate payment receipts are recorded.',
);
for (const person of people.slice(0, 3)) {
  const paymentEvidenceId = evidence(
    maya,
    `${person.name} bank payment receipt`,
    `payment-${person.name.toLowerCase()}`,
  );
  const paymentId = execute(maya, 'record_payment', {
    id: allocationId,
    memberId: memberId(person),
    reference: `FICTIONAL-bank-payment-${person.name}`,
    evidenceId: paymentEvidenceId,
  });
  deny(
    `${person.name} cannot receive a duplicate payment record`,
    maya,
    'record_payment',
    {
      id: allocationId,
      memberId: memberId(person),
      reference: `FICTIONAL-duplicate-${person.name}`,
      evidenceId: paymentEvidenceId,
    },
    /already/,
  );
  execute(theo, 'review_payment', {
    id: allocationId,
    paymentId,
    decision: 'approve',
  });
  say(
    person,
    `The ledger now contains a separately reviewed FICTIONAL external payment receipt for my $${expectedMemberCents[person.name] / 100}. It is a simulation receipt, not money sent by VergeCommon.`,
  );
}
const reconciliationBeforeBudgets = allocationReconciliation(state.allocations[0]);
assert.deepEqual(reconciliationBeforeBudgets.total, {
  allocatedCents: 200000,
  reviewedReceiptCents: 140000,
  pendingReceiptCents: 0,
  remainingUnrecordedCents: 60000,
});
const budgetReceipts = [];
for (const [budget, cents, recipientLabel, purpose] of [
  ['stewardship', 40000, 'FICTIONAL Brook and Canopy Conservation Trust', 'FICTIONAL completed habitat-stewardship work'],
  ['treasury', 20000, 'FICTIONAL Three Neighbors Co-op treasury reserve', 'FICTIONAL transfer to the co-op reserve; not a conservation expense'],
]) {
  const evidenceId = evidence(maya, `${budget} external payment receipt`, `${budget}-payment`);
  const payload = {
    id: allocationId,
    budget,
    cents,
    recipientLabel,
    purpose,
    evidenceId,
    reference: `FICTIONAL-bank-${budget}-payment`,
  };
  deny(
    `A member cannot record a ${budget} disbursement`,
    nadia,
    'record_disbursement',
    payload,
    /steward/,
  );
  const disbursementId = execute(maya, 'record_disbursement', payload);
  budgetReceipts.push({ budget, disbursementId });
  deny(
    `The ${budget} receipt author cannot independently review it`,
    maya,
    'review_disbursement',
    { id: allocationId, disbursementId, decision: 'approve' },
    /Another steward/,
  );
  deny(
    `Pending ${budget} receipts prevent a one-cent overspend`,
    maya,
    'record_disbursement',
    { ...payload, cents: 1, reference: `FICTIONAL-${budget}-overspend` },
    /exceeds/,
  );
  if (budget === 'stewardship') {
    deny(
      'The stewardship payment reference cannot be reused for treasury',
      maya,
      'record_disbursement',
      { ...payload, budget: 'treasury', cents: 1 },
      /reference is already/,
    );
  }
}
const reconciliationPendingBudgets = allocationReconciliation(state.allocations[0]);
assert.deepEqual(reconciliationPendingBudgets.total, {
  allocatedCents: 200000,
  reviewedReceiptCents: 140000,
  pendingReceiptCents: 60000,
  remainingUnrecordedCents: 0,
});
assert.equal(reconciliationPendingBudgets.stewardship.reviewedReceiptCents, 0);
assert.equal(reconciliationPendingBudgets.treasury.reviewedReceiptCents, 0);
say(
  lena,
  'The FICTIONAL $400 stewardship and $200 treasury receipts are submitted but still await independent review. Allocated or pending amounts do not show that our fictional nonprofit was paid. No real payment has happened.',
);
checkpoint(
  'budget-receipts-pending',
  'Stewardship and treasury receipts await separate review',
  'The record shows $1,400 reviewed, $600 pending and no unrecorded budget. Pending amounts reserve their bucket but never count as reviewed payments.',
);
for (const { disbursementId } of budgetReceipts)
  execute(theo, 'review_disbursement', { id: allocationId, disbursementId, decision: 'approve' });
const reconciliationReviewedBudgets = allocationReconciliation(state.allocations[0]);
assert.deepEqual(reconciliationReviewedBudgets.total, {
  allocatedCents: 200000,
  reviewedReceiptCents: 200000,
  pendingReceiptCents: 0,
  remainingUnrecordedCents: 0,
});
assert.equal(reconciliationReviewedBudgets.stewardship.reviewedReceiptCents, 40000);
assert.equal(reconciliationReviewedBudgets.treasury.reviewedReceiptCents, 20000);
say(
  theo,
  'I separately reviewed the two FICTIONAL budget receipts. The ledger now reconciles $1,400 in member receipts, $400 in stewardship receipts and a $200 treasury transfer. Moving cash into treasury is not a conservation expense. These records are hypothetical; VergeCommon sent no money and verified no bank.',
);
const retirementEvidenceId = evidence(
  maya,
  'buyer retirement receipt',
  'buyer-retirement',
);
const retirementId = execute(maya, 'record_retirement', {
  settlementId,
  units: 80,
  beneficiary: 'FICTIONAL demonstration buyer',
  reference: 'FICTIONAL-registry-retirement-001',
  evidenceId: retirementEvidenceId,
});
execute(theo, 'review_retirement', { id: retirementId, decision: 'approve' });
deny(
  'A member cannot create a financial holding',
  nadia,
  'record_lot',
  lotPayload,
  /steward/,
);
assert.equal(
  state.allocations[0].payments.filter(
    (payment) => payment.status === 'reviewed',
  ).length,
  3,
);
assert.equal(
  state.allocations[0].payments.reduce(
    (sum, payment) => sum + payment.cents,
    0,
  ),
  amounts.memberPoolCents,
);
assert.equal(
  amounts.stewardshipCents + amounts.treasuryCents + amounts.memberPoolCents,
  amounts.grossCents,
);
assert.equal(publicWorkspace(state).updates.length, 0);
assert.equal(publicWorkspace(state).projects.length, 0);
assert.throws(() => memberView(state, 'fictional-outsider'), /membership/);
checkpoint(
  'receipts-recorded',
  'Member, stewardship and treasury receipts reconcile; buyer retirement is recorded',
  'All five fictional external payment receipts were independently reviewed, and all allocated cents are accounted for. No actual transfer, conservation expense or registry action took place.',
);

const result = {
  schema: 'vergecommon.coop-simulation.v1',
  classification: 'FICTIONAL_OFFLINE_DOMAIN_SIMULATION',
  generatedAt: new Date().toISOString(),
  notice: externalNotice,
  execution: {
    domain: 'lib/network.mjs applyCommand',
    httpExercised: false,
    browserExercised: false,
    productionWrites: 0,
    externalRequests: 0,
    actualCreditsIssued: 0,
    actualRevenueCents: 0,
    actualPaymentsCents: 0,
    successfulCommands: commands.length,
    expectedDenials: denialChecks.length,
    finalAuditEntries: state.audit.length,
  },
  participants: people.map((person) => ({
    name: person.name,
    memberId: memberId(person),
    role: person.role,
    representative: person.representative ?? false,
    memberPoolShareBps: person.shareBps,
  })),
  workspace: {
    id: state.id,
    name: state.name,
    visibility: state.visibility,
    projectId,
    discussionId,
  },
  land: {
    fictionalGrid: true,
    geodesicAreaSquareMetres: geometry.areaSquareMetres,
    geodesicAreaHectares: geometry.areaSquareMetres / 10000,
    overlaps: geometry.overlaps.length,
    parcels: state.parcels.map((parcel) => ({
      id: parcel.id,
      name: parcel.name,
      owner: people.find((person) => person.id === parcel.createdBy).name,
      declaredAreaSquareMetres: parcel.areaSquareMetres,
      boundary: parcel.boundaries.at(-1).geometry,
      boundaryAreaSquareMetres: parcel.boundaries.at(-1).areaSquareMetres,
      consentStatus: parcel.consents.at(-1).status,
    })),
  },
  finance: {
    currency: 'USD',
    allValuesHypothetical: true,
    creditsAssumedIssued: 100,
    creditsSold: 80,
    unitsRemainingUncommitted: 20,
    officialBufferClaim: false,
    assumedPriceCentsPerCredit: 2500,
    assumedExternalFeesCents: 0,
    feesExplanation:
      'No fee calculation exists in settlement records. Zero is a fictional arithmetic assumption, not a real quote or project-economics forecast.',
    grossSaleCents: 200000,
    recordedClearedCents: 200000,
    allocation: amounts,
    memberPayments: state.allocations[0].payments.map((payment) => ({
      member: state.members.find((member) => member.id === payment.memberId)
        .name,
      cents: payment.cents,
      status: 'fictional_external_receipt_reviewed',
      recordId: payment.id,
    })),
    retirement: { units: 80, status: 'fictional_external_receipt_reviewed' },
    stewardshipDisbursement: 'FICTIONAL_EXTERNAL_RECEIPT_REVIEWED_NOT_EXECUTED',
    treasuryDisbursement: 'FICTIONAL_EXTERNAL_RECEIPT_REVIEWED_NOT_EXECUTED',
    budgetDisbursements: state.allocations[0].disbursements.map((receipt) => ({
      budget: receipt.budget,
      recipientLabel: receipt.recipientLabel,
      cents: receipt.cents,
      status: 'fictional_external_receipt_reviewed',
      recordId: receipt.id,
    })),
    reconciliation: {
      beforeBudgetReceipts: reconciliationBeforeBudgets,
      pendingBudgetReceipts: reconciliationPendingBudgets,
      reviewedBudgetReceipts: reconciliationReviewedBudgets,
    },
  },
  finalPreparation: projectReadiness(state, projectId),
  stages,
  transcript,
  denialChecks,
  boundaries: [
    'Existing private project posts and comments coordinate the discussion. Commands here were run by an offline script, not by typing into group chat.',
    'The conversation actions build opens structured map, consent, governance and financial forms within Discussion. This offline run does not exercise that interface or turn ordinary replies into approvals.',
    'Non-stewards only receive their own parcels and evidence; the full pooled private boundary is steward-only.',
    'Conservation, easement execution, carbon eligibility, verification, issuance, sales, bank settlement and payments are external facts. Fictional references are used to exercise recordkeeping.',
    'Land area is unrelated to the assumed credit quantity in this fixture. No yield, duration, price or eligibility forecast is made.',
    'The software records a single settled cash amount and does not model a separate trade, itemized verification/registry/broker fees, or an execution-ready payout instruction.',
    'Stewardship and treasury external receipts are recorded and independently reviewed. The treasury receipt records an assumed reserve transfer, not a conservation expense. No bank transaction or nonprofit grant was executed.',
  ],
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  `${outputDirectory}result.json`,
  `${JSON.stringify(result, null, 2)}\n`,
);
await writeFile(
  `${outputDirectory}commands.json`,
  `${JSON.stringify({ classification: result.classification, notice: externalNotice, commands }, null, 2)}\n`,
);
await writeFile(
  `${outputDirectory}workspace.json`,
  `${JSON.stringify({ classification: result.classification, notice: externalNotice, state }, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ classification: result.classification, successfulCommands: commands.length, expectedDenials: denialChecks.length, areaHectares: result.land.geodesicAreaHectares, memberAmountsCents: expectedMemberCents, actualRevenueCents: 0, outputDirectory }, null, 2)}\n`,
);
