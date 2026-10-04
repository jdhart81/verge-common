"""Woodland (DFM) acceptance against a running self-hosted build with VERGE_WOODLAND_DFM=1.

Synthetic accounts only. Exercises the woodland page, spine layers with independent review,
woodlot consent, a planned join year, all four spine analyses in the server's analysis worker,
member privacy, and cleanup (archive and account closure). Local targets by default; a
specifically authorized production check needs VERGE_ALLOW_PRODUCTION_FIXTURES=1.
"""
import json, os, re, uuid, urllib.request, urllib.error, http.cookiejar, pathlib, time
base = os.environ.get('VERGE_TEST_ORIGIN', 'http://127.0.0.1:3100')
assert base.startswith(('http://127.0.0.1:', 'http://localhost:')) or (base == 'https://vergecommon.com' and os.environ.get('VERGE_ALLOW_PRODUCTION_FIXTURES') == '1'), 'Use local staging, or explicitly opt in to private synthetic production fixtures.'
fixture = json.loads((pathlib.Path(__file__).parent / 'woodland-acceptance-fixture.json').read_text())
prefix = 'wood_' + uuid.uuid4().hex[:10]
class Client:
    def __init__(self): self.open = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self, path, data=None, form=False, method=None):
        h = {'Origin': base}
        if data is not None:
            h['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
            data = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
        try:
            with self.open.open(urllib.request.Request(base + path, data=data, headers=h, method=method), timeout=60) as r:
                raw = r.read(); return r.status, json.loads(raw) if r.headers.get_content_type() == 'application/json' else raw.decode()
        except urllib.error.HTTPError as e:
            raw = e.read()
            try: return e.code, json.loads(raw)
            except Exception: return e.code, raw.decode()
    def register(self, n):
        self.name = prefix + n; self.password = uuid.uuid4().hex + '!'
        code, body = self.call('/auth/register', {'acceptTerms': 'yes', 'username': self.name, 'displayName': 'Synthetic ' + n, 'password': self.password}, form=True)
        assert code == 201, (code, body)
import urllib.parse
checks = []
code, page = Client().call('/woodland/')
assert code == 200 and 'data-woodland-open="yes"' in page, (code, page[:200])
checks.append('woodland page reports projects open')
a, b, c, d = Client(), Client(), Client(), Client()
for client, n in [(a, 'a'), (b, 'b'), (c, 'c'), (d, 'd')]: client.register(n)
coop = str(uuid.uuid4())
code, _ = a.call('/api/workspaces', {'op': 'create', 'requestId': coop, 'payload': {'name': 'Synthetic woodland acceptance', 'region': 'Synthetic', 'summary': 'Private acceptance records', 'displayName': 'Synthetic A'}}); assert code == 201, code
def state(client):
    code, s = client.call('/api/workspaces?id=' + coop); assert code == 200, (code, s); return s
def command(client, op, payload):
    return client.call('/api/workspaces', {'id': coop, 'version': state(client)['version'], 'op': op, 'payload': payload, 'requestId': str(uuid.uuid4())})
def ok(client, op, payload):
    code, s = command(client, op, payload); assert code == 200, (op, code, s); return s
ok(a, 'update_coop', {'name': 'Synthetic woodland acceptance', 'region': 'Synthetic', 'summary': 'Private acceptance records', 'visibility': 'public'})
for client, name in [(b, 'Synthetic B'), (c, 'Synthetic C')]:
    code, _ = client.call('/api/workspaces', {'id': coop, 'op': 'request_membership', 'requestId': str(uuid.uuid4()), 'payload': {'name': name}}); assert code == 200, code
    m = next(m for m in state(a)['state']['members'] if m['name'] == name)
    ok(a, 'member_status', {'id': m['id'], 'status': 'active'})
    if client is b: ok(a, 'member_role', {'id': m['id'], 'role': 'steward'})
s = ok(a, 'create_project', {'name': 'Synthetic woodlot spine', 'summary': 'Acceptance', 'region': 'Synthetic', 'kind': 'woodland'})
project = s['state']['projects'][0]['id']
assert s['features']['woodland'] is True
# Spine layers: one steward saves, another reviews.
s = ok(a, 'save_woodland_layers', {'projectId': project, 'layers': fixture['layers'], 'params': fixture['params'], 'notes': 'Synthetic acceptance layers'})
version = s['state']['woodlandLayers'][-1]
assert version['layers']['streams'] and version['layers']['connectors'], 'spine layers stored'
assert command(a, 'review_woodland_layers', {'id': version['id'], 'decision': 'approve', 'note': 'Self review'})[0] == 403
ok(b, 'review_woodland_layers', {'id': version['id'], 'decision': 'approve', 'note': 'Independent synthetic review'})
checks.append('spine lines and drafted corridors saved and independently reviewed')
# Woodlots: A (steward, consent), B and C (member, no consent; B plans to join).
parcels = {}
for owner, name in [(a, 'Woodlot A'), (c, 'Woodlot B'), (c, 'Woodlot C')]:
    s = ok(owner, 'record_parcel', {'projectId': project, 'name': name, 'landReference': 'Synthetic ' + name, 'areaSquareMetres': 1, 'consentReference': 'Synthetic holder statement'})
    pid = next(p['id'] for p in s['state']['parcels'] if p['name'] == name); parcels[name] = pid
    ok(b, 'review_parcel', {'id': pid, 'decision': 'approve'})
    s = ok(owner, 'save_boundary', {'parcelId': pid, 'geometry': fixture['parcels'][name], 'consentReference': 'Synthetic boundary statement'})
    boundary = next(p for p in s['state']['parcels'] if p['id'] == pid)['boundaries'][-1]['id']
    ok(b, 'review_boundary', {'parcelId': pid, 'id': boundary, 'decision': 'approve'})
s = ok(a, 'record_parcel_consent', {'parcelId': parcels['Woodlot A'], 'holder': 'Synthetic holder', 'authority': 'Synthetic authority', 'reference': 'Synthetic consent', 'scope': 'Pooling this woodlot', 'attested': True})
consent = next(p for p in s['state']['parcels'] if p['id'] == parcels['Woodlot A'])['consents'][-1]['id']
ok(b, 'review_parcel_consent', {'parcelId': parcels['Woodlot A'], 'id': consent, 'decision': 'approve', 'note': 'Synthetic consent review'})
year = time.gmtime().tm_year
ok(c, 'plan_parcel_join', {'parcelId': parcels['Woodlot B'], 'year': year + 4})
assert command(c, 'plan_parcel_join', {'parcelId': parcels['Woodlot A'], 'year': year + 4})[0] == 403
checks.append('woodlot consent and a member-set planned join year')
def analyze(client, kind, expect=200):
    code, body = client.call('/api/woodland-analysis', {'id': coop, 'projectId': project, 'kind': kind})
    assert code == expect, (kind, code, body)
    return body.get('analysis') if code == 200 else body
results = {kind: analyze(a, kind) for kind in ['network', 'outlook', 'climate', 'frontier']}
for kind, r in results.items():
    assert r['result']['status'] == 'ok', (kind, r['result'].get('reasons'))
    assert r['layersVersionId'] == version['id'] and r['analysisYear'] == year
net = results['network']['result']['summary']
assert net['linkedPairs'] == 3 and net['robustPairs'] is not None, net
frontier = results['frontier']['result']
assert [e['parcel'] for e in frontier['frontier']] == [parcels['Woodlot B']], frontier['frontier']
assert frontier['frontier'][0]['completesLinks'], 'Woodlot B completes a link'
assert frontier['committed']['parcels'] == [parcels['Woodlot A']]
outlook = results['outlook']['result']
assert any(parcels['Woodlot B'] in m['committedParcels'] for m in outlook['milestones']), 'the planned year counts'
assert [c_['status'] for c_ in results['climate']['result']['cores']]
checks.append('network, outlook, climate and frontier analyses in the analysis worker')
# Member privacy: C sees only C's woodlots; outsiders and unknown kinds are refused.
mine = analyze(c, 'frontier')
assert mine['viewer'] == 'member'
assert [e['parcel'] for e in mine['result']['frontier']] == [parcels['Woodlot B']]
assert mine['result']['committed']['parcels'] == [] and mine['result']['committed']['parcelCount'] == 1
assert parcels['Woodlot A'] not in json.dumps(analyze(c, 'outlook'))
assert analyze(d, 'frontier', 403)
assert analyze(a, 'everything', 400)
checks.append('member sees only their woodlots; outsiders and unknown analyses refused')
# Cleanup: archive the fixture, then close every synthetic account.
assert command(a, 'archive', {})[0] == 200
for client in [a, b, c, d]:
    assert client.call('/auth/close', {'password': client.password, 'confirmation': 'DELETE'}, form=True)[0] == 200
checks.append('archive and account deletion')
print(json.dumps({'status': 'passed', 'workspace': coop, 'checks': checks}))
