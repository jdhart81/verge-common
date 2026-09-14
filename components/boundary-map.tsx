'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import { boundaryFeatures } from '@/lib/boundary-editor.mjs';

type Point = number[];
type Props = {
  points: Point[];
  drawing: boolean;
  disabled: boolean;
  focus: { point: Point; request: number } | null;
  onAdd: (point: Point) => void;
  onMove: (index: number, point: Point) => void;
  onSelect: (index: number) => void;
};

export function BoundaryMap(props: Props) {
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
        const points = latest.current.points;
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
        const locate = new lib.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
        });
        instance.addControl(locate, 'top-right');
        locate.on('error', () =>
          setError(
            'Location is unavailable. Pan the map or enter coordinates instead.',
          ),
        );
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
            data: boundaryFeatures([]) as Parameters<
              GeoJSONSource['setData']
            >[0],
          });
          instance.addLayer({
            id: 'boundary-fill',
            type: 'fill',
            source: 'boundary',
            filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-color': '#315a48', 'fill-opacity': 0.2 },
          });
          instance.addLayer({
            id: 'boundary-line',
            type: 'line',
            source: 'boundary',
            filter: ['==', '$type', 'LineString'],
            paint: { 'line-color': '#193628', 'line-width': 3 },
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
      boundaryFeatures(props.points) as Parameters<GeoJSONSource['setData']>[0],
    );
    instance.getCanvas().style.cursor =
      props.drawing && !props.disabled ? 'crosshair' : '';
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    void import('maplibre-gl').then(({ Marker }) => {
      if (cancelled) return;
      markers.current = props.points.map((point, index) => {
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
      });
    });
    return () => {
      cancelled = true;
    };
  }, [props.points, props.drawing, props.disabled, ready]);

  useEffect(() => {
    if (ready && props.focus)
      map.current?.flyTo({
        center: [props.focus.point[0], props.focus.point[1]],
        zoom: 17,
      });
  }, [props.focus, ready]);

  return (
    <div className="mt-4">
      <div
        ref={container}
        className="h-[420px] w-full overflow-hidden rounded-xl border"
        aria-label="Private parcel boundary map"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          type="button"
          variant="outline"
          disabled={!ready || !props.points.length}
          onClick={() => map.current && fit(map.current, props.points)}
        >
          Fit boundary
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
