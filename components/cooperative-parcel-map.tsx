'use client';
import { useId, useState } from 'react';
import { cooperativeMap } from '@/lib/cooperative-map.mjs';
import { Button } from '@/components/ui/button';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { MonitoringParcel } from '@/components/monitoring-board';

type Parcel = MonitoringParcel & { projectId: string; status: string };
export function CooperativeParcelMap({
  parcels,
  projects,
  steward,
}: {
  parcels: Parcel[];
  projects: { id: string; name: string }[];
  steward: boolean;
}) {
  const [projectId, setProjectId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const titleId = useId(),
    descriptionId = useId();
  if (!steward) return null;
  const model = cooperativeMap(parcels, {
    steward,
    projectId: projectId || null,
  });
  const selected =
    model.parcels.find((p) => p.id === selectedId) ?? model.parcels[0];
  return (
    <section className="panel my-6" aria-labelledby={titleId}>
      <h3 id={titleId}>Your cooperative landscape</h3>
      <p id={descriptionId} className="small">
        Private steward view of the latest reviewed parcel boundaries. Solid
        green outlines have current reviewed pooling consent; dashed amber
        outlines still need it. This overview does not change ownership or
        authorize sharing.
      </p>
      <ControlLabel>
        Show parcels for
        <NativeSelect
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <NativeSelectOption value="">All projects</NativeSelectOption>
          {projects.map((project) => (
            <NativeSelectOption key={project.id} value={project.id}>
              {project.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </ControlLabel>
      {model.parcels.length ? (
        <>
          <figure className="my-4">
            <svg
              viewBox={`0 0 ${model.width} ${model.height}`}
              className="w-full rounded-lg border bg-[#f4f7ed]"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              <title>Reviewed parcel outlines, north at the top</title>
              <text x="16" y="25" fontSize="15" fill="#294c3b">
                N ↑
              </text>
              {model.parcels.map((parcel) => (
                <polygon
                  key={parcel.id}
                  points={parcel.points
                    .map((point) =>
                      point.map((value) => value.toFixed(2)).join(','),
                    )
                    .join(' ')}
                  fill={parcel.consentCurrent ? '#4c8060' : '#c68d35'}
                  fillOpacity={selected?.id === parcel.id ? 0.38 : 0.14}
                  stroke={parcel.consentCurrent ? '#275c3e' : '#946016'}
                  strokeWidth={selected?.id === parcel.id ? 3 : 1.5}
                  strokeDasharray={parcel.consentCurrent ? undefined : '6 4'}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {parcel.name}:{' '}
                    {parcel.consentCurrent
                      ? 'Current pooling consent reviewed'
                      : 'Current pooling consent needed'}
                  </title>
                </polygon>
              ))}
            </svg>
            <figcaption className="small mt-2">
              Shared coordinate overview, not a survey or basemap. Boundaries
              stay in this browser view; no map provider is contacted.
              {model.bounds && (
                <>
                  {' '}
                  Extent: W {model.bounds[0].toFixed(5)}, S{' '}
                  {model.bounds[1].toFixed(5)}, E {model.bounds[2].toFixed(5)},
                  N {model.bounds[3].toFixed(5)}.
                </>
              )}
            </figcaption>
          </figure>
          {model.wideExtent && (
            <p className="notice">
              These parcels span a broad region or high latitude. The overview
              can distort distance and shape; inspect each project and its
              original coordinates separately.
            </p>
          )}
          <div className="flex flex-wrap gap-2" aria-label="Highlight a parcel">
            {model.parcels.map((parcel) => (
              <Button
                key={parcel.id}
                type="button"
                variant={selected?.id === parcel.id ? 'default' : 'outline'}
                aria-pressed={selected?.id === parcel.id}
                onClick={() => setSelectedId(parcel.id)}
              >
                {parcel.name}
              </Button>
            ))}
          </div>
          {selected && (
            <output className="small mt-3 block" aria-live="polite">
              {selected.name} ·{' '}
              {(selected.areaSquareMetres / 10000).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}{' '}
              hectares estimated from the boundary ·{' '}
              {selected.consentCurrent
                ? 'Current pooling consent reviewed'
                : 'Current pooling consent needed'}
              . Recorded consent and mapped area do not establish carbon-credit
              eligibility.
            </output>
          )}
        </>
      ) : (
        <p className="notice">
          No current reviewed boundaries to display. Record and review parcels
          and their latest boundaries in Parcels and Monitoring.
        </p>
      )}
      {model.omitted.length > 0 && (
        <details className="mt-4">
          <summary>
            {model.omitted.length} parcel{model.omitted.length === 1 ? '' : 's'}{' '}
            awaiting map preparation
          </summary>
          <ul>
            {model.omitted.map((parcel) => (
              <li key={parcel.id}>
                {parcel.name}: {parcel.reason}.
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
