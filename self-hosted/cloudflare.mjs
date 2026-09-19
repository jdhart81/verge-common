import { getDatabase, d1Adapter, objectStore } from './storage.mjs';
export const env = {
  get DB() {
    return d1Adapter(getDatabase());
  },
  EVIDENCE: objectStore(),
};
