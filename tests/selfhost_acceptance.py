"""Production-build acceptance using isolated synthetic accounts; no external providers."""
import os,json,uuid,re,urllib.request,urllib.error,urllib.parse,http.cookiejar,concurrent.futures,hashlib,html
base=os.environ.get('VERGE_TEST_ORIGIN','http://127.0.0.1:3100')
assert base.startswith(('http://127.0.0.1:','http://localhost:')) or (base=='https://vergecommon.com' and os.environ.get('VERGE_ALLOW_PRODUCTION_FIXTURES')=='1'), 'Use local staging, or explicitly opt in to private synthetic production fixtures.'
prefix='test_'+uuid.uuid4().hex[:12]
class Client:
 def __init__(self): self.jar=http.cookiejar.CookieJar();self.open=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def call(self,path,data=None,headers=None,form=False,method=None):
  h={'Origin':base,**(headers or {})}
  if data is not None:
   h['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
   data=(urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
  try:
   with self.open.open(urllib.request.Request(base+path,data=data,headers=h,method=method)) as r:
    raw=r.read();return r.status,json.loads(raw) if r.headers.get_content_type()=='application/json' else raw.decode()
  except urllib.error.HTTPError as e:
   raw=e.read()
   try: return e.code,json.loads(raw)
   except: return e.code,raw.decode()
 def register(self,n):
  self.name=prefix+n;self.password=uuid.uuid4().hex+'!'
  code,body=self.call('/auth/register',{'username':self.name,'displayName':'Synthetic '+n,'password':self.password},form=True)
  assert code==201,(code,body);self.recovery=re.findall(r'<code>(.*?)</code>',body)[0]
 def token(self,scope):
  code,body=self.call('/auth/token',{'label':'Acceptance test','scope':scope},form=True)
  assert code==200,(code,body);return re.search(r'<code>(vc_[A-Za-z0-9_-]+)</code>',body).group(1)
# Assert rendered route identity before creating any persistent test fixtures.
# A build rooted at /app previously aliased the homepage to /app/page.tsx.
for path,heading in [('/', 'What if conservation were open source?'),('/app/', 'Your community. A place to care for.')]:
 code,body=Client().call(path)
 assert code==200,(path,code)
 h1=re.search(r'<h1\b[^>]*>(.*?)</h1>',body,re.S)
 text=' '.join(html.unescape(re.sub(r'<[^>]+>',' ',h1.group(1))).split()) if h1 else ''
 assert text==heading,(path,text,heading)
a,b,eve=Client(),Client(),Client()
for c,n in [(a,'a'),(b,'b'),(eve,'e')]:c.register(n)
code,_=Client().call('/api/workspaces',headers={'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged'})
assert code==401,code
id=str(uuid.uuid4());code,current=a.call('/api/workspaces',{'op':'create','requestId':id,'payload':{'name':'Synthetic launch acceptance','region':'Test region','summary':'Private acceptance records','displayName':'Synthetic A'}});assert code==201,(code,current)
def state(client):
 code,s=client.call('/api/workspaces?id='+id);assert code==200,(code,s);return s
def command(client,op,payload,version=None,rid=None):
 version=state(client)['version'] if version is None else version
 return client.call('/api/workspaces',{'id':id,'version':version,'op':op,'payload':payload,'requestId':rid or str(uuid.uuid4())})
assert b.call('/api/workspaces?id='+id)[0]==403
assert eve.call('/api/network?id='+id)[0]==404
code,inv=a.call('/api/invitations',{'id':id,'action':'create','label':'Synthetic B'});assert code==200,(code,inv)
_,invite=inv['link'].split('#');wid,secret=invite.split('.')
code,_=b.call('/api/invitations',{'id':wid,'token':secret,'action':'accept','name':'Synthetic B','requestId':str(uuid.uuid4())});assert code==200,code
current=state(a);member=next(m for m in current['state']['members'] if m['name']=='Synthetic B')
code,_=command(a,'member_status',{'id':member['id'],'status':'active'});assert code==200,code
code,current=command(a,'create_project',{'name':'Habitat project','region':'Synthetic area','summary':'Acceptance test','kind':'ecohedge'});assert code==200,(code,current)
project=current['state']['projects'][0]['id'];version=current['version'];rid=str(uuid.uuid4())
payload={'projectId':project,'text':'Private acceptance update','visibility':'members'}
code,current=command(b,'post_update',payload,version,rid);assert code==200,(code,current)
code,replayed=command(b,'post_update',payload,version,rid);assert code==200 and replayed['version']==current['version']
assert command(b,'post_update',{**payload,'text':'Different'},version,rid)[0]==409
assert command(eve,'post_update',payload,current['version'])[0]==403
assert a.call('/api/workspaces',{'id':id},headers={'Origin':'https://wrong.example'})[0]==403
# Actual private object bytes and cross-account download authorization.
content=b'Synthetic evidence for production acceptance.';boundary='vc'+uuid.uuid4().hex
multipart=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
def upload(client,upload_id,body=multipart,headers=None):
 path=base+'/api/files?'+urllib.parse.urlencode({'workspace':id,'uploadId':upload_id})
 try:
  with client.open.open(urllib.request.Request(path,data=body,headers={'Origin':base,'Content-Type':'multipart/form-data; boundary='+boundary,**(headers or {})})) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
upload_id=str(uuid.uuid4());code,asset=upload(a,upload_id);assert code==201,(code,asset)
code,retry=upload(a,upload_id);assert code==200 and retry['id']==asset['id'],(code,retry)
native_upload_token=a.token('app:write');native_upload_client=Client()
code,retry=upload(native_upload_client,upload_id,headers={'Authorization':'Bearer '+native_upload_token});assert code==200 and retry['id']==asset['id'],(code,retry)
read_upload_token=a.token('app:read')
assert upload(native_upload_client,upload_id,headers={'Authorization':'Bearer '+read_upload_token})[0]==403
assert upload(a,upload_id,multipart.replace(content,content+b' changed'))[0]==409
assert upload(a,upload_id.upper())[0]==400
assert upload(eve,upload_id)[0]==403
code,independent=upload(b,upload_id);assert code==201 and independent['id']!=asset['id'],(code,independent)
assert b.call('/api/files?id='+independent['id'],method='DELETE')[0]==200
assert asset['sha256']==hashlib.sha256(content).hexdigest()
with a.open.open(base+'/api/files?id='+asset['id']) as r:assert r.read()==content
assert b.call('/api/files?id='+asset['id'])[0]==404
assert eve.call('/api/files?id='+asset['id'])[0]==403
# Unsubmitted files can be discarded only by the uploader; attached files survive.
assert b.call('/api/files?id='+asset['id'],method='DELETE')[0]==404
assert a.call('/api/files?id='+asset['id'],headers={'Origin':'https://wrong.example'},method='DELETE')[0]==403
assert a.call('/api/files?id='+asset['id'],method='DELETE')[0]==200
assert a.call('/api/files?id='+asset['id'],method='DELETE')[0]==200
assert a.call('/api/files?id='+asset['id'])[0]==404
assert upload(a,upload_id)[0]==409
assert command(a,'submit_evidence',{'projectId':project,'title':'Discarded evidence','method':'Inspection','period':'Test','notes':'Synthetic','assetId':asset['id']})[0]==404
upload_id=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 duplicates=list(pool.map(lambda _:upload(a,upload_id),range(2)))
assert sorted(result[0] for result in duplicates)==[200,201],duplicates
assert duplicates[0][1]['id']==duplicates[1][1]['id'],duplicates
asset=duplicates[0][1]
code,current=command(a,'submit_evidence',{'projectId':project,'title':'Attached evidence','method':'Inspection','period':'Test','notes':'Synthetic','assetId':asset['id']})
assert code==200,(code,current)
assert a.call('/api/files?id='+asset['id'],method='DELETE')[0]==409
code,retry=upload(a,upload_id);assert code==200 and retry['id']==asset['id'],(code,retry)
with a.open.open(base+'/api/files?id='+asset['id']) as r:assert r.read()==content
# Native scoped access and revocation.
token=b.token('app:read');anonymous=Client()
assert anonymous.call('/api/workspaces?id='+id,headers={'Authorization':'Bearer '+token})[0]==200
assert anonymous.call('/api/workspaces',{},headers={'Authorization':'Bearer '+token})[0]==403
code,account=b.call('/account');tokenid=re.findall(r'name="id" value="([a-f0-9-]+)"',account)[0]
b.call('/auth/revoke',{'id':tokenid},form=True)
assert anonymous.call('/api/workspaces?id='+id,headers={'Authorization':'Bearer '+token})[0]==401
# Real hosted MCP handshake, private read, bounded write and financial denial.
agent_token=a.token('mcp:write')
def rpc(method,params):
 return anonymous.call('/mcp',{'jsonrpc':'2.0','id':1,'method':method,'params':params},headers={'Authorization':'Bearer '+agent_token,'Accept':'application/json, text/event-stream'})
code,result=rpc('initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'launch-acceptance','version':'1'}})
assert code==200 and 'result' in result,(code,result)
code,result=rpc('tools/call',{'name':'get_private_workspace','arguments':{'id':id}})
assert code==200 and not result['result'].get('isError'),(code,result)
current=state(a)
code,result=rpc('tools/call',{'name':'apply_coop_command','arguments':{'id':id,'version':current['version'],'requestId':str(uuid.uuid4()),'command':{'op':'create_task','payload':{'projectId':project,'title':'Synthetic agent action'}}}})
assert code==200 and not result['result'].get('isError'),(code,result)
assert any(t['title']=='Synthetic agent action' for t in state(a)['state']['tasks'])
code,result=rpc('tools/call',{'name':'apply_coop_command','arguments':{'id':id,'version':state(a)['version'],'requestId':str(uuid.uuid4()),'command':{'op':'record_payment','payload':{}}}})
assert code==200 and result['result'].get('isError'),(code,result)
assert anonymous.call('/a%70i/workspaces',{},headers={'Authorization':'Bearer '+agent_token})[0]==403
# Personal blocking applies to real API reads and mutations, not just the UI.
code,current=command(a,'post_update',{'projectId':project,'text':'Synthetic block fixture','visibility':'members'});assert code==200,(code,current)
blocked_update=current['state']['updates'][-1]['id']
founder=next(m for m in current['state']['members'] if m.get('isYou'))
code,current=command(b,'block_member',{'id':founder['id']});assert code==200,(code,current)
assert all(u['id']!=blocked_update for u in current['state']['updates'])
assert command(b,'post_comment',{'updateId':blocked_update,'text':'Must be denied'})[0]==403
assert state(a)['state']['blocks']==[]
for c,expected_blocks in [(a,[]),(b,[{'memberId':founder['id'],'name':founder['name']}])]:
 code,exported=c.call('/account/export');assert code==200,(code,exported)
 exported_state=next(w['state'] for w in exported['workspaces'] if w.get('state',{}).get('id')==id)
 assert exported_state['blocks']==expected_blocks
 assert all(not {'requestHash','stateHash','commitmentNonce'} & event.keys() for event in exported_state['audit'])
code,current=command(b,'unblock_member',{'id':founder['id']});assert code==200,(code,current)
assert any(u['id']==blocked_update for u in current['state']['updates'])
# Founder transfer must persist both the shared state and relational owner ID.
code,_=command(a,'member_role',{'id':member['id'],'role':'steward'});assert code==200,code
# A partner's named representative participates without gaining stewardship or
# access to agreement files. A separate active member cannot see this workflow.
representative=Client();representative.register('representative')
def join_member(client,name):
 code,invitation=a.call('/api/invitations',{'id':id,'action':'create','label':name});assert code==200,(code,invitation)
 workspace,secret=invitation['link'].split('#')[1].split('.')
 code,accepted=client.call('/api/invitations',{'id':workspace,'token':secret,'action':'accept','name':name,'requestId':str(uuid.uuid4())});assert code==200,(code,accepted)
 record=next(m for m in state(a)['state']['members'] if m['name']==name)
 code,result=command(a,'member_status',{'id':record['id'],'status':'active'});assert code==200,(code,result)
 return record['id']
representative_member=join_member(representative,'Synthetic partner representative')
join_member(eve,'Synthetic unrelated member')
agreement_evidence=next(e for e in state(a)['state']['evidence'] if e['title']=='Attached evidence')['id']
code,result=command(b,'review_evidence',{'id':agreement_evidence,'decision':'approve','note':'Synthetic independent agreement review.'});assert code==200,(code,result)
agreement_reference='Synthetic private agreement reference not shared with representatives'
code,result=command(a,'record_partnership',{'projectId':project,'name':'Synthetic conservation partner','website':'https://example.org','role':'Field review and mentoring','agreementReference':agreement_reference,'evidenceId':agreement_evidence});assert code==200,(code,result)
partner_id=result['state']['partnerships'][-1]['id']
code,result=command(b,'review_partnership',{'id':partner_id,'decision':'approve'});assert code==200,(code,result)
assert state(representative)['state']['partnerships']==[]
assert state(eve)['state']['partnerships']==[]
assert command(representative,'invite_partner_representative',{'id':partner_id,'memberId':representative_member})[0]==403
code,result=command(a,'invite_partner_representative',{'id':partner_id,'memberId':representative_member});assert code==200,(code,result)
def participation(client):return next(p for p in state(client)['state']['partnerships'] if p['id']==partner_id)
offered=participation(representative);invitation_id=offered['representative']['id']
assert offered['participationStatus']=='invited' and offered['representative']['isRepresentative']
assert not {'agreementReference','evidenceId','participation','createdBy'} & offered.keys()
assert agreement_reference not in json.dumps(state(representative))
assert state(eve)['state']['partnerships']==[]
response={'id':partner_id,'invitationId':invitation_id,'decision':'accept','roleTitle':'Conservation coordinator','authorityReference':'Synthetic board authorization reference'}
assert command(b,'respond_partner_invitation',response)[0]==403
code,result=command(representative,'respond_partner_invitation',response);assert code==200,(code,result)
assert participation(representative)['participationStatus']=='accepted'
review={'id':partner_id,'invitationId':invitation_id,'decision':'approve','evidenceId':agreement_evidence,'note':'Synthetic independent authority review.'}
assert command(a,'review_partner_representative',review)[0]==403
assert command(representative,'review_partner_representative',review)[0]==403
assert command(b,'review_partner_representative',review)[0]==400
authority_upload_id=str(uuid.uuid4());code,authority_asset=upload(representative,authority_upload_id);assert code==201,(code,authority_asset)
code,result=command(representative,'submit_evidence',{'projectId':project,'title':'Synthetic representative authority','method':'Supplied authorization','period':'Test','notes':'Synthetic authority evidence; no real organization claim.','assetId':authority_asset['id']});assert code==200,(code,result)
authority_id=next(e for e in result['state']['evidence'] if e['title']=='Synthetic representative authority')['id']
code,result=command(b,'review_evidence',{'id':authority_id,'decision':'approve','note':'Synthetic review of supplied authority.'});assert code==200,(code,result)
code,result=command(b,'review_partner_representative',{**review,'evidenceId':authority_id});assert code==200,(code,result)
assert participation(representative)['participationStatus']=='reviewed'
assert state(representative)['role']=='member'
assert state(eve)['state']['partnerships']==[]
assert representative.call('/api/files?id='+asset['id'])[0]==404
assert state(a)['state']['organization'] is None
code,current=command(a,'transfer_stewardship',{'id':member['id'],'confirmation':'TRANSFER'});assert code==200,(code,current)
assert not current['isOwner'] and state(b)['isOwner']
assert a.call('/api/workspaces',{'op':'create','requestId':id,'payload':{}})[0]==409
assert b.call('/api/workspaces',{'op':'create','requestId':id,'payload':{}})[0]==200
assert command(a,'archive',{})[0]==403
code,current=command(b,'archive',{});assert code==200,(code,current)
# Remove synthetic personal records and accounts after archive.
code,result=representative.call('/auth/close',{'password':representative.password,'confirmation':'DELETE'},form=True);assert code==200,(code,result)
assert participation(a)['representative'] is None
assert participation(a)['participationStatus']=='not_invited'
assert a.call('/api/files?id='+authority_asset['id'])[0]==404
assert upload(representative,authority_upload_id)[0]==401
for c in [a,b,eve]:
 code,_=c.call('/auth/close',{'password':c.password,'confirmation':'DELETE'},form=True);assert code==200,code
print(json.dumps({'status':'passed','workspace':id,'checks':['distinct mission homepage and app route','four independent accounts','forged identity denied','private invitation and membership','member post','idempotency and conflict','outsider denial','CSRF rejection','idempotent evidence upload/hash/private download/discard and attached-file protection','native read scope and token revocation','real hosted MCP handshake/read/write','agent financial denial','encoded scope bypass denied','private blocking and interaction denial','reviewed partnership invitation, acceptance and independent authority review','representative and unrelated member privacy without privilege changes','representative erasure removes authority files and participation','persisted founder transfer and authority change','archive','account and associated-data deletion']}))

# Native consumer auth: no browser cookie, manual token creation or redirect.
native=Client();native_name=prefix+'native';native_password=uuid.uuid4().hex+'!'
code,registration=native.call('/auth/native/register',{'username':native_name,'displayName':'Synthetic native','password':native_password});assert code==201,(code,registration)
assert not list(native.jar)
token=registration['token'];assert registration['expiresAt']>0
headers={'Authorization':'Bearer '+token}
code,_=native.call('/api/workspaces',headers=headers);assert code==200,code
code,login=native.call('/auth/native/login',{'username':native_name,'password':native_password});assert code==200,(code,login)
assert native.call('/auth/native/logout',{},headers={'Authorization':'Bearer '+login['token']})[0]==200
assert native.call('/api/workspaces',headers={'Authorization':'Bearer '+login['token']})[0]==401
replacement=uuid.uuid4().hex+'!'
code,recovered=native.call('/auth/native/recover',{'username':native_name,'password':replacement,'recoveryCode':registration['recoveryCode']});assert code==200,(code,recovered)
assert native.call('/api/workspaces',headers=headers)[0]==401
headers={'Authorization':'Bearer '+recovered['token']}
code,result=native.call('/auth/native/delete',{'password':replacement,'confirmation':'DELETE'},headers=headers);assert code==200 and result.get('deleted') is True,(code,result)
assert native.call('/api/workspaces',headers=headers)[0]==401
print(json.dumps({'status':'passed','checks':['native registration without cookies','native login and session expiry metadata','native server-side logout','native recovery rotates access','native account deletion']}))
