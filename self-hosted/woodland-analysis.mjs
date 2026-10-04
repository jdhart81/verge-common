// Worker-thread runner for woodland engine work (WS7): the spine analyses and the corridor
// check itself. On a watershed-sized spine each takes seconds and blocks the thread it runs on,
// and the gateway and the app share one Node process, so they all run here, in a separate
// thread:
//
//   - one job at a time (the second CPU stays with the web process), at most `maxWaiting` queued;
//     a full queue answers 503 at once instead of piling up requests;
//   - one job per account at a time (`key`): a second concurrent request from the same account
//     answers 429, so one account cannot hold the queue;
//   - a worker that cannot start answers 503 for its job and the next job tries again;
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

/** The gateway proxies with a 30 s limit; a job deadline must leave room inside it. */
export const MAX_DEADLINE_MS = 25000;
export const deadlineMs = (value) =>
  Math.min(MAX_DEADLINE_MS, Math.max(1000, Number(value) || MAX_DEADLINE_MS));

export function createWoodlandAnalysisPool({
  timeoutMs = MAX_DEADLINE_MS,
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
    let w;
    try {
      // Thread exhaustion makes the constructor throw; fail this job, not the process.
      w = worker ?? spawn();
    } catch {
      worker = null;
      settle(
        job,
        failure('Landscape analysis could not start. Try again shortly.', 503),
      );
      return;
    }
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
    try {
      w.postMessage({ id: job.id, kind: job.kind, input: job.input });
    } catch {
      retire(w);
      settle(job, failure('Landscape analysis could not start.', 503));
    }
  }
  const limit = deadlineMs(timeoutMs);
  return {
    /** @param {{key?: string}} [options] key: the account, for one job per account at a time */
    run(kind, input, { key = null } = {}) {
      if (closed)
        return Promise.reject(failure('Analysis is shutting down.', 503));
      if (key && (current?.key === key || waiting.some((j) => j.key === key)))
        return Promise.reject(
          failure(
            'Your previous landscape analysis is still running. Try again when it finishes.',
            429,
          ),
        );
      if (waiting.length >= maxWaiting)
        return Promise.reject(
          failure('Landscape analysis is busy. Try again in a minute.', 503),
        );
      return new Promise((resolve, reject) => {
        waiting.push({
          id: nextId++,
          kind,
          input,
          key,
          resolve,
          reject,
          deadline: Date.now() + limit,
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
