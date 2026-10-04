'use client';
// Old-growth spine analyses for a woodland project (dfm-core 0.2.0). Each analysis runs on the
// co-op server, in its analysis worker, against the current reviewed layers and the co-op's
// consent records; this component only displays what the server returns for this viewer.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { consentParcels } from '@/lib/woodland-input.mjs';
import type { WoodlandState } from './woodland-panel';

type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
type Pair = { a: string; b: string };
type Feature = { properties?: Record<string, unknown> };
type Base = {
  status: 'ok' | 'incomplete';
  engine: string;
  inputChecksum: string | null;
  reasons: string[];
  warnings: string[];
  limitations?: string[];
};
type NetworkResult = Base & {
  summary?: {
    sections: number;
    severedSections: number;
    loops: number;
    loopsThroughCores: number;
    dendritic: boolean;
    linkedPairs: number;
    robustPairs: number | null;
    totalPairs: number;
    rho2: number | null;
    lengthM: number;
    disturbanceWidthM: number;
  };
  coreLinks?: (Pair & { robust: boolean | null })[];
  singlePointsOfFailure?:
    | {
        separates: Pair[];
        verified: boolean;
        nearLines: string[];
        extentM: number;
      }[]
    | null;
  severed?: { sourceId?: string; id?: string; severedBy?: string }[];
};
type OutlookResult = Base & {
  parameters?: {
    oldGrowthAgeYears: number | null;
    oldGrowthAgeSource: string | null;
  };
  milestones?: {
    year: number;
    committedParcels: string[];
    committedParcelCount?: number;
    committedLinks: Pair[];
    committedM2: number;
    oldGrowthAgeLinks: Pair[] | null;
    oldGrowthAgeM2: number | null;
  }[];
  assumptions?: string[];
};
type ClimateResult = Base & {
  target?: { warmingC: number; source: string } | null;
  temperatureSource?: string;
  cores?: {
    id: string;
    tempC: number | null;
    status: string;
    coolest: { id: string; tempC: number; via: string[] } | null;
    coolingC: number | null;
  }[];
};
type FrontierResult = Base & {
  committed?: {
    parcels: string[];
    parcelCount?: number;
    spineM2: number;
    mappedSpineM2: number;
    share: number;
    links: Pair[];
  };
  frontier?: {
    parcel: string;
    spineM2: number;
    completesLinks: Pair[];
    direction?: string;
    distanceM?: number;
  }[];
  laterParcels?: string[];
  /** Members other than stewards get the co-op total only (WS8). */
  frontierForStewards?: boolean;
};
type Analysis<R> = {
  kind: string;
  layersVersionId: string;
  analysisYear: number;
  ageAsOfYear: number;
  ageShiftYears: number;
  planId: string | null;
  warnings: string[];
  viewer: 'steward' | 'member';
  result: R;
};
type Results = {
  network?: Analysis<NetworkResult>;
  outlook?: Analysis<OutlookResult>;
  climate?: Analysis<ClimateResult>;
  frontier?: Analysis<FrontierResult>;
};
type Kind = keyof Results;
export type SpineLayers = {
  id: string;
  layers: Record<string, Feature[]> | null;
  params: Record<string, unknown>;
};

const LABELS: Record<Kind, string> = {
  network: 'Test the network',
  outlook: 'Project the years ahead',
  climate: 'Find climate routes',
  frontier: 'Find the next woodlots',
};
const CLIMATE_STATUS: Record<string, string> = {
  route: 'Route to a cooler core',
  short: 'Cooler core reachable, short of the target',
  none: 'No cooler core reachable',
  coolest: 'Coolest core',
  unknown: 'Unknown: a temperature is missing',
};
const ha = (m2?: number | null) =>
  m2 == null ? '—' : `${(m2 / 10000).toFixed(1)} ha`;
const pct = (v?: number | null) =>
  v == null ? 'not determined' : `${Math.round(v * 100)}%`;
const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

function Notes({ result, extra = [] }: { result: Base; extra?: string[] }) {
  const warnings = [...extra, ...result.warnings];
  return (
    <>
      {result.reasons.length > 0 && (
        <ul>
          {result.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <details>
          <summary>{warnings.length} warning(s)</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {!!result.limitations?.length && (
        <details>
          <summary>What this does not establish</summary>
          <ul>
            {result.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small break-all">
        {result.engine}
        {result.inputChecksum ? ` · input checksum ${result.inputChecksum}` : ''}
      </p>
    </>
  );
}
function Table({
  label,
  head,
  rows,
  nowrap = [],
}: {
  label: string;
  head: string[];
  rows: (string | number)[][];
  nowrap?: number[];
}) {
  return (
    // A focusable labelled region lets keyboard users scroll a wide table (WCAG 2.1.1).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <section className="spine-table-scroll" aria-label={label} tabIndex={0}>
      <table className="spine-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={nowrap.includes(j) ? 'nowrap' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function WoodlandSpinePanel({
  coopId,
  projectId,
  current,
  state,
  steward,
  disabled,
  mutate,
}: {
  coopId: string;
  projectId: string;
  current: SpineLayers;
  state: WoodlandState;
  steward: boolean;
  disabled: boolean;
  mutate: Save;
}) {
  const ids = { plan: useId() };
  const [results, setResults] = useState<Results>({});
  const [running, setRunning] = useState<Kind | null>(null);
  const [error, setError] = useState('');
  const [planId, setPlanId] = useState('');
  const [years, setYears] = useState<Record<string, string>>({});
  const layers = current.layers ?? {};
  // Features are labelled by name; unnamed ones by their kind and place in the layer.
  const KIND: Record<string, string> = {
    coreAreas: 'Core area',
    retained: 'Corridor',
    streams: 'Stream',
    connectors: 'Link',
    roads: 'Road',
    water: 'Open water',
    crossings: 'Crossing',
  };
  const name = new Map<string, string>();
  for (const [layer, list] of Object.entries(layers))
    list.forEach((f, i) => {
      const id = text(f.properties?.dfm_id);
      if (id)
        name.set(
          id,
          text(f.properties?.name) || `${KIND[layer] ?? 'Feature'} ${i + 1}`,
        );
    });
  for (const p of state.parcels ?? []) name.set(p.id, p.name || 'Woodlot');
  const cores = layers.coreAreas?.length ?? 0;
  const totalPairs = (cores * (cores - 1)) / 2;
  const label = (id: string) => name.get(id) ?? id;
  const pair = (p: Pair) => `${label(p.a)} – ${label(p.b)}`;
  const names = (ids: string[]) =>
    ids
      .map(label)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .join(', ');
  const pairs = (list?: Pair[] | null) =>
    list?.length ? list.map(pair).join('; ') : 'none';
  const lines =
    (layers.streams?.length ?? 0) + (layers.connectors?.length ?? 0);
  const temps = (layers.coreAreas ?? []).some((f) =>
    Number.isFinite(f.properties?.temp_c),
  );
  const drafted = (layers.retained ?? []).filter(
    (f) => f.properties?.spine === true,
  ).length;
  // A plan redacted by account erasure has no units to apply (E1).
  const plans = (state.treatmentPlans ?? []).filter(
    (p) => p.projectId === projectId && !p.erasureRedacted,
  );
  type Parcel = NonNullable<WoodlandState['parcels']>[number];
  // Woodlots this viewer can see that have no current consent: owner-or-steward, as everywhere.
  const uncommitted: Parcel[] = (
    consentParcels(state, projectId) as {
      properties: { dfm_id: string; consent: string };
    }[]
  )
    .filter((f) => f.properties.consent !== 'covered')
    .map((f) =>
      (state.parcels ?? []).find((p: Parcel) => p.id === f.properties.dfm_id),
    )
    .filter((p): p is Parcel => p !== undefined);
  const run = async (kind: Kind) => {
    setError('');
    setRunning(kind);
    try {
      const response = await fetch('/api/woodland-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: coopId,
          projectId,
          kind,
          ...(planId ? { planId } : {}),
        }),
        signal: AbortSignal.timeout(35000),
      });
      const data: { analysis?: Results[Kind]; error?: string } =
        await response.json();
      if (!response.ok || !data.analysis)
        throw new Error(data.error || 'The analysis did not complete.');
      setResults((r) => ({ ...r, [kind]: data.analysis }));
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'TimeoutError'
          ? 'The analysis took too long. Try again shortly.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setRunning(null);
    }
  };
  const saveYear = async (parcelId: string, year: number | null) => {
    setError('');
    try {
      await mutate('plan_parcel_join', { parcelId, year });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const { network, outlook, climate, frontier } = results;
  const context = (a: Analysis<Base>) =>
    `Reviewed layers ${a.layersVersionId.slice(0, 8)} · ${a.analysisYear}${
      a.planId
        ? ` · with plan “${plans.find((p) => p.id === a.planId)?.name ?? a.planId}”`
        : ' · no treatment plan applied'
    }`;
  return (
    <section
      className="mt-6 woodland-spine"
      aria-label="Old-growth spine"
      data-woodland-spine
    >
      <h3>Old-growth spine</h3>
      <p className="small">
        The spine is the branching network of retained forest along streams,
        valleys and ridges. It is mapped whole, then built woodlot by woodlot
        as owners consent, and it ages toward old growth while the woods
        around it are worked. These analyses use the reviewed layers and the
        co-op’s consent records, run on the co-op server and take a few
        seconds. They are structural only: they do not establish species
        movement, genetics or old-growth condition.
      </p>
      <p className="small">
        Reviewed spine: {layers.streams?.length ?? 0} streams,{' '}
        {layers.connectors?.length ?? 0} ridge, valley and saddle links,{' '}
        {drafted} drafted corridors.
        {current.params.oldGrowthAgeYears != null
          ? ` Old-growth age ${text(current.params.oldGrowthAgeYears)} years (${text(current.params.oldGrowthAgeSource)}).`
          : ' No old-growth age threshold is recorded.'}
      </p>
      {plans.length > 0 && (
        <>
          <ControlLabel htmlFor={ids.plan}>Apply a treatment plan</ControlLabel>
          <NativeSelect
            className="w-full max-w-md"
            id={ids.plan}
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setResults({});
            }}
          >
            <NativeSelectOption value="">
              None: the layers as reviewed
            </NativeSelectOption>
            {plans.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name} ({p.period}, {p.status})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </>
      )}
      <div className="actions mt-3">
        {(Object.keys(LABELS) as Kind[]).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant={results[kind] ? 'outline' : 'default'}
            disabled={
              !!running ||
              (kind === 'network' && !lines) ||
              (kind === 'climate' && !temps)
            }
            onClick={() => void run(kind)}
          >
            {kind === 'frontier' && !steward
              ? 'See the committed spine'
              : LABELS[kind]}
          </Button>
        ))}
      </div>
      {!lines && (
        <p className="small">
          A steward adds streams and ridge, valley or saddle links to the
          layers to test the spine as a network.
        </p>
      )}
      {!temps && (
        <p className="small">
          Record core temperatures, with their source, to find climate routes.
        </p>
      )}
      <output className="small block" aria-live="polite">
        {running ? `${LABELS[running]}… This can take up to half a minute.` : ''}
      </output>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {network && (
        <article
          className="network-card mt-4"
          aria-label="Spine network"
          data-spine-result="network"
          data-status={network.result.status}
        >
          <h4>Network</h4>
          <p className="muted small">{context(network)}</p>
          {network.result.summary && (
            <>
              <p>
                {network.result.summary.linkedPairs} of{' '}
                {network.result.summary.totalPairs} core-area pairs are linked
                through the spine.{' '}
                {network.result.summary.robustPairs == null
                  ? 'Whether they survive a single disturbance was not determined.'
                  : `${network.result.summary.robustPairs} ${network.result.summary.robustPairs === 1 ? 'stays' : 'stay'} linked after any single disturbance up to ${network.result.summary.disturbanceWidthM} m wide (ρ₂ ${pct(network.result.summary.rho2)}).`}
              </p>
              <p>
                {network.result.summary.loops} loop(s),{' '}
                {network.result.summary.loopsThroughCores} closing through
                core areas
                {network.result.summary.dendritic
                  ? '. A pure tree: one break on a branch cuts everything beyond it.'
                  : '.'}{' '}
                {network.result.summary.sections} sections,{' '}
                {(network.result.summary.lengthM / 1000).toFixed(1)} km
                {network.result.summary.severedSections
                  ? `; ${network.result.summary.severedSections} severed by a road without a recorded crossing`
                  : ''}
                .
              </p>
              <Table
                label="Core links"
                nowrap={[1]}
                head={['Link', 'Survives one disturbance']}
                rows={(network.result.coreLinks ?? []).map((l) => [
                  pair(l),
                  l.robust == null ? 'not determined' : l.robust ? 'yes' : 'no',
                ])}
              />
              {!!network.result.singlePointsOfFailure?.length && (
                <>
                  <h5 className="mt-3">Where one disturbance would cut a link</h5>
                  <ul>
                    {network.result.singlePointsOfFailure.map((z, i) => (
                      <li key={i}>
                        Near {z.nearLines.map(label).join(', ') || 'the spine'}{' '}
                        (about {z.extentM} m of corridor): separates{' '}
                        {pairs(z.separates)}.{' '}
                        {z.verified
                          ? 'Confirmed at the stated width.'
                          : 'Not confirmed at the stated width; it may still be real.'}
                      </li>
                    ))}
                  </ul>
                  <p className="small">
                    A new loop around these places, such as a saddle or ridge
                    link, would give each link a second route.
                  </p>
                </>
              )}
            </>
          )}
          <Notes result={network.result} extra={network.warnings} />
        </article>
      )}

      {outlook && (
        <article
          className="network-card mt-4"
          aria-label="Spine outlook"
          data-spine-result="outlook"
          data-status={outlook.result.status}
        >
          <h4>The years ahead</h4>
          <p className="muted small">
            {context(outlook)} · stand ages rolled forward{' '}
            {outlook.ageShiftYears} year(s) from {outlook.ageAsOfYear}
          </p>
          {outlook.result.milestones && (
            <>
              <Table
                label="Projected links by year"
                nowrap={[0, 1, 2, 3, 4]}
                head={[
                  'Year',
                  'Links through committed forest',
                  'Links at old-growth age',
                  'Committed forest',
                  'At old-growth age',
                  'Woodlots committed',
                ]}
                rows={outlook.result.milestones.map((m) => [
                  m.year,
                  `${m.committedLinks.length} of ${totalPairs}`,
                  m.oldGrowthAgeLinks == null
                    ? 'no threshold'
                    : `${m.oldGrowthAgeLinks.length} of ${totalPairs}`,
                  ha(m.committedM2),
                  ha(m.oldGrowthAgeM2),
                  outlook.viewer === 'steward'
                    ? names(m.committedParcels) || 'none'
                    : `${m.committedParcelCount ?? m.committedParcels.length}${
                        m.committedParcels.length
                          ? ` (yours: ${names(m.committedParcels)})`
                          : ''
                      }`,
                ])}
              />
              <details>
                <summary>Which links, by year</summary>
                <ul>
                  {outlook.result.milestones.map((m) => (
                    <li key={m.year}>
                      {m.year}: through committed forest{' '}
                      {pairs(m.committedLinks)}
                      {m.oldGrowthAgeLinks
                        ? `; at old-growth age ${pairs(m.oldGrowthAgeLinks)}`
                        : ''}
                      .
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
          {!!outlook.result.assumptions?.length && (
            <details>
              <summary>Assumptions</summary>
              <ul>
                {outlook.result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          {outlook.viewer !== 'steward' && (
            <p className="small">
              Your projection counts planned join years only for woodlots you
              recorded; stewards see the co-op’s full projection.
            </p>
          )}
          <Notes result={outlook.result} extra={outlook.warnings} />
        </article>
      )}

      {climate && (
        <article
          className="network-card mt-4"
          aria-label="Climate routes"
          data-spine-result="climate"
          data-status={climate.result.status}
        >
          <h4>Climate routes</h4>
          <p className="muted small">{context(climate)}</p>
          {climate.result.cores && (
            <>
              <p className="small">
                {climate.result.target
                  ? `Planning for ${climate.result.target.warmingC} °C of warming (${climate.result.target.source}).`
                  : 'No warming target is recorded: any cooler linked core counts as a route.'}{' '}
                Temperatures: {climate.result.temperatureSource}.
              </p>
              <Table
                label="Climate routes by core"
                nowrap={[1, 4]}
                head={['Core area', '°C', 'Status', 'Coolest reachable', 'Cooler by']}
                rows={climate.result.cores.map((c) => [
                  label(c.id),
                  c.tempC ?? '—',
                  CLIMATE_STATUS[c.status] ?? c.status,
                  c.coolest
                    ? `${label(c.coolest.id)} via ${c.coolest.via.map(label).join(' → ')}`
                    : '—',
                  c.coolingC == null ? '—' : `${c.coolingC} °C`,
                ])}
              />
            </>
          )}
          <Notes result={climate.result} extra={climate.warnings} />
        </article>
      )}

      {frontier && (
        <article
          className="network-card mt-4"
          aria-label="Next woodlots"
          data-spine-result="frontier"
          data-status={frontier.result.status}
        >
          <h4>
            {frontier.viewer === 'steward'
              ? 'The next woodlots'
              : 'The committed spine'}
          </h4>
          <p className="muted small">{context(frontier)}</p>
          {frontier.result.committed && (
            <p>
              {pct(frontier.result.committed.share)} of the mapped spine is
              committed, across{' '}
              {frontier.result.committed.parcelCount ??
                frontier.result.committed.parcels.length}{' '}
              woodlot(s). Links held through committed forest:{' '}
              {pairs(frontier.result.committed.links)}.
            </p>
          )}
          {!frontier.result.frontierForStewards &&
            frontier.result.frontier &&
            (frontier.result.frontier.length ? (
              <Table
                label="Woodlots that would extend the committed spine"
                nowrap={[0, 2]}
                head={[
                  'Woodlot',
                  'Links it would complete',
                  'Spine in the woodlot',
                  'Direction from the committed spine',
                ]}
                rows={frontier.result.frontier.map((e) => [
                  label(e.parcel),
                  pairs(e.completesLinks),
                  ha(e.spineM2),
                  e.direction
                    ? `${e.direction}, about ${e.distanceM} m`
                    : 'first woodlot',
                ])}
              />
            ) : (
              <p className="small">
                No woodlot without consent adjoins the committed spine.
              </p>
            ))}
          {!!frontier.result.laterParcels?.length && (
            <p className="small">
              Holding spine but not yet adjoining the committed stretch:{' '}
              {names(frontier.result.laterParcels)}.
            </p>
          )}
          <p className="small">
            A woodlot’s stretch is committed once its holder’s pooling consent
            is recorded and another steward reviews it, in Land &amp; parcels.
            {frontier.result.frontierForStewards
              ? ' Stewards see which woodlots would extend it next: where a neighbour’s woodlot sits on that list would show whether they have consented, so members see the co-op total.'
              : ''}
          </p>
          <Notes result={frontier.result} extra={frontier.warnings} />
        </article>
      )}

      {uncommitted.length > 0 && (
        <details className="mt-4" data-planned-join>
          <summary>Planned join years (projection only)</summary>
          <p className="small">
            A planned year lets the outlook show a woodlot joining later. It is
            an assumption, never consent, and only a future year counts.
          </p>
          {uncommitted.map((p) => (
            <form
              key={p.id}
              className="action-form mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveYear(p.id, Number(years[p.id]));
              }}
            >
              <ControlLabel htmlFor={`${ids.plan}-${p.id}`}>
                {p.name || p.id}
                {p.plannedJoinYear ? ` · planned ${p.plannedJoinYear}` : ''}
              </ControlLabel>
              <Input
                id={`${ids.plan}-${p.id}`}
                type="number"
                inputMode="numeric"
                value={years[p.id] ?? ''}
                placeholder="Year"
                disabled={disabled}
                onChange={(e) =>
                  setYears((y) => ({ ...y, [p.id]: e.target.value }))
                }
              />
              <div className="actions">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={disabled || !years[p.id]}
                >
                  Save planned year
                </Button>
                {p.plannedJoinYear && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void saveYear(p.id, null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          ))}
        </details>
      )}
    </section>
  );
}
