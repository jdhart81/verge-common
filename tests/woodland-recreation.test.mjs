// Recreation along the old-growth corridor. Each test names the invariant it checks: RC1-RC9
// in lib/woodland-recreation.mjs. Everything runs through ordinary co-op commands on the
// synthetic watershed co-op (tests/woodland-spine-fixture.mjs): three members, nine woodlots,
// reviewed layers. Woodlots 4 and 5 were recorded by the member; stewards recorded the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkConnectivitySync, canonicalHashSync } from '@viridis/dfm-core';
import { memberView } from '../lib/network.mjs';
import { WOODLAND_OPS } from '../lib/woodland.mjs';
import { planCheckInput, consentParcels } from '../lib/woodland-input.mjs';
import { spineAnalysisInput } from '../lib/woodland-spine.mjs';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';
import {
  RECREATION_OPS,
  RECREATION_LIMITS,
  adoptedUseUnits,
  cleanUseFeatures,
  corridorHolds,
} from '../lib/woodland-recreation.mjs';
import { clearedUnits } from '../lib/woodland-recreation-geo.mjs';
import { eraseWorkspaceState } from '../self-hosted/erasure.mjs';
import {
  owner,
  reviewer,
  member,
  NOW,
  spineCoop,
  reviewWatershedLayers,
} from './woodland-spine-fixture.mjs';
import { P, UNITS } from './dfm-watershed-fixture.mjs';

const line = (pts, cleared_width_m, name) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => P(x, y)) },
  properties: { cleared_width_m, ...(name ? { name } : {}) },
});
// The upper main stem runs through woodlot-1 (recorded by the founding steward). Its drafted
// corridor is 140 m wide and the minimum width is 100 m.
const EAST_EDGE = [[289, 150], [293, 196], [301, 232]]; // near the corridor's east edge
const WEST_EDGE = [[265, 150], [269, 196], [277, 232]]; // near its west edge
const CENTER = [[276, 150], [280, 196], [288, 232]]; // down its middle
const ACROSS = [[300, 200], [450, 200]]; // from woodlot-1 into the member's woodlot-4
const DAY = 86_400_000;

function coop() {
  const f = spineCoop();
  reviewWatershedLayers(f);
  return f;
}
const record = (f, id) => f.s.corridorUses.find((u) => u.id === id);
const propose = (f, features, extra = {}, actor = member, now = NOW) =>
  f.run(
    'propose_corridor_use',
    {
      projectId: f.project,
      name: 'Brook trail',
      kind: 'walking-trail',
      audience: 'members',
      features,
      ...extra,
    },
    actor,
    now,
  );
/** Agreement from every holder, a vote opened by a steward, and all three members' votes. */
function adopt(f, id, choices = ['approve', 'approve', 'approve']) {
  for (const w of record(f, id).woodlots) {
    const holder = f.s.parcels.find((p) => p.id === w.parcelId).createdBy;
    f.run(
      'agree_corridor_use',
      { id, parcelId: w.parcelId, decision: 'agree', attested: true },
      { id: holder },
    );
  }
  f.run('open_corridor_use_vote', { id }, owner);
  [owner, reviewer, member].forEach((actor, i) =>
    f.run('vote_corridor_use', { id, choice: choices[i] }, actor),
  );
  f.run('close_corridor_use_vote', { id }, owner);
  return record(f, id);
}
const analyse = (f, kind) =>
  runSpineAnalysis(kind, spineAnalysisInput(f.s, f.project, { now: NOW }).input);
const refuses = (fn, pattern, status) =>
  assert.throws(fn, (e) => {
    assert.match(e.message, pattern);
    if (status) assert.equal(e.status, status);
    return true;
  });

await test('RC1 natural is the default: without an adopted use nothing is stored, checked or projected differently', async () => {
  for (const op of RECREATION_OPS) assert.ok(WOODLAND_OPS.includes(op), op);
  const f = coop();
  assert.equal(f.s.corridorUses, undefined);
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  // The same results dfm-core 0.2.0 gave (tests/woodland-native.test.mjs compares all of them).
  const before = JSON.parse(
    await readFile(
      new URL('./dfm-results-0.2.0-watershed.json', import.meta.url),
      'utf8',
    ),
  );
  const outlook = analyse(f, 'outlook');
  assert.equal(outlook.inputChecksum, before.results.outlook.inputChecksum);
  // A proposal that is not adopted changes no check and no analysis either.
  const id = propose(f, [line(EAST_EDGE, 8)]);
  assert.equal(record(f, id).status, 'awaiting_agreement');
  assert.deepEqual(adoptedUseUnits(f.s, f.project), []);
  assert.equal(
    analyse(f, 'outlook').inputChecksum,
    before.results.outlook.inputChecksum,
  );
  const plan = f.run(
    'submit_treatment_plan',
    {
      projectId: f.project,
      name: 'Away from the spine',
      period: '2027',
      treatments: [UNITS['unit-a']],
    },
    member,
  );
  const stored = f.s.treatmentPlans.find((p) => p.id === plan);
  assert.equal(stored.status, 'submitted');
  assert.equal('clearedGround' in stored, false);
});

await test('RC2 a use is a mapped proposal: trail lines with a cleared width, and cleared areas', () => {
  const f = coop();
  const id = propose(f, [line(EAST_EDGE, 3, 'Brook trail, upper stretch')], {
    description: 'Natural surface, hand built.',
  });
  const u = record(f, id);
  assert.equal(u.kind, 'walking-trail');
  assert.equal(u.audience, 'members');
  assert.equal(u.features[0].properties.cleared_width_m, 3);
  assert.equal(u.units.length, 1);
  assert.equal(u.units[0].properties.corridor_permitted, false);
  assert.ok(u.clearedM2 > 1000 && u.clearedM2 < 1500, `${u.clearedM2} m² cleared`);
  // A tread worn under standing trees clears nothing and contributes no unit.
  assert.deepEqual(clearedUnits('x', [line(CENTER, 0)]), []);
  // Only the geometry, a name and the cleared width are kept.
  const [kept] = cleanUseFeatures([
    { ...line(EAST_EDGE, 2, 'n'), properties: { cleared_width_m: 2, name: 'n', secret: 1 } },
  ]);
  assert.deepEqual(kept.properties, { name: 'n', cleared_width_m: 2 });
  for (const [features, pattern] of [
    [[], /at least one trail line or cleared area/],
    [[line(EAST_EDGE, -1)], /width cleared of trees/],
    [[line(EAST_EDGE, 31)], /width cleared of trees/],
    [[{ ...line(EAST_EDGE, 2), properties: {} }], /width cleared of trees/],
    [[line([[289, 150]], 2)], /a trail is a line of 2 to/],
    [[{ type: 'Feature', geometry: { type: 'Point', coordinates: P(289, 150) }, properties: {} }], /line for a trail or a polygon/],
    [Array.from({ length: RECREATION_LIMITS.featuresPerUse + 1 }, () => line(EAST_EDGE, 0)), /at most 20 lines and areas/],
  ])
    refuses(() => propose(coop(), features), pattern);
  refuses(() => propose(f, [line(EAST_EDGE, 2)], { kind: 'motocross' }), /kind of use/);
  refuses(() => propose(f, [line(EAST_EDGE, 2)], { audience: 'everyone' }), /members or public/);
  refuses(() => propose(f, [line(EAST_EDGE, 2)], { name: ' ' }), /name for the use/);
});

await test('RC3 the corridor comes first: a use that breaks a link is blocked, with no override', () => {
  const f = coop();
  // Three metres cleared along the edge leaves more than the minimum width beside it.
  const edge = record(f, propose(f, [line(EAST_EDGE, 3)]));
  assert.equal(edge.status, 'awaiting_agreement');
  assert.equal(edge.holds, true);
  assert.deepEqual(edge.check.lostLinks, []);
  // The same three metres down the middle leave two strips, each narrower than the minimum.
  const middleId = propose(f, [line(CENTER, 3)]);
  const middle = record(f, middleId);
  assert.equal(middle.status, 'blocked');
  assert.equal(middle.holds, false);
  assert.ok(middle.check.lostLinks.length > 0);
  assert.ok(middle.check.lostLinks.every((l) => l.causes.some((c) => c.startsWith(`rec-${middleId}-`))));
  // A blocked use cannot be agreed, voted on or put to an override.
  refuses(
    () => f.run('agree_corridor_use', { id: middleId, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner),
    /not waiting for holders/,
    409,
  );
  refuses(() => f.run('open_corridor_use_vote', { id: middleId }, owner), /must agree before/, 409);
  refuses(() => f.run('propose_plan_override', { id: middleId, reason: 'x' }, owner), /not found/);
  // A tread under standing trees down the same middle clears nothing, so the corridor holds.
  assert.equal(record(f, propose(f, [line(CENTER, 0)])).status, 'awaiting_agreement');
  // Only a completed check can say the corridor holds.
  assert.equal(corridorHolds({ status: 'incomplete', lostLinks: [], pinchedLinks: [] }), false);
  assert.equal(corridorHolds(null), false);
  assert.equal(corridorHolds({ status: 'fail', lostLinks: [], pinchedLinks: [{}] }), false);
  // Uses already adopted count: two edge clearings that each hold alone do not hold together.
  const g = coop();
  assert.equal(adopt(g, propose(g, [line(EAST_EDGE, 8)])).status, 'adopted');
  const alone = coop();
  assert.equal(record(alone, propose(alone, [line(WEST_EDGE, 8)])).status, 'awaiting_agreement');
  assert.equal(record(g, propose(g, [line(WEST_EDGE, 8)])).status, 'blocked');
  // Without reviewed layers there is nothing to check a use against.
  const bare = spineCoop();
  refuses(() => propose(bare, [line(EAST_EDGE, 3)]), /review the woodland layers first/, 409);
});

await test('RC4 each holder of a crossed woodlot agrees; pooling consent is not agreement; one refusal ends it', () => {
  const f = coop();
  // woodlot-1 has reviewed pooling consent; that is not agreement to a trail.
  const id = propose(f, [line(ACROSS, 0)], {}, reviewer);
  const u = () => record(f, id);
  assert.deepEqual(u().woodlots, [{ parcelId: 'woodlot-1' }, { parcelId: 'woodlot-4' }]);
  refuses(() => f.run('open_corridor_use_vote', { id }, owner), /must agree before/, 409);
  // Only whoever recorded a woodlot answers for it, and only with an attestation.
  const agree = (parcelId, actor, extra = { attested: true }) =>
    f.run('agree_corridor_use', { id, parcelId, decision: 'agree', ...extra }, actor);
  refuses(() => agree('woodlot-4', owner), /Only the member who recorded a woodlot/, 403);
  refuses(() => agree('woodlot-4', member, {}), /Confirm that you may agree/);
  refuses(() => agree('woodlot-9', owner), /does not cross that woodlot/, 404);
  agree('woodlot-1', owner);
  assert.equal(u().status, 'awaiting_agreement');
  agree('woodlot-4', member);
  assert.equal(u().status, 'agreed');
  assert.ok(u().woodlots.every((w) => w.agreedAt === NOW));
  // One refusal ends a proposal.
  const other = propose(f, [line(ACROSS, 0)], { name: 'Second route' });
  f.run('agree_corridor_use', { id: other, parcelId: 'woodlot-4', decision: 'refuse' }, member);
  assert.equal(record(f, other).status, 'declined');
  refuses(() => f.run('agree_corridor_use', { id: other, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner), /not waiting/, 409);
  // A route on land no member has recorded cannot be proposed.
  refuses(() => propose(f, [line([[700, 700], [720, 700]], 2)]), /crosses no recorded woodlot/);
});

await test('RC5 the co-op votes: frozen electorate, two-thirds quorum, a majority of the electorate', () => {
  const f = coop();
  const id = propose(f, [line(EAST_EDGE, 3)]);
  f.run('agree_corridor_use', { id, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner);
  refuses(() => f.run('open_corridor_use_vote', { id }, member), /steward/i);
  f.run('open_corridor_use_vote', { id }, owner);
  const v = () => record(f, id).vote;
  assert.equal(record(f, id).status, 'voting');
  assert.equal(v().electorate.length, 3);
  assert.equal(v().quorum, 2);
  refuses(() => f.run('vote_corridor_use', { id, choice: 'maybe' }, member), /approve, oppose or abstain/);
  f.run('vote_corridor_use', { id, choice: 'oppose' }, member);
  f.run('vote_corridor_use', { id, choice: 'approve' }, member); // a member may change their vote
  assert.equal(v().votes.length, 1);
  refuses(() => f.run('close_corridor_use_vote', { id }, owner), /Wait for the deadline/, 409);
  // After the deadline one approval of three meets neither the quorum nor a majority.
  f.run('close_corridor_use_vote', { id }, owner, NOW + 15 * DAY);
  assert.equal(record(f, id).status, 'not_adopted');
  refuses(() => f.run('vote_corridor_use', { id, choice: 'approve' }, owner), /Voting is closed/, 409);
  // Two approvals of three adopt; one approval and two against do not.
  const g = coop();
  assert.equal(adopt(g, propose(g, [line(EAST_EDGE, 3)]), ['approve', 'approve', 'oppose']).status, 'adopted');
  const h = coop();
  assert.equal(adopt(h, propose(h, [line(EAST_EDGE, 3)]), ['approve', 'oppose', 'oppose']).status, 'not_adopted');
  // If the reviewed layers change before the vote opens, the use must be checked again.
  const k = coop();
  const stale = propose(k, [line(EAST_EDGE, 3)]);
  k.run('agree_corridor_use', { id: stale, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner);
  reviewWatershedLayers(k);
  refuses(() => k.run('open_corridor_use_vote', { id: stale }, owner), /layers changed/, 409);
});

await test('RC6 an adopted use counts wherever the corridor is checked', () => {
  const f = coop();
  const before = analyse(f, 'outlook');
  const adopted = adopt(f, propose(f, [line(EAST_EDGE, 8)]));
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.adoptedAt, NOW);
  const units = adoptedUseUnits(f.s, f.project);
  assert.equal(units.length, 1);
  // Spine analyses: the cleared ground is no longer committed forest, and never old growth.
  const after = analyse(f, 'outlook');
  assert.equal(after.status, 'ok');
  after.milestones.forEach((m, i) => {
    const lost = before.milestones[i].committedM2 - m.committedM2;
    assert.ok(
      Math.abs(lost - adopted.clearedM2) < 0.02 * adopted.clearedM2,
      `${m.year}: ${lost.toFixed(0)} m² less committed forest, ${adopted.clearedM2} m² cleared`,
    );
    assert.deepEqual(m.committedLinks, before.milestones[i].committedLinks);
  });
  assert.ok(before.milestones[4].oldGrowthAgeM2 - after.milestones[4].oldGrowthAgeM2 > 0.9 * adopted.clearedM2);
  assert.deepEqual(analyse(f, 'network').coreLinks, analyse(coop(), 'network').coreLinks);
  // Harvest plans: checked with the cleared ground excluded, and the plan records it.
  const planId = f.run(
    'submit_treatment_plan',
    { projectId: f.project, name: 'Away from the spine', period: '2027', treatments: [UNITS['unit-a']] },
    member,
  );
  const plan = f.s.treatmentPlans.find((p) => p.id === planId);
  assert.equal(plan.status, 'submitted');
  assert.deepEqual(plan.clearedGround, units);
  // The stored check reproduces from the records a steward downloads (WS12).
  const input = planCheckInput(f.s.woodlandLayers, plan, consentParcels(f.s, f.project));
  assert.equal(input.water.at(-1).properties.excluded, 'recreation-clearing');
  assert.equal(canonicalHashSync(input), plan.check.inputChecksum);
  assert.equal(checkConnectivitySync(input).status, plan.check.status);
  const fresh = coop();
  const plain = fresh.run(
    'submit_treatment_plan',
    { projectId: fresh.project, name: 'Away from the spine', period: '2027', treatments: [UNITS['unit-a']] },
    member,
  );
  assert.notEqual(plan.check.inputChecksum, fresh.s.treatmentPlans.find((p) => p.id === plain).check.inputChecksum);
});

await test('RC7 it can always end: a steward, a crossed holder, a withdrawn woodlot or an erased account', () => {
  const f = coop();
  const id = adopt(f, propose(f, [line(ACROSS, 0)], {}, reviewer)).id;
  // Not anyone: the reviewer recorded neither woodlot, but is a steward; a holder may end it too.
  const g = coop();
  const gid = adopt(g, propose(g, [line(EAST_EDGE, 8)])).id; // crosses the owner's woodlot only
  refuses(() => g.run('end_corridor_use', { id: gid }, member), /steward/i);
  g.run('end_corridor_use', { id: gid }, reviewer);
  assert.equal(record(g, gid).status, 'ended');
  assert.deepEqual(adoptedUseUnits(g.s, g.project), []);
  assert.equal(analyse(g, 'outlook').milestones[0].committedM2, analyse(coop(), 'outlook').milestones[0].committedM2);
  refuses(() => g.run('end_corridor_use', { id: gid }, reviewer), /already ended/, 409);
  // The member holds woodlot-4, which the adopted use crosses.
  f.run('end_corridor_use', { id }, member);
  assert.equal(record(f, id).status, 'ended');
  // A proposer withdraws a proposal; withdrawing a woodlot ends the uses that cross it.
  const h = coop();
  const mine = propose(h, [line(EAST_EDGE, 3)]);
  h.run('end_corridor_use', { id: mine }, member);
  assert.equal(record(h, mine).status, 'withdrawn');
  const crossing = adopt(h, propose(h, [line(ACROSS, 0)])).id;
  const voting = propose(h, [line(ACROSS, 0)], { name: 'Loop' });
  for (const [parcelId, actor] of [['woodlot-1', owner], ['woodlot-4', member]])
    h.run('agree_corridor_use', { id: voting, parcelId, decision: 'agree', attested: true }, actor);
  h.run('open_corridor_use_vote', { id: voting }, owner);
  h.run('withdraw_parcel', { parcelId: 'woodlot-4', reason: 'Sold' }, member);
  assert.equal(record(h, crossing).status, 'ended');
  assert.equal(record(h, voting).status, 'withdrawn');
  assert.equal(record(h, voting).vote.status, 'withdrawn');
  // Erasing the member's account removes woodlot-4, so a use crossing it ends; the member's own
  // unanswered proposal goes with them, and one others acted on stays without its description.
  const k = coop();
  const kept = adopt(k, propose(k, [line(ACROSS, 0)], { description: 'My idea' })).id;
  const gone = propose(k, [line(EAST_EDGE, 3)], { name: 'Unanswered' });
  const erased = eraseWorkspaceState(k.s, member.id, NOW + DAY).state;
  const keptUse = erased.corridorUses.find((u) => u.id === kept);
  assert.equal(keptUse.status, 'ended');
  assert.equal(keptUse.description, '');
  assert.equal(keptUse.erasureRedacted, true);
  assert.equal(erased.corridorUses.some((u) => u.id === gone), false);
  assert.doesNotMatch(JSON.stringify(erased.corridorUses), new RegExp(`"${member.id}"`));
});

await test('RC8 which woodlots a use crosses stays with stewards and their holders', () => {
  const f = coop();
  const id = propose(f, [line(ACROSS, 0)], {}, reviewer);
  f.run('agree_corridor_use', { id, parcelId: 'woodlot-1', decision: 'agree', attested: true }, owner);
  const seen = (actor) => memberView(f.s, actor.id).state.corridorUses.find((u) => u.id === id);
  const steward = seen(owner);
  assert.deepEqual(steward.woodlots.map((w) => w.parcelId), ['woodlot-1', 'woodlot-4']);
  assert.equal(steward.canAgree, false, 'the owner has already agreed for woodlot-1');
  const holder = seen(member);
  assert.deepEqual(holder.woodlots.map((w) => w.parcelId), ['woodlot-4']);
  assert.equal(holder.canAgree, true);
  assert.equal(holder.woodlotCount, 2);
  assert.equal(holder.agreedCount, 1);
  // Every member sees the whole route and the corridor result; nobody sees an account ID.
  assert.deepEqual(holder.features, steward.features);
  assert.equal(holder.holds, true);
  for (const view of [steward, holder]) {
    assert.equal('createdBy' in view, false);
    assert.doesNotMatch(JSON.stringify(view.features), /woodlot/);
  }
  assert.equal(seen(reviewer).mine, true);
  // A member with no woodlot on the route sees counts only.
  const g = coop();
  const gid = propose(g, [line(EAST_EDGE, 3)], {}, owner);
  const other = memberView(g.s, member.id).state.corridorUses.find((u) => u.id === gid);
  assert.deepEqual(other.woodlots, []);
  assert.equal(other.woodlotCount, 1);
  assert.equal(other.canAgree, false);
});

await test('RC9 uses, features and bytes are bounded', () => {
  const f = coop();
  for (let i = 0; i < RECREATION_LIMITS.usesPerProject; i++)
    propose(f, [line(CENTER, 0)], { name: `Trail ${i}` });
  refuses(() => propose(f, [line(CENTER, 0)]), /has reached 20 recreation uses/, 429);
  // Ended and declined uses free their places.
  f.run('end_corridor_use', { id: f.s.corridorUses[0].id }, member);
  propose(f, [line(CENTER, 0)]);
  const long = Array.from({ length: 501 }, (_, i) => [200 + i * 0.1, 200]);
  refuses(() => cleanUseFeatures([line(long, 0)]), /2 to 500/);
  const big = Array.from({ length: 20 }, () =>
    line(Array.from({ length: 500 }, (_, i) => [200 + i * 0.01, 200 + (i % 2)]), 0),
  );
  refuses(() => cleanUseFeatures(big), /Simplify the route/, 413);
});
