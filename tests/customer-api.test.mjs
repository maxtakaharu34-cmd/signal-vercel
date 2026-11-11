import test from 'node:test';
import assert from 'node:assert/strict';
import {handleVercelApi} from '../server/vercel-api.mjs';
import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';

const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const factorId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const commandId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env={CUSTOMER_AUTH_ENABLED:'true',OWNER_EMAIL:'owner@example.test',SITE_ORIGIN:'https://terminal.example.test',DEMO_BRIDGE_SECRET:'a'.repeat(64),SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public-test-key'};

function fixture(){
 const cookies=new Map(),calls=[],seen=new Set();
 let verified=false,exchange=false,saved={version:0,positions:[],pending:[],account:null};
 const tokens=aal=>({access_token:'header.'+Buffer.from(JSON.stringify({aal,sub:userId})).toString('base64url')+'.signature',refresh_token:'test-refresh',expires_in:3600});
 const claims=authorization=>JSON.parse(Buffer.from(authorization.split('.')[1],'base64url').toString());
 let market={id:1,version:4,checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL,announcement:''};
 async function fetcher(value,init){
  const url=new URL(value),body=init.body?JSON.parse(init.body):null;
  calls.push([url.pathname,body]);
  const respond=(data,status)=>Response.json(data,{status});
  if(url.pathname==='/auth/v1/otp')return respond({});
  if(url.searchParams.get('grant_type')==='pkce'){
   if(exchange||body.auth_code!=='test-code'||!body.code_verifier)return respond({error_code:'flow_state_not_found'},401);
   exchange=true;
   return respond(tokens('aal1'));
  }
  if(url.pathname==='/auth/v1/user')return respond({
   id:userId,email:'person@example.test',email_confirmed_at:'2026-11-11',
   factors:verified?[{id:factorId,factor_type:'totp',status:'verified'}]:[],
  });
  if(url.pathname==='/auth/v1/factors')return respond({id:factorId,totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'TESTDEMOFACTOR'}});
  if(url.pathname.endsWith('/challenge'))return respond({id:'test-challenge'});
  if(url.pathname.endsWith('/verify')){
   if(body.challenge_id!=='test-challenge'||body.code!=='123456')return respond({error_code:'mfa_verification_failed'},401);
   verified=true;
   return respond(tokens('aal2'));
  }
  if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  if(url.pathname.endsWith('/customer_portal'))return respond({ok:true});
  if(url.pathname.endsWith('/customer_order_transaction')){
   assert.equal(claims(init.headers.authorization).aal,'aal2');
   assert.equal(body.bridge_token,env.DEMO_BRIDGE_SECRET);
   const duplicate=seen.has(body.command_id);
   if(body.operation==='read'||duplicate)return respond({...saved,duplicate});
   const {payload}=body;
   if(payload.version!==saved.version||payload.scene_version!==market.version)return respond({code:'PT409'},409);
   if(body.command_id)seen.add(body.command_id);
   const edits=new Map(saved.positions.map(row=>[row.id,row]));
   for(const row of payload.positions)edits.set(row.id,row);
   saved={version:saved.version+1,positions:[...edits.values()],pending:payload.pending,account:payload.account??saved.account};
   return respond({...saved,duplicate:false});
  }
  throw Error('Unexpected fixture path '+url.pathname);
 }
 async function send(path,body,{jar=cookies,headers={},config=env}={}){
  const response=await handleVercelApi(new Request(env.SITE_ORIGIN+path,{
   method:body===undefined?'GET':'POST',headers:{origin:env.SITE_ORIGIN,cookie:[...jar].map(([key,value])=>key+'='+value).join('; '),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }),config,{fetcher,siteHandler:async()=>Response.json(market)});
  for(const cookie of response.headers.getSetCookie()){
   const pair=cookie.split(';')[0],at=pair.indexOf('=');
   if(pair.slice(at+1))jar.set(pair.slice(0,at),pair.slice(at+1));
   else jar.delete(pair.slice(0,at));
  }
  return response;
 }
 return {send,cookies,calls,setMarket(value){market=value;}};
}

test('the verified email and second factor gate access, orders use server prices and deduplicate retries',async()=>{
 const {send,cookies,calls}=fixture();
 const session='/api/customer/session',orders='/api/customer/orders';
 assert.equal((await send(orders)).status,401);
 assert.equal((await send('/api/customer/email',{email:'person@example.test',mode:'register'},{headers:{origin:'https://foreign.example.test'}})).status,403);
 const start=await send('/api/customer/email',{email:'person@example.test',mode:'register'});
 assert.equal(start.status,200);
 assert.ok(start.headers.getSetCookie().some(value=>value.includes('HttpOnly; Secure; SameSite=Lax')));
 assert.equal(calls[0][1].create_user,true);
 assert.equal(calls[0][1].code_challenge_method,'s256');
 assert.equal((await send('/api/customer/callback?code=test-code',undefined,{jar:new Map()})).headers.get('location'),env.SITE_ORIGIN+'/?account=failed#trades');
 const callback=await send('/api/customer/callback?code=test-code');
 assert.equal(callback.headers.get('location'),env.SITE_ORIGIN+'/?account=verified#trades');
 assert.equal((await (await send(session)).json()).state,'enroll');
 assert.equal((await send(orders)).status,403);

 const enrollment=await (await send('/api/customer/mfa/enroll',{})).json();
 assert.match(enrollment.qr,/^data:image\/svg\+xml/);
 assert.equal((await send('/api/customer/mfa/verify',{code:'111111'})).status,401);
 assert.equal((await (await send('/api/customer/mfa/verify',{code:'123456'})).json()).state,'ready');
 const nextDevice=new Map(cookies);
 const initial=await (await send(orders)).json();
 assert.equal(initial.orders.account.balance,1000000);

 const buy={operation:'place',commandId,side:'buy',quantity:1,instrument:'BTC/JPY',leverage:300,price:1,balance:99000000};
 const first=await send(orders,buy);
 assert.equal(first.status,200);
 const traded=(await first.json()).orders;
 assert.equal(traded.positions.length,1);
 assert.ok(traded.positions[0].open.price>1000000);
 assert.equal(traded.account.balance,1000000);
 assert.equal((await (await send(orders,buy,{jar:nextDevice})).json()).duplicate,true);
 assert.deepEqual((await (await send(orders,undefined,{jar:nextDevice})).json()).orders,traded);
 const close={operation:'close',commandId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',id:commandId};
 const closed=(await (await send(orders,close,{jar:nextDevice})).json()).orders;
 assert.equal(closed.positions[0].close.reason,'manual');
 assert.ok(closed.account.balance<1000000);
 assert.equal((await send('/api/customer/logout',{})).status,200);
 assert.equal((await send(orders)).status,401);
});

test('customer signup is hidden until enabled and a fresh login does not request account creation',async()=>{
 const {send,calls}=fixture();
 const status=await send('/api/customer/session',undefined,{config:{...env,CUSTOMER_AUTH_ENABLED:undefined}});
 assert.deepEqual(await status.json(),{enabled:false,state:'guest'});
 assert.equal(calls.length,0);
 assert.equal((await send('/api/customer/email',{email:'person@example.test',mode:'login'})).status,200);
 assert.equal(calls[0][1].create_user,false);
});
