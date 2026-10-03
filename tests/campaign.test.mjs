import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderCampaign,
  lintCampaign,
  runCampaign,
  unsubscribe,
} from '../scripts/campaign.mjs';
globalThis.fetch = () => {
  throw new Error('Network forbidden in campaign tests');
};
const env = {
  RESEND_API_KEY: 'fixture-key',
  VERGE_UPDATES_SEGMENT_ID: 'segment',
  VERGE_UPDATES_FROM: 'VergeCommon <updates@vergecommon.com>',
  VERGE_UPDATES_REPLY_TO: 'justin@vergecommon.com',
  VERGE_UPDATES_POSTAL_ADDRESS: 'Fixture address',
};
const source =
  '---\nsubject: First update\npreview: Common ground\n---\n# Hello\n\n[Visit](https://vergecommon.com/)';
const options = (extra = {}) => ({
  env,
  read: async () => source,
  print: () => {},
  ...extra,
});
await test('I9 rendered campaign has sender, postal address, working unsubscribe and plain text', () => {
  const rendered = renderCampaign(source, env);
  assert.equal(lintCampaign(rendered, env), true);
  assert.match(rendered.text, /Hello/);
  assert.ok(rendered.text.includes(env.VERGE_UPDATES_POSTAL_ADDRESS));
  assert.ok(rendered.html.includes(`href="${unsubscribe}"`));
});
await test('I8 I9 lint rejects missing unsubscribe/address/identity/text, pixels, scripts and insecure links', () => {
  const message = renderCampaign(source, env);
  for (const bad of [
    { ...message, html: message.html.replaceAll(unsubscribe, '') },
    { ...message, text: message.text.replaceAll(unsubscribe, '') },
    {
      ...message,
      text: message.text.replace(env.VERGE_UPDATES_POSTAL_ADDRESS, ''),
    },
    { ...message, from: '' },
    { ...message, text: '' },
    {
      ...message,
      html:
        message.html + '<img src="https://pixel.test" width="1" height="1">',
    },
    { ...message, html: message.html + '<script>alert(1)</script>' },
    { ...message, html: message.html + '<a href="http://evil.test">link</a>' },
  ])
    assert.throws(() => lintCampaign(bad, env));
  for (const text of [
    '![Image](https://example.test/image.png)',
    '<script>bad</script>',
    '[Bad](http://example.test)',
    '[Bad](javascript:alert)',
    '<img src="https://pixel.test">',
    '[Bad](//evil.test)',
    '[Bad](/redirect)',
  ])
    assert.throws(() => renderCampaign(source + '\n' + text, env));
});
await test('I10 dry-run, lint and preview make zero network calls', async () => {
  let calls = 0;
  const client = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error('Network');
      },
    },
  );
  await runCampaign(['file.md'], options({ client }));
  await runCampaign(['--lint', 'file.md'], options({ client }));
  const written = [];
  await runCampaign(
    ['--preview', 'file.md'],
    options({
      client,
      makeDir: async () => {},
      write: async (path, content) => written.push([path, content]),
    }),
  );
  assert.equal(calls, 0);
  assert.equal(written.length, 2);
  assert.ok(written.some(([p]) => p.endsWith('.txt')));
});
await test('I10 mismatched send confirmation, ambiguous args and CI writes abort before provider access', async () => {
  let calls = 0;
  const client = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error('Network');
      },
    },
  );
  for (const args of [
    ['--send', 'id'],
    ['--send', 'id', '--confirm', 'other'],
    ['--create', 'file', '--test', 'file'],
    ['--create', 'file', '--confirm', 'id'],
    ['--send', 'id', '--confirm', 'id', '--to', 'addr'],
    ['--bogus', 'file'],
  ])
    await assert.rejects(() => runCampaign(args, options({ client })));
  for (const args of [
    ['--create', 'file'],
    ['--test', 'file', '--to', 'fixture@example.test'],
    ['--send', 'id', '--confirm', 'id'],
  ])
    await assert.rejects(() =>
      runCampaign(args, options({ env: { ...env, CI: 'true' }, client })),
    );
  assert.equal(calls, 0);
});
await test('I10 create only drafts; send prints segment/count before send and revalidates compliance', async () => {
  const events = [];
  let draft;
  const client = {
    countSegment: async () => {
      events.push('count');
      return 7;
    },
    createBroadcast: async (m) => {
      draft = m;
      events.push('create');
      return { id: 'id' };
    },
    getBroadcast: async () => ({
      ...renderCampaign(source, env),
      segment_id: 'segment',
      status: 'draft',
    }),
    sendBroadcast: async () => {
      events.push('send');
    },
  };
  await runCampaign(['--create', 'file'], options({ client }));
  assert.equal(draft.segment_id, 'segment');
  assert.equal(draft.send, undefined);
  assert.equal(events.includes('send'), false);
  events.length = 0;
  await runCampaign(
    ['--send', 'id', '--confirm', 'id'],
    options({ client, print: (m) => events.push(m) }),
  );
  assert.match(events[1], /segment.*7/);
  assert.equal(events[2], 'send');
  for (const change of [
    { segment_id: 'wrong' },
    { status: 'sent' },
    { text: '' },
  ]) {
    const bad = {
      ...client,
      getBroadcast: async () => ({
        ...renderCampaign(source, env),
        segment_id: 'segment',
        status: 'draft',
        ...change,
      }),
      sendBroadcast: () => assert.fail('Must not send'),
    };
    await assert.rejects(() =>
      runCampaign(
        ['--send', 'id', '--confirm', 'id'],
        options({ client: bad }),
      ),
    );
  }
});
await test('Single test email is not a broadcast; TODO example cannot be sent or created', async () => {
  let sent;
  await runCampaign(
    ['--test', 'file', '--to', 'fixture@example.test'],
    options({
      client: {
        sendEmail: async (m) => {
          sent = m;
        },
      },
    }),
  );
  assert.equal(sent.to, 'fixture@example.test');
  assert.equal(sent.html.includes(unsubscribe), false);
  await assert.rejects(() =>
    runCampaign(
      ['--create', 'file'],
      options({ read: async () => source + '\nTODO(Justin): write this' }),
    ),
  );
});
