// Private Site service access is supplied on hidden stdin, never in process args.
import assert from 'node:assert/strict';
import {RealtimeClient} from '@supabase/supabase-js';
let input='';for await(const part of process.stdin)input+=part;
const {origin,siteAccess,serviceSecret}=JSON.parse(input);let session;
async function call(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{'OAI-Sites-Authorization':'Bearer '+siteAccess,'x-signal-owner-service':serviceSecret,...(session?{'x-signal-admin-session':session}:{}),...(body?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});const data=await r.json();assert.equal(r.status,200,path);return data}
const config=await call('/api/live-config');assert.ok(!JSON.stringify(config).includes(serviceSecret));
const client=new RealtimeClient(config.url+'/realtime/v1',{params:{apikey:config.publishableKey}});
let channel,resolveHint;const hint=new Promise(resolve=>resolveHint=resolve);let timer;
try{
 await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Realtime subscription timed out')),15000);channel=client.channel(config.topic,{config:{private:false,presence:{enabled:false}}}).on('broadcast',{event:config.event},message=>resolveHint({payload:message.payload,at:performance.now()})).subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR')reject(Error('Realtime channel rejected'))})});
 console.log('PASS: production WebSocket subscription is connected');
 session=(await call('/api/admin/login',{pin:'111'})).session;const scene=await call('/api/scene'),started=performance.now();
 const saved=await call('/api/admin/publish',{expected_version:scene.version,new_checkpoint:scene.checkpoint,new_signal:scene.signal,new_announcement:scene.announcement,event_label:'リアルタイム同期の接続確認'});
 assert.equal(saved.delivery.notified,true);assert.equal(saved.version,scene.version+1);
 const received=await Promise.race([hint,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Broadcast not received')),10000)})]);clearTimeout(timer);assert.deepEqual(received.payload,{changed:true});
 const viewer=await call('/api/scene');assert.equal(viewer.version,saved.version);assert.deepEqual(viewer.checkpoint,scene.checkpoint);
 console.log('PASS: saved revision arrives via WebSocket; authenticated viewer reads the exact saved data');
 console.log(JSON.stringify({notification_ms:Math.round(received.at-started),save_to_viewer_ms:Math.round(performance.now()-started)}));
 await call('/api/admin/logout',{});
}finally{clearTimeout(timer);if(channel)await client.removeChannel(channel);await client.disconnect()}
