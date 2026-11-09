import test from 'node:test';import assert from 'node:assert/strict';import {handleVercelApi} from '../server/vercel-api.mjs';
const env={NODE_ENV:'production',OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://terminal.example.test',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'f'.repeat(64),SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable'};
const request=(path,body,cookie='')=>new Request(env.SITE_ORIGIN+path,{method:body?'POST':'GET',headers:{origin:env.SITE_ORIGIN,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const user={id:'owner-id',email:env.OWNER_EMAIL,email_confirmed_at:'2026-11-09T00:00:00Z',is_anonymous:false};
function provider(override={}){let challenge,exchanges=0;return {get exchanges(){return exchanges},fetch:async(url,options)=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(u.pathname.endsWith('/otp')){assert.equal(u.searchParams.get('redirect_to'),env.SITE_ORIGIN+'/api/auth/callback');assert.equal(body.email,env.OWNER_EMAIL);assert.equal(body.code_challenge_method,'s256');challenge=body.code_challenge;return Response.json({})}
 if(u.searchParams.get('grant_type')==='pkce'){exchanges++;assert.equal(body.auth_code,'valid-code');assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.code_verifier))).toString('base64url'),challenge);if(exchanges>1)return Response.json({},{status:400});return Response.json({access_token:'secret-access',refresh_token:'secret-refresh',expires_in:3600})}
 if(u.pathname.endsWith('/user'))return Response.json({...user,...override});throw Error('Unexpected provider call');
 }}}
test('default email link uses server-only PKCE, validates the owner, then still requires PIN',async()=>{
 const p=provider(),sent=await handleVercelApi(request('/api/auth/request',{email:env.OWNER_EMAIL}),env,{fetcher:p.fetch});assert.equal(sent.status,200);assert.deepEqual(await sent.json(),{ok:true,method:'link'});const pending=sent.headers.get('set-cookie');assert.match(pending,/__Host-fx-owner-pkce=/);assert.match(pending,/HttpOnly; Secure; SameSite=Lax/);
 const response=await handleVercelApi(request('/api/auth/callback?code=valid-code',null,pending),env,{fetcher:p.fetch});assert.equal(response.status,303);assert.equal(response.headers.get('location'),env.SITE_ORIGIN+'/admin');assert.equal(response.headers.get('referrer-policy'),'no-referrer');const ownerCookie=response.headers.getSetCookie().find(x=>x.startsWith('__Host-fx-owner='));assert.ok(ownerCookie);assert.doesNotMatch(ownerCookie,/secret-access|secret-refresh/);assert.match(response.headers.get('set-cookie'),/__Host-fx-owner-pkce=;.*Max-Age=0/);
 const session=await handleVercelApi(request('/api/session',null,ownerCookie),env,{fetcher:p.fetch});assert.equal((await session.json()).is_admin,false);
 const replay=await handleVercelApi(request('/api/auth/callback?code=valid-code',null,pending),env,{fetcher:p.fetch});assert.match(replay.headers.get('location'),/link_failed/);assert.doesNotMatch(replay.headers.get('set-cookie'),/__Host-fx-owner=/);
});
test('missing, expired or altered PKCE cookie never reaches token exchange',async()=>{
 const p=provider(),sent=await handleVercelApi(request('/api/auth/request',{email:env.OWNER_EMAIL}),env,{fetcher:p.fetch}),pending=sent.headers.get('set-cookie');
 for(const cookie of ['',pending.replace('__Host-fx-owner-pkce=','__Host-fx-owner-pkce=x')]){const response=await handleVercelApi(request('/api/auth/callback?code=valid-code',null,cookie),env,{fetcher:p.fetch});assert.match(response.headers.get('location'),/wrong_browser/)}
 const original=Date.now;try{const later=Date.now()+1200001;Date.now=()=>later;const response=await handleVercelApi(request('/api/auth/callback?code=valid-code',null,pending),env,{fetcher:p.fetch});assert.match(response.headers.get('location'),/wrong_browser/)}finally{Date.now=original}assert.equal(p.exchanges,0);
});
test('PKCE success for an unconfirmed or different account cannot create owner access',async()=>{
 for(const override of [{email:'other@example.test'},{email_confirmed_at:null},{is_anonymous:true}]){const p=provider(override),sent=await handleVercelApi(request('/api/auth/request',{email:env.OWNER_EMAIL}),env,{fetcher:p.fetch}),response=await handleVercelApi(request('/api/auth/callback?code=valid-code',null,sent.headers.get('set-cookie')),env,{fetcher:p.fetch});assert.match(response.headers.get('location'),/link_failed/);assert.doesNotMatch(response.headers.get('set-cookie'),/__Host-fx-owner=/)}
});
