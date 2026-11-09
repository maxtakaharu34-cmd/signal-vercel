import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCheckpoint,DEFAULT_SIGNAL,validateScene} from '../web/engine.mjs';
import {projectScene,startAutomation,tuneAutomation,validAutomationSettings,timelineMomentum} from '../web/timeline.mjs';
import {handleSiteApi} from '../server/site-api.mjs';

const at=Date.parse('2026-11-09T09:00:00Z');
const initial=()=>({id:1,version:10,checkpoint:initialCheckpoint(),signal:{...DEFAULT_SIGNAL},announcement:'',updated_at:new Date(at).toISOString()});
test('live tuning preserves observed candles, current price, momentum and common seed',()=>{
 const source=startAutomation(initial(),1,at),now=at+123000,current=projectScene(source,now);
 const next=tuneAutomation(source,{speed:5,volatility:7},now);
 assert.ok(validateScene(next));assert.deepEqual(next.checkpoint.rows,current.checkpoint.rows);
 assert.equal(next.checkpoint.automation.startPrice,current.checkpoint.rows.at(-1).close);
 assert.equal(next.checkpoint.automation.initialMomentum,timelineMomentum(source.checkpoint,123));
 assert.equal(next.checkpoint.automation.modelSeed,source.checkpoint.automation.modelSeed);
 assert.deepEqual(next.signal,current.signal);assert.equal(next.checkpoint.config.direction,1);
 const future=projectScene(next,now+2000);assert.equal(future.checkpoint.total,current.checkpoint.total+10);
 assert.deepEqual(future,projectScene(structuredClone(next),now+2000));
 for(const settings of [{speed:3,volatility:7},{speed:5,volatility:11},{speed:1,volatility:1.5},{speed:1},{speed:1,volatility:2,direction:-1},null])assert.equal(validAutomationSettings(settings),false);
 assert.throws(()=>tuneAutomation(initial(),{speed:1,volatility:2},now));
});

test('tuning is owner-gated, validated, version-checked and audited without starting a stopped scenario',async()=>{
 const env={OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://example.test',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'e'.repeat(64),SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'},owner={userId:'owner-id',email:env.OWNER_EMAIL};
 const req=(path,body,session)=>new Request(env.SITE_ORIGIN+path,{method:'POST',headers:{origin:env.SITE_ORIGIN,'content-type':'application/json',...(session?{'x-signal-admin-session':session}:{})},body:JSON.stringify(body)});
 const originalFetch=globalThis.fetch,originalNow=Date.now;let writes=0,label,scene=startAutomation(initial(),0,at);Date.now=()=>at+30000;
 globalThis.fetch=async(url,options)=>{if(!url.endsWith('/rpc/site_demo_bridge'))return new Response(null,{status:202});const b=JSON.parse(options.body);if(b.operation==='read')return Response.json({scene});writes++;label=b.payload.event_label;scene={...scene,version:scene.version+1,checkpoint:b.payload.new_checkpoint,signal:b.payload.new_signal,announcement:b.payload.new_announcement};return Response.json({scene})};
 try{
  const input={action:'tune',settings:{speed:2,volatility:6},expected_version:10};
  assert.equal((await handleSiteApi(req('/api/admin/automation',input),env)).status,401);
  const login=await handleSiteApi(req('/api/admin/login',{pin:'111'}),env,owner),session=(await login.json()).session;
  assert.equal((await handleSiteApi(req('/api/admin/automation',{...input,settings:{speed:2,volatility:20}},session),env,owner)).status,400);
  assert.equal((await handleSiteApi(req('/api/admin/automation',{...input,expected_version:9},session),env,owner)).status,409);assert.equal(writes,0);
  const response=await handleSiteApi(req('/api/admin/automation',input,session),env,owner);assert.equal(response.status,200);assert.equal((await response.json()).version,11);assert.equal(writes,1);assert.match(label,/速さ・値動き/);
  scene={...initial(),version:11};const stopped=await handleSiteApi(req('/api/admin/automation',{...input,expected_version:11},session),env,owner);assert.equal(stopped.status,409);assert.equal((await stopped.json()).code,'AUTOMATION_STOPPED');assert.equal(writes,1);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow}
});
