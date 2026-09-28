'use client';
import { ControlLabel } from '@/components/ui/label';
import { FieldDraftImport } from '@/components/field-draft-import';
import { AnalysisPanel, type AnalysisState } from '@/components/analysis-panel';
import { BoundaryEditor } from '@/components/boundary-editor';
import { downloadBoundary } from '@/lib/boundary-editor.mjs';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { validateBoundary } from '@/lib/monitoring.mjs';
import { localObservationDate } from '@/lib/observation-date.mjs';
type PolygonGeometry = { type: string; coordinates: number[][][] };
export type MonitoringBoundary = {
  id: string; status: string; geometry: PolygonGeometry;
  consentReference: string; externalSearchAllowed: boolean;
};
export type MonitoringParcel = { id: string; name: string; boundaries?: MonitoringBoundary[] };
export type MonitoringState = AnalysisState & {
  id: string; visibility: string; parcels: MonitoringParcel[];
  observations?: {
    id: string; parcelId: string; boundaryId: string; status: string;
    observedAt: number; observedDate?: string; observedTimeZone?: string; method: string; finding: string; reference: string;
  }[];
};
type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
function Form({
  children,
  save,
  submit,
  disabled = false,
}: {
  children: React.ReactNode;
  save: (v: Record<string, string>) => Promise<boolean>;
  submit: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        setBusy(true);
        setError('');
        try {
          if (
            await save(
              Object.fromEntries(new FormData(f)) as Record<string, string>,
            )
          )
            f.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={disabled || busy}>
        {children}
        <Button className="mt-4" type="submit">
          {busy ? 'Saving…' : submit}
        </Button>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function Outline({ geometry }: { geometry: PolygonGeometry }) {
  const { bbox } = validateBoundary(geometry),
    [w, s, e, n] = bbox;
  const points = geometry.coordinates[0]
    .map(
      ([x, y]: number[]) =>
        `${20 + ((x - w) / (e - w)) * 280},${200 - ((y - s) / (n - s)) * 180}`,
    )
    .join(' ');
  return (
    <figure>
      <svg
        viewBox="0 0 320 220"
        className="w-full max-w-md"
      >
        <title>Parcel boundary outline, north at top</title>
        <polygon
          points={points}
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="2"
        />
        <text x="10" y="15" fontSize="12">
          N ↑
        </text>
      </svg>
      <figcaption className="small">
        Coordinate outline · not a basemap or survey. W {w} / S {s} / E {e} / N{' '}
        {n}
      </figcaption>
    </figure>
  );
}
export function MonitoringBoard({
  state,
  steward,
  busy,
  growthPaused = false,
  mutate,
  refresh,
}: {
  state: MonitoringState;
  steward: boolean;
  busy: boolean;
  growthPaused?: boolean;
  mutate: Save;
  refresh: () => Promise<void>;
}) {
  const parcelSelectId = useId();
  const [selected, setSelected] = useState(''),
    [geometry, setGeometry] = useState(''),
    [editorRevision, setEditorRevision] = useState(0),
    [allow, setAllow] = useState(false),
    [confirm, setConfirm] = useState(false),
    [fileError, setFileError] = useState('');
  const parcel = state.parcels.find((p) => p.id === selected),
    boundary = parcel?.boundaries?.at(-1);
  const disabled = busy || state.visibility === 'archived' || growthPaused;
  let preview: PolygonGeometry | null = null;
  try {
    preview = validateBoundary(JSON.parse(geometry)).geometry;
  } catch {}
  return (
    <section>
      <h2>Map and monitor your land</h2>
      <p>
        Review a boundary, find satellite scenes, and record what you observe on
        the ground.
      </p>
      <div>
        <ControlLabel htmlFor={parcelSelectId}>Private parcel</ControlLabel>
        <NativeSelect
          id={parcelSelectId}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setGeometry('');
            setAllow(false);
            setConfirm(false);
            setFileError('');
          }}
        >
          <NativeSelectOption value="">Choose a parcel</NativeSelectOption>
          {state.parcels.map((p) => (
            <NativeSelectOption value={p.id} key={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {!state.parcels.length && (
        <p className="empty">Add a parcel in the Parcels section first.</p>
      )}
      {parcel && (
        <div
          className="network-columns monitoring-columns mt-6"
          key={parcel.id}
        >
          <section>
            <h3>Boundary history</h3>
            {!(parcel.boundaries ?? []).length && (
              <p className="empty">
                Draw or import your parcel’s boundary to begin.
              </p>
            )}
            {[...(parcel.boundaries ?? [])].reverse().map((b) => (
              <article className="network-card" key={b.id}>
                <p className="eyebrow">
                  {b.id === boundary?.id
                    ? 'Current boundary'
                    : 'Earlier boundary'}{' '}
                  · {b.status}
                </p>
                <Outline geometry={b.geometry} />
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      setGeometry(JSON.stringify(b.geometry, null, 2));
                      setEditorRevision((n) => n + 1);
                      setAllow(false);
                      setFileError('');
                    }}
                  >
                    Use as new draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      try {
                        downloadBoundary(JSON.stringify(b.geometry));
                      } catch (e) {
                        setFileError((e as Error).message);
                      }
                    }}
                  >
                    Download boundary
                  </Button>
                </div>
                <p>Consent reference: {b.consentReference}</p>
                <p>
                  External scene searches:{' '}
                  {b.externalSearchAllowed ? 'Allowed' : 'Not allowed'}
                </p>
                {steward && b.status === 'submitted' && (
                  <Form
                    disabled={disabled}
                    submit="Record independent review"
                    save={(v) =>
                      mutate('review_boundary', {
                        ...v,
                        id: b.id,
                        parcelId: parcel.id,
                      })
                    }
                  >
                    <ControlLabel>
                      Decision
                      <NativeSelect name="decision" required>
                        <NativeSelectOption value="">Choose</NativeSelectOption>
                        <NativeSelectOption value="approve">
                          Approve boundary record
                        </NativeSelectOption>
                        <NativeSelectOption value="reject">
                          Reject boundary record
                        </NativeSelectOption>
                      </NativeSelect>
                    </ControlLabel>
                  </Form>
                )}
                {b.externalSearchAllowed && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await mutate('revoke_satellite_consent', {
                          parcelId: parcel.id,
                          id: b.id,
                        });
                      } catch (e) {
                        setFileError((e as Error).message);
                      }
                    }}
                  >
                    Stop external searches for this version
                  </Button>
                )}
              </article>
            ))}
            <h3 className="mt-6">Satellite discovery history</h3>
            <p className="small">
              Scene metadata only. No image analysis, vegetation trend, carbon
              estimate, or automatic alert is generated.
            </p>
            {[...(state.satelliteSearches ?? [])]
              .filter((x) => x.parcelId === parcel.id)
              .reverse()
              .map((run) => (
                <article className="network-card" key={run.id}>
                  <h4>
                    {run.start} – {run.end}
                  </h4>
                  <p>
                    {run.scenes.length} scenes returned · maximum {run.limit}{' '}
                    per search
                  </p>
                  <p className="small">
                    {run.provider} · {run.connectorVersion} · saved{' '}
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                  {!run.scenes.length && (
                    <p>
                      No scenes returned. This is not evidence of no ecological
                      change.
                    </p>
                  )}
                  {run.scenes.map((scene) => (
                    <div className="panel mt-3" key={scene.id}>
                      <p>{new Date(scene.acquiredAt).toLocaleString()}</p>
                      <p>
                        Scene cloud cover:{' '}
                        {scene.cloudCover === null
                          ? 'Unavailable'
                          : `${scene.cloudCover}%`}{' '}
                        · not parcel-level cloud cover
                      </p>
                      <a
                        href={scene.reference}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        View source scene metadata ↗
                      </a>
                    </div>
                  ))}
                  <details className="mt-4">
                    <summary>Source receipt</summary>
                    <p className="small break-all">
                      Boundary: {run.boundaryId}
                      <br />
                      Response SHA-256: {run.responseSha256}
                    </p>
                  </details>
                </article>
              ))}
            <AnalysisPanel
              key={parcel.id}
              state={state}
              parcel={parcel}
              boundary={boundary}
              steward={steward}
              disabled={disabled}
              mutate={mutate}
            />
            <h3 className="mt-6">Field observations</h3>
            {[...(state.observations ?? [])]
              .filter((o) => o.parcelId === parcel.id)
              .reverse()
              .map((o) => (
                <article className="network-card" key={o.id}>
                  <p className="eyebrow">
                    {o.status} · {o.observedDate ?? new Date(o.observedAt).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                    {o.observedTimeZone ? ` (${o.observedTimeZone})` : ''}
                  </p>
                  <p>
                    <strong>Method:</strong> {o.method}
                  </p>
                  <p className="whitespace-pre-wrap">{o.finding}</p>
                  {o.reference && (
                    <a href={o.reference} target="_blank" rel="noreferrer">
                      Supporting reference ↗
                    </a>
                  )}
                  <p className="small">Boundary version: {o.boundaryId}</p>
                  {steward && o.status === 'submitted' && (
                    <Form
                      submit="Record independent review"
                      disabled={disabled}
                      save={(v) =>
                        mutate('review_observation', { ...v, id: o.id })
                      }
                    >
                      <ControlLabel>
                        Decision
                        <NativeSelect name="decision" required>
                          <NativeSelectOption value="">
                            Choose
                          </NativeSelectOption>
                          <NativeSelectOption value="approve">
                            Approve observation record
                          </NativeSelectOption>
                          <NativeSelectOption value="reject">
                            Reject observation record
                          </NativeSelectOption>
                        </NativeSelect>
                      </ControlLabel>
                    </Form>
                  )}
                </article>
              ))}
          </section>
          <aside className="panel">
            <h3>Add a boundary version</h3>
            <BoundaryEditor
              key={editorRevision}
              value={geometry}
              onChange={setGeometry}
              disabled={disabled}
            />
            <Form
              key={`boundary-${editorRevision}`}
              submit="Save boundary for review"
              disabled={disabled || !preview}
              save={async (v) => {
                const saved = await mutate('save_boundary', {
                  parcelId: parcel.id,
                  geometry: validateBoundary(JSON.parse(geometry)).geometry,
                  consentReference: v.consentReference,
                  externalSearchAllowed: allow,
                });
                if (saved) {
                  setGeometry('');
                  setAllow(false);
                  setConfirm(false);
                  setEditorRevision((n) => n + 1);
                }
                return saved;
              }}
            >
              {preview && <Outline geometry={preview} />}
              <ControlLabel>
                Landholder’s boundary and monitoring consent reference
                <Input name="consentReference" required maxLength={300} />
              </ControlLabel>
              <ControlLabel className="flex gap-3 items-start">
                <Checkbox
                  checked={allow}
                  onCheckedChange={(v) => setAllow(v === true)}
                />
                <span>
                  Consent permits sending this bounding box to Copernicus for
                  satellite searches.
                </span>
              </ControlLabel>
            </Form>
            {fileError && (
              <p role="alert" className="form-error">
                {fileError}
              </p>
            )}
            <h3 className="mt-8">Find Sentinel-2 scenes</h3>
            <Form
              submit="Search and save scene receipt"
              disabled={
                disabled ||
                boundary?.status !== 'reviewed' ||
                !boundary?.externalSearchAllowed ||
                !confirm
              }
              save={async (v) => {
                const response = await fetch('/api/monitoring', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    id: state.id,
                    parcelId: parcel.id,
                    ...v,
                    confirmExternal: confirm,
                  }),
                });
                const result: { error?: string } = await response.json();
                if (!response.ok) throw new Error(result.error ?? 'The scene search could not be completed.');
                await refresh();
                setConfirm(false);
                return true;
              }}
            >
              <ControlLabel>
                From
                <Input type="date" name="start" required />
              </ControlLabel>
              <ControlLabel>
                Through
                <Input type="date" name="end" required />
              </ControlLabel>
            </Form>
            <ControlLabel className="flex gap-3 items-start mt-4">
              <Checkbox
                checked={confirm}
                onCheckedChange={(v) => setConfirm(v === true)}
              />
              <span>
                Send the current boundary’s bounding box and selected dates to
                Copernicus. Private member details are not sent.
              </span>
            </ControlLabel>
            <p className="small mt-3">
              Requires reviewed boundary and recorded consent. Up to 20 newest
              scenes; narrow dates for more detail. No background monitoring is
              enabled.
            </p>
            <h3 className="mt-8">Record a field visit</h3>
            <Form
              key={parcel.id}
              submit="Save observation for review"
              disabled={disabled || boundary?.status !== 'reviewed'}
              save={(v) =>
                mutate('record_observation', {
                  ...v,
                  parcelId: parcel.id,
                  ...localObservationDate(v.date),
                })
              }
            >
              <FieldDraftImport />
              <ControlLabel>
                Observation date
                <Input type="date" name="date" required />
              </ControlLabel>
              <ControlLabel>
                Method, sampling locations, and units
                <Textarea name="method" required maxLength={1000} />
              </ControlLabel>
              <ControlLabel>
                Findings, measurements, and uncertainty
                <Textarea name="finding" required maxLength={2000} />
              </ControlLabel>
              <ControlLabel>
                Supporting HTTPS reference (optional)
                <Input name="reference" type="url" maxLength={500} />
              </ControlLabel>
              <p className="small">
                Attach private photographs through Evidence. A reviewed
                observation is not carbon certification.
              </p>
            </Form>
          </aside>
        </div>
      )}
    </section>
  );
}
