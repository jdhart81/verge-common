// A portable, untrusted field note. It carries no parcel authority or review status.
export function parseFieldDraft(value) {
  if (!value || value.format !== 'verge-field-draft' || value.version !== 1 || !value.draft) throw new Error('Choose a Verge Common field-draft export (version 1).');
  const draft = value.draft;
  const result = {};
  for (const [key, limit] of [['place', 200], ['method', 1000], ['finding', 2000], ['reference', 500]]) {
    const text = draft[key];
    if (typeof text !== 'string' || text.length > limit || (key !== 'reference' && !text.trim())) throw new Error(`Invalid ${key} in field draft.`);
    result[key] = text;
  }
  if (typeof draft.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('Invalid observation date.');
  const time = Date.parse(draft.date + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== draft.date) throw new Error('Invalid observation date.');
  if (result.reference) {
    let url;
    try { url = new URL(result.reference); } catch { throw new Error('Reference must be an HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Reference must be HTTPS without embedded credentials.');
  }
  return { place: result.place, method: result.method, finding: result.finding, reference: result.reference, date: draft.date };
}
