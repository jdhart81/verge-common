import json,uuid,urllib.request,urllib.error,concurrent.futures
base='http://localhost:3000'
import http.cookiejar
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with opener.open(base+'/signin-with-chatgpt?return_to=/api/workspaces') as response: assert response.status==200
def call(path,data=None,origin=base):
 h={'Origin':origin}
 if data is not None:h['Content-Type']='application/json';data=json.dumps(data).encode()
 try:
  with opener.open(urllib.request.Request(base+path,data=data,headers=h)) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:
  raw=e.read()
  try:return e.code,json.loads(raw)
  except json.JSONDecodeError:return e.code,{'error':raw.decode(errors='replace')}
id=str(uuid.uuid4());code,result=call('/api/workspaces',{'op':'create','requestId':id,'payload':{'name':'HTTP integration fixture','region':'Synthetic test region','summary':'Private automated development test','displayName':'Development tester'}})
assert code==201,(code,result)
code,result=call('/api/workspaces?id='+id);assert code==200,(code,result);assert result['version']==0
command={'id':id,'version':0,'op':'create_project','requestId':str(uuid.uuid4()),'payload':{'name':'Fixture EcoHedge','region':'Test area','summary':'Test project','kind':'ecohedge'}}
code,result=call('/api/workspaces',command);assert code==200,(code,result);assert result['version']==1
code,replay=call('/api/workspaces',command);assert code==200,(code,replay);assert replay['version']==1 and len(replay['state']['projects'])==1
changed=dict(command,payload={**command['payload'],'name':'Different payload'})
code,_=call('/api/workspaces',changed);assert code==409,code
code,_=call('/api/workspaces',dict(command,requestId=str(uuid.uuid4())));assert code==409,code
code,_=call('/api/workspaces',command,origin='https://untrusted.example');assert code==403,code
code,public=call('/api/network?id='+id);assert code==404,(code,public)
project=result['state']['projects'][0]['id']
commands=[{'id':id,'version':1,'op':'create_task','requestId':str(uuid.uuid4()),'payload':{'projectId':project,'title':'Concurrent task '+str(i)}} for i in range(2)]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(lambda c:call('/api/workspaces',c),commands))
assert sorted(c for c,_ in outcomes)==[200,409],outcomes
code,current=call('/api/workspaces?id='+id);assert len(current['state']['tasks'])==1
assert current['state']['audit'][-1]['hash'] and current['state']['audit'][-1]['previousHash']
# R2 upload, attachment authorization, digest and durable evidence metadata.
import hashlib
content=b'Synthetic conservation evidence. No private information.'
boundary='verge-test-'+uuid.uuid4().hex
multipart=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
request=urllib.request.Request(base+'/api/files?workspace='+id,data=multipart,headers={'Origin':base,'Content-Type':'multipart/form-data; boundary='+boundary})
with opener.open(request) as response: asset=json.load(response)
assert asset['sha256']==hashlib.sha256(content).hexdigest()
with opener.open(base+'/api/files?id='+asset['id']) as response:
 assert response.read()==content
 assert response.headers['Content-Disposition'].startswith('attachment;')
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'submit_evidence','requestId':str(uuid.uuid4()),'payload':{'projectId':project,'title':'File fixture','method':'Test inspection','period':'Test period','notes':'Synthetic local evidence','assetId':asset['id']}})
assert code==200,(code,current)
assert current['state']['evidence'][0]['asset']['sha256']==asset['sha256']
version=current['version']
code,current=call('/api/workspaces',{'id':id,'version':version,'op':'archive','requestId':str(uuid.uuid4()),'payload':{}});assert code==200,(code,current)
print('HTTP integration passed: durable creation/readback, replay protection, payload mismatch, stale-write rejection, cross-origin rejection, private discovery, concurrent write isolation, linked audit, private file upload/download, evidence attachment, archive.')
# Archive any earlier fixtures left by a failed test attempt.
code,listing=call('/api/workspaces')
for workspace in listing.get('workspaces',[]):
 if workspace['name']=='HTTP integration fixture' and workspace['visibility']!='archived':
  code,view=call('/api/workspaces?id='+workspace['id'])
  if code==200:call('/api/workspaces',{'id':workspace['id'],'version':view['version'],'op':'archive','requestId':str(uuid.uuid4()),'payload':{}})
