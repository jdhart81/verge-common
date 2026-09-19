import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearInvitation,
  invitationForJoin,
  invitationLifetime,
  invitationSignInPath,
  invitationStorageKey,
  pendingInvitation,
  rememberInvitation,
} from '../lib/invitation-handoff.mjs';
import { accountPage } from '../self-hosted/account.mjs';

const invitation = `${'a'.repeat(36)}.${'b'.repeat(72)}`;
const otherInvitation = `${'c'.repeat(36)}.${'d'.repeat(72)}`;
function session() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

await test('invitation survives authentication in this tab without putting its secret in auth URLs or forms', () => {
  const storage = session();
  assert.equal(invitationForJoin(`#${invitation}`, storage, 100), invitation);
  assert.equal(rememberInvitation(storage, invitation, 100), true);
  const signIn = new URL(invitationSignInPath, 'https://vergecommon.test');
  assert.equal(signIn.searchParams.get('return_to'), '/join/');
  assert.equal(signIn.href.includes(invitation), false);
  for (const mode of ['login', 'register', 'recover']) {
    const html = accountPage({ mode, returnTo: '/join/' });
    assert.ok(html.includes('name="returnTo" value="/join/"'));
    assert.ok(!html.includes(invitation));
    assert.equal(invitationForJoin('', storage, 101), invitation);
  }
  const confirmation = accountPage({
    user: { username: 'neighbor', displayName: 'Neighbor' },
    recoveryCode: 'synthetic-recovery',
    returnTo: '/join/',
  });
  assert.ok(confirmation.includes('href="/join/"'));
  assert.ok(!confirmation.includes(invitation));
  assert.equal(
    invitationForJoin('', session(), 101),
    '',
    'Another tab has no saved handoff',
  );
  clearInvitation(storage);
  assert.equal(
    invitationForJoin('', storage, 102),
    '',
    'Acceptance removes the saved secret',
  );
});

await test('new invitations take precedence and malformed fragments never select an older saved invitation', () => {
  const storage = session();
  rememberInvitation(storage, invitation, 100);
  assert.equal(
    invitationForJoin(`#${otherInvitation}`, storage, 101),
    otherInvitation,
  );
  for (const fragment of [
    '#invalid',
    '#',
    `#${invitation}?tracking=1`,
    '#https://evil.test/',
  ]) {
    assert.equal(invitationForJoin(fragment, storage, 101), '');
  }
  assert.equal(rememberInvitation(storage, 'invalid', 101), false);
  rememberInvitation(storage, otherInvitation, 101);
  assert.equal(invitationForJoin('', storage, 102), otherInvitation);
});

await test('browser-denied, corrupted, expired and future-dated session storage fail safely', () => {
  const blocked = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  };
  for (const storage of [null, blocked]) {
    assert.equal(rememberInvitation(storage, invitation), false);
    assert.equal(pendingInvitation(storage), '');
    assert.equal(invitationForJoin(`#${invitation}`, storage), invitation);
    assert.doesNotThrow(() => clearInvitation(storage));
  }
  const storage = session();
  for (const raw of [
    '{broken',
    'null',
    '{}',
    JSON.stringify({ invitation, savedAt: '100' }),
  ]) {
    storage.setItem(invitationStorageKey, raw);
    assert.equal(pendingInvitation(storage, 100), '');
  }
  rememberInvitation(storage, invitation, 100);
  assert.equal(pendingInvitation(storage, 99), '');
  rememberInvitation(storage, invitation, 101);
  assert.equal(
    pendingInvitation(storage, 100 + invitationLifetime - 1),
    invitation,
  );
  assert.equal(pendingInvitation(storage, 100 + invitationLifetime), '');
});
