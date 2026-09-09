import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCooperative,
  exampleCooperative,
  scenarioPacket,
} from '../lib/cooperative.mjs';
test('example closes both quantity and money without a platform cut', () => {
  const r = calculateCooperative(exampleCooperative());
  assert.equal(r.grossKg, 100000);
  assert.equal(r.ecologicalReserveKg, 20000);
  assert.equal(r.memberPoolCents, 112500);
  assert.equal(r.platformCutCents, 0);
  assert.ok(Object.values(r.checks).every(Boolean));
});
test('ecological reserve rounds upward for fractional kilograms', () => {
  const s = exampleCooperative();
  s.projects = s.projects.slice(0, 1);
  s.projects[0].contributionKg = 1;
  s.policy.saleKg = 0;
  const r = calculateCooperative(s);
  assert.equal(r.ecologicalReserveKg, 1);
  assert.equal(r.modeledCapacityKg, 0);
});
test('oversales are rejected rather than silently clamped', () => {
  const s = exampleCooperative();
  s.policy.saleKg = 80001;
  assert.throws(() => calculateCooperative(s), /exceeds/);
});
test('incompatible scopes and unknown members cannot enter one pool', () => {
  const s = exampleCooperative();
  s.projects[0].poolKey = 'different vintage';
  assert.throws(() => calculateCooperative(s), /scope/);
  s.projects[0].poolKey = s.poolKey;
  s.projects[0].memberId = 'unknown';
  assert.throws(() => calculateCooperative(s), /reference a member/);
});
test('invalid percentages and duplicate IDs fail closed', () => {
  const s = exampleCooperative();
  s.members[0].shareBps = 0;
  assert.throws(() => calculateCooperative(s), /100%/);
  const x = exampleCooperative();
  x.projects[0].id = x.projects[1].id;
  assert.throws(() => calculateCooperative(x), /unique/);
  x.projects[0].id = 'new';
  x.policy.stewardshipBps = 9999;
  assert.throws(() => calculateCooperative(x), /exceed 100%/);
});
test('noninteger, negative, and unsafe numeric inputs are rejected', () => {
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const s = exampleCooperative();
    s.projects[0].contributionKg = value;
    assert.throws(() => calculateCooperative(s));
  }
});
test('ties use stable IDs and allocations are invariant to input order', () => {
  const s = exampleCooperative();
  s.members = [
    { id: 'b', name: 'B', shareBps: 5000 },
    { id: 'a', name: 'A', shareBps: 5000 },
  ];
  s.projects = s.projects.slice(0, 1);
  s.projects[0].memberId = 'a';
  s.policy = {
    ecologicalReserveBps: 0,
    stewardshipBps: 0,
    treasuryBps: 0,
    saleKg: 1000,
    priceCentsPerTonne: 1,
  };
  const r = calculateCooperative(s);
  assert.deepEqual(
    r.allocations.map((m) => m.cents),
    [1, 0],
  );
  s.members.reverse();
  assert.deepEqual(calculateCooperative(s).allocations, r.allocations);
});
test('zero proceeds and full reserve remain valid without phantom payouts', () => {
  const s = exampleCooperative();
  s.policy.ecologicalReserveBps = 10000;
  s.policy.saleKg = 0;
  const r = calculateCooperative(s);
  assert.equal(r.proceedsCents, 0);
  assert.ok(r.allocations.every((m) => m.cents === 0));
});
test('a member with zero shares never receives remainder pennies', () => {
  const s = exampleCooperative();
  s.members = [
    { id: 'a', name: 'A', shareBps: 0 },
    { id: 'b', name: 'B', shareBps: 10000 },
    { id: 'c', name: 'C', shareBps: 0 },
  ];
  const r = calculateCooperative(s);
  assert.equal(r.allocations[0].cents, 0);
  assert.equal(r.allocations[1].cents, r.memberPoolCents);
});
test('draft export cannot claim execution, issuance or payment', () => {
  const p = scenarioPacket(exampleCooperative());
  assert.equal(p.authority.payout, 'NOT_PAID');
  assert.equal(p.authority.registryIssuance, 'NOT_ISSUED');
  assert.equal(p.authority.easementExecution, 'NOT_EXECUTED');
  assert.equal(p.agreements.length, 3);
  assert.ok(p.agreements.every((a) => a.recordingReference === null));
});
test('quantity conservation holds across reserve settings', () => {
  for (let bps = 0; bps <= 10000; bps += 137) {
    const s = exampleCooperative();
    s.policy.ecologicalReserveBps = bps;
    s.policy.saleKg = 0;
    const r = calculateCooperative(s);
    assert.equal(r.grossKg, r.ecologicalReserveKg + r.modeledCapacityKg);
    assert.equal(
      r.memberPoolCents,
      r.allocations.reduce((n, a) => n + a.cents, 0),
    );
  }
});
