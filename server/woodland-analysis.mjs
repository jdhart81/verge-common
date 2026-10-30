// Read-only spine analyses for woodland projects (POST /api/woodland-analysis), and the engine
// runner shared with the corridor check on previews and submitted plans.
//
//   WS7 Engine work never runs on the thread that answers requests in production: the
//       self-hosted gateway registers a worker-thread runner (self-hosted/woodland-analysis.mjs)
//       and this module hands each job to it, one per account at a time. Without a runner,
//       production refuses (503); development runs inline so `vinext dev` still works.
//   WS8 Membership and the woodland flag are checked before any project input is read, and the
//       result is reduced to what the viewer may see (lib/woodland-spine.mjs). Only stewards may
//       apply a plan to the outlook or build-out: those results depend on woodlot consents, so a
//       member could otherwise draw a unit anywhere and read from the change in committed area
//       whether the land under it is committed. Network and climate results never use consents.
//   WS10 Results are cached by analysis and exact input, for every viewer alike; the per-viewer
//       reduction happens after the cache, so a cached result never crosses that boundary.
import { membership, isSteward, applyCommand } from '../lib/network.mjs';
import { DomainError } from '../lib/domain-error.mjs';
import { CHECK_DEFERRED, deferredCheckInput } from '../lib/woodland.mjs';
import {
  SPINE_ANALYSES,
  spineAnalysisInput,
  spineResultForViewer,
} from '../lib/woodland-spine.mjs';

/** Where the self-hosted gateway registers its worker-thread runner. */
export const WOODLAND_ANALYSIS_RUNNER = Symbol.for(
  'vergecommon.woodland-analysis',
);
export const registeredRunner = () =>
  globalThis[WOODLAND_ANALYSIS_RUNNER] ?? null;

const CACHE_ENTRIES = 32;
const cache = new Map();
export const clearAnalysisCache = () => cache.clear();
async function inputKey(kind, input) {
  const bytes = new TextEncoder().encode(JSON.stringify([kind, input]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
async function inline(kind, input) {
  const { runWoodlandJob } = await import('../lib/woodland-spine-run.mjs');
  return runWoodlandJob(kind, input);
}
const isProduction = () => globalThis.process?.env?.NODE_ENV === 'production';

/**
 * Run one engine job ('check' or a spine analysis) off the request thread (WS7).
 * Runner errors keep their 4xx/503/504 status as DomainErrors; anything else is rethrown.
 * @param {string} kind
 * @param {object} input
 * @param {{runner?: {run: Function} | null, production?: boolean, key?: string | null}} [options]
 */
export async function runEngine(
  kind,
  input,
  { runner = registeredRunner(), production = isProduction(), key = null } = {},
) {
  if (!runner && production)
    throw new DomainError(
      'Woodland analysis needs the self-hosted analysis worker.',
      503,
    );
  try {
    return runner
      ? await runner.run(kind, input, { key })
      : await inline(kind, input);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500 && status !== 503 && status !== 504) throw error;
    throw new DomainError(error.message, status);
  }
}

/**
 * WS7 for submit_treatment_plan (lib/woodland.mjs): apply the command with the check deferred,
 * so every refusal before the check is answered at no engine cost; then run the check on the
 * command's exact input in the analysis worker and return the context for the real command.
 * The context is built only from the worker's result, never from the request.
 * @param {object} state full co-op state the command will be applied to
 * @param {{id: string}} user authenticated account
 * @param {object} data the command request ({op, payload, requestId, ...})
 * @param {{runner?: {run: Function} | null, production?: boolean, now?: number}} [options]
 * @returns {Promise<{woodlandCheck: object}>}
 */
export async function submitCheckContext(
  state,
  user,
  data,
  { runner = registeredRunner(), production = isProduction(), now = Date.now() } = {},
) {
  let input = null;
  try {
    applyCommand(
      state,
      user,
      { op: data?.op, payload: data?.payload },
      now,
      data?.requestId ?? crypto.randomUUID(),
      { woodlandCheck: CHECK_DEFERRED },
    );
  } catch (error) {
    input = deferredCheckInput(error);
    if (!input) throw error;
  }
  if (!input)
    throw new DomainError('Only a treatment plan submission is checked.', 400);
  return {
    woodlandCheck: await runEngine('check', input, {
      runner,
      production,
      key: user.id,
    }),
  };
}

/**
 * @param {object} state full co-op state (server side only)
 * @param {string} userId authenticated account
 * @param {{projectId: string, kind: string, planId?: string}} data request body
 * @param {{enabled: boolean, runner?: {run(kind, input): Promise<object>}|null, now?: number, production?: boolean}} options
 */
export async function woodlandAnalysis(state, userId, data, options) {
  const {
    enabled,
    runner = registeredRunner(),
    now = Date.now(),
    production = isProduction(),
  } = options;
  const viewer = membership(state, userId);
  if (!viewer)
    throw new DomainError('Active co-op membership is required.', 403);
  if (!enabled)
    throw new DomainError('Woodland projects are not enabled.', 404);
  const kind = data?.kind;
  if (!SPINE_ANALYSES.includes(kind))
    throw new DomainError(
      `Choose an analysis: ${SPINE_ANALYSES.join(', ')}.`,
    );
  if (typeof data.projectId !== 'string' || data.projectId.length > 100)
    throw new DomainError('Choose a woodland project.');
  if (
    data.planId != null &&
    (typeof data.planId !== 'string' || data.planId.length > 100)
  )
    throw new DomainError('Choose a treatment plan.');
  const steward = isSteward(state, userId);
  if (data.planId != null && !steward && (kind === 'outlook' || kind === 'frontier'))
    throw new DomainError(
      'Only stewards can apply a treatment plan to the outlook or the build-out. Apply it to the network or climate routes instead.',
      403,
    );
  let prepared;
  try {
    // WS8: another member's planned join years never enter a non-steward's projection.
    prepared = spineAnalysisInput(state, data.projectId, {
      now,
      planId: data.planId ?? null,
      viewer: { userId, steward },
    });
  } catch (error) {
    throw new DomainError(error.message, error.status ?? 400);
  }
  const { input, context } = prepared;
  const key = await inputKey(kind, input);
  let result = cache.get(key);
  if (result) cache.delete(key);
  else
    result = await runEngine(kind, input, { runner, production, key: userId });
  cache.set(key, result);
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  const ownParcelIds = (state.parcels ?? [])
    .filter((p) => p.createdBy === userId)
    .map((p) => p.id);
  return {
    kind,
    projectId: data.projectId,
    ...context,
    viewer: steward ? 'steward' : 'member',
    result: spineResultForViewer(kind, result, {
      steward,
      ownParcelIds,
      parcelIds: input.parcels.map((p) => p.properties.dfm_id),
    }),
  };
}
