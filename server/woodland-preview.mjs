// Read-only browser preview. Private parcel inputs never leave the server, and the check runs
// in the analysis worker, not on the thread that answers requests (WS7).
import { membership } from '../lib/network.mjs';
import { DomainError } from '../lib/domain-error.mjs';
import {
  previewCheckInput,
  previewResult,
  WOODLAND_LIMITS,
} from '../lib/woodland.mjs';
import { cleanFeatures } from '../lib/woodland-input.mjs';
import { runEngine } from './woodland-analysis.mjs';

export async function woodlandServerPreview(
  state,
  userId,
  projectId,
  treatments,
  enabled,
  options = {},
) {
  if (!membership(state, userId))
    throw new DomainError('Active co-op membership is required.', 403);
  if (!enabled)
    throw new DomainError('Woodland projects are not enabled.', 404);
  let prepared;
  try {
    const units = cleanFeatures(
      treatments,
      'treatments',
      WOODLAND_LIMITS.treatmentsPerPlan,
    );
    // No units checks the current state (agents use this); the browser always sends units.
    if (
      new TextEncoder().encode(JSON.stringify(units)).byteLength >
      WOODLAND_LIMITS.planBytes
    )
      throw new DomainError('Simplify the treatment units.', 413);
    prepared = previewCheckInput(state, projectId, units);
  } catch (error) {
    if (error instanceof Error && error.status >= 400 && error.status < 500)
      throw new DomainError(error.message, error.status);
    throw error;
  }
  if (prepared.incomplete) return prepared.incomplete;
  const result = await runEngine('check', prepared.input, {
    ...options,
    key: userId,
  });
  const {
    geometry: _geometry,
    geometryOmitted: _omitted,
    ...check
  } = previewResult(result, prepared.layersVersionId);
  return check;
}
