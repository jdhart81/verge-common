// Runs one spine analysis with dfm-core. Used by the analysis worker thread (and, outside
// production, inline): each call can take seconds, so a server never runs it on the thread
// that answers requests (WS7).
import {
  spineNetwork,
  projectSpine,
  climateRoutes,
  buildOutFrontier,
} from '@viridis/dfm-core';
import { SPINE_ANALYSES } from './woodland-spine.mjs';

/** Network cut search budget: the engine default; past it robustness is reported as null. */
export const CUT_BUDGET = 20000;

export function runSpineAnalysis(kind, input) {
  if (!SPINE_ANALYSES.includes(kind))
    throw Object.assign(new Error('Choose a spine analysis.'), { status: 400 });
  if (kind === 'network')
    return spineNetwork(input, { cuts: true, cutBudget: CUT_BUDGET });
  if (kind === 'outlook') return projectSpine(input);
  if (kind === 'climate') return climateRoutes(input);
  return buildOutFrontier(input);
}
