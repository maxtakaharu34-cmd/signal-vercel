// Run only with disposable, freshly seeded test users passed through stdin.
import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {series} from '../web/lib/simulation.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {fixtures}=JSON.parse(input),{url,publishableKey}=JSON.parse(readFileSync(new URL('../public/supabase-config.json',import.meta.url)));
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const a=createClient(url,publishableKey,options),otherTab=createClient(url,publishableKey,options),b=createClient(url,publishableKey,options),anon=createClient(url,publishableKey,options);
const clients=[a,otherTab,b,anon];
const pass=label=>console.log('PASS: '+label);
function check(result){if(result.error)throw Error(result.error.code+': '+result.error.message);return result.data}
function totp(secret){let bits='',bytes=[];for(const c of secret.toUpperCase().replace(/=+$/,'')){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);assert.ok(n>=0);bits+=n.toString(2).padStart(5,'0')}for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=hash[19]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
try{
 const loginA=check(await a.auth.signInWithPassword(fixtures[0]));check(await b.auth.signInWithPassword(fixtures[1]));
 check(await otherTab.auth.setSession(loginA.session));pass('real Auth password login for disposable users');
 const config={direction:0,volatility:3,speed:1},{rows,rng}=series(7,config),checkpoint={schemaVersion:1,seed:7,total:72,config,rows,rngState:rng.state()};
 const prior=check(await a.from('demo_workspaces').select('version').maybeSingle());const startVersion=prior?.version||0;
 let saved=check(await a.rpc('save_demo_workspace',{expected_version:startVersion,new_checkpoint:checkpoint,event_label:'integration initial'}));assert.equal(saved.version,startVersion+1);pass('authenticated RPC persists checkpoint');
 let restored=check(await otherTab.from('demo_workspaces').select('*').single());assert.deepEqual(restored.checkpoint,checkpoint);pass('separate client restores exact saved checkpoint');
 assert.equal(check(await b.from('demo_workspaces').select('*')).length,0);assert.equal(check(await b.from('demo_workspace_events').select('*')).length,0);pass('other user cannot read state or history');
 const denied=await b.from('demo_workspaces').insert({owner_id:fixtures[0].id,version:1,checkpoint});assert.ok(denied.error);pass('other user cannot write owner state');
 assert.ok((await anon.from('demo_workspaces').select('*')).error);assert.ok((await anon.rpc('save_demo_workspace',{expected_version:0,new_checkpoint:checkpoint})).error);pass('anonymous state access denied');
 let receive,fail;const change=new Promise((resolve,reject)=>{receive=resolve;fail=reject}),timeout=setTimeout(()=>fail(Error('Realtime delivery timeout')),10000);change.catch(()=>{});
 const channel=otherTab.channel('integration-state').on('system',{},payload=>console.log('Realtime system: '+JSON.stringify(payload))).on('postgres_changes',{event:'UPDATE',schema:'public',table:'demo_workspaces',filter:'owner_id=eq.'+fixtures[0].id},payload=>receive(payload.new));
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Realtime subscribe timeout')),15000);channel.subscribe((status,error)=>{console.log('Realtime status: '+status+(error?' '+error.message:''));if(status==='SUBSCRIBED'){clearTimeout(t);resolve()}else if(status==='CHANNEL_ERROR'){clearTimeout(t);reject(error||Error(status))}})});
 checkpoint.config.direction=1;saved=check(await a.rpc('save_demo_workspace',{expected_version:startVersion+1,new_checkpoint:checkpoint,event_label:'integration change'}));assert.equal(saved.version,startVersion+2);let delivered;try{delivered=await change;pass('authenticated WebSocket receives database change')}catch{delivered=check(await otherTab.from('demo_workspaces').select('*').single());pass('authenticated refresh recovers a missed WebSocket notification')}finally{clearTimeout(timeout)}assert.equal(delivered.version,startVersion+2);assert.equal(delivered.checkpoint.config.direction,1);
 const stale=await a.rpc('save_demo_workspace',{expected_version:startVersion+1,new_checkpoint:checkpoint,event_label:'stale'});assert.equal(stale.error?.code,'PT409');assert.equal(check(await a.from('demo_workspace_events').select('*')).length,startVersion+2);pass('stale writes rejected atomically');
 const factor=check(await a.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable test'}));check(await a.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));pass('actual TOTP enrollment and verification');
 assert.equal(check(await otherTab.from('demo_workspaces').select('*')).length,0);assert.ok((await otherTab.rpc('save_demo_workspace',{expected_version:startVersion+2,new_checkpoint:checkpoint})).error);pass('database blocks aal1 after MFA enrollment');
 assert.equal(check(await a.from('demo_workspaces').select('*')).length,1);pass('aal2 retains authorized access');
}finally{for(const client of clients){await client.removeAllChannels();await client.auth.signOut().catch(()=>{})}}
