'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import { featurePoints } from '@/lib/woodland-editor.mjs';
import {
  propertyText,
  type WoodlandFeature,
  type MapFeature,
  type WoodlandLayers,
} from './woodland-map-editor';

type Point = number[];
type Props = {
  points: Point[];
  drawing: boolean;
  disabled: boolean;
  layers: WoodlandLayers;
  treatments: WoodlandFeature[];
  parcels: WoodlandFeature[];
  loss: MapFeature[];
  onAdd: (point: Point) => void;
  onMove: (index: number, point: Point) => void;
  onSelect: (index: number) => void;
};

export function WoodlandMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const latest = useRef(props);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);

  useEffect(() => {
    let cancelled = false;
    let instance: LibreMap | null = null;
    let resize: ResizeObserver | null = null;
    const slowMessage =
      'The background map is taking too long to load. You can keep editing coordinates, retry, or turn off the map.';
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setError(slowMessage);
    }, 15000);
    void (async () => {
      try {
        const lib = await import('maplibre-gl');
        const { default: workerUrl } =
          await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url');
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !container.current) return;
        // MapLibre's computed relative worker URL cannot survive Vite chunk naming.
        lib.setWorkerUrl(workerUrl);
        const points = allPoints(latest.current);
        instance = new lib.Map({
          container: container.current,
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: points.length ? [points[0][0], points[0][1]] : [0, 20],
          zoom: points.length ? 16 : 1,
          renderWorldCopies: false,
          attributionControl: { compact: false },
        });
        map.current = instance;
        instance.addControl(new lib.NavigationControl(), 'top-right');
        instance.on('error', () => {
          clearTimeout(loadingTimeout);
          setError(
            'The background map could not fully load. Your draft is still available below. Retry or turn off the map to continue with coordinates.',
          );
        });
        instance.once('load', () => {
          clearTimeout(loadingTimeout);
          setError((current) => (current === slowMessage ? '' : current));
        });
        instance.once('style.load', () => {
          if (cancelled || !instance) return;
          instance.addSource('boundary', {
            type: 'geojson',
            data: mapFeatures(latest.current) as Parameters<
              GeoJSONSource['setData']
            >[0],
          });
          const styles: [string, string, number[]][] = [
            ['coreAreas', '#235b35', [1, 0]],
            ['retained', '#8b6c15', [6, 2]],
            ['roads', '#353535', [2, 2]],
            ['water', '#176da5', [6, 2, 1, 2]],
            ['streams', '#0b5d8f', [1, 0]],
            ['connectors', '#6b4aa0', [8, 2, 1, 2]],
            ['treatments', '#a63aa6', [1, 2]],
            ['parcels', '#555555', [2, 4]],
            ['loss', '#df2424', [5, 2]],
          ];
          for (const [layer, color, dash] of styles) {
            instance.addLayer({
              id: layer + '-fill',
              type: 'fill',
              source: 'boundary',
              filter: [
                'all',
                ['==', '$type', 'Polygon'],
                ['==', 'editor_layer', layer],
              ],
              paint: {
                'fill-color': color,
                'fill-opacity': layer === 'loss' ? 0.45 : 0.15,
              },
            });
            instance.addLayer({
              id: layer + '-line',
              type: 'line',
              source: 'boundary',
              filter: [
                'all',
                ['!=', '$type', 'Point'],
                ['==', 'editor_layer', layer],
              ],
              paint: {
                'line-color': color,
                'line-width': layer === 'loss' ? 4 : layer === 'streams' ? 3 : 2,
                'line-dasharray': dash,
              },
            });
          }
          instance.addLayer({
            id: 'crossings-ring',
            type: 'circle',
            source: 'boundary',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 7,
              'circle-color': '#fff',
              'circle-stroke-color': '#333',
              'circle-stroke-width': 3,
            },
          });
          instance.addLayer({
            id: 'feature-labels',
            type: 'symbol',
            source: 'boundary',
            layout: {
              'text-field': ['get', 'editor_label'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 12,
              'text-offset': [0, 1.5],
            },
            paint: {
              'text-color': '#222',
              'text-halo-color': '#fff',
              'text-halo-width': 2,
            },
          });
          if (points.length > 1) fit(instance, points);
          setReady(true);
        });
        instance.on('click', (event) => {
          if (!latest.current.drawing || latest.current.disabled) return;
          latest.current.onAdd([event.lngLat.wrap().lng, event.lngLat.lat]);
        });
        resize = new ResizeObserver(() => instance?.resize());
        resize.observe(container.current);
      } catch {
        clearTimeout(loadingTimeout);
        if (!cancelled)
          setError(
            'This browser could not start the map. Use the coordinate editor or upload a boundary below.',
          );
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
      resize?.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance?.remove();
      map.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!ready || !map.current) return;
    let cancelled = false;
    const instance = map.current;
    void (instance.getSource('boundary') as GeoJSONSource)?.setData(
      mapFeatures(latest.current) as Parameters<GeoJSONSource['setData']>[0],
    );
    instance.getCanvas().style.cursor =
      props.drawing && !props.disabled ? 'crosshair' : '';
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    void import('maplibre-gl').then(({ Marker }) => {
      if (cancelled) return;
      markers.current = props.points
        .map((point, index) => {
          if (!validPoint(point)) return null;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = String(index + 1);
          button.setAttribute('aria-label', `Select corner ${index + 1}`);
          button.style.cssText =
            'width:28px;height:28px;border-radius:50%;background:#fff;color:#193628;border:2px solid #193628;font-size:12px;font-weight:bold;cursor:pointer';
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            latest.current.onSelect(index);
          });
          const marker = new Marker({
            element: button,
            draggable: !props.disabled,
          })
            .setLngLat([point[0], point[1]])
            .addTo(instance);
          marker.on('dragend', () => {
            const location = marker.getLngLat().wrap();
            // Reset immediately if a move is rejected; accepted moves arrive through props.
            const original = latest.current.points[index];
            if (original) marker.setLngLat([original[0], original[1]]);
            if (!latest.current.disabled)
              latest.current.onMove(index, [location.lng, location.lat]);
          });
          return marker;
        })
        .filter((marker): marker is Marker => marker !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    props.points,
    props.layers,
    props.treatments,
    props.parcels,
    props.loss,
    props.drawing,
    props.disabled,
    ready,
  ]);

  return (
    <div className="mt-4">
      <div
        ref={container}
        className="h-[420px] w-full overflow-hidden rounded-xl border"
        aria-label="Private woodland map"
        data-loss-feature-count={props.loss.length}
      />
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          type="button"
          variant="outline"
          disabled={!ready || !allPoints(props).length}
          onClick={() => map.current && fit(map.current, allPoints(props))}
        >
          Fit to features
        </Button>
        {error && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReady(false);
              setError('');
              setAttempt((n) => n + 1);
            }}
          >
            Retry map
          </Button>
        )}
      </div>
      {!ready && !error && (
        <output className="small block">Loading background map…</output>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

function fit(map: LibreMap, points: Point[]) {
  if (!points.length) return;
  map.fitBounds(
    [
      [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
      ],
      [
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    ],
    { padding: 45, maxZoom: 18, duration: 400 },
  );
}

function allPoints(props: Props): Point[] {
  return [
    ...Object.values(props.layers).flat(),
    ...props.treatments,
    ...props.parcels,
  ]
    .flatMap((f) => featurePoints(f))
    .concat(props.points)
    .filter(validPoint);
}
function mapFeatures(props: Props) {
  const features = Object.entries({
    ...props.layers,
    treatments: props.treatments,
    parcels: props.parcels,
    loss: props.loss,
  }).flatMap(([layer, list]) =>
    list.flatMap((f) => {
      let geometry = f.geometry;
      if (!Array.isArray(geometry.coordinates)) return [];
      const pointsForMap =
        geometry.type === 'MultiPolygon'
          ? geometry.coordinates.flat(2)
          : geometry.type === 'Polygon'
            ? geometry.coordinates.flat()
            : featurePoints(f);
      if (pointsForMap.some((point: number[]) => !validPoint(point))) return [];
      if (geometry.type === 'Point' && geometry.coordinates.length !== 2)
        return [];
      if (geometry.type === 'LineString' && geometry.coordinates.length < 2)
        return [];
      if (
        geometry.type === 'Polygon' &&
        (geometry.coordinates[0]?.length ?? 0) < 4
      ) {
        const points = featurePoints(f);
        if (points.length < 2) return [];
        geometry = { type: 'LineString', coordinates: points };
      }
      return [
        {
          ...f,
          geometry,
          properties: {
            ...f.properties,
            editor_layer: layer,
            editor_label:
              layer +
              ': ' +
              (propertyText(f.properties.name) ||
                propertyText(f.properties.dfm_id)),
          },
        },
      ];
    }),
  );
  return { type: 'FeatureCollection', features };
}

function validPoint(p: number[]): boolean {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(Number.isFinite) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}
