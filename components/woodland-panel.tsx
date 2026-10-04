'use client';
// Woodland (DFM) panel: corridor layers, treatment plans and override votes.
// The server checks every submitted plan; local previews are advisory.
import { lazy, Suspense, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  WoodlandMapEditor,
  type WoodlandLayers,
  type WoodlandParams,
} from './woodland-map-editor';
import { consentParcels, planCheckInput } from '@/lib/woodland-input.mjs';
import { emptyLayers } from '@/lib/woodland-editor.mjs';
import { DFM_SITE_URL } from '@/lib/dfm-site.mjs';
import { Textarea } from '@/components/ui/textarea';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
// Loaded only when a woodland project has reviewed layers.
const WoodlandSpinePanel = lazy(() =>
  import('./woodland-spine-panel').then((m) => ({
    default: m.WoodlandSpinePanel,
  })),
);

type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
type Feature = {
  type: 'Feature';
  geometry: unknown;
  properties?: Record<string, unknown>;
};
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
  /** Set on checks made with the Landscape Package's canonical input (v0.10.0 on). */
  inputForm?: string;
};
type LayersVersion = {
  id: string;
  projectId: string;
  status: string;
  createdAt: number;
  notes: string;
  params: WoodlandParams;
  layers: Record<string, Feature[]> | null;
  canReview?: boolean;
};
type Override = {
  status: string;
  reason: string;
  electorate: string[];
  quorum: number;
  closesAt: number;
  votes: { memberId: string; choice: string }[];
};
type Plan = {
  id: string;
  projectId: string;
  name: string;
  period: string;
  status: string;
  layersVersionId: string;
  check: Check;
  treatments?: Feature[];
  erasureRedacted?: boolean;
  createdAt: number;
  canReview?: boolean;
  override?: Override;
  reviewNote?: string;
};
export type WoodlandState = {
  parcels?: {
    id: string;
    projectId: string;
    name?: string;
    plannedJoinYear?: number;
    status: string;
    boundaries?: { status: string; geometry: unknown }[];
    consents?: { status: string; landSnapshot: unknown }[];
    landReference?: string;
    areaSquareMetres?: number;
  }[];
  projects: { id: string; name: string; kind: string }[];
  woodlandLayers?: LayersVersion[];
  treatmentPlans?: Plan[];
};

const ha = (m2?: number) => `${((m2 ?? 0) / 10000).toFixed(2)} ha`;
function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + '\n'], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const pairs = (list?: Pair[]) =>
  list?.length ? list.map((p) => `${p.a}–${p.b}`).join(', ') : 'none';
const LAYER_KEYS = [
  'coreAreas',
  'retained',
  'roads',
  'water',
  'crossings',
  'streams',
  'connectors',
];
const LAYER_NAMES: Record<string, string> = {
  coreAreas: 'core areas',
  retained: 'retained corridors',
  roads: 'roads',
  water: 'open water',
  crossings: 'crossings',
  streams: 'streams',
  connectors: 'ridge, valley and saddle links',
};

function CheckSummary({ check }: { check: Check }) {
  return (
    <div className="small">
      <p>
        <strong>Corridor check: {check.status}</strong> · links held:{' '}
        {pairs(check.linkedAfter)}
        {check.pinchedLinks?.length
          ? ` · pinch points: ${pairs(check.pinchedLinks)}`
          : ''}
        {check.consent
          ? ` · committed ${ha(check.consent.committedM2)}, proposed ${ha(check.consent.proposedM2)}`
          : ''}
      </p>
      {check.reasons.length > 0 && (
        <ul>
          {check.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {check.warnings.length > 0 && (
        <details>
          <summary>{check.warnings.length} warning(s)</summary>
          <ul>
            {check.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted">
        {check.engine} · Stored plan checksum:{' '}
        <span
          className="break-all"
          data-stored-plan-checksum={check.inputChecksum}
        >
          {check.inputChecksum}
        </span>
      </p>
    </div>
  );
}

export function WoodlandPanel({
  state,
  steward,
  busy,
  memberId,
  growthPaused = false,
  mutate,
  requestEnvelope,
}: {
  state: WoodlandState;
  steward: boolean;
  busy: boolean;
  memberId: string;
  growthPaused?: boolean;
  mutate: Save;
  requestEnvelope: { id: string; version: number };
}) {
  const ids = { project: useId() };
  const woodland = state.projects.filter((p) => p.kind === 'woodland');
  const [projectId, setProjectId] = useState(woodland[0]?.id ?? '');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  // Per-record text, so typing in one card never fills another.
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const reviewNote = (id: string, fallback: string) =>
    reviewNotes[id]?.trim() || fallback;
  const disabled = busy || growthPaused;
  const reference = consentParcels(state, projectId);
  if (!woodland.length)
    return (
      <section>
        <h2>Woodland corridors</h2>
        <p>
          Create a project with the type “Woodland (DFM corridors)” to plan
          retained corridors and check harvest plans.
        </p>
        <p className="woodland-credit">
          Corridor check by{' '}
          <a href={DFM_SITE_URL}>Dendritic Forest Management</a>, open source.
        </p>
      </section>
    );
  const versions = (state.woodlandLayers ?? []).filter(
    (v) => v.projectId === projectId,
  );
  const current = [...versions].reverse().find((v) => v.status === 'reviewed');
  const plans = (state.treatmentPlans ?? [])
    .filter((p) => p.projectId === projectId)
    .slice()
    .reverse();
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="woodland-panel">
      <h2>Woodland corridors</h2>
      <p>
        Each harvest or treatment plan is checked against the reviewed corridor
        layers before it can be reviewed. A plan that breaks a link between core
        areas is blocked; members can override it only by a recorded vote. The
        check is structural: it does not establish species movement, genetics or
        old-growth condition.
      </p>
      <p className="woodland-credit">
        Corridor check by <a href={DFM_SITE_URL}>Dendritic Forest Management</a>
        , open source.
      </p>
      <ControlLabel htmlFor={ids.project}>Woodland project</ControlLabel>
      <NativeSelect
        className="w-full max-w-md"
        id={ids.project}
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        {woodland.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h3 className="mt-6">Corridor layers</h3>
      {current ? (
        <p className="small">
          Current reviewed layers: minimum width {current.params.minWidthM} m (
          {current.params.minWidthSource}).{' '}
          {current.layers
            ? LAYER_KEYS.filter(
                (k) => k in (current.layers ?? {}) || !k.match(/^(streams|connectors)$/),
              )
                .map(
                  (k) =>
                    `${current.layers?.[k]?.length ?? 0} ${LAYER_NAMES[k]}`,
                )
                .join(' · ')
            : ''}
        </p>
      ) : (
        <p className="small">
          No reviewed layers yet. A steward uploads them and another steward
          reviews them.
        </p>
      )}
      {versions
        .filter((v) => v.status === 'submitted')
        .map((v) => (
          <article key={v.id} className="network-card">
            <p>
              Layers submitted {new Date(v.createdAt).toLocaleDateString()} ·
              minimum width {v.params.minWidthM} m · {v.notes}
            </p>
            {v.canReview && (
              <>
                <Textarea
                  aria-label="Layer review note"
                  placeholder="Review note: what you checked, or what needs correcting"
                  value={reviewNotes[v.id] ?? ''}
                  maxLength={1500}
                  disabled={disabled}
                  onChange={(e) =>
                    setReviewNotes((n) => ({ ...n, [v.id]: e.target.value }))
                  }
                />
                <div className="actions">
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      run(() =>
                        mutate('review_woodland_layers', {
                          id: v.id,
                          decision: 'approve',
                          note: reviewNote(
                            v.id,
                            'Reviewed against the field map.',
                          ),
                        }),
                      )
                    }
                  >
                    Approve layers
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      run(() =>
                        mutate('review_woodland_layers', {
                          id: v.id,
                          decision: 'reject',
                          note: reviewNote(v.id, 'Needs correction.'),
                        }),
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              </>
            )}
          </article>
        ))}
      {steward && (
        <>
          <Textarea
            aria-label="Layer notes"
            placeholder="Notes: data sources, field checks"
            value={notes}
            maxLength={1500}
            disabled={disabled}
            onChange={(e) => setNotes(e.target.value)}
          />
          <WoodlandMapEditor
            key={projectId + 'layers'}
            mode="layers"
            projectId={projectId}
            initialLayers={
              (current?.layers ??
                versions.at(-1)?.layers ??
                emptyLayers()) as WoodlandLayers
            }
            initialParams={
              (current?.params ??
                versions.at(-1)?.params ?? {
                  minWidthM: 100,
                  minWidthSource: '',
                  roadWidthM: 6,
                }) as WoodlandParams
            }
            parcels={reference}
            disabled={disabled}
            mutate={mutate}
            notes={notes}
            envelope={{ ...requestEnvelope, op: 'save_woodland_layers' }}
          />
        </>
      )}
      {current?.layers && (
        <Suspense fallback={<p className="small">Loading spine tools…</p>}>
          <WoodlandSpinePanel
            key={projectId + current.id}
            coopId={requestEnvelope.id}
            projectId={projectId}
            current={current}
            state={state}
            steward={steward}
            disabled={disabled}
            mutate={mutate}
          />
        </Suspense>
      )}
      <h3 className="mt-6">Treatment plans</h3>
      {current?.layers && (
        <WoodlandMapEditor
          key={projectId + current.id + 'plan'}
          mode="plan"
          projectId={projectId}
          initialLayers={current.layers as WoodlandLayers}
          initialParams={current.params}
          parcels={reference}
          disabled={disabled}
          mutate={mutate}
          envelope={{ ...requestEnvelope, op: 'submit_treatment_plan' }}
        />
      )}
      {plans.map((p) => {
        const o = p.override;
        const voted = o?.votes.find((v) => v.memberId === memberId)?.choice;
        return (
          <article key={p.id} className="network-card mt-4">
            <h4>
              {p.name}
              {p.period ? ` · ${p.period}` : ''} ·{' '}
              <span className={`status status-${p.status}`}>{p.status}</span>
            </h4>
            {p.erasureRedacted && (
              <p className="small" data-plan-redacted>
                Removed when its author deleted their account. Only the record
                of the co-op’s decision remains; it can no longer be reviewed or
                voted on.
              </p>
            )}
            {!p.erasureRedacted &&
              p.layersVersionId !== current?.id &&
              p.status === 'submitted' && (
                <p className="small">
                  Layers changed since this check. Submit the plan again
                  before review.
                </p>
              )}
            <CheckSummary check={p.check} />
            {steward &&
              planCheckInput(state.woodlandLayers ?? [], p, reference) && (
                <div className="actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(async () => {
                        const { toLandscapePackage } =
                          await import('@viridis/dfm-core');
                        downloadJson(
                          toLandscapePackage(
                            planCheckInput(
                              state.woodlandLayers ?? [],
                              p,
                              reference,
                            ),
                            { name: p.name, generator: 'VergeCommon' },
                          ),
                          `woodland-plan-${p.id.slice(0, 8)}.json`,
                        );
                      })
                    }
                  >
                    Download check inputs
                  </Button>
                  <span className="small">
                    A Landscape Package that reproduces this result and its
                    checksum with the open-source engine, while the co-op’s
                    woodlot consents are unchanged.
                  </span>
                </div>
              )}
            {p.canReview && !p.erasureRedacted && (
              <>
                <Textarea
                  aria-label="Plan review note"
                  placeholder="Review note: what you checked, or what needs to change"
                  value={reviewNotes[p.id] ?? ''}
                  maxLength={1500}
                  disabled={disabled}
                  onChange={(e) =>
                    setReviewNotes((n) => ({ ...n, [p.id]: e.target.value }))
                  }
                />
                <div className="actions">
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      run(() =>
                        mutate('review_treatment_plan', {
                          id: p.id,
                          decision: 'approve',
                          note: reviewNote(p.id, 'Corridor check reviewed.'),
                        }),
                      )
                    }
                  >
                    Approve plan
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      run(() =>
                        mutate('review_treatment_plan', {
                          id: p.id,
                          decision: 'reject',
                          note: reviewNote(p.id, 'Plan needs changes.'),
                        }),
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              </>
            )}
            {o && (
              <p className="small">
                Override vote {o.status}: {o.reason} · {o.votes.length}/
                {o.electorate.length} voted, quorum {o.quorum}
                {o.status === 'open'
                  ? ` · closes ${new Date(o.closesAt).toLocaleDateString()}`
                  : ''}
              </p>
            )}
            {o?.status === 'open' && !p.erasureRedacted && (
              <div className="actions">
                {(['approve', 'oppose', 'abstain'] as const).map((choice) => (
                  <Button
                    key={choice}
                    variant={voted === choice ? 'default' : 'outline'}
                    disabled={disabled}
                    onClick={() =>
                      run(() =>
                        mutate('vote_plan_override', { id: p.id, choice }),
                      )
                    }
                  >
                    {choice}
                  </Button>
                ))}
                {steward && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      run(() => mutate('close_plan_override', { id: p.id }))
                    }
                  >
                    Close vote
                  </Button>
                )}
              </div>
            )}
            {steward &&
              !p.erasureRedacted &&
              p.status === 'blocked' &&
              p.check.status === 'fail' &&
              o?.status !== 'open' && (
                <form
                  className="action-form mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() =>
                      mutate('propose_plan_override', {
                        id: p.id,
                        reason: reasons[p.id] ?? '',
                        days: 14,
                      }),
                    );
                  }}
                >
                  <Textarea
                    aria-label="Override reason"
                    placeholder="Why this plan should proceed despite the lost link"
                    value={reasons[p.id] ?? ''}
                    maxLength={2000}
                    onChange={(e) =>
                      setReasons((r) => ({ ...r, [p.id]: e.target.value }))
                    }
                    required
                  />
                  <Button type="submit" variant="outline" disabled={disabled}>
                    Open a 14-day override vote
                  </Button>
                </form>
              )}
          </article>
        );
      })}
    </section>
  );
}
