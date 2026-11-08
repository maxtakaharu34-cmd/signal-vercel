import test from 'node:test';
import assert from 'node:assert/strict';
import {handleVercelApi} from '../server/vercel-api.mjs';
const env={NODE_ENV:'production',OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://terminal.example.test',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'a'.repeat(64),SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
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
