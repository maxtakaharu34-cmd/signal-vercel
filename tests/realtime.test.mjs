import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {subscribeScene} from '../web/live.mjs';
const until=async predicate=>{for(let i=0;i<120&&!predicate();i++)await new Promise(r=>setTimeout(r,5));assert.ok(predicate())};
function setup(read){
 const window=new Window();let broadcast,status,closed=0,reads=0;const records=[],statuses=[];
 const stop=subscribeScene({window,onRecord:r=>records.push(r),onStatus:s=>statuses.push(s),call:async path=>path==='/api/live-config'?{url:'https://test.supabase.co',publishableKey:'public',topic:'demo-scene-refresh-v1',event:'refresh'}:read(++reads),createRealtime:()=>({channel(){return {on(type,filter,cb){assert.equal(type,'broadcast');assert.equal(filter.event,'refresh');broadcast=cb;return this},subscribe(cb){status=cb;cb('SUBSCRIBED');return this}}},async removeChannel(){closed++},async disconnect(){closed++}})});
 return {window,records,statuses,emit:payload=>broadcast({payload}),status:s=>status(s),get reads(){return reads},get closed(){return closed},async close(){stop();await window.happyDOM.close()}};
}
test('realtime hints load authenticated snapshots and coalesce notification bursts',async()=>{
 const a=setup(async n=>({version:n,source:'authenticated API'}));try{
  await until(()=>a.records.length===1);for(let i=0;i<100;i++)a.emit({changed:true,version:999,checkpoint:'untrusted'});
  await until(()=>a.records.length===2);assert.equal(a.reads,2);assert.equal(a.records.at(-1).version,2);assert.equal(a.records.at(-1).source,'authenticated API');
  a.emit({changed:false});await new Promise(r=>setTimeout(r,20));assert.equal(a.reads,2);
  a.status('CHANNEL_ERROR');a.status('SUBSCRIBED');await until(()=>a.records.length===3);assert.ok(a.statuses.includes('CHANNEL_ERROR'));assert.equal(a.records.at(-1).version,3);
 }finally{await a.close()}assert.equal(a.closed,2);
});
test('an invalidation during a pending read is not lost, and closed subscribers stay closed',async()=>{
 let release;const a=setup(n=>n===1?new Promise(r=>release=()=>r({version:n})):Promise.resolve({version:n}));try{
  await until(()=>a.reads===1);a.emit({changed:true});release();await until(()=>a.records.length===2);assert.deepEqual(a.records.map(r=>r.version),[1,2]);
 }finally{await a.close()}const n=a.reads;a.emit({changed:true});await new Promise(r=>setTimeout(r,20));assert.equal(a.reads,n);
});
