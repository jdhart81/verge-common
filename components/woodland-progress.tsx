'use client';

import { Button } from '@/components/ui/button';

// What memberView attaches for each woodland project (lib/woodland-progress.mjs, CP1-CP6).
export type CorridorProgress = {
  projectId: string;
  layers: 'none' | 'submitted' | 'reviewed';
  pattern: {
    coreAreas: number;
    retained: number;
    streams: number;
    maxStreamOrder: number;
    ridge: number;
    valley: number;
    saddle: number;
  };
  woodlots: number;
  joined: number;
  onCorridor: number;
  onCorridorJoined: number;
  reached: Record<Stage, boolean>;
  next: Stage | null;
  rows: {
    parcelId: string;
    name: string;
    boundary: 'none' | 'submitted' | 'reviewed';
    onCorridor: boolean | null;
    joined: boolean;
  }[];
};
type Stage = 'map' | 'branches' | 'woodlots' | 'joining' | 'whole';

const plural = (n: number, one: string, many = one + 's') =>
  `${n} ${n === 1 ? one : many}`;

const STAGES: { id: Stage; title: string; detail: (p: CorridorProgress) => string }[] = [
  {
    id: 'map',
    title: 'Map the corridor',
    detail: (p) =>
      p.reached.map
        ? `${plural(p.pattern.coreAreas, 'core area')} and ${plural(p.pattern.retained, 'retained corridor')} are reviewed.`
        : p.layers === 'submitted'
          ? 'Layers are waiting for another steward’s review.'
          : 'A steward draws or uploads the core areas and retained corridors.',
  },
  {
    id: 'branches',
    title: 'Trace the branches',
    detail: (p) =>
      p.reached.branches
        ? `${plural(p.pattern.streams, 'stream')}${p.pattern.maxStreamOrder ? ` (largest: order ${p.pattern.maxStreamOrder})` : ''}, ${plural(p.pattern.valley, 'valley link')}, ${plural(p.pattern.ridge, 'ridge link')} and ${plural(p.pattern.saddle, 'saddle link')}.`
        : 'Add the streams, then valley, ridge and saddle links, so the corridor branches the way water does.',
  },
  {
    id: 'woodlots',
    title: 'Record the woodlots',
    detail: (p) =>
      p.reached.woodlots
        ? `${plural(p.woodlots, 'woodlot')} with a reviewed boundary${p.reached.map ? `; the mapped corridor touches ${p.onCorridor}` : ''}.`
        : 'Each owner records their own woodlot and its boundary. Another steward reviews it.',
  },
  {
    id: 'joining',
    title: 'Owners join, one woodlot at a time',
    detail: (p) =>
      p.reached.joining
        ? `${p.joined} of ${plural(p.woodlots, 'woodlot')} joined by the owner’s reviewed consent.`
        : 'An owner joins by recording consent for their own woodlot. Nobody can join for someone else.',
  },
  {
    id: 'whole',
    title: 'The corridor is whole',
    detail: (p) =>
      p.reached.whole
        ? 'Every recorded woodlot the mapped corridor touches has joined.'
        : p.onCorridor
          ? `${p.onCorridorJoined} of ${plural(p.onCorridor, 'woodlot')} the mapped corridor touches ${p.onCorridorJoined === 1 ? 'has' : 'have'} joined.`
          : 'Reached when every recorded woodlot the mapped corridor touches has joined.',
  },
];

/** A schematic of the co-op's woodlots as nodes on a branching line. Not a map. */
function Nodes({ woodlots, joined }: { woodlots: number; joined: number }) {
  const shown = Math.min(woodlots, 24);
  const width = Math.max(shown, 3) * 34 + 30;
  return (
    <svg
      className="corridor-progress-nodes"
      viewBox={`0 0 ${width} 76`}
      width={width}
      height={76}
      aria-hidden="true"
    >
      <path d={`M10 38H${width - 10}`} className="corridor-progress-trunk" />
      {Array.from({ length: shown }, (_, i) => {
        const x = 32 + i * 34;
        const y = i % 2 ? 60 : 16;
        return (
          <g key={i}>
            <path
              d={`M${x - 12} 38Q${x - 4} 38 ${x} ${y}`}
              className={
                i < joined
                  ? 'corridor-progress-branch is-joined'
                  : 'corridor-progress-branch'
              }
            />
            <circle
              cx={x}
              cy={y}
              r="8"
              className={
                i < joined
                  ? 'corridor-progress-node is-joined'
                  : 'corridor-progress-node'
              }
            />
          </g>
        );
      })}
    </svg>
  );
}

export function WoodlandProgress({
  progress,
  steward,
  onOpenTab,
}: {
  progress: CorridorProgress;
  steward: boolean;
  onOpenTab?: (tab: string) => void;
}) {
  const open = (tab: string, label: string) =>
    onOpenTab && (
      <Button type="button" variant="outline" onClick={() => onOpenTab(tab)}>
        {label}
      </Button>
    );
  return (
    <section
      className="corridor-progress"
      aria-label="Corridor progress"
      data-corridor-progress
      data-next={progress.next ?? 'done'}
    >
      <h3>Corridor progress</h3>
      <p className="small">
        The aim is one old-growth corridor that branches along the streams,
        valleys and ridges, the way water does, and reconnects the woods. It is
        mapped whole, then joined one woodlot at a time. Each woodlot is a node:
        it connects when its owner agrees.
      </p>
      {progress.woodlots > 0 && (
        <>
          <Nodes woodlots={progress.woodlots} joined={progress.joined} />
          <p className="small">
            {progress.joined} of {plural(progress.woodlots, 'woodlot')} joined.
            A schematic: each dot is a woodlot, not its place on the map.
          </p>
        </>
      )}
      <ol className="corridor-progress-steps">
        {STAGES.map((stage, i) => {
          const done = progress.reached[stage.id];
          const next = progress.next === stage.id;
          return (
            <li
              key={stage.id}
              data-stage={stage.id}
              data-state={done ? 'done' : next ? 'next' : 'later'}
            >
              <strong>
                {i + 1}. {stage.title}
                <span className="corridor-progress-state">
                  {done ? ' · done' : next ? ' · next' : ''}
                </span>
              </strong>
              <span>{stage.detail(progress)}</span>
            </li>
          );
        })}
      </ol>
      <h4>{steward ? 'Woodlots' : 'Your woodlots'}</h4>
      {progress.rows.length === 0 ? (
        <p className="small">
          {steward
            ? 'No woodlot is recorded in this project yet.'
            : 'You have not recorded a woodlot in this project yet.'}{' '}
          Record it under Parcels, with its boundary under Map & monitor.
        </p>
      ) : (
        <ul className="corridor-progress-rows">
          {progress.rows.map((row) => (
            <li
              key={row.parcelId}
              data-woodlot-state={
                row.joined
                  ? 'joined'
                  : row.boundary !== 'reviewed'
                    ? 'boundary'
                    : 'consent'
              }
            >
              <strong>{row.name || 'Unnamed woodlot'}</strong>
              <span>
                {row.joined
                  ? 'Joined: the owner’s consent is reviewed.'
                  : row.boundary === 'none'
                    ? 'Needs a boundary before it can join.'
                    : row.boundary === 'submitted'
                      ? 'Boundary is waiting for a steward’s review.'
                      : 'Boundary reviewed. Not joined yet: the owner records consent for this woodlot.'}{' '}
                {row.onCorridor === true
                  ? 'The mapped corridor touches this woodlot.'
                  : row.onCorridor === false
                    ? 'The mapped corridor does not touch this woodlot. A steward can extend a branch to it in the layers.'
                    : ''}
              </span>
              {onOpenTab && !row.joined && (
                <span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onOpenTab(
                        row.boundary === 'none' ? 'monitoring' : 'parcels',
                      )
                    }
                  >
                    {row.boundary === 'none'
                      ? 'Draw its boundary'
                      : row.boundary === 'submitted'
                        ? 'See its record'
                        : 'Record the owner’s consent'}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="actions mt-3">
        {open('parcels', 'Open Parcels')}
        {open('monitoring', 'Open Map & monitor')}
      </div>
      <p className="small">
        “Touches” compares the maps only. It does not establish species
        movement, genetics, regulatory compliance or old-growth condition.
        {!steward &&
          ' You see your own woodlots; for the rest of the co-op you see counts only.'}
      </p>
    </section>
  );
}

/** One line above the tabs: where the corridor stands and the next step. */
export function CorridorStrip({
  progress,
  projects,
  onOpen,
}: {
  progress?: Record<string, CorridorProgress>;
  projects: { id: string; name: string }[];
  onOpen: () => void;
}) {
  const list = Object.values(progress ?? {});
  if (!list.length) return null;
  return (
    <div className="corridor-strip" data-corridor-strip>
      {list.map((p) => {
        const stage = STAGES.find((s) => s.id === p.next);
        return (
          <p key={p.projectId}>
            <strong>
              {projects.find((x) => x.id === p.projectId)?.name ?? 'Corridor'}
            </strong>
            {': '}
            {p.woodlots
              ? `${p.joined} of ${plural(p.woodlots, 'woodlot')} joined the corridor.`
              : 'no woodlot has a reviewed boundary yet.'}{' '}
            {stage
              ? `Next: ${stage.title.toLowerCase()}.`
              : 'Every woodlot the mapped corridor touches has joined.'}
          </p>
        );
      })}
      <Button type="button" variant="outline" onClick={onOpen}>
        Open Woodland corridors
      </Button>
    </div>
  );
}
