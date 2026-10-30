// Woodland (DFM) projects: retained-corridor layers and treatment plans checked
// for corridor connectivity with @viridis/dfm-core before review.
//
// Invariants (DFM Build Spec; tests in tests/woodland.test.mjs):
//   W1 Layers (core areas, retained habitat, roads, water, crossings) and their
//      parameters are versioned per woodland project; a version takes effect only
//      after a second steward reviews it.
//   W2 Every treatment plan is checked against the current reviewed layers and the
//      co-op's current parcel consents. A plan whose check does not pass is stored
//      as 'blocked' with its result and cannot be reviewed.
//   W3 A blocked plan whose check FAILED (not incomplete) can proceed only through a
//      recorded override vote: frozen electorate of active members, quorum of two
//      thirds, approval by a majority of the electorate, a stated reason. An adopted
//      override returns the plan to 'submitted'; it still needs two-person review.
//   W4 A plan can be reviewed only while the layers it was checked against are still
//      the current reviewed layers.
//   W5 Corridor sections are 'committed' only on parcels whose current consent is
//      reviewed and matches the parcel's reviewed boundary (parcelConsentIsCurrent).
//   W6 Agents and members never approve their own records; stewards review.
//   W7 Stored records stay within size limits so woodland data cannot exhaust a
//      co-op's storage.
//   WS1 The engine is dfm-core 0.2.0. Its connectivity check (dfm-connectivity-0.2.0) gives the
//      same results as 0.1.0 for every input without the stepping-stone setting, which woodland
//      projects do not use, so stored plans keep their meaning. One exception: 0.2.0 adds four
//      upkeep treatments to LIGHT_INTENSITIES (prescribed-burn, prescribed-grazing,
//      late-season-mowing, brush-management), so a corridor-permitted unit with one of them and a
//      reason keeps its habitat where 0.1.0 removed it.
//   WS2 streams and connectors are optional layers, stored only when they hold features: a
//      version without them stores exactly as before, and its check sees no spine layers.
//      Checks from v0.10.0 on use the Landscape Package's canonical input (WS12); their
//      stored result says so (inputForm), and only those are offered for exact reproduction.
//   WS7 On the server the corridor check on a submitted plan runs in the analysis worker, never
//      on the request thread. The server first applies the command with CHECK_DEFERRED: every
//      refusal before the check happens then, at no engine cost, and otherwise the command stops
//      with the exact check input. The server checks that input in the worker and applies the
//      command again with the result, which is used only for exactly the input the command
//      builds; a mismatch (the co-op changed in between) is refused, not checked here. Without
//      server context (tests, scripts) the command checks the plan itself.
//   WS5 Spine lines are saved only when the engine can draft corridors from them; the
//      drafted corridors are retained habitat that goes through the same review (W1).
//   WS9 A planned join year is a projection assumption recorded on a woodlot, never consent:
//      it is set by the woodlot's recorder or a steward, and only for a future year.
//   E1 A plan redacted by account erasure is a structural record only: it cannot be reviewed,
//      voted on, put to an override or have an override closed.
import {checkConnectivitySync, validateInput, deriveSpine, canonicalHashSync, ENGINE_VERSION} from '@viridis/dfm-core';
import {consentParcels, cleanFeatures, cleanLayers, woodlandCheckInput, CHECK_INPUT_FORM} from './woodland-input.mjs';
import {spineParams, spineProblems, hasSpineLines} from './woodland-spine.mjs';
export {consentParcels, woodlandCheckInput, CHECK_INPUT_FORM} from './woodland-input.mjs';

export const WOODLAND_OPS = Object.freeze([
  'save_woodland_layers',
  'review_woodland_layers',
  'submit_treatment_plan',
  'review_treatment_plan',
  'propose_plan_override',
  'vote_plan_override',
  'close_plan_override',
  'plan_parcel_join',
]);
export const WOODLAND_LIMITS = Object.freeze({
  layerBytes: 90_000,
  planBytes: 40_000,
  layerVersionsPerProject: 5,
  plansPerProject: 40,
  treatmentsPerPlan: 50,
});
class WoodlandError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new WoodlandError(message, status);
};
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required.`);
  return value.trim().slice(0, max);
};
const decision = (value) => (['approve', 'reject'].includes(value) ? value : fail('Choose approve or reject.'));
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const round = (value) =>
  JSON.parse(JSON.stringify(value, (k, v) => (typeof v === 'number' && k !== 'version' ? Math.round(v * 1e7) / 1e7 : v)));

function woodlandProject(s, projectId) {
  const project = (s.projects ?? []).find((x) => x.id === projectId);
  if (!project) fail('Project not found.', 404);
  if (project.kind !== 'woodland') fail('Woodland layers and treatment plans belong to woodland projects.');
  return project;
}

/** The latest reviewed layers version for a project, or null. */
export function currentLayers(s, projectId) {
  return (
    (s.woodlandLayers ?? [])
      .filter((v) => v.projectId === projectId && v.status === 'reviewed')
      .at(-1) ?? null
  );
}

function cleanParams(p) {
  return {
    minWidthM: Number(p?.minWidthM),
    minWidthSource: typeof p?.minWidthSource === 'string' ? p.minWidthSource.trim().slice(0, 300) : '',
    ...(p?.roadWidthM != null ? {roadWidthM: Number(p.roadWidthM)} : {}),
    ...spineParams(p), // WS4: only the optional settings that are set
  };
}

/**
 * WS7. Pass as the precomputed check (applyCommand context `woodlandCheck`) to validate a
 * submit_treatment_plan command up to its corridor check without running the engine: the
 * command then throws, and deferredCheckInput(error) is the exact input it would check.
 */
export const CHECK_DEFERRED = Symbol.for('vergecommon.woodland-check-deferred');
const DEFERRED_INPUT = Symbol.for('vergecommon.woodland-check-input');
/** The check input carried by a deferred submit (see CHECK_DEFERRED), or null for any other error. */
export const deferredCheckInput = (error) => error?.[DEFERRED_INPUT] ?? null;

/** The corridor check for a submitted plan (WS7). */
function submitCheck(input, precomputed) {
  if (precomputed === CHECK_DEFERRED)
    throw Object.assign(new Error('The corridor check runs in the analysis worker.'), {[DEFERRED_INPUT]: input});
  if (precomputed == null) return checkConnectivitySync(input);
  if (precomputed.inputChecksum && precomputed.inputChecksum === canonicalHashSync(input)) return precomputed;
  return fail('The co-op changed while this plan was being checked. Submit it again.', 409);
}

/** Result kept with a plan: everything except large consent geometry (W7). */
function storedResult(result) {
  const loss = result.geometry?.features?.filter((f) => f.properties?.dfm_layer === 'connectivity-loss') ?? [];
  const {geometry: _geometry, ...rest} = result;
  const kept = {...rest, geometry: {type: 'FeatureCollection', features: loss}};
  return bytes(kept) <= WOODLAND_LIMITS.planBytes ? round(kept) : {...round(rest), geometryOmitted: 'Too large to store; rerun the check to map it.'};
}

/** A plan that can still be acted on (E1): erasure leaves only a structural record. */
function livePlan(s, id) {
  const plan = (s.treatmentPlans ?? []).find((x) => x.id === id) ?? fail('Treatment plan not found.', 404);
  if (plan.erasureRedacted) fail('This plan was removed when its author deleted their account.', 409);
  return plan;
}

function closeOverride(plan, now) {
  const o = plan.override;
  const approvals = o.votes.filter((v) => v.choice === 'approve').length;
  const passed = o.votes.length >= o.quorum && approvals > o.electorate.length / 2;
  o.status = passed ? 'adopted' : 'not_adopted';
  o.closedAt = now;
  if (passed) plan.status = 'submitted';
}

/**
 * Apply one woodland command to a cloned state. Host helpers keep membership,
 * steward and review rules identical to the rest of the co-op.
 * @param {object} h {requireSteward(s, userId), member (the actor's membership record), review(record, userId, decision, now)}
 */
export function applyWoodland(s, user, op, p, now, id, h) {
  s.woodlandLayers ??= [];
  s.treatmentPlans ??= [];
  switch (op) {
    case 'save_woodland_layers': {
      h.requireSteward(s, user.id);
      const project = woodlandProject(s, p.projectId);
      // Stored layers are rounded to 1e-7 degrees (about 1 cm); validate and size what is stored.
      const layers = round(cleanLayers(p.layers));
      const params = cleanParams(p.params);
      const check = validateInput({...layers, params, treatments: []});
      if (check.errors.length) fail(`These layers cannot be checked: ${check.errors.join(' ')}`);
      const spine = spineProblems(layers, params, new Date(now).getUTCFullYear());
      if (spine.length) fail(`These spine settings cannot be used: ${spine.join(' ')}`);
      if (hasSpineLines(layers)) {
        const draft = deriveSpine({...layers, params});
        if (draft.status !== 'ok') fail(`The spine lines cannot be drafted: ${draft.reasons.join(' ')}`);
      }
      if (bytes(layers) > WOODLAND_LIMITS.layerBytes)
        fail(`Simplify the layers to under ${WOODLAND_LIMITS.layerBytes / 1000} KB (fewer corners or features).`, 413);
      const versions = s.woodlandLayers.filter((v) => v.projectId === project.id);
      if (versions.length >= WOODLAND_LIMITS.layerVersionsPerProject) {
        // Keep history bounded: drop the oldest superseded version's geometry, keep its record.
        const oldest = versions.find((v) => v.layers && v !== currentLayers(s, project.id));
        if (oldest) { oldest.layers = null; oldest.geometryRemovedAt = now; }
      }
      s.woodlandLayers.push({
        id, projectId: project.id, layers, params,
        notes: typeof p.notes === 'string' ? p.notes.slice(0, 1500) : '',
        engine: ENGINE_VERSION, createdBy: user.id, createdAt: now, status: 'submitted',
      });
      return true;
    }
    case 'review_woodland_layers': {
      h.requireSteward(s, user.id);
      const version = s.woodlandLayers.find((v) => v.id === p.id) ?? fail('Layers version not found.', 404);
      h.review(version, user.id, decision(p.decision), now);
      version.reviewNote = text(p.note, 1500, 'A review note');
      return true;
    }
    case 'submit_treatment_plan': {
      const project = woodlandProject(s, p.projectId);
      const layers = currentLayers(s, project.id) ?? fail('A steward must save and another steward review the woodland layers first.', 409);
      if (s.treatmentPlans.filter((x) => x.projectId === project.id).length >= WOODLAND_LIMITS.plansPerProject)
        fail(`This project has reached ${WOODLAND_LIMITS.plansPerProject} treatment plans.`, 429);
      // Every refusal comes before the check, so a refused plan costs no engine time (WS7).
      const name = text(p.name, 160, 'A plan name');
      const period = text(p.period, 60, 'A period');
      const treatments = cleanFeatures(p.treatments, 'treatments', WOODLAND_LIMITS.treatmentsPerPlan);
      if (!treatments.length) fail('Add at least one treatment unit.');
      if (bytes(treatments) > WOODLAND_LIMITS.planBytes) fail('Simplify the treatment units.', 413);
      const input = woodlandCheckInput(layers.layers, treatments, consentParcels(s, project.id), layers.params);
      const result = submitCheck(input, h.precomputedCheck);
      s.treatmentPlans.push({
        id, projectId: project.id,
        name,
        period,
        treatments: round(treatments),
        layersVersionId: layers.id,
        check: {...storedResult(result), inputForm: CHECK_INPUT_FORM},
        status: result.status === 'pass' ? 'submitted' : 'blocked',
        createdBy: user.id, createdAt: now,
      });
      return true;
    }
    case 'review_treatment_plan': {
      h.requireSteward(s, user.id);
      const plan = livePlan(s, p.id);
      if (plan.status === 'blocked') fail('This plan did not pass the corridor check. A recorded override vote is required first.', 409);
      if (currentLayers(s, plan.projectId)?.id !== plan.layersVersionId)
        fail('The woodland layers changed after this plan was checked. Submit the plan again.', 409);
      h.review(plan, user.id, decision(p.decision), now);
      plan.reviewNote = text(p.note, 1500, 'A review note');
      return true;
    }
    case 'propose_plan_override': {
      h.requireSteward(s, user.id);
      const plan = livePlan(s, p.id);
      if (plan.status !== 'blocked') fail('Only a blocked plan can be put to an override vote.', 409);
      if (plan.check.status !== 'fail') fail('An incomplete check cannot be overridden; fix the inputs and submit again.', 409);
      if (plan.override?.status === 'open') fail('An override vote is already open.', 409);
      const electorate = s.members.filter((m) => m.status === 'active').map((m) => m.id);
      const days = Number.isInteger(p.days) && p.days >= 1 && p.days <= 60 ? p.days : 14;
      plan.override = {
        id, reason: text(p.reason, 2000, 'A reason for the override'), electorate,
        quorum: Math.ceil((electorate.length * 2) / 3), closesAt: now + days * 86_400_000,
        votes: [], status: 'open', createdBy: user.id, createdAt: now,
      };
      return true;
    }
    case 'vote_plan_override': {
      const plan = livePlan(s, p.id);
      const o = plan.override;
      if (!o || o.status !== 'open' || now >= o.closesAt) fail('Voting is closed.', 409);
      if (!o.electorate.includes(h.member.id)) fail('You are not in this vote’s frozen electorate.', 403);
      if (!['approve', 'oppose', 'abstain'].includes(p.choice)) fail('Choose approve, oppose or abstain.');
      o.votes = o.votes.filter((v) => v.memberId !== h.member.id);
      o.votes.push({memberId: h.member.id, choice: p.choice, at: now});
      return true;
    }
    case 'close_plan_override': {
      h.requireSteward(s, user.id);
      const plan = livePlan(s, p.id);
      const o = plan.override;
      if (!o || o.status !== 'open') fail('No open override vote.', 409);
      if (now < o.closesAt && o.votes.length < o.electorate.length) fail('Wait for the deadline or all eligible members to vote.', 409);
      closeOverride(plan, now);
      return true;
    }
    case 'plan_parcel_join': {
      // WS9: a projection assumption for a woodlot without consent; it commits nothing.
      const parcel = (s.parcels ?? []).find((x) => x.id === p.parcelId) ?? fail('Woodlot not found.', 404);
      if (parcel.createdBy !== user.id) h.requireSteward(s, user.id);
      woodlandProject(s, parcel.projectId);
      if (parcel.status === 'withdrawn') fail('This woodlot was withdrawn.', 409);
      if (p.year === null) {
        delete parcel.plannedJoinYear;
        return true;
      }
      const year = new Date(now).getUTCFullYear();
      if (!Number.isInteger(p.year) || p.year <= year || p.year > year + 200)
        fail(`Choose a planned join year after ${year} and within 200 years.`);
      parcel.plannedJoinYear = p.year;
      return true;
    }
    default:
      return false;
  }
}

/**
 * The input and layers version for a preview of proposed treatments, or `incomplete` when the
 * project has no reviewed layers. Pure: the engine runs in the analysis worker (WS7).
 */
export function previewCheckInput(s, projectId, treatments = []) {
  const project = woodlandProject(s, projectId);
  const layers = currentLayers(s, project.id);
  if (!layers) return {incomplete: {status: 'incomplete', reasons: ['No reviewed woodland layers for this project.'], warnings: []}};
  return {input: woodlandCheckInput(layers.layers, treatments, consentParcels(s, project.id), layers.params), layersVersionId: layers.id};
}
/** A check result as previews return it: stored form, with the layers version. */
export const previewResult = (result, layersVersionId) => ({...storedResult(result), layersVersionId});

/** Run the check for a proposed set of treatments without saving, on this thread (tests, dev). */
export function previewTreatmentCheck(s, projectId, treatments = []) {
  const prepared = previewCheckInput(s, projectId, treatments);
  if (prepared.incomplete) return prepared.incomplete;
  return previewResult(checkConnectivitySync(prepared.input), prepared.layersVersionId);
}

