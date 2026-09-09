'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
type Item = { id: string; [key: string]: any };
export function AnalysisPanel({
  state,
  parcel,
  boundary,
  steward,
  disabled,
  mutate,
}: {
  state: any;
  parcel: Item;
  boundary: any;
  steward: boolean;
  disabled: boolean;
  mutate: (op: string, p: any) => Promise<boolean>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [upload, setUpload] = useState(''),
    [jobId, setJobId] = useState('');
  const scenes: Item[] = Array.from(
    new Map(
      (state.satelliteSearches ?? [])
        .filter(
          (r: Item) =>
            r.parcelId === parcel.id && r.boundaryId === boundary?.id,
        )
        .flatMap((r: Item) => r.scenes)
        .map((s: Item) => [s.id, s]),
    ).values(),
  ) as Item[];
  const jobs: Item[] = (state.analysisJobs ?? []).filter(
    (j: Item) => j.parcelId === parcel.id,
  );
  async function act(op: string, p: any) {
    setBusy(true);
    setError('');
    try {
      await mutate(op, p);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function download(job: Item) {
    const { createdBy, ...exported } = job;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `verge-imagery-job-${job.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel mt-8">
      <h3>Compare vegetation between two dates</h3>
      <p>
        Select two discovered scenes. Export a private processing job, run the
        open-source worker with aligned imagery, and import its result for
        review.
      </p>
      <p className="small">
        This workflow measures NDVI, a vegetation index. A decrease can reflect
        seasonality, weather, management, or residual cloud effects. It does not
        establish habitat loss or carbon emissions.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <form
        className="action-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          await act('create_analysis_job', { ...values, parcelId: parcel.id });
        }}
      >
        <fieldset
          disabled={
            disabled ||
            busy ||
            boundary?.status !== 'reviewed' ||
            scenes.length < 2
          }
        >
          {['beforeId', 'afterId'].map((name, i) => (
            <label key={name}>
              {i === 0 ? 'Earlier scene' : 'Later scene'}
              <NativeSelect name={name} required>
                <NativeSelectOption value="">Choose a scene</NativeSelectOption>
                {scenes.map((s) => (
                  <NativeSelectOption value={s.id} key={s.id}>
                    {s.acquiredAt.slice(0, 10)} · {s.id}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ))}
          <Button type="submit" className="mt-4">
            Create processing job
          </Button>
        </fieldset>
      </form>
      {scenes.length < 2 && (
        <p className="small">
          Discover at least two scenes for the current reviewed boundary first.
        </p>
      )}
      {jobs.map((job) => (
        <article className="network-card" key={job.id}>
          <h4>
            {job.scenes[0].acquiredAt.slice(0, 10)} →{' '}
            {job.scenes[1].acquiredAt.slice(0, 10)}
          </h4>
          <p className="small">
            Job {job.id}
            <br />
            Boundary {job.boundaryId}
          </p>
          <Button variant="outline" onClick={() => download(job)}>
            Download private job
          </Button>
        </article>
      ))}
      <p className="small mt-4">
        Job files include the private parcel boundary. Share only with an
        authorized processor.{' '}
        <a
          className="text-link"
          href="https://github.com/jdhart81/verge-common/tree/main/workers/imagery"
          target="_blank"
          rel="noreferrer"
        >
          Worker setup and instructions ↗
        </a>
      </p>
      <h4 className="mt-6">Import a worker receipt</h4>
      <form
        className="action-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const receipt = JSON.parse(upload);
            if (await act('import_analysis', { jobId, receipt })) setUpload('');
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={disabled || busy}>
          <label>
            Processing job
            <NativeSelect
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required
            >
              <NativeSelectOption value="">Choose a job</NativeSelectOption>
              {jobs
                .filter(
                  (j) =>
                    !(state.analysisResults ?? []).some(
                      (r: Item) => r.jobId === j.id,
                    ),
                )
                .map((j) => (
                  <NativeSelectOption key={j.id} value={j.id}>
                    {j.id}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          <label>
            Worker JSON result
            <Input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 20000) {
                  setError('Use a receipt under 20 KB.');
                  return;
                }
                setUpload(await f.text());
              }}
            />
          </label>
          <label>
            Receipt contents
            <Textarea
              value={upload}
              onChange={(e) => setUpload(e.target.value)}
              maxLength={20000}
              required
              rows={4}
            />
          </label>
          <Button type="submit" className="mt-4">
            Import for independent review
          </Button>
        </fieldset>
      </form>
      {(state.analysisResults ?? [])
        .filter((r: Item) => r.parcelId === parcel.id)
        .map((result: Item) => {
          const r = result.receipt;
          return (
            <article className="network-card" key={result.id}>
              <p className="eyebrow">
                {result.status} · {r.quality.replaceAll('_', ' ')}
              </p>
              <h4>
                {r.signal === 'decrease_for_review'
                  ? 'Vegetation decrease flagged for review'
                  : r.signal === 'unavailable'
                    ? 'Insufficient usable coverage'
                    : 'No decrease flag at the screening threshold'}
              </h4>
              <p>
                {r.pairedPixels.toLocaleString()} /{' '}
                {r.totalPixels.toLocaleString()} parcel pixels usable on both
                dates ({((100 * r.pairedPixels) / r.totalPixels).toFixed(1)}%)
              </p>
              {r.meanChange !== null && (
                <p>
                  Earlier NDVI {r.beforeMean.toFixed(3)} · Later{' '}
                  {r.afterMean.toFixed(3)} · Change {r.meanChange.toFixed(3)}
                </p>
              )}
              <p className="small">
                Imported computer-reported result; input fingerprints are
                recorded but the website has not reprocessed the imagery or
                authenticated its source.
              </p>
              {result.reviewNote && <p>Review: {result.reviewNote}</p>}
              <details>
                <summary>Reproduction details</summary>
                <pre className="text-sm whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      algorithm: r.algorithm,
                      runtime: r.runtime,
                      processorSha256: r.processorSha256,
                      inputSha256: r.inputSha256,
                      radiometry: r.radiometry,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {steward && result.status === 'submitted' && (
                <form
                  className="action-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await act('review_analysis', {
                      ...Object.fromEntries(new FormData(e.currentTarget)),
                      id: result.id,
                    });
                  }}
                >
                  <fieldset disabled={disabled || busy}>
                    <label>
                      Review decision
                      <NativeSelect name="decision" required>
                        <NativeSelectOption value="">Choose</NativeSelectOption>
                        <NativeSelectOption value="approve">
                          Accept reviewed record
                        </NativeSelectOption>
                        <NativeSelectOption value="reject">
                          Reject record
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                    <label>
                      Field checks, limitations, and next action
                      <Textarea name="note" maxLength={2000} required />
                    </label>
                    <Button className="mt-4" type="submit">
                      Record review
                    </Button>
                  </fieldset>
                </form>
              )}
            </article>
          );
        })}
    </section>
  );
}
