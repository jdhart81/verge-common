'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import './conservation-landscape.css';

const motionQuery = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(notify: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

function getMotionPreference() {
  return window.matchMedia(motionQuery).matches;
}

function Tree({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <path
        d="M0 5V22M0 14l-6-5M0 10l5-4"
        className="vc-landscape-tree-trunk"
      />
      <g className="vc-landscape-canopy">
        <path d="M-2-23C-13-24-17-13-12-6C-23 2-12 13-3 9C4 17 20 8 14-2C20-12 11-24 3-20Z" />
        <path
          d="M-7-9C-9-4-7 1-3 3M5-15C11-12 12-7 9-3"
          className="vc-landscape-leaf-line"
        />
      </g>
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

export function ConservationLandscape() {
  const id = useId();
  const figure = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionPreference,
    () => true,
  );
  const [requestedMotion, setRequestedMotion] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const motionEnabled = requestedMotion ?? !reducedMotion;

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
      data-motion={motionEnabled && visible ? 'running' : 'paused'}
      data-explicit-motion={requestedMotion === true ? 'true' : undefined}
    >
      <div className="vc-landscape-heading">
        <span>Small places. Shared purpose.</span>
        <button
          type="button"
          className="vc-landscape-motion"
          aria-pressed={!motionEnabled}
          aria-controls={`${id}-landscape`}
          onClick={() => setRequestedMotion(!motionEnabled)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {motionEnabled ? (
              <path d="M5 3v10M11 3v10" />
            ) : (
              <path d="M5 3l8 5-8 5Z" />
            )}
          </svg>
          {motionEnabled ? 'Pause motion' : 'Play motion'}
        </button>
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
          a shared habitat path. A community meeting place represents a local
          conservation partner. A field notebook represents the care neighbors
          document together. This is a conceptual illustration, not a map of
          real land.
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

          <Home x={137} y={187} />
          <Home x={407} y={160} />
          <Home x={305} y={312} />

          <Tree x={186} y={178} size={0.82} />
          <Tree x={212} y={201} size={0.64} />
          <Tree x={326} y={160} size={0.82} />
          <Tree x={351} y={178} size={0.68} />
          <Tree x={373} y={151} size={0.61} />
          <Tree x={191} y={336} size={0.92} />
          <Tree x={225} y={357} size={0.7} />
          <Tree x={247} y={332} size={0.62} />
          <Tree x={468} y={305} size={0.75} />
          <Tree x={487} y={326} size={0.6} />
          <Tree x={71} y={307} size={0.65} />

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

      <figcaption className="vc-landscape-caption">
        <span className="vc-landscape-key">
          <span /> Land. Neighbors. A shared future.
        </span>
        <span>Illustration only · not real parcel boundaries</span>
      </figcaption>
    </figure>
  );
}
