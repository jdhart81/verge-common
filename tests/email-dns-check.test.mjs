import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEmailDns } from '../scripts/email-dns-check.mjs';
const resolver = {
  resolveTxt: async (name) =>
    name.startsWith('resend')
      ? [['v=DKIM1; p=', 'fixturekey']]
      : name.startsWith('send.')
        ? [['v=spf1 include:amazonses.com ~all']]
        : [['v=DMARC1; p=none']],
  resolveMx: async (name) =>
    name.startsWith('send.')
      ? [{ exchange: 'feedback-smtp.us-east-1.amazonses.com.', priority: 10 }]
      : [1, 2, 3, 4, 5].map((n) => ({
          exchange: `eforward${n}.registrar-servers.com`,
          priority: n * 10,
        })),
  resolveCname: async () => ['send.forge.rmta.net.'],
};
await test('DNS all six checks pass with injected resolver only', async () => {
  assert.ok((await checkEmailDns({ resolver })).every((r) => r.pass));
});
await test('DNS missing send MX and any eforward root MX fail', async () => {
  for (const name of ['send MX', 'Inbound forwarding MX']) {
    const fake = {
      ...resolver,
      resolveMx: async (query) =>
        query.startsWith('send.') === (name === 'send MX')
          ? []
          : resolver.resolveMx(query),
    };
    assert.equal(
      (await checkEmailDns({ resolver: fake })).find((r) => r.name === name)
        .pass,
      false,
    );
  }
});
await test('DNS lookup failures, duplicate SPF and empty DKIM fail closed', async () => {
  const fake = {
    ...resolver,
    resolveTxt: async (name) =>
      name.startsWith('send.')
        ? [['v=spf1 include:amazonses.com ~all'], ['v=spf1 -all']]
        : [['p=']],
  };
  const results = await checkEmailDns({ resolver: fake });
  assert.equal(results[0].pass, false);
  assert.equal(results[1].pass, false);
});
