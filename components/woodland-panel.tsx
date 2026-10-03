'use client';
// Woodland (DFM) panel: corridor layers, treatment plans and override votes.
// The server checks every submitted plan; local previews are advisory.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  WoodlandMapEditor,
  type WoodlandLayers,
  type WoodlandParams,
} from './woodland-map-editor';
import { consentParcels } from '@/lib/woodland-input.mjs';
import { emptyLayers } from '@/lib/woodland-editor.mjs';
import { Textarea } from '@/components/ui/textarea';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

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
};
type LayersVersion = {
  id: string;
  projectId: string;
  status: string;
  createdAt: number;
  notes: string;
  params: { minWidthM: number; minWidthSource: string; roadWidthM?: number };
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
  createdAt: number;
  canReview?: boolean;
  override?: Override;
  reviewNote?: string;
};
export type WoodlandState = {
  parcels?: {
    id: string;
    projectId: string;
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
const pairs = (list?: Pair[]) =>
  list?.length ? list.map((p) => `${p.a}–${p.b}`).join(', ') : 'none';
const LAYER_KEYS = ['coreAreas', 'retained', 'roads', 'water', 'crossings'];

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
  const [reason, setReason] = useState('');
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
            ? LAYER_KEYS.map(
                (k) => `${current.layers?.[k]?.length ?? 0} ${k}`,
              ).join(' · ')
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
              <div className="actions">
                <Button
                  disabled={disabled}
                  onClick={() =>
                    run(() =>
                      mutate('review_woodland_layers', {
                        id: v.id,
                        decision: 'approve',
                        note: 'Reviewed against the field map.',
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
                        note: 'Needs correction.',
                      }),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
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
              {p.name} · {p.period} ·{' '}
              <span className={`status status-${p.status}`}>{p.status}</span>
            </h4>
            {p.layersVersionId !== current?.id && p.status === 'submitted' && (
              <p className="small">
                Layers changed since this check. Submit the plan again before
                review.
              </p>
            )}
            <CheckSummary check={p.check} />
            {p.canReview && (
              <div className="actions">
                <Button
                  disabled={disabled}
                  onClick={() =>
                    run(() =>
                      mutate('review_treatment_plan', {
                        id: p.id,
                        decision: 'approve',
                        note: 'Corridor check reviewed.',
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
                        note: 'Plan needs changes.',
                      }),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
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
            {o?.status === 'open' && (
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
                        reason,
                        days: 14,
                      }),
                    );
                  }}
                >
                  <Textarea
                    placeholder="Why this plan should proceed despite the lost link"
                    value={reason}
                    maxLength={2000}
                    onChange={(e) => setReason(e.target.value)}
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
