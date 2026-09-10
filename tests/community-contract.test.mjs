import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newWorkspace, publicWorkspace } from '../lib/network.mjs';
export function nativeFixture() {
  const state = newWorkspace({name:'Fixture river co-op',region:'Synthetic region',summary:'Test data only',displayName:'Fixture steward'}, {id:'owner'}, 1, 'fixture-coop');
  state.projects = [{id:'project', name:'River care',summary:'Synthetic public project',region:'Synthetic region',kind:'restoration',status:'active',visibility:'public'}, {id:'private',visibility:'private',name:'Secret project'}];
  state.updates = [{id:'update',projectId:'project',text:'Fixture field visit 🌱',createdAt:1000,visibility:'public'}, {id:'hidden-update',projectId:'private',text:'Private text',visibility:'public'}];
  state.events = [{id:'event',projectId:'project',title:'Fixture walk',summary:'Test event',startsAt:1000,endsAt:2000,timeZone:'UTC',status:'scheduled',visibility:'public',instructions:'Private meeting instructions'}];
  return {coops:[publicWorkspace(state)],next:null};
}
test('native discovery fixture matches the backend public projection', () => {
  const fixture=JSON.parse(fs.readFileSync(new URL('../ios/CoreTests/Fixtures/community.json',import.meta.url),'utf8'));
  assert.deepEqual(fixture,nativeFixture());
  assert.ok(!JSON.stringify(fixture).includes('Private meeting instructions'));
  assert.equal(fixture.coops[0].projects.length,1);
});
