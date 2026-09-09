import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(fetch) {
  const handlers = {};
  vm.runInNewContext(source, { URL, Response, fetch, self: { location: { origin: 'https://verge.test' }, addEventListener: (name, fn) => handlers[name] = fn } });
  return handlers.fetch;
}
test('offline navigations return generic reconnect page without private content', async () => {
  const handle = worker(async () => { throw new Error('network'); });
  let response;
  handle({request:{url:'https://verge.test/workspace/', method:'GET', mode:'navigate'}, respondWith: p => response = p});
  const result = await response;
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(await result.text(), /You’re offline/);
});
test('API writes, auth, evidence and cross-origin requests are untouched', () => {
  const handle = worker(() => { throw new Error('must not fetch'); });
  for (const [url, method, mode] of [['/api/workspaces','POST','cors'], ['/api/evidence','GET','navigate'], ['/signin-with-chatgpt','GET','navigate'], ['/workspace','POST','navigate'], ['https://elsewhere.test/workspace','GET','navigate']]) {
    handle({request:{url:new URL(url,'https://verge.test').href, method, mode}, respondWith: () => assert.fail('must not intercept')});
  }
});
test('online auth and error responses are preserved', async () => {
  const denied = new Response('Sign in', {status:401});
  let response;
  worker(async () => denied)({request:{url:'https://verge.test/workspace/', method:'GET', mode:'navigate'}, respondWith: p => response = p});
  assert.equal(await response, denied);
});
