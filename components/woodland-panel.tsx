'use client';
// Woodland (DFM) panel: corridor layers, treatment plans and override votes.
// Every check runs on the server with @viridis/dfm-core; this panel only sends
// files and decisions and shows stored results.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ControlLabel } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
type Feature = { type: 'Feature'; geometry: unknown; properties?: Record<string, unknown> };
type Pair = { a: string; b: string };
type Check = {
  status: 'pass' | 'fail' | 'incomplete';
  engine: string;
  inputChecksum: string;
  reasons: string[];
  warnings: string[];
  linkedAfter?: Pair[];
  lostLinks?: (Pair & { causes: string[] })[];
  pinchedLinks?: Pair[];
  consent?: { committedM2: number; proposedM2: number };
};
type LayersVersion = {
  id: string; projectId: string; status: string; createdAt: number; notes: string;
  params: { minWidthM: number; minWidthSource: string; roadWidthM?: number };
  layers: Record<string, Feature[]> | null; canReview?: boolean;
};
type Override = {
  status: string; reason: string; electorate: string[]; quorum: number; closesAt: number;
  votes: { memberId: string; choice: string }[];
};
type Plan = {
  id: string; projectId: string; name: string; period: string; status: string;
  layersVersionId: string; check: Check; createdAt: number; canReview?: boolean;
  override?: Override; reviewNote?: string;
};
export type WoodlandState = {
  projects: { id: string; name: string; kind: string }[];
  woodlandLayers?: LayersVersion[];
  treatmentPlans?: Plan[];
};

const ha = (m2?: number) => `${((m2 ?? 0) / 10000).toFixed(2)} ha`;
const pairs = (list?: Pair[]) => (list?.length ? list.map((p) => `${p.a}–${p.b}`).join(', ') : 'none');
const LAYER_KEYS = ['coreAreas', 'retained', 'roads', 'water', 'crossings'];

async function readJson(file: File | undefined) {
  if (!file) throw new Error('Choose a file.');
  if (file.size > 95_000) throw new Error('The file is larger than 95 KB. Simplify the geometry first.');
  return JSON.parse(await file.text());
}

/** Accept a DFM Landscape Package v1 or a {layers, params} object. */
function layersFrom(json: Record<string, unknown>) {
  const layers = (json.layers ?? {}) as Record<string, Feature[]>;
  return {
    layers: Object.fromEntries(LAYER_KEYS.map((k) => [k, layers[k] ?? []])),
    params: (json.params ?? {}) as Record<string, unknown>,
  };
}

/** Accept a GeoJSON FeatureCollection, a list of features, or a package's treatments layer. */
function treatmentsFrom(json: Record<string, unknown> | Feature[]) {
  if (Array.isArray(json)) return json;
  if (json.type === 'FeatureCollection') return (json.features ?? []) as Feature[];
  return ((json.layers as Record<string, Feature[]>)?.treatments ?? []) as Feature[];
}

function CheckSummary({ check }: { check: Check }) {
  return (
    <div className="small">
      <p>
        <strong>Corridor check: {check.status}</strong> · links held: {pairs(check.linkedAfter)}
        {check.pinchedLinks?.length ? ` · pinch points: ${pairs(check.pinchedLinks)}` : ''}
        {check.consent ? ` · committed ${ha(check.consent.committedM2)}, proposed ${ha(check.consent.proposedM2)}` : ''}
      </p>
      {check.reasons.length > 0 && (
        <ul>{check.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      {check.warnings.length > 0 && (
        <details>
          <summary>{check.warnings.length} warning(s)</summary>
          <ul>{check.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <p className="muted">{check.engine} · {check.inputChecksum.slice(0, 19)}…</p>
    </div>
  );
}

export function WoodlandPanel({
  state, steward, busy, memberId, growthPaused = false, mutate,
}: {
  state: WoodlandState; steward: boolean; busy: boolean; memberId: string;
  growthPaused?: boolean; mutate: Save;
}) {
  const ids = { project: useId(), layers: useId(), plan: useId(), name: useId(), period: useId() };
  const woodland = state.projects.filter((p) => p.kind === 'woodland');
  const [projectId, setProjectId] = useState(woodland[0]?.id ?? '');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [reason, setReason] = useState('');
  const disabled = busy || growthPaused;
  if (!woodland.length)
    return (
      <section>
        <h2>Woodland corridors</h2>
        <p>Create a project with the type “Woodland (DFM corridors)” to plan retained corridors and check harvest plans.</p>
      </section>
    );
  const versions = (state.woodlandLayers ?? []).filter((v) => v.projectId === projectId);
  const current = [...versions].reverse().find((v) => v.status === 'reviewed');
  const plans = (state.treatmentPlans ?? []).filter((p) => p.projectId === projectId).slice().reverse();
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <section className="woodland-panel">
      <h2>Woodland corridors</h2>
      <p>
        Each harvest or treatment plan is checked against the reviewed corridor layers before it can be reviewed.
        A plan that breaks a link between core areas is blocked; members can override it only by a recorded vote.
        The check is structural: it does not establish species movement, genetics or old-growth condition.
      </p>
      <ControlLabel htmlFor={ids.project}>Woodland project</ControlLabel>
      <NativeSelect className="w-full max-w-md" id={ids.project} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {woodland.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
      </NativeSelect>
      {error && <p role="alert" className="error">{error}</p>}

      <h3 className="mt-6">Corridor layers</h3>
      {current ? (
        <p className="small">
          Current reviewed layers: minimum width {current.params.minWidthM} m ({current.params.minWidthSource}).{' '}
          {current.layers ? LAYER_KEYS.map((k) => `${current.layers?.[k]?.length ?? 0} ${k}`).join(' · ') : ''}
        </p>
      ) : (
        <p className="small">No reviewed layers yet. A steward uploads them and another steward reviews them.</p>
      )}
      {versions.filter((v) => v.status === 'submitted').map((v) => (
        <article key={v.id} className="network-card">
          <p>Layers submitted {new Date(v.createdAt).toLocaleDateString()} · minimum width {v.params.minWidthM} m · {v.notes}</p>
          {v.canReview && (
            <div className="actions">
              <Button disabled={disabled} onClick={() => run(() => mutate('review_woodland_layers', { id: v.id, decision: 'approve', note: 'Reviewed against the field map.' }))}>Approve layers</Button>
              <Button variant="outline" disabled={disabled} onClick={() => run(() => mutate('review_woodland_layers', { id: v.id, decision: 'reject', note: 'Needs correction.' }))}>Reject</Button>
            </div>
          )}
        </article>
      ))}
      {steward && (
        <form className="action-form mt-4" onSubmit={(e) => {
          e.preventDefault();
          const file = (e.currentTarget.elements.namedItem('layers') as HTMLInputElement).files?.[0];
          void run(async () => {
            const { layers, params } = layersFrom(await readJson(file));
            await mutate('save_woodland_layers', { projectId, layers, params, notes });
          });
        }}>
          <ControlLabel htmlFor={ids.layers}>Upload a DFM Landscape Package (JSON from the DFM workspace)</ControlLabel>
          <Input id={ids.layers} name="layers" type="file" accept=".json,application/json" disabled={disabled} />
          <Textarea placeholder="Notes: data sources, field checks" value={notes} maxLength={1500} onChange={(e) => setNotes(e.target.value)} />
          <Button className="mt-4" type="submit" disabled={disabled}>Submit layers for review</Button>
        </form>
      )}

      <h3 className="mt-6">Treatment plans</h3>
      {current && (
        <form className="action-form mt-4" onSubmit={(e) => {
          e.preventDefault();
          const file = (e.currentTarget.elements.namedItem('plan') as HTMLInputElement).files?.[0];
          void run(async () => {
            const treatments = treatmentsFrom(await readJson(file));
            await mutate('submit_treatment_plan', { projectId, name, period, treatments });
          });
        }}>
          <ControlLabel htmlFor={ids.name}>Plan name</ControlLabel>
          <Input id={ids.name} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} required />
          <ControlLabel htmlFor={ids.period}>Period</ControlLabel>
          <Input id={ids.period} value={period} maxLength={60} placeholder="e.g. Winter 2027" onChange={(e) => setPeriod(e.target.value)} required />
          <ControlLabel htmlFor={ids.plan}>Treatment units (GeoJSON polygons with properties.dfm_id and intensity)</ControlLabel>
          <Input id={ids.plan} name="plan" type="file" accept=".json,.geojson,application/json,application/geo+json" disabled={disabled} />
          <Button className="mt-4" type="submit" disabled={disabled}>Check and submit plan</Button>
        </form>
      )}
      {plans.map((p) => {
        const o = p.override;
        const voted = o?.votes.find((v) => v.memberId === memberId)?.choice;
        return (
          <article key={p.id} className="network-card mt-4">
            <h4>{p.name} · {p.period} · <span className={`status status-${p.status}`}>{p.status}</span></h4>
            {p.layersVersionId !== current?.id && p.status === 'submitted' && (
              <p className="small">Layers changed since this check. Submit the plan again before review.</p>
            )}
            <CheckSummary check={p.check} />
            {p.canReview && (
              <div className="actions">
                <Button disabled={disabled} onClick={() => run(() => mutate('review_treatment_plan', { id: p.id, decision: 'approve', note: 'Corridor check reviewed.' }))}>Approve plan</Button>
                <Button variant="outline" disabled={disabled} onClick={() => run(() => mutate('review_treatment_plan', { id: p.id, decision: 'reject', note: 'Plan needs changes.' }))}>Reject</Button>
              </div>
            )}
            {o && (
              <p className="small">
                Override vote {o.status}: {o.reason} · {o.votes.length}/{o.electorate.length} voted, quorum {o.quorum}
                {o.status === 'open' ? ` · closes ${new Date(o.closesAt).toLocaleDateString()}` : ''}
              </p>
            )}
            {o?.status === 'open' && (
              <div className="actions">
                {(['approve', 'oppose', 'abstain'] as const).map((choice) => (
                  <Button key={choice} variant={voted === choice ? 'default' : 'outline'} disabled={disabled}
                    onClick={() => run(() => mutate('vote_plan_override', { id: p.id, choice }))}>{choice}</Button>
                ))}
                {steward && <Button variant="outline" disabled={disabled} onClick={() => run(() => mutate('close_plan_override', { id: p.id }))}>Close vote</Button>}
              </div>
            )}
            {steward && p.status === 'blocked' && p.check.status === 'fail' && o?.status !== 'open' && (
              <form className="action-form mt-4" onSubmit={(e) => { e.preventDefault(); void run(() => mutate('propose_plan_override', { id: p.id, reason, days: 14 })); }}>
                <Textarea placeholder="Why this plan should proceed despite the lost link" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} required />
                <Button type="submit" variant="outline" disabled={disabled}>Open a 14-day override vote</Button>
              </form>
            )}
          </article>
        );
      })}
    </section>
  );
}
