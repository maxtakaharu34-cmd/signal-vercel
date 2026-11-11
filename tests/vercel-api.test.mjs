import test from 'node:test';
import assert from 'node:assert/strict';
import {handleVercelApi} from '../server/vercel-api.mjs';
const env={NODE_ENV:'production',OWNER_AUTH_METHOD:'code',OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://terminal.example.test',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'a'.repeat(64),SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const request=(path,body,cookie='',extra={})=>new Request(env.SITE_ORIGIN+path,{method:body?'POST':'GET',headers:{origin:env.SITE_ORIGIN,cookie,'content-type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
const verified={id:'owner-id',email:env.OWNER_EMAIL,email_confirmed_at:new Date().toISOString(),is_anonymous:false};
const tokens={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600};
const authFetch=async(url,options)=>{
 if(url.endsWith('/verify'))return Response.json(tokens);
 if(url.endsWith('/user')){assert.equal(options.headers.authorization,'Bearer '+tokens.access_token);return Response.json(verified)}
 if(url.endsWith('/otp'))return Response.json({});
 if(url.includes('/logout'))return new Response(null,{status:204});
 throw Error('Unexpected request');
};
const login=()=>handleVercelApi(request('/api/auth/verify',{email:env.OWNER_EMAIL,token:'123456'}),env,{fetcher:authFetch});
test('Vercel ignores forged Sites identities, service headers and PIN-only logins',async()=>{
 for(const path of ['/api/session','/api/admin/login','/api/admin/publish']){
  const r=await handleVercelApi(request(path,path==='/api/session'?null:{pin:'111'},'',{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':env.OWNER_EMAIL,'x-signal-owner-service':env.DEMO_BRIDGE_SECRET,'x-signal-admin-session':'forged'}),env,{fetcher:authFetch});
  assert.equal(r.status,401);
 }
});
test('verified owner email then PIN unlocks management; plaintext credentials never leave server',async()=>{
 const response=await login();assert.equal(response.status,200);const ownerCookie=response.headers.get('set-cookie');
 assert.match(ownerCookie,/__Host-fx-owner=/);assert.match(ownerCookie,/HttpOnly; Secure; SameSite=Strict/);assert.doesNotMatch(ownerCookie,/test-access|test-refresh/);assert.deepEqual(await response.json(),{ok:true});
 let r=await handleVercelApi(request('/api/session',null,ownerCookie),env,{fetcher:authFetch});let data=await r.json();assert.equal(data.owner_eligible,true);assert.equal(data.is_admin,false);
 r=await handleVercelApi(request('/api/admin/login',{pin:'111'},ownerCookie),env,{fetcher:authFetch});assert.equal(r.status,200);const pin=(await r.json()).session;
 r=await handleVercelApi(request('/api/session',null,ownerCookie,{'x-signal-admin-session':pin}),env,{fetcher:authFetch});assert.equal((await r.json()).is_admin,true);
 r=await handleVercelApi(request('/api/admin/login',{pin:'111'},ownerCookie.replace('__Host-fx-owner=','__Host-fx-owner=x')),env,{fetcher:authFetch});assert.equal(r.status,401);
 const secondCookie=(await login()).headers.get('set-cookie');r=await handleVercelApi(request('/api/session',null,secondCookie,{'x-signal-admin-session':pin}),env,{fetcher:authFetch});assert.equal((await r.json()).is_admin,false);
 r=await handleVercelApi(request('/api/admin/logout',{},ownerCookie),env,{fetcher:authFetch});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('OTP sends only to the allowlisted owner and server checks confirmed identity',async()=>{
 let calls=0;const fetcher=async(...args)=>{calls++;return authFetch(...args)};
 assert.equal((await handleVercelApi(request('/api/auth/request',{email:'other@example.test'}),env,{fetcher})).status,403);assert.equal(calls,0);
 assert.equal((await handleVercelApi(request('/api/auth/request',{email:env.OWNER_EMAIL}),env,{fetcher})).status,200);assert.equal(calls,1);
 const unconfirmed=async(url,options)=>url.endsWith('/user')?Response.json({...verified,email_confirmed_at:null}):authFetch(url,options);
 assert.equal((await handleVercelApi(request('/api/auth/verify',{email:env.OWNER_EMAIL,token:'123456'}),env,{fetcher:unconfirmed})).status,403);
 const other=async(url,options)=>url.endsWith('/user')?Response.json({...verified,email:'other@example.test'}):authFetch(url,options);
 assert.equal((await handleVercelApi(request('/api/auth/verify',{email:env.OWNER_EMAIL,token:'123456'}),env,{fetcher:other})).status,403);
 assert.equal((await handleVercelApi(request('/api/auth/verify',{email:env.OWNER_EMAIL,token:'123456'},'',{origin:'https://evil.test'}),env,{fetcher})).status,403);
});
test('production never uses the development public proxy and missing configuration fails closed',async()=>{
 let suppliedUser='unset';const r=await handleVercelApi(request('/api/scene'),{...env,SIGNAL_READ_FALLBACK_URL:'https://evil.test'},{siteHandler:async(_r,_env,user)=>{suppliedUser=user;return Response.json({common:true})}});assert.equal(r.status,200);assert.equal(suppliedUser,null);
 assert.equal((await handleVercelApi(request('/api/admin/login',{pin:'111'}),{},{})).status,503);
});

test('customer management requires the verified owner and that session’s PIN before forwarding a scoped request',async()=>{
 const customer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',command='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const calls=[];
 const fetcher=async(url,options)=>{
  if(url.endsWith('/customer_portal')){
   assert.equal(options.headers.authorization,'Bearer '+tokens.access_token);
   const body=JSON.parse(options.body);
   assert.equal(body.bridge_token,env.DEMO_BRIDGE_SECRET);
   calls.push(body);
   return Response.json(body.operation==='admin_list'?{customers:[]}:{balance:1500000,changed:true,notifyToken:customer});
  }
  if(url.endsWith('/broadcast')){
   calls.push(JSON.parse(options.body));
   return Response.json({});
  }
  return authFetch(url,options);
 };
 const send=(path,body,cookie='',header={})=>handleVercelApi(request(path,body,cookie,header),env,{fetcher});
 const ownerCookie=(await login()).headers.get('set-cookie');
 const path='/api/admin/customers';
 assert.equal((await send(path)).status,401);
 assert.equal((await send(path,null,ownerCookie)).status,403);
 assert.equal(calls.length,0);
 const pin=(await (await send('/api/admin/login',{pin:'111'},ownerCookie)).json()).session;
 const headers={'x-signal-admin-session':pin};
 assert.equal((await send(path+'?q=test',null,ownerCookie,headers)).status,200);
 assert.equal(calls[0].operation,'admin_list');
 const edit=path+'/balance?customer='+customer;
 const payload={commandId:command,balance:1500000,expectedBalance:1000000,reason:'  デモ設定  ',side:'sell'};
 assert.equal((await send(edit,payload,ownerCookie,{...headers,origin:'https://evil.test'})).status,403);
 assert.equal((await send(edit,{...payload,balance:-1},ownerCookie,headers)).status,400);
 assert.deepEqual(await (await send(edit,payload,ownerCookie,headers)).json(),{balance:1500000,changed:true});
 assert.deepEqual(calls[1].payload,{customerId:customer,commandId:command,balance:1500000,expectedBalance:1000000,reason:'デモ設定'});
 assert.deepEqual(calls[2].messages,[{topic:'demo-account-refresh-'+customer,event:'refresh',payload:{changed:true}}]);
});

test('campaign visibility is public, but publication and customer reset require the owner and PIN',async()=>{
 const customerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const forwarded=[];
 const fetcher=async(url,options)=>{
  if(url.endsWith('/demo_campaign_public_state')){
   assert.equal(options.headers.authorization,undefined);
   return Response.json({enabled:false,version:1});
  }
  if(url.endsWith('/demo_campaign_transaction')){
   assert.equal(options.headers.authorization,'Bearer '+tokens.access_token);
   forwarded.push(JSON.parse(options.body));
   return Response.json({enabled:true,version:2,changed:true});
  }
  if(url.endsWith('/broadcast'))return Response.json({});
  return authFetch(url,options);
 };
 const send=(path,body,cookie='',header={})=>handleVercelApi(request(path,body,cookie,header),env,{fetcher});
 assert.deepEqual(await (await send('/api/campaign')).json(),{enabled:false,version:1});
 assert.equal((await send('/api/admin/campaign')).status,401);
 const ownerCookie=(await login()).headers.get('set-cookie');
 assert.equal((await send('/api/admin/campaign',{enabled:true,version:1},ownerCookie)).status,403);
 const pin=(await (await send('/api/admin/login',{pin:'111'},ownerCookie)).json()).session;
 const headers={'x-signal-admin-session':pin};
 assert.equal((await send('/api/admin/campaign',{enabled:true,version:1},ownerCookie,headers)).status,200);
 assert.deepEqual(forwarded[0].payload,{enabled:true,version:1});
 assert.equal((await send('/api/admin/customers/campaign?customer='+customerId,{round:1},ownerCookie,headers)).status,200);
 assert.deepEqual(forwarded[1].payload,{customerId,round:1});
});
