'use client';

import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import './conservation-landscape.css';

const motionQuery = '(prefers-reduced-motion: reduce)';

// English captions for the corridor story. On this release branch the opening page is English
// only; on main these come from the home translations (lib/i18n), which ship with the next
// full release.
const t = {
  landscapeStoryValley:
    'Three neighbors. Three separate woodlots behind their homes.',
  landscapeStoryPlan:
    'They start a co-op and map one corridor through all three.',
  landscapeStoryJoin: 'Each owner agrees for their own plot, and it connects.',
  landscapeStoryAge: 'Left alone, the woodlots behind the houses grow old.',
  landscapeStoryEdge:
    'A shared trail goes to a co-op vote. Tree crops on a field are the owner’s call.',
  landscapeStoryNext: 'The aim: the corridor meets the next co-op’s.',
  landscapeStorySummary:
    'Neighbors start a co-op and map one corridor through their woodlots. Each owner agrees for their own plot, shared choices go to a vote, the woods grow old and, in time, the corridor meets the next co-op’s.',
  landscapeNextCoop: 'Next co-op',
} as const;

// Geometry of the corridor story (viewBox 600 by 470). Each of the three plots has a woodlot
// behind its house. The corridor runs through all three along the shared habitat path, one
// stretch per plot, then follows the creek. Each plot connects at its own node.
const STORY = {
  creek:
    'M505-30C450 36 536 73 480 130S482 213 540 249S556 347 515 378S517 452 565 499',
  path: 'M115 241C147 222 193 226 222 245S278 282 298 253S305 208 344 201S400 223 445 193L497 197',
  plots: [
    {
      outline: 'M72 164L165 112L270 152L251 258L172 284L64 253Z',
      woodlot:
        'M172 150C200 138 244 152 252 186C258 214 250 246 226 252C200 258 172 250 162 224C154 198 154 162 172 150Z',
      stretch: 'M115 241C147 222 193 226 222 245C240 257 256 266 272 268',
      link: 'M117 233L134 212',
      node: [116, 241],
      vote: [162, 170],
      oldTrees: [
        [188, 172, 11],
        [216, 170, 9],
        [232, 198, 11],
        [196, 206, 10],
        [214, 232, 9],
        [178, 228, 8],
      ],
    },
    {
      outline: 'M172 284L251 258L394 272L426 364L314 409L186 375L134 328Z',
      woodlot:
        'M176 318C196 296 236 282 262 276C276 292 276 326 264 350C250 374 218 384 196 372C174 360 166 334 176 318Z',
      stretch: 'M272 268C284 270 292 262 298 253C318 224 305 208 344 201',
      link: 'M277 274L297 295',
      node: [272, 268],
      vote: [330, 296],
      oldTrees: [
        [200, 316, 10],
        [228, 304, 9],
        [250, 322, 11],
        [196, 346, 9],
        [226, 344, 11],
        [246, 356, 8],
      ],
    },
    {
      outline: 'M270 152L333 108L441 133L474 220L394 272L251 258Z',
      woodlot:
        'M296 150C316 126 360 122 378 146C388 164 384 196 364 208C342 220 308 216 296 196C286 180 284 164 296 150Z',
      stretch: 'M344 201C383 194 400 223 445 193L497 197',
      link: 'M436 190L416 184',
      node: [442, 195],
      vote: [432, 144],
      oldTrees: [
        [314, 152, 10],
        [340, 142, 9],
        [362, 156, 11],
        [322, 182, 10],
        [350, 188, 11],
        [370, 184, 8],
      ],
    },
  ],
  band: [
    [86, 184],
    [100, 190],
    [84, 200],
    [98, 206],
    [82, 216],
    [96, 222],
  ],
  exit: 'M540 249C552 243 562 234 574 228',
  neighbour: 'M640 196C618 204 596 216 574 228',
} as const;

function subscribeToMotionPreference(notify: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

function getMotionPreference() {
  return window.matchMedia(motionQuery).matches;
}

function cyclePhase(seconds: number): CSSProperties {
  return { '--vc-cycle-delay': `${seconds}s` } as CSSProperties;
}

function Tree({
  x,
  y,
  size = 1,
  phase = 0,
}: {
  x: number;
  y: number;
  size?: number;
  phase?: number;
}) {
  return (
    <g transform={`translate(${x} ${y + 22 * size}) scale(${size})`}>
      <ellipse
        cx="0"
        cy="1"
        rx="12"
        ry="3"
        className="vc-landscape-tree-ground"
      />
      <g className="vc-landscape-tree-growth" style={cyclePhase(phase)}>
        <path
          d="M0-17V0M0-8l-6-5M0-12l5-4"
          className="vc-landscape-tree-trunk"
        />
        <g transform="translate(0 -22)">
          <g className="vc-landscape-canopy">
            <path d="M-2-23C-13-24-17-13-12-6C-23 2-12 13-3 9C4 17 20 8 14-2C20-12 11-24 3-20Z" />
            <path
              d="M-7-9C-9-4-7 1-3 3M5-15C11-12 12-7 9-3"
              className="vc-landscape-leaf-line"
            />
          </g>
        </g>
      </g>
    </g>
  );
}

function Hedgerow({
  x,
  y,
  angle = 0,
  phase = 0,
}: {
  x: number;
  y: number;
  angle?: number;
  phase?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <g className="vc-landscape-hedge-growth" style={cyclePhase(phase)}>
        <path
          d="M-16 1C-19-5-12-11-7-7C-8-17 7-18 9-9C17-11 23-2 16 2Z"
          className="vc-landscape-hedge-leaves"
        />
        <path
          d="M-9-2l3-3M1-4l1-5M10-1l3-4"
          className="vc-landscape-hedge-detail"
        />
      </g>
    </g>
  );
}

function Wildflowers({
  x,
  y,
  phase = 0,
  color = 'coral',
}: {
  x: number;
  y: number;
  phase?: number;
  color?: 'coral' | 'gold' | 'violet';
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`vc-landscape-flowers vc-landscape-flowers-${color}`}
    >
      <g className="vc-landscape-flower-growth" style={cyclePhase(phase)}>
        <path
          d="M0 0V-17M-9 0l-2-11M8 0l3-10"
          className="vc-landscape-flower-stems"
        />
        <path
          d="M0-5C-7-4-8-11-2-9M0-8C6-6 9-13 3-12M7-2C2-3 2-7 6-6"
          className="vc-landscape-flower-leaves"
        />
        <g transform="translate(0 -18)">
          <g className="vc-landscape-bloom" style={cyclePhase(phase - 2)}>
            <path d="M0-2C-8-10-11 1-4 2C-10 9 3 11 3 4C11 9 13-3 5-3C10-11-3-13 0-2Z" />
            <circle r="2.5" className="vc-landscape-flower-center" />
          </g>
        </g>
        <circle
          cx="-11"
          cy="-12"
          r="3.5"
          className="vc-landscape-small-bloom"
        />
        <circle cx="11" cy="-11" r="3" className="vc-landscape-small-bloom" />
      </g>
    </g>
  );
}

function Bird({
  x,
  y,
  phase = 0,
  size = 1,
}: {
  x: number;
  y: number;
  phase?: number;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="vc-landscape-bird-flight" style={cyclePhase(phase)}>
        <g
          transform={`scale(${size}) rotate(72)`}
          className="vc-landscape-bird"
        >
          <g className="vc-landscape-bird-wing vc-landscape-bird-wing-left">
            <path d="M0-2C-6-8-13-11-20-9L-13-2L-6 2L0 2Z" />
          </g>
          <g className="vc-landscape-bird-wing vc-landscape-bird-wing-right">
            <path d="M0-2C6-8 13-11 20-9L13-2L6 2L0 2Z" />
          </g>
          <path d="M0-10C3-7 3-1 2 4L5 10L0 8L-5 10L-2 4C-3-1-3-7 0-10Z" />
        </g>
      </g>
    </g>
  );
}

function Butterfly({
  x,
  y,
  phase = 0,
}: {
  x: number;
  y: number;
  phase?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="vc-landscape-butterfly-float" style={cyclePhase(phase)}>
        <g className="vc-landscape-butterfly-wings">
          <path d="M0-1C-11-14-16-3-7 1C-11 10-2 11 0 2C2 11 11 10 7 1C16-3 11-14 0-1Z" />
        </g>
        <path
          d="M0-3v8M0-2l-3-4M0-2l3-4"
          className="vc-landscape-butterfly-body"
        />
      </g>
    </g>
  );
}

function Rabbit() {
  return (
    <g transform="translate(220 292)" className="vc-landscape-rabbit">
      <circle cx="-9" cy="-2" r="3" />
      <ellipse cx="-1" cy="-3" rx="8" ry="5.5" />
      <g transform="translate(6 -7)">
        <g className="vc-landscape-rabbit-ears">
          <path d="M-1 1C-7-12-1-14 1-2C0-14 6-15 4 0" />
        </g>
        <circle r="4.5" />
        <circle cx="2" cy="-1" r="0.8" className="vc-landscape-rabbit-eye" />
      </g>
      <path d="M-5 2h5M4 1h5" />
    </g>
  );
}

function Home({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="vc-landscape-home">
      <path d="M-18-3V23H17V-3" fill="#f9f5e9" />
      <path d="M-23-3L-1-22L22-3Z" fill="#697d65" />
      <path d="M-5 23V8H5V23M-11 4h-1v5h1M11 4h1v5h-1" />
      <path d="M11-12v-11h6v16" fill="#f9f5e9" />
    </g>
  );
}

export function ConservationLandscape({
  id = 'vc-home-landscape',
}: {
  id?: string;
}) {
  const figure = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionPreference,
    () => true,
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!figure.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(figure.current);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      className="vc-landscape"
      ref={figure}
      data-motion={reducedMotion ? 'static' : visible ? 'running' : 'paused'}
    >
      <div className="vc-landscape-heading">
        <span>Small places. Shared purpose.</span>
      </div>

      <svg
        id={`${id}-landscape`}
        className="vc-landscape-art"
        viewBox="0 0 600 470"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>Neighboring land, connected by care</title>
        <desc id={`${id}-description`}>
          Three neighboring parcels with homes, trees and a creek connect along
          a shared habitat path. Trees grow and wildflowers bloom along property
          edges as birds, butterflies and a rabbit make their home in the
          landscape. A community meeting place represents a local conservation
          partner. A field notebook represents the care neighbors document
          together. This is a conceptual illustration, not a map of real land.
        </desc>
        <defs>
          <pattern
            id={`${id}-meadow`}
            width="19"
            height="19"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <path
              d="M4 10l2-4M6 10l1-3"
              stroke="#8e9b6f"
              strokeWidth="0.9"
              opacity="0.33"
              strokeLinecap="round"
            />
          </pattern>
          <pattern
            id={`${id}-orchard`}
            width="29"
            height="29"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-13)"
          >
            <circle cx="14" cy="14" r="2.6" fill="#75875d" opacity="0.3" />
          </pattern>
          <clipPath id={`${id}-frame`}>
            <rect x="1" y="1" width="598" height="468" rx="18" />
          </clipPath>
          <path
            id={`${id}-habitat`}
            d="M115 241C147 222 193 226 222 245S278 282 298 253S305 208 344 201S400 223 445 193"
          />
        </defs>

        <g clipPath={`url(#${id}-frame)`}>
          <rect width="600" height="470" fill="#f5f1e5" />

          <g className="vc-landscape-contours">
            <path d="M-34 116C30 90 14 34 92 21S205 25 237-18M-22 132C47 105 37 54 103 40S206 41 253-9M-10 148C68 119 57 73 120 59S208 63 270 3M8 165C88 137 78 95 136 81S222 81 287 18" />
            <path d="M311 478C354 421 426 449 463 414S484 335 540 326S603 353 637 313M335 496C377 433 436 468 481 433S500 356 548 347S609 373 647 335M358 509C399 453 456 489 499 453S518 378 565 369S618 397 655 357" />
            <path d="M280-25C299 24 355 16 373 61S363 105 407 133M302-25C321 6 368 5 390 52S381 95 423 119" />
          </g>

          <path
            d="M505-30C450 36 536 73 480 130S482 213 540 249S556 347 515 378S517 452 565 499"
            className="vc-landscape-creek-bank"
          />
          <path
            d="M505-30C450 36 536 73 480 130S482 213 540 249S556 347 515 378S517 452 565 499"
            className="vc-landscape-creek"
          />
          <path
            d="M505-30C450 36 536 73 480 130S482 213 540 249S556 347 515 378S517 452 565 499"
            className="vc-landscape-water-line"
          />

          <g className="vc-landscape-parcels">
            <path
              d="M72 164L165 112L270 152L251 258L172 284L64 253Z"
              fill="#dce4c7"
            />
            <path
              d="M72 164L165 112L270 152L251 258L172 284L64 253Z"
              fill={`url(#${id}-meadow)`}
              stroke="none"
            />
            <path
              d="M270 152L333 108L441 133L474 220L394 272L251 258Z"
              fill="#c5d5b2"
            />
            <path
              d="M270 152L333 108L441 133L474 220L394 272L251 258Z"
              fill={`url(#${id}-orchard)`}
              stroke="none"
            />
            <path
              d="M172 284L251 258L394 272L426 364L314 409L186 375L134 328Z"
              fill="#e2e4b4"
            />
            <path
              d="M172 284L251 258L394 272L426 364L314 409L186 375L134 328Z"
              fill={`url(#${id}-meadow)`}
              stroke="none"
            />
          </g>

          {/* The corridor story, under the trees and hedges: the woodlot behind each house, the
              planned corridor through all three, the stretch that turns solid as each owner
              agrees, and the canopy that deepens as the woods grow old. Without motion every
              part shows in its final state. */}
          <g className="vc-landscape-story-spine" aria-hidden="true">
            {STORY.plots.map((plot) => (
              <path
                key={plot.woodlot}
                d={plot.woodlot}
                className="vc-landscape-story-woodlot"
              />
            ))}
            <path d={STORY.creek} className="vc-landscape-story-plan" />
            <path d={STORY.path} className="vc-landscape-story-plan" />
            {STORY.plots.map((plot, i) => (
              <path
                key={plot.stretch}
                d={plot.stretch}
                pathLength={1}
                className={`vc-landscape-story-segment vc-landscape-story-segment-${i + 1}`}
              />
            ))}
            <path
              d={STORY.creek}
              pathLength={1}
              className="vc-landscape-story-segment vc-landscape-story-segment-4"
            />
            {[...STORY.plots.map((plot) => plot.stretch), STORY.creek].map(
              (d) => (
                <path key={d} d={d} className="vc-landscape-story-aged" />
              ),
            )}
            {STORY.plots.map((plot) => (
              <path
                key={plot.woodlot}
                d={plot.woodlot}
                className="vc-landscape-story-woodlot-aged"
              />
            ))}
            {STORY.plots.flatMap((plot) =>
              plot.oldTrees.map(([x, y, r]) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r={r}
                  className="vc-landscape-story-old-tree"
                />
              )),
            )}
          </g>

          <path
            d="M82 409C78 366 107 330 153 315S246 301 277 338S360 360 405 326S421 281 462 269"
            className="vc-landscape-footpath"
          />
          <path
            d="M153 315L138 213M277 338L309 308M405 326L411 179"
            className="vc-landscape-driveways"
          />

          <g className="vc-landscape-garden-lines">
            <path d="M81 198l35-18M80 207l36-18M79 216l37-18M78 225l35-16" />
            <path d="M344 323l41-12M347 332l41-12M350 341l41-12M353 350l41-12" />
          </g>

          <g className="vc-landscape-habitat">
            <use href={`#${id}-habitat`} className="vc-landscape-habitat-bed" />
            <use
              href={`#${id}-habitat`}
              className="vc-landscape-habitat-line"
            />
            <use
              href={`#${id}-habitat`}
              className="vc-landscape-habitat-travel"
            />
          </g>

          <g className="vc-landscape-boundary-habitat">
            <Hedgerow x={91} y={158} angle={-29} phase={-3} />
            <Hedgerow x={130} y={137} angle={-29} phase={-8} />
            <Hedgerow x={184} y={121} angle={21} phase={-14} />
            <Hedgerow x={226} y={137} angle={21} phase={-19} />
            <Hedgerow x={298} y={134} angle={-35} phase={-6} />
            <Hedgerow x={362} y={120} angle={13} phase={-11} />
            <Hedgerow x={443} y={160} angle={70} phase={-20} />
            <Hedgerow x={433} y={249} angle={-34} phase={-4} />
            <Hedgerow x={203} y={277} angle={-18} phase={-16} />
            <Hedgerow x={315} y={267} angle={6} phase={-9} />
            <Hedgerow x={154} y={347} angle={40} phase={-21} />
            <Hedgerow x={217} y={386} angle={15} phase={-7} />
            <Hedgerow x={275} y={402} angle={15} phase={-18} />
            <Hedgerow x={365} y={388} angle={-23} phase={-12} />
          </g>

          <g className="vc-landscape-boundary-flowers">
            <Wildflowers x={76} y={245} phase={-3} />
            <Wildflowers x={94} y={261} phase={-9} color="gold" />
            <Wildflowers x={160} y={129} phase={-14} color="violet" />
            <Wildflowers x={258} y={158} phase={-5} color="gold" />
            <Wildflowers x={393} y={138} phase={-12} />
            <Wildflowers x={459} y={213} phase={-18} color="violet" />
            <Wildflowers x={182} y={286} phase={-16} color="gold" />
            <Wildflowers x={278} y={275} phase={-1} />
            <Wildflowers x={365} y={279} phase={-7} color="violet" />
            <Wildflowers x={147} y={328} phase={-11} />
            <Wildflowers x={247} y={397} phase={-19} color="violet" />
            <Wildflowers x={334} y={400} phase={-4} color="gold" />
            <Wildflowers x={410} y={362} phase={-13} />
          </g>

          <Home x={137} y={187} />
          <Home x={407} y={160} />
          <Home x={305} y={312} />

          <Tree x={186} y={178} size={0.98} phase={-8} />
          <Tree x={212} y={201} size={0.72} phase={-15} />
          <Tree x={326} y={160} size={0.92} phase={-4} />
          <Tree x={351} y={178} size={0.74} phase={-11} />
          <Tree x={373} y={151} size={0.65} phase={-18} />
          <Tree x={191} y={336} size={1.05} phase={-20} />
          <Tree x={225} y={357} size={0.78} phase={-2} />
          <Tree x={247} y={332} size={0.69} phase={-13} />
          <Tree x={468} y={305} size={0.85} phase={-16} />
          <Tree x={487} y={326} size={0.68} phase={-6} />
          <Tree x={71} y={307} size={0.72} phase={-10} />
          <Tree x={109} y={130} size={0.65} phase={-1} />
          <Tree x={207} y={107} size={0.72} phase={-17} />
          <Tree x={337} y={91} size={0.66} phase={-22} />
          <Tree x={401} y={245} size={0.65} phase={-7} />
          <Tree x={387} y={355} size={0.82} phase={-12} />

          <g className="vc-landscape-story-edge" aria-hidden="true">
            <path
              d={STORY.path}
              transform="translate(3 -13)"
              className="vc-landscape-story-trail"
            />
            {STORY.plots.map((plot) => (
              <g
                key={plot.outline}
                transform={`translate(${plot.vote[0]} ${plot.vote[1]})`}
                className="vc-landscape-story-vote"
              >
                <rect x="-8" y="-9" width="16" height="18" rx="2.5" />
                <path d="M-4 0l3 3 5-6" />
              </g>
            ))}
            <g className="vc-landscape-story-band">
              {STORY.band.map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="4.6" />
              ))}
            </g>
          </g>
          <g className="vc-landscape-story-next" aria-hidden="true">
            <path
              d={STORY.exit}
              pathLength={1}
              className="vc-landscape-story-segment vc-landscape-story-exit"
            />
            <path
              d={STORY.neighbour}
              pathLength={1}
              className="vc-landscape-story-segment vc-landscape-story-neighbour"
            />
            <circle
              cx="574"
              cy="228"
              r="9"
              className="vc-landscape-story-junction"
            />
            <g className="vc-landscape-label vc-landscape-story-next-label">
              <rect x="462" y="170" width="130" height="30" rx="15" />
              <text x="527" y="190" textAnchor="middle">
                {t.landscapeNextCoop}
              </text>
            </g>
          </g>

          <Rabbit />
          <Butterfly x={164} y={245} phase={-2} />
          <Butterfly x={374} y={235} phase={-7} />
          <Butterfly x={309} y={379} phase={-11} />
          <Bird x={282} y={138} phase={-4} />
          <Bird x={300} y={159} phase={-5.5} size={0.8} />

          <g className="vc-landscape-nodes">
            <circle cx="116" cy="241" r="8" />
            <circle cx="272" cy="268" r="8" />
            <circle cx="442" cy="195" r="8" />
            <circle
              cx="116"
              cy="241"
              r="2.5"
              className="vc-landscape-node-core"
            />
            <circle
              cx="272"
              cy="268"
              r="2.5"
              className="vc-landscape-node-core"
            />
            <circle
              cx="442"
              cy="195"
              r="2.5"
              className="vc-landscape-node-core"
            />
          </g>

          {/* How the co-op works: each owner agrees for their own plot, which lights up and
              connects at its node; shared choices such as a trail are voted on by every member;
              tree crops on a field are the owner's own call. */}
          <g className="vc-landscape-story-joins" aria-hidden="true">
            {STORY.plots.map((plot, i) => (
              <g
                key={plot.outline}
                className={`vc-landscape-story-join vc-landscape-story-join-${i + 1}`}
              >
                <path d={plot.outline} className="vc-landscape-story-plot" />
                <path d={plot.link} className="vc-landscape-story-link" />
                <g transform={`translate(${plot.node[0]} ${plot.node[1]})`}>
                  <circle r="9.5" className="vc-landscape-story-joined" />
                  <path
                    d="M-4 0l3 3 5-6"
                    className="vc-landscape-story-check"
                  />
                </g>
              </g>
            ))}
          </g>

          <path
            d="M274 270C295 271 320 283 338 287S381 295 417 282"
            className="vc-landscape-partner-path"
          />
          <g transform="translate(455 273)" className="vc-landscape-partner">
            <circle r="39" className="vc-landscape-partner-halo" />
            <circle r="30" fill="#f8f5e9" />
            <path d="M-16-7L0-18L16-7M-13-7V14H13V-7M-19 15H19M-4 14V3H4V14" />
            <path d="M-7-3h2M5-3h2" />
          </g>

          <g className="vc-landscape-label">
            <rect x="42" y="77" width="155" height="34" rx="17" />
            <circle cx="59" cy="94" r="3" fill="#66825b" stroke="none" />
            <text x="71" y="99">
              Neighboring land
            </text>
            <path d="M115 112v17" className="vc-landscape-label-leader" />
          </g>
          <g className="vc-landscape-label">
            <rect x="337" y="55" width="154" height="34" rx="17" />
            <circle cx="354" cy="72" r="3" fill="#365a3f" stroke="none" />
            <text x="366" y="77">
              Connected habitat
            </text>
            <path d="M424 91l15 34" className="vc-landscape-label-leader" />
          </g>
          <g className="vc-landscape-label">
            <rect x="387" y="313" width="137" height="34" rx="17" />
            <text x="455.5" y="335" textAnchor="middle">
              Local nonprofit
            </text>
          </g>

          <g
            transform="translate(65 368) rotate(-7)"
            className="vc-landscape-notebook"
          >
            <path d="M2 2h49v60H2Z" fill="#dedbcc" stroke="none" />
            <rect x="-2" y="-3" width="48" height="60" rx="4" fill="#fbf8ef" />
            <path d="M6-3v60M16 10h18M16 20h14M16 30h18" />
            <path d="M17 42l5 5 12-13" className="vc-landscape-check" />
          </g>
          <g className="vc-landscape-note">
            <text x="129" y="428">
              Care, recorded together.
            </text>
            <path d="M110 414l9 10" />
          </g>

          <g
            transform="translate(552 54)"
            className="vc-landscape-compass"
            aria-hidden="true"
          >
            <path d="M0 17V-10M-4-3l4-9 4 9M-9 7H9" />
            <text x="0" y="-19" textAnchor="middle">
              N
            </text>
          </g>
        </g>
        <rect
          x="1"
          y="1"
          width="598"
          height="468"
          rx="18"
          className="vc-landscape-frame"
        />
      </svg>

      {/* One caption per scene. Screen readers get the summary once, not a changing line. */}
      <p className="vc-landscape-story-captions">
        <span className="vc-landscape-story-summary">
          {t.landscapeStorySummary}
        </span>
        {[
          t.landscapeStoryValley,
          t.landscapeStoryPlan,
          t.landscapeStoryJoin,
          t.landscapeStoryEdge,
          t.landscapeStoryAge,
          t.landscapeStoryNext,
        ].map((caption, i) => (
          <span
            key={caption}
            aria-hidden="true"
            className={`vc-landscape-story-caption vc-landscape-story-caption-${i + 1}`}
          >
            {caption}
          </span>
        ))}
      </p>

      <figcaption className="vc-landscape-caption">
        <span className="vc-landscape-key">
          <span /> Land. Neighbors. A shared future.
        </span>
        <span>Illustration only · not real parcel boundaries</span>
      </figcaption>
    </figure>
  );
}
