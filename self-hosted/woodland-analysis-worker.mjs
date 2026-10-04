// Worker thread for woodland spine analyses; see self-hosted/woodland-analysis.mjs.
import { parentPort } from 'node:worker_threads';
import { runSpineAnalysis } from '../lib/woodland-spine-run.mjs';

parentPort.on('message', ({ id, kind, input }) => {
  let reply;
  try {
    reply = { id, result: runSpineAnalysis(kind, input) };
  } catch (error) {
    reply = {
      id,
      error: error instanceof Error ? error.message : String(error),
      status: Number.isInteger(error?.status) ? error.status : 500,
    };
  }
  parentPort.postMessage(reply);
});
