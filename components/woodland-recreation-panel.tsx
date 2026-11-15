'use client';
// Recreation along the old-growth corridor (lib/woodland-recreation.mjs, RC1-RC9). Natural
// corridor is the default; this panel lists the uses a co-op has proposed or adopted and lets
// members propose a route, agree for their own woodlots, vote and end a use. Every rule is
// enforced by the co-op's commands on the server; this component only displays and sends.
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
  audience: string;
  description?: string;
  features: UseFeature[];
  status: string;
  holds: boolean;
  clearedM2: number;
  check: { status: string; lostLinks?: Pair[]; pinchedLinks?: Pair[]; reasons?: string[] };
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
  const pairs = (links?: Pair[]) =>
    (links ?? []).map((l) => `${l.a} – ${l.b}`).join('; ');
  return (
    <section
      className="mt-6"
      aria-label="Recreation along the corridor"
      data-woodland-recreation
    >
      <h3>Recreation along the corridor</h3>
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
              · for {AUDIENCE[u.audience] ?? u.audience} ·{' '}
              {STATUS[u.status] ?? u.status}
            </p>
            {u.description && <p>{u.description}</p>}
            <p className="small">
              {u.holds
                ? `The corridor holds: every link between core areas keeps the minimum width with ${u.clearedM2} m² of corridor cleared.`
                : u.check.status === 'incomplete'
                  ? `The corridor check could not be completed: ${(u.check.reasons ?? []).join(' ')}`
                  : `The corridor does not hold. Links lost: ${pairs(u.check.lostLinks) || 'none'}. Links pinched below the minimum width: ${pairs(u.check.pinchedLinks) || 'none'}. Route it along the corridor’s edge, or record a tread under standing trees, and propose it again.`}
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
              . Holders agreed: {u.agreedCount} of {u.woodlotCount}.
            </p>
            {u.woodlots.length > 0 && (
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
    </section>
  );
}
