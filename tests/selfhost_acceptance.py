"""Production-build acceptance using isolated synthetic accounts; no external providers."""
import os,json,uuid,re,urllib.request,urllib.error,urllib.parse,http.cookiejar,concurrent.futures,hashlib,html
base=os.environ.get('VERGE_TEST_ORIGIN','http://127.0.0.1:3100')
assert base.startswith(('http://127.0.0.1:','http://localhost:')) or (base=='https://vergecommon.com' and os.environ.get('VERGE_ALLOW_PRODUCTION_FIXTURES')=='1'), 'Use local staging, or explicitly opt in to private synthetic production fixtures.'
prefix='test_'+uuid.uuid4().hex[:12]
class Client:
 def __init__(self): self.jar=http.cookiejar.CookieJar();self.open=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def call(self,path,data=None,headers=None,form=False):
  h={'Origin':base,**(headers or {})}
  if data is not None:
   h['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
   data=(urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
  try:
   with self.open.open(urllib.request.Request(base+path,data=data,headers=h)) as r:
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
with a.open.open(urllib.request.Request(base+'/api/files?workspace='+id,data=multipart,headers={'Origin':base,'Content-Type':'multipart/form-data; boundary='+boundary})) as r:asset=json.load(r)
assert asset['sha256']==hashlib.sha256(content).hexdigest()
with a.open.open(base+'/api/files?id='+asset['id']) as r:assert r.read()==content
assert b.call('/api/files?id='+asset['id'])[0]==404
assert eve.call('/api/files?id='+asset['id'])[0]==403
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
code,current=command(a,'archive',{});assert code==200,(code,current)
# Preserve archived synthetic co-op receipt, remove synthetic login accounts.
for c in [a,b,eve]:
 code,_=c.call('/auth/close',{'password':c.password,'confirmation':'CLOSE'},form=True);assert code==200,code
print(json.dumps({'status':'passed','workspace':id,'checks':['distinct mission homepage and app route','three independent accounts','forged identity denied','private invitation and membership','member post','idempotency and conflict','outsider denial','CSRF rejection','evidence upload/hash/private download','native read scope and token revocation','real hosted MCP handshake/read/write','agent financial denial','encoded scope bypass denied','archive','account closure']}))
