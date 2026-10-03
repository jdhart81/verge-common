// Read-only browser preview. Private parcel inputs never leave the server.
import { membership } from '../lib/network.mjs';
import { DomainError } from '../lib/domain-error.mjs';
import { previewTreatmentCheck, WOODLAND_LIMITS } from '../lib/woodland.mjs';
import { cleanFeatures } from '../lib/woodland-input.mjs';

export function woodlandServerPreview(
  state,
  userId,
  projectId,
  treatments,
  enabled,
) {
  if (!membership(state, userId))
    throw new DomainError('Active co-op membership is required.', 403);
  if (!enabled)
    throw new DomainError('Woodland projects are not enabled.', 404);
  try {
    const units = cleanFeatures(
      treatments,
      'treatments',
      WOODLAND_LIMITS.treatmentsPerPlan,
    );
    if (!units.length)
      throw new DomainError('Add at least one treatment unit.');
    if (
      new TextEncoder().encode(JSON.stringify(units)).byteLength >
      WOODLAND_LIMITS.planBytes
    )
      throw new DomainError('Simplify the treatment units.', 413);
    const {
      geometry: _geometry,
      geometryOmitted: _omitted,
      ...check
    } = previewTreatmentCheck(state, projectId, units);
    return check;
  } catch (error) {
    if (error instanceof Error && error.status >= 400 && error.status < 500)
      throw new DomainError(error.message, error.status);
    throw error;
  }
}
