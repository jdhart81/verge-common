import { validateBoundary } from './monitoring.mjs';
import { parcelConsentIsCurrent } from './readiness.mjs';

/** @param {any[]} parcels @param {{steward?: boolean, projectId?: string | null}} options */
export function cooperativeMap(
  parcels,
  { steward = false, projectId = null } = {},
) {
  const width = 720,
    height = 380,
    padding = 32;
  const empty = {
    width,
    height,
    parcels: [],
    omitted: [],
    bounds: null,
    wideExtent: false,
  };
  // The UI consumes the existing private member projection and never broadens
  // geometry access. A non-steward receives no combined map, even accidentally.
  if (!steward) return empty;
  const visible = [],
    omitted = [];
  for (const parcel of parcels) {
    if (projectId && parcel.projectId !== projectId) continue;
    if (parcel.status === 'withdrawn') continue;
    const boundary = parcel.boundaries?.at(-1);
    const omit = (reason) =>
      omitted.push({ id: parcel.id, name: parcel.name, reason });
    if (parcel.status !== 'reviewed') {
      omit('Parcel review needed');
      continue;
    }
    if (boundary?.status !== 'reviewed') {
      omit('Current boundary review needed');
      continue;
    }
    try {
      const validated = validateBoundary(boundary.geometry);
      visible.push({
        id: parcel.id,
        name: parcel.name,
        projectId: parcel.projectId,
        boundaryId: boundary.id,
        consentCurrent: parcelConsentIsCurrent(parcel),
        ...validated,
      });
    } catch {
      omit('Boundary needs correction');
    }
  }
  if (!visible.length) return { ...empty, omitted };
  const bounds = [
    Math.min(...visible.map((p) => p.bbox[0])),
    Math.min(...visible.map((p) => p.bbox[1])),
    Math.max(...visible.map((p) => p.bbox[2])),
    Math.max(...visible.map((p) => p.bbox[3])),
  ];
  const [west, south, east, north] = bounds;
  // A shared local equirectangular projection preserves relative placement
  // and aspect ratio, unlike fitting every parcel to its own independent box.
  const latitude = (south + north) / 2;
  const longitudeFactor = Math.max(1e-6, Math.cos((latitude * Math.PI) / 180));
  const spanX = (east - west) * longitudeFactor,
    spanY = north - south;
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY,
  );
  const offsetX = (width - spanX * scale) / 2,
    offsetY = (height - spanY * scale) / 2;
  return {
    width,
    height,
    bounds,
    omitted,
    wideExtent:
      east - west > 10 || north - south > 10 || Math.abs(latitude) > 80,
    parcels: visible.map(
      ({ geometry, bbox: _bbox, areaMethod: _areaMethod, ...parcel }) => ({
        ...parcel,
        points: geometry.coordinates[0].map(([longitude, latitude]) => [
          offsetX + (longitude - west) * longitudeFactor * scale,
          offsetY + (north - latitude) * scale,
        ]),
      }),
    ),
  };
}
