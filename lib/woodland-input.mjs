// Pure input preparation shared by the authoritative command and lazy browser preview.
// Keep cleaning identical to the original woodland command, including property truncation.
import { parcelConsentIsCurrent } from './readiness.mjs';
export function consentParcels(s, projectId) {
  return (s.parcels ?? [])
    .filter((p) => p.projectId === projectId && p.status !== 'withdrawn')
    .map((parcel) => {
      const boundary = parcel.boundaries?.at(-1);
      if (!boundary || boundary.status !== 'reviewed') return null;
      return {
        type: 'Feature',
        geometry: boundary.geometry,
        properties: {
          dfm_id: parcel.id,
          consent: parcelConsentIsCurrent(parcel) ? 'covered' : 'none',
        },
      };
    })
    .filter(Boolean);
}
export function cleanFeatures(list, label, max) {
  const fail = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (!Array.isArray(list))
    fail(`${label} must be a list of GeoJSON features.`);
  if (list.length > max) fail(`Use at most ${max} ${label}.`);
  return list.map((f) => {
    if (f?.type !== 'Feature' || !f.geometry)
      fail(`Every item in ${label} must be a GeoJSON Feature.`);
    const props =
      f.properties && typeof f.properties === 'object' ? f.properties : {};
    const keep = {};
    for (const k of [
      'dfm_id',
      'core_class',
      'evidence_id',
      'passage',
      'width_m',
      'period',
      'intensity',
      'corridor_permitted',
      'reason',
      'name',
    ])
      if (props[k] !== undefined)
        keep[k] =
          typeof props[k] === 'string' ? props[k].slice(0, 300) : props[k];
    return { type: 'Feature', geometry: f.geometry, properties: keep };
  });
}
export function woodlandCheckInput(layers, treatments, parcels, params) {
  return {
    ...layers,
    treatments: cleanFeatures(treatments, 'treatments', 50),
    parcels,
    params,
  };
}
