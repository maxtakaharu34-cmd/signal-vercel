import test from 'node:test';import assert from 'node:assert/strict';
import {handleSiteApi} from '../server/site-api.mjs';import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
const env={OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://example.test',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'b'.repeat(64),SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'},owner={userId:'owner-id',email:env.OWNER_EMAIL};
const request=(path,body,session,origin=env.SITE_ORIGIN)=>new Request(env.SITE_ORIGIN+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(session?{'x-signal-admin-session':session}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('owner commands persist an anchored scenario; public reads advance without writes; stop freezes it',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.parse('2026-11-06T03:00:00Z'),writes=0,reads=0,lastPayload;
 let scene={id:1,version:21,checkpoint:initialCheckpoint(),signal:{...DEFAULT_SIGNAL},announcement:'',updated_at:new Date(now).toISOString()};
 Date.now=()=>now;
 globalThis.fetch=async(url,options)=>{if(!url.endsWith('/rpc/site_demo_bridge'))return new Response(null,{status:202});const b=JSON.parse(options.body);assert.equal(b.bridge_token,env.DEMO_BRIDGE_SECRET);if(b.operation==='read'){reads++;return Response.json({scene,events:[]})}writes++;lastPayload=b;assert.equal(b.site_actor.id,owner.userId);assert.equal(b.payload.expected_version,scene.version);scene={...scene,version:scene.version+1,checkpoint:b.payload.new_checkpoint,signal:b.payload.new_signal,announcement:b.payload.new_announcement,updated_at:new Date(now).toISOString()};return Response.json({scene})};
 try{
  const login=await handleSiteApi(request('/api/admin/login',{pin:'111'}),env,owner),session=(await login.json()).session;
  let response=await handleSiteApi(request('/api/admin/automation',{action:'start',direction:1,expected_version:21},session),env,owner);assert.equal(response.status,200);const started=await response.json();assert.equal(started.version,22);assert.ok(scene.checkpoint.automation);assert.equal(writes,1);assert.match(lastPayload.payload.event_label,/自動生成の方向を上昇へ変更/);
  now+=31000;const a=await (await handleSiteApi(request('/api/scene'),env)).json();now+=1000;const b=await (await handleSiteApi(request('/api/scene'),env)).json();assert.equal(a.version,b.version);assert.ok(b.clock.step>a.clock.step);assert.equal(writes,1);assert.ok(reads>=3);assert.equal(b.checkpoint.total,started.checkpoint.total+32);assert.equal(scene.checkpoint.total,started.checkpoint.total);
  response=await handleSiteApi(request('/api/admin/automation',{action:'start',direction:-1,expected_version:21},session),env,owner);assert.equal(response.status,409);assert.equal(writes,1);
  response=await handleSiteApi(request('/api/admin/automation',{action:'stop',expected_version:22},session),env,owner);assert.equal(response.status,200);const stopped=await response.json();assert.equal(stopped.version,23);assert.equal(stopped.checkpoint.automation,undefined);assert.equal(stopped.checkpoint.rows.at(-1).close,b.checkpoint.rows.at(-1).close);now+=100000;assert.deepEqual((await (await handleSiteApi(request('/api/scene'),env)).json()).checkpoint,stopped.checkpoint);
 }finally{Date.now=originalNow;globalThis.fetch=originalFetch}
});
test('automation cannot be invoked by anonymous visitors, non-owners, forged sessions or cross-origin requests',async()=>{
 const input={action:'start',direction:1,expected_version:1};assert.equal((await handleSiteApi(request('/api/admin/automation',input),env)).status,401);assert.equal((await handleSiteApi(request('/api/admin/automation',input),env,{userId:'someone',email:'other@example.test'})).status,403);assert.equal((await handleSiteApi(request('/api/admin/automation',input,'forged'),env,owner)).status,403);
 const session=(await (await handleSiteApi(request('/api/admin/login',{pin:'111'}),env,owner)).json()).session;assert.equal((await handleSiteApi(request('/api/admin/automation',input,session,'https://evil.test'),env,owner)).status,403);
 for(const bad of [{...input,direction:9},{...input,expected_version:0},{...input,action:'transfer'}])assert.equal((await handleSiteApi(request('/api/admin/automation',bad,session),env,owner)).status,400);
});
