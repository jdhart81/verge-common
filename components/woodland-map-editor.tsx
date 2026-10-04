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
  LINK_KINDS,
  emptyLayers,
  newFeature,
  editorFeature,
  featurePoints,
  withPoints,
  draftProblems,
  importDraft,
  mergeSpineDraft,
  sizeReport,
} from '@/lib/woodland-editor.mjs';
import { woodlandCheckInput } from '@/lib/woodland-input.mjs';
import {
  spineParams,
  spineProblems,
  MAX_STREAM_ORDER,
} from '@/lib/woodland-spine.mjs';
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
  // Optional old-growth spine, age and climate settings (docs/WOODLAND.md).
  spineWidthByOrderM?: Record<string, number>;
  spineWidthSource?: string;
  connectorWidthM?: number;
  connectorWidthSource?: string;
  ageAsOfYear?: number;
  oldGrowthAgeYears?: number;
  oldGrowthAgeSource?: string;
  milestoneYears?: number[];
  coreTempSource?: string;
  climateWarmingC?: number;
  climateSource?: string;
};
type NumberParam =
  | 'connectorWidthM'
  | 'ageAsOfYear'
  | 'oldGrowthAgeYears'
  | 'climateWarmingC';
type TextParam =
  | 'spineWidthSource'
  | 'connectorWidthSource'
  | 'oldGrowthAgeSource'
  | 'coreTempSource'
  | 'climateSource';
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
  streams: 'Streams (spine) · solid line',
  connectors: 'Ridge, valley and saddle links (spine) · long dash-dot',
  treatments: 'Treatment units · dotted',
};
const SPINE_LINE_LAYERS = ['streams', 'connectors'];
const optionalNumber = (value: string) =>
  value.trim() === '' ? undefined : Number(value);
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
    [preview, setLocalPreview] = useState<Preview | null>(null),
    [serverPreview, setServerPreview] = useState<Preview | null>(null),
    [checking, setChecking] = useState(false);
  const [light, setLight] = useState<string[]>([]),
    [name, setName] = useState(''),
    [period, setPeriod] = useState('');
  const [spineNote, setSpineNote] = useState<{
    status: string;
    count: number;
    reasons: string[];
    warnings: string[];
  } | null>(null);
  const [milestoneText, setMilestoneText] = useState(
    (initialParams.milestoneYears ?? []).join(', '),
  );
  const setPreview = (result: Preview | null) => {
    setLocalPreview(result);
    if (!result) setServerPreview(null);
  };
  const list =
    layer === 'treatments' ? draft.treatments : (draft.layers[layer] ?? []);
  const feature = list[selected];
  const points = feature ? (featurePoints(feature) as number[][]) : [];
  const edit = (next: typeof draft) => {
    setPast((p) => [...p.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setPreview(null);
    setSpineNote(null);
    setError('');
  };
  const setParams = (changes: Partial<WoodlandParams>) =>
    edit({ ...draft, params: { ...draft.params, ...changes } });
  const numberParam = (key: NumberParam, value: string) =>
    setParams({ [key]: optionalNumber(value) });
  const textParam = (key: TextParam, value: string) =>
    setParams({ [key]: value.trim() ? value : undefined });
  const widthTable = draft.params.spineWidthByOrderM ?? {};
  const setOrderWidth = (order: number, value: string) => {
    const table: Record<string, number> = { ...widthTable };
    const width = optionalNumber(value);
    if (width === undefined) delete table[order];
    else table[order] = width;
    setParams({
      spineWidthByOrderM: Object.keys(table).length ? table : undefined,
    });
  };
  const streamOrders = (draft.layers.streams ?? [])
    .map((f) => f.properties.stream_order)
    .filter((n): n is number => Number.isInteger(n));
  const orders = Array.from(
    {
      length: Math.min(
        MAX_STREAM_ORDER,
        Math.max(3, ...streamOrders, ...Object.keys(widthTable).map(Number)),
      ),
    },
    (_, i) => i + 1,
  );
  const spineLines = SPINE_LINE_LAYERS.flatMap(
    (k) => draft.layers[k] ?? [],
  );
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
    problems.push(
      ...spineProblems(draft.layers, draft.params, new Date().getUTCFullYear()),
    );
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
          woodlandCheckInput(draft.layers, draft.treatments, [], draft.params),
        ) as Preview;
        setPreview({ ...result, lostLinks: result.lostLinks ?? [] });
      } finally {
        setChecking(false);
      }
    });
  // WS6: the engine drafts corridors along the spine lines; a steward reviews them like any
  // retained corridor and submits the layers for another steward's review.
  const draftSpine = () =>
    attempt(async () => {
      setChecking(true);
      try {
        const core = await import('@viridis/dfm-core');
        const result = core.deriveSpine({
          streams: draft.layers.streams ?? [],
          connectors: draft.layers.connectors ?? [],
          water: draft.layers.water ?? [],
          params: draft.params,
        });
        if (result.status === 'ok')
          edit({
            ...draft,
            layers: {
              ...draft.layers,
              retained: mergeSpineDraft(
                draft.layers.retained ?? [],
                result.features,
                spineLines,
              ) as WoodlandFeature[],
            },
          });
        setSpineNote({
          status: result.status,
          count: result.features.length,
          reasons: result.reasons,
          warnings: result.warnings,
        });
      } finally {
        setChecking(false);
      }
    });
  const runServerPreview = () =>
    attempt(async () => {
      setChecking(true);
      setServerPreview(null);
      try {
        const response = await fetch('/api/woodland-preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: envelope.id,
            projectId,
            treatments: draft.treatments,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data: { check?: Preview; error?: string } = await response.json();
        if (!response.ok || !data.check)
          throw new Error(data.error || 'Server preview failed.');
        setServerPreview(data.check);
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
            <details className="mt-3" data-spine-settings>
              <summary>Old-growth spine settings (optional)</summary>
              <p className="small">
                Corridor widths by stream order, from your co-op policy or a
                forester. Each is at least the minimum width, and a larger
                stream never gets a narrower corridor. Without a table, every
                stream uses the minimum width plus the 10% pinch margin.
              </p>
              <div className="grid min-w-0 gap-x-3 sm:grid-cols-3">
                {orders.map((order) => (
                  <div key={order} className="min-w-0">
                    {label(`order-${order}`, `Order ${order} width (m)`)}
                    <Input
                      id={`${prefix}-order-${order}`}
                      type="number"
                      min={0}
                      value={widthTable[order] ?? ''}
                      onChange={(e) => setOrderWidth(order, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              {label('spine-source', 'Spine width source')}
              <Input
                id={`${prefix}-spine-source`}
                maxLength={300}
                value={draft.params.spineWidthSource ?? ''}
                onChange={(e) => textParam('spineWidthSource', e.target.value)}
              />
              {label('link-width', 'Ridge, valley and saddle link width (m)')}
              <Input
                id={`${prefix}-link-width`}
                type="number"
                min={0}
                value={draft.params.connectorWidthM ?? ''}
                onChange={(e) => numberParam('connectorWidthM', e.target.value)}
              />
              {label('link-source', 'Link width source')}
              <Input
                id={`${prefix}-link-source`}
                maxLength={300}
                value={draft.params.connectorWidthSource ?? ''}
                onChange={(e) =>
                  textParam('connectorWidthSource', e.target.value)
                }
              />
            </details>
            <details className="mt-3" data-age-settings>
              <summary>Stand ages and climate (optional)</summary>
              <p className="small">
                Projections need the year stand ages were recorded and, to
                show old-growth age, a threshold with its source. Climate
                routes need core temperatures with their source. Age is not
                condition, and neither predicts what species will do.
              </p>
              {label('as-of', 'Year stand ages were recorded')}
              <Input
                id={`${prefix}-as-of`}
                type="number"
                value={draft.params.ageAsOfYear ?? ''}
                onChange={(e) => numberParam('ageAsOfYear', e.target.value)}
              />
              {label('og-age', 'Old-growth age threshold (years)')}
              <Input
                id={`${prefix}-og-age`}
                type="number"
                min={0}
                value={draft.params.oldGrowthAgeYears ?? ''}
                onChange={(e) =>
                  numberParam('oldGrowthAgeYears', e.target.value)
                }
              />
              {label('og-source', 'Old-growth age source')}
              <Input
                id={`${prefix}-og-source`}
                maxLength={300}
                value={draft.params.oldGrowthAgeSource ?? ''}
                onChange={(e) => textParam('oldGrowthAgeSource', e.target.value)}
              />
              {label('milestones', 'Milestone years, comma-separated')}
              <Input
                id={`${prefix}-milestones`}
                inputMode="numeric"
                placeholder="Default: now, +10, +25, +50 and +100 years"
                value={milestoneText}
                onChange={(e) => {
                  setMilestoneText(e.target.value);
                  const years = e.target.value
                    .split(/[\s,]+/)
                    .filter(Boolean)
                    .map(Number);
                  setParams({ milestoneYears: years.length ? years : undefined });
                }}
              />
              {label('temp-source', 'Core temperature source')}
              <Input
                id={`${prefix}-temp-source`}
                maxLength={300}
                value={draft.params.coreTempSource ?? ''}
                onChange={(e) => textParam('coreTempSource', e.target.value)}
              />
              {label('warming', 'Warming to plan for (°C)')}
              <Input
                id={`${prefix}-warming`}
                type="number"
                min={0}
                step="0.1"
                value={draft.params.climateWarmingC ?? ''}
                onChange={(e) => numberParam('climateWarmingC', e.target.value)}
              />
              {label('warming-source', 'Warming source')}
              <Input
                id={`${prefix}-warming-source`}
                maxLength={300}
                value={draft.params.climateSource ?? ''}
                onChange={(e) => textParam('climateSource', e.target.value)}
              />
            </details>
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
                {layer === 'streams' && (
                  <>
                    {label('order', 'Stream order (Strahler)')}
                    <NativeSelect
                      className="w-full"
                      id={`${prefix}-order`}
                      value={propertyText(feature.properties.stream_order)}
                      onChange={(e) =>
                        property('stream_order', Number(e.target.value))
                      }
                    >
                      {Array.from(
                        { length: MAX_STREAM_ORDER },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <NativeSelectOption key={n} value={n}>
                          {n}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </>
                )}
                {layer === 'connectors' && (
                  <>
                    {label('kind', 'Link kind')}
                    <NativeSelect
                      className="w-full"
                      id={`${prefix}-kind`}
                      value={String(feature.properties.kind)}
                      onChange={(e) => property('kind', e.target.value)}
                    >
                      {LINK_KINDS.map((v: string) => (
                        <NativeSelectOption key={v} value={v}>
                          {v}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </>
                )}
                {(layer === 'retained' || layer === 'coreAreas') && (
                  <>
                    {label('age', 'Stand age in years (optional)')}
                    <Input
                      id={`${prefix}-age`}
                      type="number"
                      min={0}
                      max={3000}
                      value={propertyText(feature.properties.stand_age)}
                      onChange={(e) =>
                        property('stand_age', optionalNumber(e.target.value))
                      }
                    />
                  </>
                )}
                {layer === 'coreAreas' && (
                  <>
                    {label('temp', 'Mean temperature °C (optional)')}
                    <Input
                      id={`${prefix}-temp`}
                      type="number"
                      step="0.1"
                      value={propertyText(feature.properties.temp_c)}
                      onChange={(e) =>
                        property('temp_c', optionalNumber(e.target.value))
                      }
                    />
                  </>
                )}
                {layer === 'retained' && feature.properties.spine === true && (
                  <p className="small">
                    Drafted spine corridor (
                    {propertyText(feature.properties.origin)},{' '}
                    {propertyText(feature.properties.width_m)} m:{' '}
                    {propertyText(feature.properties.width_source)}). Drafting
                    again replaces it and keeps its name and stand age.
                  </p>
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
                        ...(spineParams(
                          imported.params,
                        ) as Partial<WoodlandParams>),
                      },
                    }
                  : {
                      ...draft,
                      treatments: imported.treatments as WoodlandFeature[],
                    },
              );
              setSelected(-1);
              if (mode === 'layers')
                setMilestoneText(
                  (spineParams(imported.params).milestoneYears ?? []).join(
                    ', ',
                  ),
                );
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
          {mode === 'layers' && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || checking || !spineLines.length}
              onClick={() => void draftSpine()}
            >
              Draft spine corridors
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() => void runPreview()}
          >
            Preview corridor check
          </Button>
          {mode === 'plan' && (
            <Button
              type="button"
              variant="outline"
              disabled={blocked}
              onClick={() => void runServerPreview()}
            >
              Preview with co-op inputs
            </Button>
          )}
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
                  setLocalPreview(null);
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
      {spineNote && (
        <section
          aria-label="Spine draft"
          aria-live="polite"
          className="mt-3 break-words"
          data-spine-draft-status={spineNote.status}
        >
          <strong>
            {spineNote.status === 'ok'
              ? `Spine draft: ${spineNote.count} corridors in Retained corridors`
              : 'Spine draft: not drafted'}
          </strong>
          {spineNote.status === 'ok' && (
            <p>
              Check each drafted corridor against the ground, record stand
              ages, then submit the layers for another steward to review.
            </p>
          )}
          {spineNote.reasons.length > 0 && (
            <ul>
              {spineNote.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {spineNote.warnings.length > 0 && (
            <details>
              <summary>Spine draft warnings</summary>
              <ul>
                {spineNote.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {preview && (
        <section
          aria-label="Local corridor preview"
          aria-live="polite"
          className="mt-3 break-words"
          data-local-preview-status={preview.status}
          data-local-lost-links={JSON.stringify(preview.lostLinks)}
        >
          <strong>Local corridor preview: {preview.status}</strong>
          <p>
            This local check uses woodland layers and treatment units. Consent
            areas and input checksum: computed by the co-op on submit. The
            server checks the plan again when submitted.
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
            <summary>Preview warnings</summary>
            <ul>
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {serverPreview && (
        <section
          aria-label="Co-op corridor preview"
          aria-live="polite"
          className="mt-3 break-words"
        >
          <strong>Co-op corridor preview: {serverPreview.status}</strong>
          <p>
            This check includes current private consent inputs without sharing
            parcel geometry. It does not save a plan. Changes to layers or
            consents before submission can change the checksum.
          </p>
          <p>
            Server preview checksum:{' '}
            <span
              className="break-all"
              data-server-preview-checksum={serverPreview.inputChecksum}
            >
              {serverPreview.inputChecksum ||
                'Unavailable until layers are reviewed.'}
            </span>
          </p>
        </section>
      )}
    </div>
  );
}
