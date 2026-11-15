'use client';
// What shapes the old-growth corridor besides harvests (lib/woodland-recreation.mjs): shared
// uses the co-op decides on (RC1-RC9) and facts it records (CF1-CF6: rights-of-way, blowdown).
// Natural corridor is the default. Members propose a route, agree for their own woodlots, vote
// and end a use; stewards record and review facts. Every rule is enforced by the co-op's
// commands on the server; this component only displays and sends.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  RECREATION_KINDS,
  RECREATION_KIND_LABELS,
  RECREATION_AUDIENCES,
  RECREATION_LIMITS,
  FACT_KINDS,
  BLOWDOWN_SEVERITIES,
} from '@/lib/woodland-recreation.mjs';

type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
type Pair = { a: string; b: string };
type UseFeature = {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: { name?: string; cleared_width_m?: number };
};
export type CorridorUse = {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  /** 'fact' for a right-of-way or blowdown; absent for a use the co-op decides on. */
  basis?: string;
  audience?: string;
  source?: string;
  eventYear?: number;
  severity?: string;
  reviewNote?: string;
  canReview?: boolean;
  description?: string;
  features: UseFeature[];
  status: string;
  holds: boolean;
  clearedM2: number;
  check: {
    status: string;
    lostLinks?: Pair[];
    pinchedLinks?: Pair[];
    reasons?: string[];
  } | null;
  woodlots: { parcelId: string; agreedAt?: number }[];
  woodlotCount: number;
  agreedCount: number;
  vote?: {
    electorate: string[];
    quorum: number;
    closesAt: number;
    votes: { memberId: string; choice: string }[];
    status: string;
  };
  mine: boolean;
  canAgree: boolean;
  canVote: boolean;
  canEnd: boolean;
};

const STATUS: Record<string, string> = {
  blocked: 'Blocked: it would break the corridor',
  awaiting_agreement: 'Waiting for woodlot holders to agree',
  agreed: 'Holders agreed; waiting for a steward to open the vote',
  voting: 'Co-op vote open',
  adopted: 'Adopted',
  not_adopted: 'Not adopted by the co-op',
  declined: 'Declined by a woodlot holder',
  withdrawn: 'Withdrawn',
  ended: 'Ended; natural corridor again',
  submitted: 'Recorded; waiting for another steward to review',
  reviewed: 'In effect',
  rejected: 'Rejected in review',
};
const SEVERITY: Record<string, string> = {
  gaps: 'Gaps under a standing canopy',
  'stand-replacing': 'Stand-replacing',
};
const IN_PROGRESS = ['awaiting_agreement', 'agreed', 'voting'];
const AUDIENCE: Record<string, string> = {
  members: 'Co-op members',
  public: 'The public',
};
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Lines and polygons from a GeoJSON Feature, FeatureCollection or list of features. */
function readRoute(json: unknown, defaultWidth: number): UseFeature[] {
  const value = json as { type?: string; features?: unknown } | unknown[];
  const list = Array.isArray(value)
    ? value
    : value?.type === 'FeatureCollection' && Array.isArray(value.features)
      ? value.features
      : value?.type === 'Feature'
        ? [value]
        : null;
  if (!list) throw new Error('Use a GeoJSON Feature or FeatureCollection.');
  return (list as UseFeature[]).map((f) =>
    f?.geometry?.type === 'LineString' &&
    !Number.isFinite(f.properties?.cleared_width_m)
      ? { ...f, properties: { ...f.properties, cleared_width_m: defaultWidth } }
      : f,
  );
}

export function WoodlandRecreationPanel({
  projectId,
  uses,
  parcelNames,
  layersReviewed,
  steward,
  memberId,
  disabled,
  mutate,
}: {
  projectId: string;
  uses: CorridorUse[];
  parcelNames: Record<string, string>;
  layersReviewed: boolean;
  steward: boolean;
  memberId: string;
  disabled: boolean;
  mutate: Save;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>(RECREATION_KINDS[0]);
  const [audience, setAudience] = useState<string>(RECREATION_AUDIENCES[0]);
  const [description, setDescription] = useState('');
  const [width, setWidth] = useState('0');
  const [route, setRoute] = useState<UseFeature[] | null>(null);
  const [attested, setAttested] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [fact, setFact] = useState({
    kind: FACT_KINDS[0] as string,
    name: '',
    source: '',
    year: String(new Date().getUTCFullYear()),
    severity: BLOWDOWN_SEVERITIES[0] as string,
    width: '0',
  });
  const [factRoute, setFactRoute] = useState<UseFeature[] | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const list = uses.filter((u) => u.projectId === projectId).slice().reverse();
  const adopted = list.filter((u) => u.status === 'adopted');
  const facts = list.filter((u) => u.status === 'reviewed');
  const pairs = (links?: Pair[]) =>
    (links ?? []).map((l) => `${l.a} – ${l.b}`).join('; ');
  return (
    <section
      className="mt-6"
      aria-label="Uses and facts along the corridor"
      data-woodland-recreation
    >
      <h3>Uses and facts along the corridor</h3>
      <p className="small">
        By default the corridor is natural and ages toward old growth. The
        co-op can adopt a shared use on a mapped stretch, such as a walking
        trail, a bike trail or disc golf. A use is adopted only if the corridor
        still holds with its ground cleared, every holder of a woodlot it
        crosses agrees, and the co-op votes for it. Cleared ground never counts
        as retained forest or toward old growth. A holder or a steward can end
        a use at any time.
      </p>
      <p className="small" data-corridor-default>
        {adopted.length
          ? `${adopted.length} adopted ${adopted.length === 1 ? 'use' : 'uses'}: ${adopted.map((u) => u.name).join(', ')}. The rest of the corridor is natural.`
          : 'No recreation use is adopted: the whole corridor is natural.'}
        {facts.length
          ? ` Recorded on the ground: ${facts.map((u) => u.name).join(', ')}.`
          : ''}
      </p>
      <p className="small">
        Stewards also record what the corridor has to live with. A
        right-of-way (a power line, a road or access easement) is checked and
        recorded even when it breaks a link, so the map shows the ground as
        it is. A blowdown stays corridor: fallen trees are part of old growth,
        leaving them is the default, and salvage is a treatment plan that
        meets the corridor check. Another steward reviews each record.
      </p>
      <p className="small">
        This records the co-op’s decision and the holders’ agreement. It does
        not establish a right of way, public access, liability cover,
        accessibility, trail safety or any permit.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {list.map((u) => {
        const tally = (choice: string) =>
          u.vote?.votes.filter((v) => v.choice === choice).length ?? 0;
        const yours = u.vote?.votes.find((v) => v.memberId === memberId)?.choice;
        return (
          <article
            key={u.id}
            className="network-card mt-4"
            data-corridor-use={u.status}
          >
            <h4>{u.name}</h4>
            <p className="muted small">
              {RECREATION_KIND_LABELS[
                u.kind as keyof typeof RECREATION_KIND_LABELS
              ] ?? u.kind}{' '}
              {u.basis === 'fact'
                ? ` · ${u.kind === 'blowdown' ? `${u.eventYear}, ${SEVERITY[u.severity ?? ''] ?? u.severity}` : 'recorded fact'} · source: ${u.source}`
                : ` · for ${AUDIENCE[u.audience ?? ''] ?? u.audience}`}{' '}
              · {STATUS[u.status] ?? u.status}
            </p>
            {u.description && <p>{u.description}</p>}
            <p className="small">
              {!u.check
                ? 'Still corridor: fallen trees are habitat, so no check or projection changes. If the stand came down, record its stand ages again in the layers.'
                : u.holds
                  ? `The corridor holds: every link between core areas keeps the minimum width with ${u.clearedM2} m² of corridor cleared.`
                  : u.check.status === 'incomplete'
                    ? `The corridor check could not be completed: ${(u.check.reasons ?? []).join(' ')}`
                    : `The corridor does not hold. Links lost: ${pairs(u.check.lostLinks) || 'none'}. Links pinched below the minimum width: ${pairs(u.check.pinchedLinks) || 'none'}. ${u.basis === 'fact' ? 'It is recorded as it is; a link elsewhere, such as a saddle or ridge link, would give these core areas another route.' : 'Route it along the corridor’s edge, or record a tread under standing trees, and propose it again.'}`}
            </p>
            <p className="small">
              {u.features.length} mapped{' '}
              {u.features.length === 1 ? 'feature' : 'features'}:{' '}
              {u.features
                .map((f) =>
                  f.geometry.type === 'LineString'
                    ? `trail, ${f.properties.cleared_width_m} m cleared`
                    : 'cleared area',
                )
                .join('; ')}
              .{' '}
              {u.basis === 'fact'
                ? `Crosses ${u.woodlotCount} recorded ${u.woodlotCount === 1 ? 'woodlot' : 'woodlots'}.`
                : `Holders agreed: ${u.agreedCount} of ${u.woodlotCount}.`}
              {u.reviewNote ? ` Review note: ${u.reviewNote}` : ''}
            </p>
            {u.basis !== 'fact' && u.woodlots.length > 0 && (
              <ul className="small">
                {u.woodlots.map((w) => (
                  <li key={w.parcelId}>
                    {parcelNames[w.parcelId] ?? 'Woodlot'}:{' '}
                    {w.agreedAt ? `agreed ${date(w.agreedAt)}` : 'not yet agreed'}
                  </li>
                ))}
              </ul>
            )}
            {u.vote && (
              <p className="small">
                Vote: {tally('approve')} approve, {tally('oppose')} oppose,{' '}
                {tally('abstain')} abstain of {u.vote.electorate.length}{' '}
                members; quorum {u.vote.quorum}; adoption needs more than half
                of all members.{' '}
                {u.vote.status === 'open'
                  ? `Closes ${date(u.vote.closesAt)}.`
                  : ''}
                {yours ? ` Your vote: ${yours}.` : ''}
              </p>
            )}
            <div className="actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob(
                      [
                        JSON.stringify(
                          { type: 'FeatureCollection', features: u.features },
                          null,
                          2,
                        ) + '\n',
                      ],
                      { type: 'application/geo+json' },
                    ),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'corridor-use.geojson';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download the route
              </Button>
              {u.canAgree &&
                u.woodlots
                  .filter((w) => !w.agreedAt)
                  .map((w) => (
                    <span key={w.parcelId} className="block">
                      <label className="block small">
                        <input
                          type="checkbox"
                          checked={!!attested[u.id + w.parcelId]}
                          onChange={(e) =>
                            setAttested((a) => ({
                              ...a,
                              [u.id + w.parcelId]: e.target.checked,
                            }))
                          }
                        />{' '}
                        I may agree to this use on{' '}
                        {parcelNames[w.parcelId] ?? 'this woodlot'}
                      </label>
                      <Button
                        type="button"
                        disabled={disabled || !attested[u.id + w.parcelId]}
                        onClick={() =>
                          void run(() =>
                            mutate('agree_corridor_use', {
                              id: u.id,
                              parcelId: w.parcelId,
                              decision: 'agree',
                              attested: true,
                            }),
                          )
                        }
                      >
                        Agree
                      </Button>{' '}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          void run(() =>
                            mutate('agree_corridor_use', {
                              id: u.id,
                              parcelId: w.parcelId,
                              decision: 'refuse',
                            }),
                          )
                        }
                      >
                        Refuse
                      </Button>
                    </span>
                  ))}
              {u.canReview && (
                <span className="block">
                  <Input
                    aria-label={`Review note for ${u.name}`}
                    maxLength={1500}
                    placeholder="Review note"
                    value={notes[u.id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [u.id]: e.target.value }))
                    }
                  />
                  {['approve', 'reject'].map((decision) => (
                    <Button
                      key={decision}
                      type="button"
                      variant={decision === 'approve' ? 'default' : 'outline'}
                      disabled={disabled || !notes[u.id]?.trim()}
                      onClick={() =>
                        void run(() =>
                          mutate('review_corridor_fact', {
                            id: u.id,
                            decision,
                            note: notes[u.id],
                          }),
                        )
                      }
                    >
                      {decision === 'approve' ? 'Confirm this record' : 'Reject'}
                    </Button>
                  ))}
                </span>
              )}
              {steward && u.status === 'agreed' && (
                <Button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => mutate('open_corridor_use_vote', { id: u.id }))
                  }
                >
                  Open the co-op vote
                </Button>
              )}
              {u.canVote &&
                ['approve', 'oppose', 'abstain'].map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    variant={yours === choice ? 'default' : 'outline'}
                    disabled={disabled}
                    onClick={() =>
                      void run(() =>
                        mutate('vote_corridor_use', { id: u.id, choice }),
                      )
                    }
                  >
                    {choice[0].toUpperCase() + choice.slice(1)}
                  </Button>
                ))}
              {steward && u.status === 'voting' && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => mutate('close_corridor_use_vote', { id: u.id }))
                  }
                >
                  Close the vote
                </Button>
              )}
              {(u.canEnd ||
                (u.status === 'submitted' && steward) ||
                (IN_PROGRESS.includes(u.status) && (u.mine || steward))) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => mutate('end_corridor_use', { id: u.id }))
                  }
                >
                  {u.status === 'adopted'
                    ? 'End this use: return to natural corridor'
                    : u.status === 'reviewed'
                      ? 'It no longer exists: end this record'
                      : u.basis === 'fact'
                        ? 'Withdraw this record'
                        : 'Withdraw this proposal'}
                </Button>
              )}
            </div>
          </article>
        );
      })}
      <details className="mt-4" data-propose-corridor-use>
        <summary>Propose a recreation use</summary>
        {!layersReviewed ? (
          <p className="small">
            A steward must save the corridor layers, and another steward review
            them, before a use can be checked against the corridor.
          </p>
        ) : (
          <form
            className="action-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!route) throw new Error('Upload the route first.');
                if (
                  await mutate('propose_corridor_use', {
                    projectId,
                    name,
                    kind,
                    audience,
                    description,
                    features: route,
                  })
                ) {
                  setName('');
                  setDescription('');
                  setRoute(null);
                }
              });
            }}
          >
            <ControlLabel htmlFor={`${id}-name`}>Name</ControlLabel>
            <Input
              id={`${id}-name`}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ControlLabel htmlFor={`${id}-kind`}>Kind of use</ControlLabel>
            <NativeSelect
              className="w-full"
              id={`${id}-kind`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {RECREATION_KINDS.map((k: string) => (
                <NativeSelectOption key={k} value={k}>
                  {RECREATION_KIND_LABELS[
                    k as keyof typeof RECREATION_KIND_LABELS
                  ] ?? k}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <ControlLabel htmlFor={`${id}-audience`}>Who it is for</ControlLabel>
            <NativeSelect
              className="w-full"
              id={`${id}-audience`}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {RECREATION_AUDIENCES.map((a: string) => (
                <NativeSelectOption key={a} value={a}>
                  {AUDIENCE[a] ?? a}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <ControlLabel htmlFor={`${id}-description`}>
              Description (optional)
            </ControlLabel>
            <Input
              id={`${id}-description`}
              maxLength={1500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <ControlLabel htmlFor={`${id}-width`}>
              Width cleared of trees along trail lines, in metres (0 for a
              tread under standing trees)
            </ControlLabel>
            <Input
              id={`${id}-width`}
              type="number"
              min={0}
              max={RECREATION_LIMITS.maxClearedWidthM}
              step="0.5"
              value={width}
              onChange={(e) => {
                setWidth(e.target.value);
                setRoute(null);
              }}
            />
            <ControlLabel htmlFor={`${id}-route`}>
              Route (GeoJSON): lines for trails, polygons for cleared ground
              such as fairways
            </ControlLabel>
            <Input
              id={`${id}-route`}
              type="file"
              accept=".json,.geojson,application/json,application/geo+json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void run(async () => {
                  setRoute(null);
                  if (!file) return;
                  if (file.size > 60000)
                    throw new Error('The route file must be under 60000 bytes.');
                  setRoute(
                    readRoute(JSON.parse(await file.text()), Number(width) || 0),
                  );
                });
              }}
            />
            <p className="small" aria-live="polite">
              {route
                ? `${route.length} ${route.length === 1 ? 'feature' : 'features'} ready. A line’s own cleared_width_m is used when it records one.`
                : 'A wider clearing down the middle of a corridor splits it; a trail along its edge, or a tread under standing trees, usually keeps it whole.'}
            </p>
            <div className="actions">
              <Button
                type="submit"
                disabled={disabled || !route || !name.trim()}
              >
                Check against the corridor and propose
              </Button>
            </div>
          </form>
        )}
      </details>
      {steward && layersReviewed && (
        <details className="mt-4" data-record-corridor-fact>
          <summary>Record a right-of-way or a blowdown (stewards)</summary>
          <form
            className="action-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!factRoute) throw new Error('Upload the map first.');
                if (
                  await mutate('record_corridor_fact', {
                    projectId,
                    kind: fact.kind,
                    name: fact.name,
                    source: fact.source,
                    features: factRoute,
                    ...(fact.kind === 'blowdown'
                      ? { eventYear: Number(fact.year), severity: fact.severity }
                      : {}),
                  })
                ) {
                  setFact((f) => ({ ...f, name: '', source: '' }));
                  setFactRoute(null);
                }
              });
            }}
          >
            <ControlLabel htmlFor={`${id}-fact-kind`}>What it is</ControlLabel>
            <NativeSelect
              className="w-full"
              id={`${id}-fact-kind`}
              value={fact.kind}
              onChange={(e) => {
                setFact((f) => ({ ...f, kind: e.target.value }));
                setFactRoute(null);
              }}
            >
              {FACT_KINDS.map((k: string) => (
                <NativeSelectOption key={k} value={k}>
                  {RECREATION_KIND_LABELS[
                    k as keyof typeof RECREATION_KIND_LABELS
                  ] ?? k}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <ControlLabel htmlFor={`${id}-fact-name`}>Name</ControlLabel>
            <Input
              id={`${id}-fact-name`}
              maxLength={120}
              value={fact.name}
              onChange={(e) => setFact((f) => ({ ...f, name: e.target.value }))}
            />
            <ControlLabel htmlFor={`${id}-fact-source`}>
              Source, such as a deed, a utility map or a field visit
            </ControlLabel>
            <Input
              id={`${id}-fact-source`}
              maxLength={300}
              value={fact.source}
              onChange={(e) =>
                setFact((f) => ({ ...f, source: e.target.value }))
              }
            />
            {fact.kind === 'blowdown' ? (
              <>
                <ControlLabel htmlFor={`${id}-fact-year`}>
                  Year it happened
                </ControlLabel>
                <Input
                  id={`${id}-fact-year`}
                  type="number"
                  value={fact.year}
                  onChange={(e) =>
                    setFact((f) => ({ ...f, year: e.target.value }))
                  }
                />
                <ControlLabel htmlFor={`${id}-fact-severity`}>
                  How much came down
                </ControlLabel>
                <NativeSelect
                  className="w-full"
                  id={`${id}-fact-severity`}
                  value={fact.severity}
                  onChange={(e) =>
                    setFact((f) => ({ ...f, severity: e.target.value }))
                  }
                >
                  {BLOWDOWN_SEVERITIES.map((v: string) => (
                    <NativeSelectOption key={v} value={v}>
                      {SEVERITY[v] ?? v}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </>
            ) : (
              <>
                <ControlLabel htmlFor={`${id}-fact-width`}>
                  Width kept clear of trees along lines, in metres
                </ControlLabel>
                <Input
                  id={`${id}-fact-width`}
                  type="number"
                  min={0}
                  max={RECREATION_LIMITS.maxClearedWidthM}
                  step="0.5"
                  value={fact.width}
                  onChange={(e) => {
                    setFact((f) => ({ ...f, width: e.target.value }));
                    setFactRoute(null);
                  }}
                />
              </>
            )}
            <ControlLabel htmlFor={`${id}-fact-route`}>
              Map (GeoJSON):{' '}
              {fact.kind === 'blowdown'
                ? 'polygons of the blowdown'
                : 'lines along the right-of-way, or polygons of cleared ground'}
            </ControlLabel>
            <Input
              id={`${id}-fact-route`}
              type="file"
              accept=".json,.geojson,application/json,application/geo+json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void run(async () => {
                  setFactRoute(null);
                  if (!file) return;
                  if (file.size > 60000)
                    throw new Error('The map file must be under 60000 bytes.');
                  setFactRoute(
                    readRoute(
                      JSON.parse(await file.text()),
                      Number(fact.width) || 0,
                    ),
                  );
                });
              }}
            />
            <div className="actions">
              <Button
                type="submit"
                disabled={
                  disabled ||
                  !factRoute ||
                  !fact.name.trim() ||
                  !fact.source.trim()
                }
              >
                Record for another steward to review
              </Button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}
