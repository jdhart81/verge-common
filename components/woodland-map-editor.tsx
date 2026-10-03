'use client';
import { lazy, Suspense, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { coordinate } from '@/lib/boundary-editor.mjs';
import {
  CORE_CHOICES,
  PASSAGE_CHOICES,
  emptyLayers,
  newFeature,
  editorFeature,
  featurePoints,
  withPoints,
  draftProblems,
  importDraft,
  sizeReport,
} from '@/lib/woodland-editor.mjs';
import { woodlandCheckInput } from '@/lib/woodland-input.mjs';
const WoodlandMap = lazy(() =>
  import('./woodland-map').then((m) => ({ default: m.WoodlandMap })),
);
export const propertyText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export type Geometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] };
export type WoodlandFeature = {
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, unknown>;
};
export type WoodlandLayers = Record<string, WoodlandFeature[]>;
export type WoodlandParams = {
  minWidthM: number;
  minWidthSource: string;
  roadWidthM?: number;
};
export type MapFeature = Omit<WoodlandFeature, 'geometry'> & {
  geometry: Geometry | { type: 'MultiPolygon'; coordinates: number[][][][] };
};
export type Preview = {
  status: 'pass' | 'fail' | 'incomplete';
  inputChecksum: string;
  reasons: string[];
  warnings: string[];
  lostLinks: {
    a: string;
    b: string;
    causes: string[];
    contributing?: string[];
  }[];
  geometry?: { type: 'FeatureCollection'; features: MapFeature[] };
};
export const LAYER_LABELS: Record<string, string> = {
  coreAreas: 'Core areas · solid',
  retained: 'Retained corridors · long dash',
  roads: 'Roads · short dash',
  water: 'Open water · dash-dot',
  crossings: 'Crossings · ring',
  treatments: 'Treatment units · dotted',
};
export function WoodlandMapEditor({
  mode,
  initialLayers,
  initialParams,
  parcels,
  disabled,
  projectId,
  envelope,
  mutate,
  notes = '',
}: {
  mode: 'layers' | 'plan';
  initialLayers: WoodlandLayers;
  initialParams: WoodlandParams;
  parcels: WoodlandFeature[];
  disabled: boolean;
  projectId: string;
  notes?: string;
  envelope: { id: string; version: number; op: string };
  mutate: (op: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState(() => ({
    layers: (mode === 'layers'
      ? Object.fromEntries(
          Object.entries(initialLayers ?? emptyLayers()).map(
            ([key, features]) => [
              key,
              features.map((f) => editorFeature(key, f)),
            ],
          ),
        )
      : structuredClone(initialLayers)) as WoodlandLayers,
    treatments: [] as WoodlandFeature[],
    params: initialParams,
  }));
  const [past, setPast] = useState<(typeof draft)[]>([]),
    [future, setFuture] = useState<(typeof draft)[]>([]);
  const [layer, setLayer] = useState(
    mode === 'plan' ? 'treatments' : 'coreAreas',
  );
  const [selected, setSelected] = useState(-1),
    [vertex, setVertex] = useState(0);
  const [longitude, setLongitude] = useState(''),
    [latitude, setLatitude] = useState('');
  const [mapOn, setMapOn] = useState(false),
    [drawing, setDrawing] = useState(false);
  const [error, setError] = useState(''),
    [previewRecord, setPreviewRecord] = useState<{
      result: Preview;
      parcels: string;
    } | null>(null),
    [checking, setChecking] = useState(false);
  const [light, setLight] = useState<string[]>([]),
    [name, setName] = useState(''),
    [period, setPeriod] = useState('');
  const preview =
    previewRecord?.parcels === JSON.stringify(parcels)
      ? previewRecord.result
      : null;
  const setPreview = (result: Preview | null) =>
    setPreviewRecord(
      result ? { result, parcels: JSON.stringify(parcels) } : null,
    );
  const list =
    layer === 'treatments' ? draft.treatments : (draft.layers[layer] ?? []);
  const feature = list[selected];
  const points = feature ? (featurePoints(feature) as number[][]) : [];
  const edit = (next: typeof draft) => {
    setPast((p) => [...p.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setPreview(null);
    setError('');
  };
  const setList = (next: WoodlandFeature[]) =>
    edit(
      layer === 'treatments'
        ? { ...draft, treatments: next }
        : { ...draft, layers: { ...draft.layers, [layer]: next } },
    );
  const update = (f: WoodlandFeature) =>
    setList(list.map((v, i) => (i === selected ? f : v)));
  const property = (key: string, value: unknown) => {
    if (feature)
      update({
        ...feature,
        properties: { ...feature.properties, [key]: value },
      });
  };
  const add = (point: number[]) => {
    if (!feature || disabled) return;
    update(withPoints(feature, [...points, point]) as WoodlandFeature);
    setVertex(points.length);
  };
  const attempt = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const payload =
    mode === 'layers'
      ? { projectId, layers: draft.layers, params: draft.params, notes }
      : { projectId, name, period, treatments: draft.treatments };
  const sizes = sizeReport(
    mode,
    draft.layers,
    draft.treatments,
    payload,
    envelope,
  );
  const problems: string[] = [
    ...draftProblems(
      mode === 'plan' ? {} : draft.layers,
      draft.treatments,
      light,
    ),
    ...sizes.problems,
  ];
  if (mode === 'layers') {
    if (draft.layers.coreAreas.length < 2)
      problems.push('Add at least two core areas.');
    if (!Number.isFinite(draft.params.minWidthM) || draft.params.minWidthM <= 0)
      problems.push('Minimum width must be positive.');
    if (!draft.params.minWidthSource.trim())
      problems.push('Minimum width source is required.');
    if (
      draft.params.roadWidthM != null &&
      (!Number.isFinite(draft.params.roadWidthM) ||
        draft.params.roadWidthM <= 0)
    )
      problems.push('Road width must be positive.');
  } else if (!draft.treatments.length)
    problems.push('Add at least one treatment unit.');
  const blocked = disabled || checking || problems.length > 0;
  const runPreview = () =>
    attempt(async () => {
      setChecking(true);
      try {
        const core = await import('@viridis/dfm-core');
        setLight([...core.LIGHT_INTENSITIES]);
        const issues = draftProblems(
          mode === 'plan' ? {} : draft.layers,
          draft.treatments,
          core.LIGHT_INTENSITIES,
        );
        if (issues.length) throw new Error(issues.join(' '));
        const result = core.checkConnectivitySync(
          woodlandCheckInput(
            draft.layers,
            draft.treatments,
            parcels,
            draft.params,
          ),
        ) as Preview;
        setPreview({ ...result, lostLinks: result.lostLinks ?? [] });
      } finally {
        setChecking(false);
      }
    });
  const label = (key: string, text: string) => (
    <label className="block mt-2" htmlFor={`${prefix}-${key}`}>
      {text}
    </label>
  );
  return (
    <div
      className="min-w-0 max-w-full mt-4 rounded-xl border p-3"
      data-woodland-editor={mode}
    >
      <h4>
        {mode === 'layers' ? 'Draw corridor layers' : 'Draw treatment plan'}
      </h4>
      <p className="small">
        Private draft in this page only. Coordinates are WGS84 longitude,
        latitude. Select a feature to edit its vertices.
      </p>
      <fieldset disabled={disabled || checking} className="min-w-0">
        {mode === 'layers' && (
          <>
            {label('width', 'Minimum width (m)')}
            <Input
              id={`${prefix}-width`}
              type="number"
              value={draft.params.minWidthM}
              onChange={(e) =>
                edit({
                  ...draft,
                  params: {
                    ...draft.params,
                    minWidthM: Number(e.target.value),
                  },
                })
              }
            />
            {label('source', 'Minimum width source')}
            <Input
              id={`${prefix}-source`}
              maxLength={300}
              value={draft.params.minWidthSource}
              onChange={(e) =>
                edit({
                  ...draft,
                  params: { ...draft.params, minWidthSource: e.target.value },
                })
              }
            />
            {label('roadwidth', 'Road width (m)')}
            <Input
              id={`${prefix}-roadwidth`}
              type="number"
              value={draft.params.roadWidthM ?? ''}
              onChange={(e) =>
                edit({
                  ...draft,
                  params: {
                    ...draft.params,
                    roadWidthM:
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                  },
                })
              }
            />
          </>
        )}
        {mode === 'plan' && (
          <>
            {label('name', 'Plan name')}
            <Input
              id={`${prefix}-name`}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {label('period', 'Period')}
            <Input
              id={`${prefix}-period`}
              maxLength={60}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
            <p className="small">
              Reviewed corridor layers and parcel boundaries are read-only.
            </p>
          </>
        )}
        {label('layer', 'Drawing layer')}
        <NativeSelect
          className="w-full"
          id={`${prefix}-layer`}
          value={layer}
          onChange={(e) => {
            setLayer(e.target.value);
            setSelected(-1);
            setDrawing(false);
          }}
        >
          {Object.entries(LAYER_LABELS)
            .filter(([k]) =>
              mode === 'plan' ? k === 'treatments' : k !== 'treatments',
            )
            .map(([k, v]) => (
              <NativeSelectOption key={k} value={k}>
                {v}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            onClick={() => {
              setList([...list, newFeature(layer) as WoodlandFeature]);
              setSelected(list.length);
              setLongitude('');
              setLatitude('');
              setVertex(0);
              setDrawing(true);
            }}
          >
            New feature
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!feature}
            onClick={() => setDrawing(!drawing)}
          >
            {drawing ? 'Finish drawing' : 'Draw by clicking'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!feature}
            onClick={() => {
              setList(list.filter((_, i) => i !== selected));
              setSelected(-1);
            }}
          >
            Delete feature
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!past.length}
            onClick={() => {
              setFuture([draft, ...future]);
              setDraft(past.at(-1)!);
              setPast(past.slice(0, -1));
              setPreview(null);
            }}
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!future.length}
            onClick={() => {
              setPast([...past, draft]);
              setDraft(future[0]);
              setFuture(future.slice(1));
              setPreview(null);
            }}
          >
            Redo
          </Button>
        </div>
        {label('feature', 'Select feature')}
        <NativeSelect
          className="w-full"
          id={`${prefix}-feature`}
          value={selected}
          onChange={(e) => {
            const index = Number(e.target.value);
            setSelected(index);
            setVertex(0);
            const first = list[index]
              ? featurePoints(list[index])[0]
              : undefined;
            setLongitude(first ? String(first[0]) : '');
            setLatitude(first ? String(first[1]) : '');
          }}
        >
          <NativeSelectOption value={-1}>Choose a feature</NativeSelectOption>
          {list.map((f, i) => (
            <NativeSelectOption key={String(f.properties.dfm_id)} value={i}>
              {i + 1}. {propertyText(f.properties.name) || LAYER_LABELS[layer]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <aside
            aria-label="Feature properties and vertices"
            className="min-w-0"
          >
            {feature && (
              <>
                <p className="small break-all">
                  dfm_id: {String(feature.properties.dfm_id)}
                </p>
                {label('feature-name', 'Feature name')}
                <Input
                  id={`${prefix}-feature-name`}
                  maxLength={300}
                  value={propertyText(feature.properties.name)}
                  onChange={(e) => property('name', e.target.value)}
                />
                {layer === 'coreAreas' && (
                  <>
                    {label('class', 'Core class')}
                    <NativeSelect
                      className="w-full"
                      id={`${prefix}-class`}
                      value={String(feature.properties.core_class)}
                      onChange={(e) => property('core_class', e.target.value)}
                    >
                      {CORE_CHOICES.map((v) => (
                        <NativeSelectOption key={v} value={v}>
                          {v}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </>
                )}
                {layer === 'crossings' && (
                  <>
                    {label('passage', 'Crossing passage')}
                    <NativeSelect
                      className="w-full"
                      id={`${prefix}-passage`}
                      value={String(feature.properties.passage)}
                      onChange={(e) => property('passage', e.target.value)}
                    >
                      {PASSAGE_CHOICES.map((v) => (
                        <NativeSelectOption key={v} value={v}>
                          {v}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </>
                )}
                {layer === 'treatments' && (
                  <>
                    {label('intensity', 'Treatment intensity')}
                    {feature.properties.corridor_permitted ? (
                      <NativeSelect
                        className="w-full"
                        id={`${prefix}-intensity`}
                        value={String(feature.properties.intensity)}
                        onChange={(e) => property('intensity', e.target.value)}
                      >
                        <NativeSelectOption value="">
                          Choose light intensity
                        </NativeSelectOption>
                        {light.map((v) => (
                          <NativeSelectOption key={v} value={v}>
                            {v}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input
                        id={`${prefix}-intensity`}
                        maxLength={300}
                        value={String(feature.properties.intensity)}
                        onChange={(e) => property('intensity', e.target.value)}
                      />
                    )}
                    <label className="block mt-2">
                      <input
                        type="checkbox"
                        checked={!!feature.properties.corridor_permitted}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          property('corridor_permitted', checked);
                          if (checked)
                            void attempt(async () =>
                              setLight([
                                ...(await import('@viridis/dfm-core'))
                                  .LIGHT_INTENSITIES,
                              ]),
                            );
                        }}
                      />{' '}
                      Corridor permitted
                    </label>
                    {label('reason', 'Reason for corridor permission')}
                    <Input
                      id={`${prefix}-reason`}
                      maxLength={300}
                      value={propertyText(feature.properties.reason)}
                      onChange={(e) => property('reason', e.target.value)}
                    />
                  </>
                )}
                {label('vertex', 'Select vertex')}
                <NativeSelect
                  className="w-full"
                  id={`${prefix}-vertex`}
                  value={vertex}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setVertex(i);
                    setLongitude(String(points[i]?.[0] ?? ''));
                    setLatitude(String(points[i]?.[1] ?? ''));
                  }}
                >
                  {points.map((_, i) => (
                    <NativeSelectOption key={i} value={i}>
                      Vertex {i + 1}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {label('longitude', 'Longitude')}
                <Input
                  id={`${prefix}-longitude`}
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
                {label('latitude', 'Latitude')}
                <Input
                  id={`${prefix}-latitude`}
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    onClick={() =>
                      void attempt(async () =>
                        add(coordinate(longitude, latitude)),
                      )
                    }
                  >
                    Add coordinate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!points.length}
                    onClick={() =>
                      void attempt(async () =>
                        update(
                          withPoints(
                            feature,
                            points.map((p, i) =>
                              i === vertex
                                ? coordinate(longitude, latitude)
                                : p,
                            ),
                          ) as WoodlandFeature,
                        ),
                      )
                    }
                  >
                    Update vertex
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!points.length}
                    onClick={() =>
                      update(
                        withPoints(
                          feature,
                          points.filter((_, i) => i !== vertex),
                        ) as WoodlandFeature,
                      )
                    }
                  >
                    Remove vertex
                  </Button>
                </div>
              </>
            )}
          </aside>
          <section aria-label="Woodland drawing map" className="min-w-0">
            <p className="small mt-3">
              The optional background map downloads tiles from OpenFreeMap,
              revealing the area viewed to that provider. Load it only if you
              agree. Drawing works without it.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMapOn(!mapOn)}
            >
              {mapOn ? 'Turn off background map' : 'Load background map'}
            </Button>
            {mapOn && (
              <Suspense fallback={<p>Loading map controls…</p>}>
                <WoodlandMap
                  layers={draft.layers}
                  treatments={draft.treatments}
                  parcels={parcels}
                  loss={
                    preview?.geometry?.features.filter(
                      (f) => f.properties.dfm_layer === 'connectivity-loss',
                    ) ?? []
                  }
                  points={points}
                  drawing={drawing && !!feature}
                  disabled={disabled || checking}
                  onAdd={add}
                  onMove={(i, p) => {
                    if (feature)
                      update(
                        withPoints(
                          feature,
                          points.map((v, j) => (i === j ? p : v)),
                        ) as WoodlandFeature,
                      );
                  }}
                  onSelect={(i) => {
                    setVertex(i);
                    setLongitude(String(points[i]?.[0] ?? ''));
                    setLatitude(String(points[i]?.[1] ?? ''));
                  }}
                />
              </Suspense>
            )}
          </section>
        </div>
        <p className="small mt-3">
          Legend: {Object.values(LAYER_LABELS).join('; ')}; parcel reference ·
          fine dash; connectivity loss · red dashed.
        </p>
        {label(
          'import',
          mode === 'layers'
            ? 'Landscape Package upload'
            : 'GeoJSON plan upload',
        )}
        <Input
          id={`${prefix}-import`}
          type="file"
          accept=".json,.geojson,application/json,application/geo+json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            void attempt(async () => {
              if (!file) return;
              if (file.size > 100000)
                throw new Error('File must be under 100000 bytes.');
              const imported = importDraft(JSON.parse(await file.text()), mode);
              edit(
                mode === 'layers'
                  ? {
                      ...draft,
                      layers: imported.layers as WoodlandLayers,
                      params: {
                        minWidthM: Number(imported.params.minWidthM),
                        minWidthSource: String(
                          imported.params.minWidthSource ?? '',
                        ),
                        roadWidthM: imported.params.roadWidthM,
                      },
                    }
                  : {
                      ...draft,
                      treatments: imported.treatments as WoodlandFeature[],
                    },
              );
              setSelected(-1);
            });
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void attempt(async () => {
                const { toLandscapePackage } =
                  await import('@viridis/dfm-core');
                const pkg = toLandscapePackage(
                  {
                    ...draft.layers,
                    treatments: draft.treatments,
                    parcels,
                    params: draft.params,
                  },
                  { name: name || 'Woodland draft', generator: 'VergeCommon' },
                );
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(pkg, null, 2) + '\n'], {
                    type: 'application/json',
                  }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'woodland-draft.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Download Landscape Package
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() => void runPreview()}
          >
            Preview corridor check
          </Button>
          <Button
            type="button"
            disabled={
              blocked || (mode === 'plan' && (!name.trim() || !period.trim()))
            }
            onClick={() =>
              void attempt(async () => {
                if (
                  await mutate(
                    mode === 'layers'
                      ? 'save_woodland_layers'
                      : 'submit_treatment_plan',
                    payload,
                  )
                )
                  setPreview(null);
              })
            }
          >
            {mode === 'layers'
              ? 'Submit layers for review'
              : 'Check and submit plan'}
          </Button>
        </div>
      </fieldset>
      <output className="small block mt-3" aria-live="polite">
        Draft: {sizes.bytes} / {sizes.limit} bytes · Request:{' '}
        {sizes.requestBytes} / 100000 bytes (strictly under) ·{' '}
        {mode === 'plan'
          ? `${draft.treatments.length} / 50 units`
          : Object.entries(draft.layers)
              .map(([k, v]) => `${k}: ${v.length} / 400`)
              .join(' · ')}
      </output>
      {problems.length > 0 && (
        <ul aria-label="Draft problems" className="small break-words">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section
          aria-label="Local corridor preview"
          aria-live="polite"
          className="mt-3 break-words"
          data-preview-checksum={preview.inputChecksum}
        >
          <strong>Local corridor preview: {preview.status}</strong>
          <p>
            The server checks the plan again when submitted. Changes to reviewed
            layers or consents may change its result.
          </p>
          <ul>
            {preview.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {preview.lostLinks.map((l, i) => (
            <p key={i}>
              Lost link {l.a}–{l.b}. Responsible units:{' '}
              {[...l.causes, ...(l.contributing ?? [])]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map(
                  (id) =>
                    `${propertyText(draft.treatments.find((f) => f.properties.dfm_id === id)?.properties.name) || id} (${id})`,
                )
                .join(', ') || 'combined plan'}
              .
            </p>
          ))}
          <details>
            <summary>Preview warnings and checksum</summary>
            <ul>
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="break-all">{preview.inputChecksum}</p>
          </details>
        </section>
      )}
    </div>
  );
}
