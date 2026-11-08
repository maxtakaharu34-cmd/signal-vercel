// Network integration check. This is a DOM/runtime test, not physical browser QA.
import assert from 'node:assert/strict';import {Window} from 'happy-dom';import {mountApp} from '../web/app.mjs';import {validateScene} from '../web/engine.mjs';
const origin='https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site';
const get=async path=>{const r=await fetch(origin+path,{redirect:'manual'});assert.equal(r.status,200,path);return r};
const scene=await (await get('/api/scene')).json();assert.ok(validateScene(scene));assert.ok(scene.version>0);assert.ok(!('actor_site_id'in scene));
assert.equal((await fetch(origin+'/api/session',{redirect:'manual'})).status,401);
for(const path of ['/api/admin/login','/api/admin/publish','/api/admin/automation'])assert.equal((await fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({pin:'111'}),redirect:'manual'})).status,401);
console.log('PASS: public presentation reads work; anonymous session and management writes remain denied');
const window=new Window({url:origin,settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});window.WebSocket=globalThis.WebSocket;window.document.write(await (await get('/')).text());let app,sceneReads=0;
window.fetch=(path,options={})=>{if(path==='/api/scene')sceneReads++;return fetch(new URL(path,origin),{...options,redirect:'manual'})};
const until=async predicate=>{for(let i=0;i<400&&!predicate();i++)await new Promise(r=>setTimeout(r,25));assert.ok(predicate())};
try{
 app=await mountApp({window,document:window.document});assert.equal(app.state().ready,true);assert.equal(app.state().isAdmin,false);assert.equal(app.state().published.version,scene.version);assert.equal(window.document.getElementById('settingRevision').textContent,'#'+String(scene.version).padStart(4,'0'));assert.equal(window.document.getElementById('exportScene').disabled,false);
 console.log('PASS: live anonymous viewer loads the saved database revision through the actual client/API path');
 await until(()=>window.document.getElementById('connectionLabel').textContent==='リアルタイム接続');await new Promise(r=>setTimeout(r,300));
 const config=await (await get('/api/live-config')).json(),reads=sceneReads,started=performance.now();
 const notify=await fetch(config.url+'/realtime/v1/api/broadcast',{method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({messages:[{topic:config.topic,event:config.event,payload:{changed:true}}]})});assert.ok(notify.ok);
 await until(()=>sceneReads>reads);assert.equal(app.state().isAdmin,false);console.log(JSON.stringify({notification_to_viewer_read_ms:Math.round(performance.now()-started),revision:app.state().published.version}));
 console.log('PASS: production WebSocket hint triggers a same-origin viewer refresh without a page reload');
}finally{app?.destroy();await window.happyDOM.close()}
