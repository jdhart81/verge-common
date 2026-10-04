// Worker-thread runner for woodland spine analyses (WS7). dfm-core's network, projection,
// climate and build-out functions take seconds on a watershed and block the thread they run
// on. The gateway and the app share one Node process, so they run here, one at a time, in a
// separate thread:
//
//   - one job at a time (the second CPU stays with the web process), at most `maxWaiting` queued;
//     a full queue answers 503 at once instead of piling up requests;
//   - each job has a hard deadline of `timeoutMs` from the moment it is queued, waiting time
//     included, so every request is answered before the gateway's 30 s proxy limit. A job whose
//     deadline is under a second away when its turn comes answers 503 without starting; a
//     running job that reaches its deadline terminates the worker and answers 504, and the
//     next job starts on a fresh worker;
//   - a worker crash fails only its own job; closing rejects queued jobs and stops the worker.
//
// The app finds the runner at globalThis[Symbol.for('vergecommon.woodland-analysis')]
// (server/woodland-analysis.mjs); self-hosted/server.mjs registers it when the woodland flag
// is on.
import { Worker } from 'node:worker_threads';

export const WOODLAND_ANALYSIS_RUNNER = Symbol.for(
  'vergecommon.woodland-analysis',
);
const failure = (message, status) =>
  Object.assign(new Error(message), { status });

export function createWoodlandAnalysisPool({
  timeoutMs = 25000,
  maxWaiting = 2,
  workerUrl = new URL('./woodland-analysis-worker.mjs', import.meta.url),
  resourceLimits = { maxOldGenerationSizeMb: 384 },
} = {}) {
  const waiting = [];
  let worker = null;
  let current = null;
  let nextId = 1;
  let closed = false;
  let completed = 0;
  let timedOut = 0;

  const settle = (job, error, result) => {
    clearTimeout(job.timer);
    if (current === job) current = null;
    if (error) job.reject(error);
    else job.resolve(result);
    queueMicrotask(start);
  };
  const retire = (w) => {
    if (worker === w) worker = null;
    void w.terminate().catch(() => {});
  };
  const spawn = () => {
    const w = new Worker(workerUrl, { resourceLimits });
    // An idle worker must not keep a stopping process alive; a running job's timer does.
    w.unref();
    w.on('message', (message) => {
      if (worker !== w || !current || message?.id !== current.id) return;
      completed += 1;
      settle(
        current,
        message.error ? failure(message.error, message.status ?? 500) : null,
        message.result,
      );
    });
    const crashed = () => {
      if (worker !== w) return;
      worker = null;
      if (current)
        settle(
          current,
          failure('The analysis stopped unexpectedly. Try again.', 500),
        );
    };
    w.on('error', crashed);
    w.on('exit', crashed);
    worker = w;
    return w;
  };
  function start() {
    if (closed || current) return;
    let job;
    while ((job = waiting.shift()) && job.deadline - Date.now() < 1000)
      job.reject(
        failure('Landscape analysis is busy. Try again in a minute.', 503),
      );
    if (!job) return;
    current = job;
    const w = worker ?? spawn();
    job.timer = setTimeout(() => {
      if (current !== job) return;
      timedOut += 1;
      retire(w);
      settle(
        job,
        failure(
          'The analysis took too long. Analyze a smaller landscape, or try again when the server is less busy.',
          504,
        ),
      );
    }, job.deadline - Date.now());
    w.postMessage({ id: job.id, kind: job.kind, input: job.input });
  }
  return {
    run(kind, input) {
      if (closed)
        return Promise.reject(failure('Analysis is shutting down.', 503));
      if (waiting.length >= maxWaiting)
        return Promise.reject(
          failure('Landscape analysis is busy. Try again in a minute.', 503),
        );
      return new Promise((resolve, reject) => {
        waiting.push({
          id: nextId++,
          kind,
          input,
          resolve,
          reject,
          deadline: Date.now() + timeoutMs,
        });
        start();
      });
    },
    stats: () => ({
      busy: !!current,
      waiting: waiting.length,
      completed,
      timedOut,
      worker: !!worker,
    }),
    async close() {
      closed = true;
      for (const job of waiting.splice(0))
        job.reject(failure('Analysis is shutting down.', 503));
      if (current) settle(current, failure('Analysis is shutting down.', 503));
      const w = worker;
      worker = null;
      if (w) await w.terminate().catch(() => {});
    },
  };
}

export function registerWoodlandAnalysis(runner) {
  globalThis[WOODLAND_ANALYSIS_RUNNER] = runner;
  return runner;
}
