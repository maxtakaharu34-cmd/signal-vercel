import test from 'node:test';import assert from 'node:assert/strict';
import {createSiteClient} from '../web/site-client.mjs';
test('a hanging request times out and the next authoritative read can recover',async()=>{
 let calls=0,timers=0;const window={setTimeout:fn=>{timers++;return setTimeout(fn,5)},clearTimeout:timer=>{timers--;clearTimeout(timer)},fetch:async(_url,{signal})=>{calls++;if(calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));return Response.json({version:24})}};
 const read=()=>createSiteClient(window).from().select().eq().single();assert.ok((await read()).error);assert.equal((await read()).data.version,24);assert.equal(timers,0);
});
test('logout succeeds when the owner identity cookie has been removed',async()=>{
 let loggedOut=false;const window={setTimeout,clearTimeout,fetch:async(path)=>{
  if(path==='/api/admin/logout'){loggedOut=true;return Response.json({ok:true})}
  return Response.json({message:'Authentication required'},{status:401});
 }};
 const client=createSiteClient(window);assert.equal((await client.auth.signOut()).error,null);assert.equal(loggedOut,true);const current=await client.auth.getSession();assert.equal(current.error,null);assert.equal(current.data.session,null);
});
