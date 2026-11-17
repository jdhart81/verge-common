import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { firstCoordinate, mapStart, zoneRegion } from '../lib/map-start.mjs';

await test('MS1/MS3: precedence and zoom follow confidence', () => {
  const all = {
    points: [[-72.8, 44.2]],
    reference: [[-72.7, 44.1]],
    near: [-72.6, 44.0],
    timeZone: 'America/New_York',
  };
  assert.deepEqual(mapStart(all), { center: [-72.8, 44.2], zoom: 16, source: 'points' });
  assert.deepEqual(mapStart({ ...all, points: [] }), { center: [-72.7, 44.1], zoom: 16, source: 'reference' });
  assert.deepEqual(mapStart({ near: all.near, timeZone: all.timeZone }), { center: [-72.6, 44.0], zoom: 13, source: 'near' });
  const region = mapStart({ timeZone: 'America/New_York' });
  assert.equal(region.source, 'region');
  assert.ok(region.zoom <= 6 && region.zoom > 1);
  assert.deepEqual(mapStart({}), { center: [0, 20], zoom: 1, source: 'world' });
  assert.deepEqual(mapStart(), { center: [0, 20], zoom: 1, source: 'world' });
});

await test('MS3: a time zone never opens closer than a country-scale view', () => {
  const source = readFileSync(new URL('../lib/map-start.mjs', import.meta.url), 'utf8');
  const names = [...source.matchAll(/^ {2}'([A-Za-z_/]+)': \[/gm)].map((m) => m[1]);
  assert.ok(names.length > 60);
  for (const name of names) {
    const view = zoneRegion(name);
    assert.ok(view, name);
    assert.ok(view.zoom >= 2 && view.zoom <= 6, name);
    assert.ok(Math.abs(view.center[0]) <= 180 && Math.abs(view.center[1]) <= 90, name);
  }
});

await test('MS4: unknown, renamed and hostile zone names', () => {
  assert.deepEqual(zoneRegion('Asia/Calcutta'), zoneRegion('Asia/Kolkata'));
  assert.equal(zoneRegion('Europe/Vaduz').zoom, 3); // falls back to its area
  for (const bad of ['', 'UTC', 'Etc/GMT+5', '__proto__', 'constructor/x', 'x'.repeat(65), null, 7, {}])
    assert.equal(zoneRegion(bad), null, JSON.stringify(bad));
  assert.equal(mapStart({ timeZone: 'UTC' }).source, 'world');
});

await test('MS4: malformed points are skipped, not thrown on', () => {
  assert.equal(mapStart({ points: 'x', reference: null, near: [200, 0] }).source, 'world');
  assert.equal(mapStart({ points: [[NaN, 1], ['a', 2]], near: [1] }).source, 'world');
  assert.deepEqual(mapStart({ points: [[NaN, 1], [10, 50]] }).center, [10, 50]);
  assert.equal(mapStart({ near: [0, 91] }).source, 'world');
});

await test('firstCoordinate finds a place in corridor layers and ignores non-places', () => {
  const layers = {
    version: 3,
    params: { widthMetres: 60 },
    layers: { stands: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { age: 80 }, geometry: { type: 'Polygon', coordinates: [[[-72.81, 44.21], [-72.8, 44.21], [-72.8, 44.2], [-72.81, 44.21]]] } }] } },
  };
  assert.deepEqual(firstCoordinate(layers), [-72.81, 44.21]);
  assert.deepEqual(firstCoordinate([{ geometry: { coordinates: [5, 6] } }]), [5, 6]);
  for (const none of [null, 4, 'x', {}, [], { a: { b: 'c' } }, { coordinates: [500, 2] }])
    assert.equal(firstCoordinate(none), null);
  let deep = [1, 2];
  for (let i = 0; i < 40; i += 1) deep = [deep];
  assert.equal(firstCoordinate(deep), null);
});

await test('MS2: the module asks for nothing and sends nothing', () => {
  const source = readFileSync(new URL('../lib/map-start.mjs', import.meta.url), 'utf8');
  for (const banned of ['fetch(', 'XMLHttpRequest', 'geolocation', 'localStorage', 'sessionStorage', 'sendBeacon', 'document.cookie'])
    assert.ok(!source.includes(banned), banned);
});
