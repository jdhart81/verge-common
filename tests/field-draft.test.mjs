import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFieldDraft } from '../lib/field-draft.mjs';
const example = () => ({format:'verge-field-draft',version:1,draft:{place:'River bank',date:'2026-09-09',method:'Walked a transect',finding:'Three trees; species uncertain',reference:''}});
test('field imports retain note text but never parcel authority or approval', () => {
  const value = example(); Object.assign(value.draft, {parcelId:'wrong', status:'reviewed', id:'native-id'});
  const draft = parseFieldDraft(value);
  assert.equal(draft.place,'River bank'); assert.equal(draft.parcelId,undefined); assert.equal(draft.status,undefined); assert.equal(draft.id,undefined);
});
test('field imports reject malformed dates, oversize text, versions and unsafe references', () => {
  for (const patch of [{date:'2026-02-30'},{method:''},{place:'🌱'.repeat(101)},{reference:'javascript:alert(1)'},{reference:'https://user:pass@example.com'}]) {
    const value = example(); Object.assign(value.draft, patch); assert.throws(() => parseFieldDraft(value));
  }
  const value = example(); value.version=2; assert.throws(() => parseFieldDraft(value));
});
