import test from 'node:test';
import assert from 'node:assert/strict';
import { coopInviteCard } from '../lib/share-card.mjs';

const coop = {
  id: 'coop_1',
  name: 'Mad River <Woods>',
  region: 'Moretown, Vermont',
  summary: 'Neighbors caring for the woods & streams between our homes.',
  projects: [],
};

await test('card links to the public co-op page and to starting your own', () => {
  const card = coopInviteCard(coop, 'https://vergecommon.com');
  assert.equal(card.joinUrl, 'https://vergecommon.com/network/?coop=coop_1');
  assert.equal(card.startUrl, 'https://vergecommon.com/');
  assert.ok(
    card.html.includes('href="https://vergecommon.com/network/?coop=coop_1"'),
  );
  assert.ok(card.html.includes('Start your own co-op'));
  assert.ok(
    card.text.includes('Join us: https://vergecommon.com/network/?coop=coop_1'),
  );
  assert.ok(
    card.text.includes('Start your own co-op: https://vergecommon.com/'),
  );
});

await test('card escapes co-op text and never adds markup from it', () => {
  const card = coopInviteCard(coop, 'https://vergecommon.com');
  assert.ok(card.html.includes('Mad River &lt;Woods&gt;'));
  assert.ok(!card.html.includes('<Woods>'));
  assert.ok(card.html.includes('woods &amp; streams'));
});

await test('card carries only the public name, region and summary', () => {
  const withPrivate = {
    ...coop,
    members: [{ email: 'private@example.com' }],
    parcels: [{ owner: 'Private Owner' }],
    organization: { contact: 'private-contact@example.com' },
  };
  const card = coopInviteCard(withPrivate, 'https://vergecommon.com');
  for (const secret of [
    'private@example.com',
    'Private Owner',
    'private-contact@example.com',
  ])
    assert.ok(!card.html.includes(secret) && !card.text.includes(secret));
});

await test('long summaries are shortened and ids are encoded', () => {
  const card = coopInviteCard(
    { ...coop, id: 'a b&c', summary: 'x'.repeat(500) },
    'https://vergecommon.com/some/path',
  );
  assert.equal(card.joinUrl, 'https://vergecommon.com/network/?coop=a%20b%26c');
  assert.ok(!card.text.includes('x'.repeat(201)));
});

await test('card refuses a non-https site or a missing co-op', () => {
  assert.throws(() => coopInviteCard(coop, 'http://example.com'));
  assert.throws(() => coopInviteCard(coop, 'javascript:alert(1)'));
  assert.throws(() => coopInviteCard({}, 'https://vergecommon.com'));
  assert.doesNotThrow(() => coopInviteCard(coop, 'http://localhost:3000'));
});
