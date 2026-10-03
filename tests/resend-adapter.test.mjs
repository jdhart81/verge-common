import test from 'node:test';
import assert from 'node:assert/strict';
import { createResendClient } from '../self-hosted/resend.mjs';
globalThis.fetch = () => {
  throw new Error('Network forbidden in adapter tests');
};
const from = 'VergeCommon <updates@vergecommon.com>';
const domain = {
  id: 'domain',
  name: 'vergecommon.com',
  open_tracking: false,
  click_tracking: false,
};
function fixture(handler) {
  const calls = [];
  const client = createResendClient({
    apiKey: 'fixture-key',
    fetchImpl: async (url, options) => {
      const call = {
        path: new URL(url).pathname + new URL(url).search,
        method: options.method,
        body: options.body ? JSON.parse(options.body) : undefined,
        headers: options.headers,
      };
      calls.push(call);
      const result = await handler(call, calls.length);
      return new Response(JSON.stringify(result.body ?? result), {
        status: result.status ?? 200,
      });
    },
  });
  return { client, calls };
}
await test('I8 verified REST email and draft shapes; tracking guard precedes both', async () => {
  const f = fixture((call) =>
    call.path.startsWith('/domains')
      ? { has_more: false, data: [domain] }
      : { id: 'id' },
  );
  const message = {
    from,
    to: 'fixture@example.test',
    subject: 'Subject',
    html: '<p>Hello</p>',
    text: 'Hello',
    reply_to: 'justin@vergecommon.com',
  };
  await f.client.sendEmail(message);
  await f.client.createBroadcast({
    ...message,
    segment_id: 'segment',
    send: true,
    scheduled_at: 'now',
    open_tracking: true,
  });
  assert.deepEqual(
    f.calls.map((c) => [c.path, c.method]),
    [
      ['/domains?limit=100', 'GET'],
      ['/emails', 'POST'],
      ['/domains?limit=100', 'GET'],
      ['/broadcasts', 'POST'],
    ],
  );
  assert.deepEqual(f.calls[1].body, message);
  assert.deepEqual(f.calls[3].body, {
    from,
    subject: message.subject,
    html: message.html,
    text: message.text,
    reply_to: message.reply_to,
    segment_id: 'segment',
    send: false,
  });
});
await test('I5 provider contact is unique across sequential and concurrent confirmations', async () => {
  const contacts = new Map();
  const f = fixture((call) => {
    if (call.path.startsWith('/contacts/contact/segments'))
      return { has_more: false, data: [{ id: 'segment' }] };
    if (call.method === 'GET')
      return contacts.has('fixture@example.test')
        ? { id: 'contact' }
        : { status: 404, body: { message: 'not found' } };
    if (call.path === '/contacts') {
      contacts.set(call.body.email, call.body);
      return { id: 'contact' };
    }
    return { id: 'segment' };
  });
  await Promise.all([
    f.client.upsertContact('fixture@example.test', 'segment'),
    f.client.upsertContact('fixture@example.test', 'segment'),
  ]);
  await f.client.upsertContact('fixture@example.test', 'segment');
  assert.equal(contacts.size, 1);
  assert.equal(f.calls.filter((c) => c.path === '/contacts').length, 1);
  assert.deepEqual(contacts.get('fixture@example.test'), {
    email: 'fixture@example.test',
    unsubscribed: false,
    segments: [{ id: 'segment' }],
  });
  assert.equal(f.calls.at(-1).path, '/contacts/contact/segments?limit=100');
  assert.equal(f.calls.at(-1).method, 'GET');
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.ok(!f.calls.some((c) => c.method === 'PATCH'));
});
await test('Contact create conflict resolves existing contact, other errors fail closed', async () => {
  let reads = 0;
  const f = fixture((call) =>
    call.path.startsWith('/contacts/existing/segments?')
      ? { has_more: false, data: [] }
      : call.method === 'GET'
        ? ++reads === 1
          ? { status: 404 }
          : { id: 'existing' }
        : call.path === '/contacts'
          ? { status: 409 }
          : { id: 'segment' },
  );
  assert.deepEqual(
    await f.client.upsertContact('fixture@example.test', 'segment'),
    { id: 'existing' },
  );
  assert.equal(f.calls.at(-1).path, '/contacts/existing/segments/segment');
});
await test('I8 tracking on, missing or unknown rejects every email/draft/send without sending', async () => {
  for (const settings of [
    { open_tracking: true, click_tracking: false },
    { open_tracking: false, click_tracking: true },
    {},
  ]) {
    const f = fixture((c) =>
      c.path.startsWith('/broadcasts')
        ? { from }
        : { has_more: false, data: [{ name: domain.name, ...settings }] },
    );
    for (const job of [
      () => f.client.sendEmail({ from }),
      () => f.client.createBroadcast({ from }),
      () => f.client.sendBroadcast('id'),
    ])
      await assert.rejects(job, (e) => e.code === 'tracking_not_disabled');
    assert.ok(f.calls.every((c) => c.method === 'GET'));
  }
});
await test('Get/send broadcasts and segment count use documented endpoints, pagination and opt-out filtering', async () => {
  const f = fixture((c) => {
    if (c.path.startsWith('/domains'))
      return { has_more: false, data: [domain] };
    if (c.path.startsWith('/segments'))
      return c.path.includes('after=')
        ? { has_more: false, data: [{ id: 'b', unsubscribed: true }] }
        : { has_more: true, data: [{ id: 'a', unsubscribed: false }] };
    return { id: 'broadcast', from };
  });
  await f.client.getBroadcast('broadcast');
  await f.client.sendBroadcast('broadcast');
  assert.equal(await f.client.countSegment('segment'), 1);
  assert.ok(
    f.calls.some(
      (c) =>
        c.path === '/broadcasts/broadcast/send' &&
        c.method === 'POST' &&
        JSON.stringify(c.body) === '{}',
    ),
  );
  assert.ok(
    f.calls.some(
      (c) => c.path === '/segments/segment/contacts?limit=100&after=a',
    ),
  );
});
await test('I2 I11 provider bodies and transport errors never echo addresses or secrets', async () => {
  const f = fixture(() => ({
    status: 422,
    body: { name: 'fixture@example.test', message: 'fixture-key' },
  }));
  await assert.rejects(
    () => f.client.upsertContact('fixture@example.test', 'segment'),
    (e) => {
      assert.deepEqual(e, { status: 422, code: 'provider_error' });
      return true;
    },
  );
  const client = createResendClient({
    apiKey: 'fixture-key',
    fetchImpl: () => {
      throw new Error('fixture@example.test fixture-key');
    },
  });
  await assert.rejects(
    () => client.getBroadcast('id'),
    (e) => {
      assert.deepEqual(e, { status: 0, code: 'transport_error' });
      return true;
    },
  );
});
await test('I8 sending-only key is separated from full-access tracking readback key', async () => {
  const calls = [];
  const client = createResendClient({
    apiKey: 'sending-fixture-key',
    trackingApiKey: 'readback-fixture-key',
    fetchImpl: async (url, options) => {
      calls.push([new URL(url).pathname, options.headers.Authorization]);
      return new Response(
        JSON.stringify(
          url.includes('/domains')
            ? { has_more: false, data: [domain] }
            : { id: 'id' },
        ),
      );
    },
  });
  await client.sendEmail({
    from,
    to: 'fixture@example.test',
    subject: 'Test',
    text: 'Test',
    html: '<p>Test</p>',
  });
  assert.deepEqual(calls, [
    ['/domains', 'Bearer readback-fixture-key'],
    ['/emails', 'Bearer sending-fixture-key'],
  ]);
});
await test('I10 CI cannot use real default fetch even with a configured key', async () => {
  const previous = process.env.CI;
  process.env.CI = 'true';
  try {
    await assert.rejects(
      () => createResendClient({ apiKey: 'fixture-key' }).getBroadcast('id'),
      (e) => e.code === 'network_disabled_in_ci',
    );
  } finally {
    if (previous === undefined) delete process.env.CI;
    else process.env.CI = previous;
  }
});
