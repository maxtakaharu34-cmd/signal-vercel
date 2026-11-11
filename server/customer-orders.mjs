import {input,json} from './auth-session.mjs';
import {applyDemoOrder,newDemoOrders} from '../web/demo-order-engine.mjs';
import {validateScene} from '../web/engine.mjs';

const commands=new Set(['match','place','placePending','close','amend','cancel']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasChanges=changes=>changes.account||changes.positions.size||changes.pending.size;
const denied=message=>json({message},409);

async function database(env,access,fetcher,operation,commandId,payload={}){
 const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/customer_order_transaction',{
  method:'POST',
  headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+access,'content-type':'application/json'},
  body:JSON.stringify({bridge_token:env.DEMO_BRIDGE_SECRET,operation,command_id:commandId,payload}),
  signal:AbortSignal.timeout(12000),
 });
 const data=await response.json();
 if(!response.ok)throw Object.assign(Error('仮想口座との接続を確認してください。'),{status:response.status===409?409:502});
 return data;
}

function batch(snapshot,scene,changes){
 const payload={version:snapshot.version,scene_version:scene.version,positions:[...changes.positions.values()],pending:[],removed_pending:[]};
 for(const [id,value] of changes.pending){
  if(value)payload.pending.push(value);
  else payload.removed_pending.push(id);
 }
 if(changes.account)payload.account=snapshot.account;
 return payload;
}
function applyChanges(snapshot,changes){
 for(const [key,edits] of [['positions',changes.positions],['pending',changes.pending]]){
  const rows=new Map(snapshot[key].map(item=>[item.id,item]));
  for(const [id,record] of edits)if(record)rows.set(id,record);else rows.delete(id);
  snapshot[key]=[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id));
 }
}
function orderState(snapshot){
 return {version:snapshot.version,account:snapshot.account??newDemoOrders().account,positions:snapshot.positions,pending:snapshot.pending};
}

export async function customerOrders(request,env,access,{fetcher,siteHandler}){
 const db=(operation,commandId,payload)=>database(env,access,fetcher,operation,commandId,payload);
 if(request.method==='GET')return json({orders:orderState(await db('read',null))});
 const body=await input(request),operation=body?.operation;
 const commandId=operation==='match'?null:body?.commandId;
 if(!commands.has(operation)||(operation!=='match'&&!uuid.test(commandId??''))||
  (['close','amend','cancel'].includes(operation)&&!uuid.test(body?.id??''))){
  return json({message:'注文内容を確認してください。'},400);
 }

 for(let attempt=0;attempt<3;attempt++){
  const publicRequest=new Request(env.SITE_ORIGIN+'/api/scene');
  const [record,sceneResponse]=await Promise.all([db('read',commandId),siteHandler(publicRequest,env,null)]);
  if(record.duplicate)return json({orders:orderState(record),outcome:null,duplicate:true});
  if(!sceneResponse.ok)return json({message:'デモレートを取得できませんでした。'},503);
  const scene=await sceneResponse.json();
  if(!validateScene(scene)||!Number.isSafeInteger(scene.version))return json({message:'デモレートを確認できませんでした。'},503);

  const snapshot=orderState(record),time=Date.now();
  const hasExposure=snapshot.positions.some(position=>!position.close)||snapshot.pending.some(order=>order.status==='pending');
  if(operation==='match'&&!hasExposure)return json({orders:snapshot,outcome:null});

  const {changes,outcome,error}=calculate(snapshot,operation,body,scene,time,hasExposure);
  if(!hasChanges(changes)&&!commandId)return json({orders:snapshot,outcome});
  if(error&&!hasChanges(changes))return denied(error);
  try{
   const saved=await db('save',error?null:commandId,batch(snapshot,scene,changes));
   if(error)return denied(error);
   return json({orders:orderState(saved),outcome:saved.duplicate?null:outcome,duplicate:saved.duplicate});
  }catch(error){
   if(error.status!==409)throw error;
  }
 }
 return denied('口座または価格が更新されました。もう一度確認してください。');
}

function calculate(snapshot,operation,body,scene,time,hasExposure){
 const changes={account:false,positions:new Map(),pending:new Map()};
 let outcome=null,error=null;
 const merge=edits=>{
  changes.account ||= edits.account;
  for(const [id,row] of edits.positions)changes.positions.set(id,row);
  for(const [id,row] of edits.pending)changes.pending.set(id,row);
  applyChanges(snapshot,edits);
 };
 if(hasExposure){
  const matched=applyDemoOrder(snapshot,'match',{}, {scene,time});
  outcome=matched.result;
  merge(matched.changes);
 }
 if(operation==='match')return {changes,outcome};
 try{
  if((operation==='place'||operation==='placePending')&&snapshot.positions.filter(position=>!position.close).length+snapshot.pending.length>=100){
   throw Error('保有建玉と未約定注文の上限は合計100件です。');
  }
  // A failed order can never affect the committed post-match account.
  const next={...snapshot,account:{...snapshot.account}};
  const {changes:orderChanges}=applyDemoOrder(next,operation,body,{scene,time,uuid:()=>body.commandId});
  snapshot.account=next.account;
  merge(orderChanges);
 }catch(failure){error=failure.message;}
 return {changes,outcome,error};
}
