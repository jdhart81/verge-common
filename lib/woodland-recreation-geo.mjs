// Geometry for recreation uses along the corridor (lib/woodland-recreation.mjs): the ground a
// use clears, as the units the corridor check removes from retained habitat (RC3, RC6), and
// the woodlots it crosses (RC4). Server and test side only; the browser never loads Turf here.
import { area } from '@turf/area';
import { buffer } from '@turf/buffer';
import { booleanIntersects } from '@turf/boolean-intersects';
import { RECREATION_INTENSITY } from './woodland-recreation.mjs';

const round7 = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
    ),
  );

/**
 * The cleared ground of a use as check units: a trail line becomes a strip of its cleared
 * width (none when the width is 0, because no trees are cleared), and a cleared area is
 * itself. IDs are stable (`rec-<use id>-<n>`), so a stored check reproduces.
 */
export function clearedUnits(useId, features) {
  const units = [];
  features.forEach((f, i) => {
    const properties = {
      dfm_id: `rec-${useId}-${i + 1}`,
      intensity: RECREATION_INTENSITY,
      corridor_permitted: false,
      ...(f.properties?.name ? { name: f.properties.name } : {}),
    };
    if (f.geometry.type === 'Polygon')
      units.push({ type: 'Feature', geometry: f.geometry, properties });
    else if (f.properties.cleared_width_m > 0) {
      const strip = buffer(f, f.properties.cleared_width_m / 2, {
        units: 'meters',
        steps: 4,
      });
      const parts =
        strip?.geometry?.type === 'MultiPolygon'
          ? strip.geometry.coordinates.map((c) => ({
              type: 'Polygon',
              coordinates: c,
            }))
          : strip?.geometry
            ? [strip.geometry]
            : [];
      parts.forEach((geometry, j) =>
        units.push({
          type: 'Feature',
          geometry,
          properties: {
            ...properties,
            dfm_id: parts.length > 1 ? `${properties.dfm_id}-${j + 1}` : properties.dfm_id,
          },
        }),
      );
    }
  });
  return round7(units);
}

/** IDs of the woodlots (features with properties.dfm_id) any feature of a use crosses. */
export function crossedWoodlots(features, parcels) {
  return parcels
    .filter((p) => features.some((f) => booleanIntersects(f, p)))
    .map((p) => p.properties.dfm_id);
}

/**
 * An edge band's polygons as check units (AG1): the corridor check reports any overlap with
 * retained habitat or a core, and a band may have none.
 */
export function bandUnits(bandId, features) {
  return round7(
    features.map((f, i) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        dfm_id: `band-${bandId}-${i + 1}`,
        intensity: 'edge-band',
        corridor_permitted: false,
      },
    })),
  );
}

/** Area of a band in square metres, whole numbers. */
export function featuresAreaM2(features) {
  return Math.round(features.reduce((sum, f) => sum + area(f), 0));
}
