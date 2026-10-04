// Test double for self-hosted/woodland-analysis-worker.mjs: behavior chosen by `kind`.
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ id, kind, input }) => {
  if (kind === 'crash') process.exit(3);
  if (kind === 'hang' || kind === 'slow') {
    const until = Date.now() + (kind === 'slow' ? input.ms : 60000);
    while (Date.now() < until);
  }
  if (kind === 'throw')
    return parentPort.postMessage({ id, error: 'Choose a spine analysis.', status: 400 });
  parentPort.postMessage({ id, result: { status: 'ok', kind, echo: input } });
});
