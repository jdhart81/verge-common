// Scenario arithmetic only. This module does not issue credits or transfer money.
const DENOMINATOR = 10000n;
function integer(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error(
      `${label} must be a nonnegative whole number no greater than ${max}.`,
    );
  return BigInt(value);
}
function number(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Scenario total exceeds the supported range.');
  return Number(value);
}
function unique(items, label) {
  const ids = items.map((x) => x.id);
  if (
    ids.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(ids).size !== ids.length
  )
    throw new Error(`${label} require unique, nonempty IDs.`);
}
export function calculateCooperative(scenario) {
  const { projects, members, policy } = scenario;
  if (!Array.isArray(projects) || !projects.length)
    throw new Error('Add at least one project.');
  if (!Array.isArray(members) || !members.length)
    throw new Error('Add at least one member.');
  unique(projects, 'Projects');
  unique(members, 'Members');
  const memberIds = new Set(members.map((m) => m.id));
  const scopes = new Set(projects.map((p) => p.poolKey));
  if (scopes.size !== 1 || !projects[0].poolKey?.trim())
    throw new Error(
      'Pool only projects with the same explicit method, vintage, and program scope.',
    );
  for (const project of projects) {
    if (!memberIds.has(project.memberId))
      throw new Error('Each project must reference a member.');
    if (!['ecohedge', 'landscape'].includes(project.kind))
      throw new Error('Unsupported project type.');
  }
  const shares = members.map((m) => ({
    ...m,
    weight: integer(m.shareBps, 'Member share', 10000),
  }));
  if (shares.reduce((s, m) => s + m.weight, 0n) !== DENOMINATOR)
    throw new Error('Member shares must total exactly 100%.');
  const reserveBps = integer(
    policy.ecologicalReserveBps,
    'Ecological reserve',
    10000,
  );
  const stewardshipBps = integer(
    policy.stewardshipBps,
    'Stewardship allocation',
    10000,
  );
  const treasuryBps = integer(policy.treasuryBps, 'Treasury allocation', 10000);
  if (stewardshipBps + treasuryBps > DENOMINATOR)
    throw new Error('Stewardship and treasury allocations cannot exceed 100%.');
  const gross = projects.reduce(
    (sum, p) => sum + integer(p.contributionKg, 'Project contribution'),
    0n,
  );
  const buffer = (gross * reserveBps + DENOMINATOR - 1n) / DENOMINATOR;
  const capacity = gross - buffer;
  const sale = integer(policy.saleKg, 'Proposed sale');
  if (sale > capacity)
    throw new Error(
      'The proposed sale exceeds the modeled pool after its ecological reserve.',
    );
  const proceeds =
    (sale * integer(policy.priceCentsPerTonne, 'Price per tonne')) / 1000n;
  const stewardship = (proceeds * stewardshipBps) / DENOMINATOR;
  const treasury = (proceeds * treasuryBps) / DENOMINATOR;
  const memberPool = proceeds - stewardship - treasury;
  const ranked = shares.map((m) => ({
    id: m.id,
    name: m.name,
    cents: (memberPool * m.weight) / DENOMINATOR,
    remainder: (memberPool * m.weight) % DENOMINATOR,
  }));
  let pennies = memberPool - ranked.reduce((sum, m) => sum + m.cents, 0n);
  ranked.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const member of ranked) {
    if (pennies > 0n) {
      member.cents += 1n;
      pennies -= 1n;
    }
  }
  const allocations = ranked
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((m) => ({ id: m.id, name: m.name, cents: number(m.cents) }));
  return {
    status: 'SCENARIO_ONLY',
    grossKg: number(gross),
    ecologicalReserveKg: number(buffer),
    modeledCapacityKg: number(capacity),
    saleKg: number(sale),
    unsoldKg: number(capacity - sale),
    proceedsCents: number(proceeds),
    stewardshipCents: number(stewardship),
    treasuryCents: number(treasury),
    memberPoolCents: number(memberPool),
    platformCutCents: 0,
    allocations,
    checks: {
      quantityCloses: buffer + capacity === gross,
      cashCloses: stewardship + treasury + memberPool === proceeds,
      memberAllocationsClose:
        ranked.reduce((s, m) => s + m.cents, 0n) === memberPool,
    },
  };
}
export function exampleCooperative() {
  return {
    version: 1,
    status: 'SCENARIO_ONLY',
    name: 'Example Landscape Co-op',
    poolKey: 'ILLUSTRATIVE-METHOD / 2030 / DEMO-PROGRAM',
    members: [
      { id: 'a', name: 'EcoHedge member', shareBps: 2500 },
      { id: 'b', name: 'Woodlot member', shareBps: 3500 },
      { id: 'c', name: 'Landscape member', shareBps: 4000 },
    ],
    projects: [
      {
        id: 'hedge',
        name: 'EcoHedge corridor',
        kind: 'ecohedge',
        memberId: 'a',
        contributionKg: 10000,
        poolKey: 'ILLUSTRATIVE-METHOD / 2030 / DEMO-PROGRAM',
      },
      {
        id: 'woodlot',
        name: 'Conservation woodlot',
        kind: 'landscape',
        memberId: 'b',
        contributionKg: 30000,
        poolKey: 'ILLUSTRATIVE-METHOD / 2030 / DEMO-PROGRAM',
      },
      {
        id: 'landscape',
        name: 'Larger conservation parcel',
        kind: 'landscape',
        memberId: 'c',
        contributionKg: 60000,
        poolKey: 'ILLUSTRATIVE-METHOD / 2030 / DEMO-PROGRAM',
      },
    ],
    policy: {
      ecologicalReserveBps: 2000,
      stewardshipBps: 1500,
      treasuryBps: 1000,
      saleKg: 60000,
      priceCentsPerTonne: 2500,
    },
  };
}
export function scenarioPacket(scenario) {
  return {
    kind: 'verge-common-cooperative-draft',
    version: 1,
    scenario,
    model: calculateCooperative(scenario),
    authority: {
      easementExecution: 'NOT_EXECUTED',
      ecologicalReview: 'NOT_VERIFIED',
      registryIssuance: 'NOT_ISSUED',
      settlement: 'NO_RECEIPT',
      payout: 'NOT_PAID',
    },
    agreements: scenario.projects.map((p) => ({
      projectId: p.id,
      memberId: p.memberId,
      status: 'DRAFT_INTAKE',
      instrumentType: null,
      jurisdiction: null,
      qualifiedHolder: null,
      carbonRightsReview: null,
      counselReview: null,
      signedInstrumentReference: null,
      recordingReference: null,
      monitoringPlanReference: null,
    })),
  };
}
