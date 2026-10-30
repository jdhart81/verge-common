// Woodland (DFM) projects are off unless VERGE_WOODLAND_DFM=1. Called only from
// server routes and the hosting gateway; never serialize env to clients.
export function woodlandEnabled(env = globalThis.process?.env ?? {}) {
  return env.VERGE_WOODLAND_DFM === '1';
}
