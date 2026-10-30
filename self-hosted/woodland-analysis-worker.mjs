// Worker thread for woodland engine jobs; see self-hosted/woodland-analysis.mjs.
import { parentPort } from 'node:worker_threads';
import { runWoodlandJob } from '../lib/woodland-spine-run.mjs';

parentPort.on('message', ({ id, kind, input }) => {
  let reply;
  try {
    reply = { id, result: runWoodlandJob(kind, input) };
  } catch (error) {
    reply = {
      id,
      error: error instanceof Error ? error.message : String(error),
      status: Number.isInteger(error?.status) ? error.status : 500,
    };
  }
  parentPort.postMessage(reply);
});
