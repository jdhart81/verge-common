import json,uuid,urllib.request,urllib.error,concurrent.futures
import os
base=os.environ.get('VERGE_TEST_ORIGIN','http://localhost:3000')
assert base in ['http://localhost:3000','http://localhost:3001'], 'Integration fixtures are restricted to local development.'
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
# Community records survive reloads and hide meeting instructions from discovery.
import time
start=int(time.time()*1000)+86400000
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'create_event','requestId':str(uuid.uuid4()),'payload':{'projectId':project,'title':'Fixture workday','summary':'Synthetic event','meetingDetails':'Private fixture location','startsAt':start,'endsAt':start+3600000,'timeZone':'Africa/Nairobi','capacity':2,'visibility':'members'}})
assert code==200,(code,current)
event=current['state']['events'][0]['id']
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'event_rsvp','requestId':str(uuid.uuid4()),'payload':{'id':event,'response':'going'}})
assert code==200 and current['state']['events'][0]['goingCount']==1,(code,current)
code,reloaded=call('/api/workspaces?id='+id)
assert reloaded['state']['events'][0]['yourResponse']=='going'
# Monitoring access gates reject unreviewed boundaries and forged provider receipts.
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'record_parcel','requestId':str(uuid.uuid4()),'payload':{'projectId':project,'name':'Monitoring fixture','landReference':'synthetic','areaSquareMetres':1000,'consentReference':'synthetic consent'}})
assert code==200,(code,current)
parcel=current['state']['parcels'][0]['id']
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'save_boundary','requestId':str(uuid.uuid4()),'payload':{'parcelId':parcel,'geometry':{'type':'Polygon','coordinates':[[[0,0],[0.01,0],[0.01,0.01],[0,0]]]},'consentReference':'synthetic boundary consent','externalSearchAllowed':True}})
assert code==200,(code,current)
code,_=call('/api/monitoring',{'id':id,'parcelId':parcel,'start':'2026-08-01','end':'2026-08-31','confirmExternal':True})
assert code==400,code
code,_=call('/api/workspaces',{'id':id,'version':current['version'],'op':'record_satellite_search','requestId':str(uuid.uuid4()),'payload':{'parcelId':parcel}})
assert code==400,code
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
# Private invitation endpoints never expose hashes or permit general command bypass.
code,invitation=call('/api/invitations',{'action':'create','id':id,'label':'Synthetic neighbor'})
assert code==200,(code,invitation)
assert invitation['link'].startswith('/join/#'+id+'.')
code,current=call('/api/workspaces?id='+id)
invite=current['state']['invitations'][0]
assert 'tokenHash' not in invite and 'usedBy' not in invite
code,_=call('/api/workspaces',{'id':id,'version':current['version'],'op':'create_invitation','requestId':str(uuid.uuid4()),'payload':{'label':'Bypass','tokenHash':'a'*64}})
assert code==400,code
code,current=call('/api/workspaces',{'id':id,'version':current['version'],'op':'revoke_invitation','requestId':str(uuid.uuid4()),'payload':{'id':invite['id']}})
assert code==200,(code,current)
code,_=call('/api/invitations',{'action':'accept','id':id,'token':invitation['link'].split('.')[-1],'name':'Test','requestId':str(uuid.uuid4())})
assert code==403,code
version=current['version']
code,current=call('/api/workspaces',{'id':id,'version':version,'op':'archive','requestId':str(uuid.uuid4()),'payload':{}});assert code==200,(code,current)
print('HTTP integration passed: durable creation/readback, replay protection, payload mismatch, stale-write rejection, cross-origin rejection, private discovery, concurrent write isolation, linked audit, private file upload/download, evidence attachment, archive.')
# Archive any earlier fixtures left by a failed test attempt.
code,listing=call('/api/workspaces')
for workspace in listing.get('workspaces',[]):
 if workspace['name']=='HTTP integration fixture' and workspace['visibility']!='archived':
  code,view=call('/api/workspaces?id='+workspace['id'])
  if code==200:call('/api/workspaces',{'id':workspace['id'],'version':view['version'],'op':'archive','requestId':str(uuid.uuid4()),'payload':{}})
