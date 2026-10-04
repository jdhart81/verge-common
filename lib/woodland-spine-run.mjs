// Runs one woodland engine job with dfm-core: a spine analysis or the corridor check. Used by
// the analysis worker thread (and, outside production, inline): each call can take seconds on a
// watershed, so a server never runs it on the thread that answers requests (WS7).
import {
  spineNetwork,
  projectSpine,
  climateRoutes,
  buildOutFrontier,
  checkConnectivitySync,
} from '@viridis/dfm-core';
import { SPINE_ANALYSES } from './woodland-spine.mjs';

/** Job kinds the worker runs: the four spine analyses and the corridor check. */
export const WOODLAND_JOBS = Object.freeze([...SPINE_ANALYSES, 'check']);

/** Network cut search budget: the engine default; past it robustness is reported as null. */
export const CUT_BUDGET = 20000;

export function runWoodlandJob(kind, input) {
  if (!WOODLAND_JOBS.includes(kind))
    throw Object.assign(new Error('Choose a spine analysis.'), { status: 400 });
  if (kind === 'check') return checkConnectivitySync(input);
  if (kind === 'network')
    return spineNetwork(input, { cuts: true, cutBudget: CUT_BUDGET });
  if (kind === 'outlook') return projectSpine(input);
  if (kind === 'climate') return climateRoutes(input);
  return buildOutFrontier(input);
}

/** The four spine analyses only (the check has its own paths). */
export function runSpineAnalysis(kind, input) {
  if (!SPINE_ANALYSES.includes(kind))
    throw Object.assign(new Error('Choose a spine analysis.'), { status: 400 });
  return runWoodlandJob(kind, input);
}
