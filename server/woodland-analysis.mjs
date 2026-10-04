// Read-only spine analyses for woodland projects (POST /api/woodland-analysis).
//
//   WS7 Analyses never run on the thread that answers requests in production: the self-hosted
//       gateway registers a worker-thread runner (self-hosted/woodland-analysis.mjs) and this
//       module hands each job to it. Without a runner, production refuses (503); development
//       runs inline so `vinext dev` still works.
//   WS8 Membership and the woodland flag are checked before any project input is read, and the
//       result is reduced to what the viewer may see (lib/woodland-spine.mjs).
//   WS10 Results are cached by analysis and exact input, for every viewer alike; the per-viewer
//       reduction happens after the cache, so a cached result never crosses that boundary.
import { membership, isSteward } from '../lib/network.mjs';
import { DomainError } from '../lib/domain-error.mjs';
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
  const { runSpineAnalysis } = await import('../lib/woodland-spine-run.mjs');
  return runSpineAnalysis(kind, input);
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
    production = globalThis.process?.env?.NODE_ENV === 'production',
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
  let prepared;
  try {
    prepared = spineAnalysisInput(state, data.projectId, {
      now,
      planId: data.planId ?? null,
    });
  } catch (error) {
    throw new DomainError(error.message, error.status ?? 400);
  }
  const { input, context } = prepared;
  const key = await inputKey(kind, input);
  let result = cache.get(key);
  if (result) cache.delete(key);
  else {
    if (!runner && production)
      throw new DomainError(
        'Spine analysis needs the self-hosted analysis worker.',
        503,
      );
    try {
      result = runner
        ? await runner.run(kind, input)
        : await inline(kind, input);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status >= 500 && status !== 503 && status !== 504) throw error;
      throw new DomainError(error.message, status);
    }
  }
  cache.set(key, result);
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  const steward = isSteward(state, userId);
  const ownParcelIds = (state.parcels ?? [])
    .filter((p) => p.createdBy === userId)
    .map((p) => p.id);
  return {
    kind,
    projectId: data.projectId,
    ...context,
    viewer: steward ? 'steward' : 'member',
    result: spineResultForViewer(kind, result, { steward, ownParcelIds }),
  };
}
