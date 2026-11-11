"""Run only against a disposable PostgreSQL cluster; initializes an Auth test stub."""
import argparse,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--socket',required=True);parser.add_argument('--port',default='55436');args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
base=['/opt/homebrew/opt/postgresql@17/bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',args.socket,'-p',args.port,'-U','postgres','postgres']
def run(sql,ok=True):
 r=subprocess.run(base+['-c',sql],capture_output=True,text=True)
 assert (r.returncode==0)==ok, r.stderr or r.stdout
 return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
def lit(value):return "'"+value.replace("'","''")+"'"
a='11111111-1111-4111-8111-111111111111';b='22222222-2222-4222-8222-222222222222'
def as_user(user,sql,ok=True):return run('begin;set local role authenticated;select set_config(\'request.jwt.claim.sub\','+lit(user)+',true);'+sql+';commit;',ok)
run("create role anon nologin;create role authenticated nologin;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);create table auth.mfa_factors(user_id uuid,status text);create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(current_setting('request.jwt.claim.aal',true),'aal1'))$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant usage on schema public to authenticated,anon;insert into auth.users values ('"+a+"'),('"+b+"');")
for migration in sorted((root/'supabase/migrations').glob('*.sql')):
 r=subprocess.run(base+['-f',str(migration)],capture_output=True,text=True);assert r.returncode==0,r.stderr
node="import {series} from './web/lib/simulation.mjs';const config={direction:0,volatility:3,speed:1},{rows,rng}=series(7,config);console.log(JSON.stringify({schemaVersion:1,seed:7,total:72,config,rows,rngState:rng.state()}));"
checkpoint=subprocess.check_output(['node','--input-type=module','-e',node],cwd=root,text=True).strip();cp=lit(checkpoint)+'::jsonb'
assert as_user(a,"select version from public.save_demo_workspace(0,"+cp+",'initial')")=='1';print('PASS: first save persists server state')
assert as_user(b,'select count(*) from public.demo_workspaces')=='0';assert as_user(b,'select count(*) from public.demo_workspace_events')=='0';print('PASS: user B cannot read user A state or events')
as_user(b,"insert into public.demo_workspaces(owner_id,version,checkpoint) values ("+lit(a)+',1,'+cp+')',False);print('PASS: user B cannot write user A state')
as_user(a,'select public.save_demo_workspace(0,'+cp+",'stale')",False);assert as_user(a,'select version from public.demo_workspaces')=='1';print('PASS: stale save is rejected without changing state')
assert as_user(a,'select version from public.save_demo_workspace(1,'+cp+",'updated')")=='2';assert as_user(a,'select count(*) from public.demo_workspace_events')=='2';print('PASS: valid update increments version and records event')
invalid=json.loads(checkpoint);invalid['config']['volatility']=None;bad=lit(json.dumps(invalid))+'::jsonb';as_user(a,'select public.save_demo_workspace(2,'+bad+",'invalid')",False);assert as_user(a,'select version from public.demo_workspaces')=='2';print('PASS: invalid checkpoint rejected atomically')
as_user(a,'update public.demo_workspaces set version=99',False);print('PASS: version guard rejects arbitrary overwrites')
run('set role anon;select count(*) from public.demo_workspaces',False);print('PASS: anonymous reads denied')

run("insert into auth.mfa_factors values ("+lit(a)+",'verified')")
assert as_user(a,'select count(*) from public.demo_workspaces')=='0';as_user(a,'select public.save_demo_workspace(2,'+cp+",'requires_mfa')",False);print('PASS: enrolled MFA blocks aal1 reads and writes')
assert as_user(a,"select set_config('request.jwt.claim.aal','aal2',true);select version from public.save_demo_workspace(2,"+cp+",'mfa_ok')")=='3';print('PASS: aal2 can read and save with enrolled MFA')

# Shared viewer/admin presentation. All fixtures remain local and disposable.
run("delete from auth.mfa_factors;update auth.users set email='maxtakaharu3.4@gmail.com',email_confirmed_at=now() where id="+lit(a)+";update auth.users set email='viewer@example.invalid',email_confirmed_at=now() where id="+lit(b))
assert json.loads(as_user(a,'select public.get_demo_access()'))['is_admin'] is True
assert json.loads(as_user(b,'select public.get_demo_access()'))['is_admin'] is False;print('PASS: verified allowlisted email is the only admin')
assert as_user(b,'select version from public.demo_scene')=='1';print('PASS: ordinary verified account can read shared scene')
signal=lit(json.dumps({'direction':1,'level':'初夏','note':'test'}))+'::jsonb'
publish='select version from public.publish_demo_scene(1,'+cp+','+signal+",'test notice','test publish')"
as_user(b,publish,False);assert as_user(b,'with changed as(update public.demo_scene set version=version+1 returning id) select count(*) from changed')=='0';print('PASS: ordinary user cannot publish or directly update scene')
assert as_user(a,publish)=='2';assert as_user(b,'select version from public.demo_scene')=='2';print('PASS: admin publication is shared with viewer')
as_user(a,publish,False);assert as_user(b,'select version from public.demo_scene')=='2';print('PASS: shared stale publication is rejected atomically')
as_user(b,'select * from demo_private.scene_audit',False);as_user(b,"insert into demo_private.admin_allowlist values ('viewer@example.invalid')",False);print('PASS: audit and role table cannot be read or forged')
events=json.loads(as_user(b,'select public.get_demo_scene_events()'));assert len(events)==1 and events[0]['version']==2 and 'actor_id' not in events[0];print('PASS: server timeline is redacted and records published settings')
run('set role anon;select * from public.demo_scene',False);run('set role anon;select public.get_demo_access()',False);print('PASS: anonymous scene and role access denied')
run('update auth.users set email_confirmed_at=null where id='+lit(a));assert json.loads(as_user(a,'select public.get_demo_access()'))['is_admin'] is False;assert as_user(a,'with changed as(update public.demo_scene set version=version+1 returning id) select count(*) from changed')=='0';print('PASS: unconfirmed allowlisted email cannot become administrator')

bridge_token='a'*64
run("insert into demo_private.site_bridge_keys values(1,encode(extensions.digest("+lit(bridge_token)+",'sha256'),'hex'))")
def via_site(actor,payload,action='read',token=bridge_token,ok=True):
 query='select public.site_demo_bridge('+lit(token)+','+lit(action)+','+lit(json.dumps(actor))+'::jsonb,'+lit(json.dumps(payload))+"::jsonb)"
 return run('begin;set local role anon;'+query+';commit;',ok)
owner={'id':'site-owner-id','email':'maxtakaharu3.4@gmail.com'}
via_site(owner,{},token='111',ok=False);print('PASS: the public PIN is never a database credential')
assert json.loads(via_site(owner,{}))['scene']['version']==2;print('PASS: scoped Site capability can read the common scene')
payload={'expected_version':2,'new_checkpoint':json.loads(checkpoint),'new_signal':{'direction':1,'level':'初夏','note':'site bridge'},'new_announcement':'','event_label':'site publication'}
via_site({'id':'viewer','email':'viewer@example.invalid'},payload,'publish',ok=False);print('PASS: Site bridge still requires the owner for publication')
assert json.loads(via_site(owner,payload,'publish'))['scene']['version']==3
assert run("select actor_site_id from demo_private.scene_audit where version=3")=='site-owner-id';print('PASS: Site publication persists and records the trusted Site identity')
via_site(owner,payload,'publish',ok=False);assert as_user(b,'select version from public.demo_scene')=='3';print('PASS: Site bridge rejects stale publications')
run('set role anon;select * from demo_private.site_bridge_keys',False);print('PASS: browser role cannot read the Site credential hash')

# Customer balances and orders use authenticated identity and a scoped server credential.
cloud_key='b'*64
run("insert into demo_private.site_bridge_keys values(2,encode(extensions.digest("+lit(cloud_key)+",'sha256'),'hex')); update auth.users set email_confirmed_at=now(); insert into auth.mfa_factors values ("+lit(a)+",'verified'),("+lit(b)+",'verified')")
command='44444444-4444-4444-8444-444444444444'
def customer_call(user,operation='read',payload=None,command_id=None,key=cloud_key,aal='aal2',ok=True):
 query="select public.customer_order_transaction("+lit(key)+","+lit(operation)+","+(lit(command_id) if command_id else 'null')+","+lit(json.dumps(payload or {}))+"::jsonb)"
 result=as_user(user,"select set_config('request.jwt.claim.aal',"+lit(aal)+",true);"+query,ok)
 return json.loads(result) if ok else None
customer_call(a,aal='aal1',ok=False)
customer_call(a,key=bridge_token,ok=False)
as_user(a,"select * from demo_private.customer_demo_accounts",False)
run("set role anon;select public.customer_order_transaction('', 'read', null, '{}')",False)
print('PASS: customer account storage needs second factor and the dedicated Vercel bridge')
position={'id':command,'side':'buy','quantity':1,'open':{'price':100.003,'time':123},'close':None,'margin':5}
payload={'version':0,'scene_version':3,'positions':[position],'pending':[],'removed_pending':[],'account':{'id':'demo','balance':1000000,'cursor':None}}
assert customer_call(a)['account'] is None
saved=customer_call(a,'save',payload,command)
assert saved['version']==1 and saved['positions']==[position]
assert customer_call(a,'save',payload,command)['duplicate']
assert customer_call(a,command_id=command)['duplicate']
assert customer_call(a)['positions']==[position]
assert customer_call(b,command_id=command)['positions']==[] and not customer_call(b,command_id=command)['duplicate']
customer_call(a,'save',payload,'55555555-5555-4555-8555-555555555555',ok=False)
customer_call(a,'save',{**payload,'version':1,'scene_version':2},ok=False)
assert customer_call(a)['version']==1
print('PASS: customer isolation, replay-safe commits and stale account or scene rejection')
run("delete from auth.mfa_factors where user_id="+lit(a))
customer_call(a,ok=False)
print('PASS: removing MFA invalidates existing elevated access to the cloud account')
