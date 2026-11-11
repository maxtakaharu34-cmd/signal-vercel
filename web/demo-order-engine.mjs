import {quotePair} from './market-quotes.mjs';
import {createExecutionPriceReader,simulationTimestamp} from './timeline.mjs';
import {DEFAULT_INSTRUMENT,instrumentInfo,instrumentPrice} from './instruments.mjs';
import {DEMO_START_BALANCE,DEMO_LEVERAGES,LIQUIDATION_RATIO,isManaged,marginFor,accountProfit,accountMarket,accountSnapshot} from './demo-account.mjs';

const MAX_REPLAY_STEPS = 7200;
export const ORDER_QUANTITY_MAX = 1000;
export const ORDER_LABELS = {buy:'買い', sell:'売り'};
export const ORDER_TYPES = {market:'成行',limit:'指値',stop:'逆指値'};

function sceneRow(scene){return scene.checkpoint.rows.at(-1);}
function cursorFor(scene){return {version:scene.version,time:sceneRow(scene).time,close:sceneRow(scene).close};}
function isOlder(scene,cursor){
 return !!cursor&&(scene.version<cursor.version||scene.version===cursor.version&&sceneRow(scene).time<cursor.time);
}

export function newDemoOrders(){
 return {positions:[],pending:[],account:{id:'demo',balance:DEMO_START_BALANCE,cursor:null}};
}

function settlePosition(position,price,row,time,account,reason){
 const profit=accountProfit(position,price,row.time);
 position.close={price,time,profit,reason};
 account.balance+=profit;
}

function fillTime(checkpoint,step,time,placedAt){
 const quotedAt=Date.parse(simulationTimestamp(checkpoint,step));
 return Number.isFinite(quotedAt)?Math.max(placedAt,Math.min(time,quotedAt)):time;
}

export function orderPrice(side, quote) {
 return side === 'buy' ? quote.ask : quote.bid;
}

export function closeSide(side) {
 return side === 'buy' ? 'sell' : 'buy';
}

export function positionProfit(position, exitPrice) {
 const scale=10**instrumentInfo(position.instrument).digits;
 const entryTicks = Math.round(position.open.price * scale);
 const exitTicks = Math.round(exitPrice * scale);
 const ticks = (exitTicks - entryTicks) * position.quantity;
 return (position.side === 'buy' ? ticks : -ticks) / scale || 0;
}

export function validOrderQuantity(quantity) {
 return Number.isInteger(quantity) && quantity >= 1 && quantity <= ORDER_QUANTITY_MAX;
}

export function triggerReached(side,type,target,price) {
 const below = (side === 'buy') === (type === 'limit');
 return below ? price <= target : price >= target;
}

export function validOrderTrigger(side,type,target,quote,instrument) {
 const scale=10**instrumentInfo(instrument).digits;
 const ticks = Math.round(target*scale);
 return Object.hasOwn(ORDER_LABELS,side) && (type==='limit'||type==='stop') &&
  Number.isSafeInteger(ticks) && ticks>0 && ticks/scale===target &&
  !triggerReached(side,type,target,orderPrice(side,quote));
}

export function matchPendingOrder(order,reader) {
 const {last,first,closeAt,version} = reader;
 const cursorVersion=order.cursor.version;
 if(Number.isSafeInteger(version)&&Number.isSafeInteger(cursorVersion)&&
    (version<cursorVersion || version===cursorVersion&&last<order.cursor.time)){
  return {status:'pending',cursor:order.cursor};
 }
 const previous = closeAt(order.cursor.time);
 if (last < order.cursor.time || first > order.cursor.time+1 || last-order.cursor.time > MAX_REPLAY_STEPS ||
     (previous !== null && Math.abs(previous-order.cursor.close)>1e-9)) return {status:'review'};
 for (let step=order.cursor.time+1;step<=last;step++) {
  const close = closeAt(step);
  if (close === null) return {status:'review'};
  const instrument=order.instrument??DEFAULT_INSTRUMENT;
  const price = orderPrice(order.side,quotePair(instrumentPrice(instrument,step,close),instrument));
  if (triggerReached(order.side,order.type,order.target,price)) return {status:'filled',price,step};
 }
 const cursor={time:last,close:closeAt(last)};
 if(Number.isSafeInteger(version))cursor.version=version;
 return {status:'pending',cursor};
}

const changed=()=>({positions:new Map(),pending:new Map(),account:false});
const stale=()=>Error('価格が更新されました。レートを確認してください。');
const insufficient=()=>Error('余力が不足しています。数量またはレバレッジを確認してください。');

// The transaction owns its snapshot. Both storage adapters persist the same edits.
export function applyDemoOrder(state,operation,input={}, {scene,time,uuid=()=>crypto.randomUUID()}={}){
 const changes=changed();
 const {positions,pending,account}=state;
 let result;
 if(operation==='match'){
  result=matchOrders(state,scene,time,changes);
 }else if(operation==='cancel'){
  if(!pending.some(order=>order.id===input.id))throw Error('すでに約定または取消されています。');
  changes.pending.set(input.id,null);
 }else{
  const row=sceneRow(scene),cursor=cursorFor(scene);
  if(isOlder(scene,account.cursor))throw stale();
  const quotes=accountMarket(row);
  const available=()=>accountSnapshot(account.balance,positions,pending,row).available;
  if(operation==='close'){
   const position=positions.find(item=>item.id===input.id&&!item.close);
   if(!position)throw Error('この建玉はすでに決済されています。');
   const price=orderPrice(closeSide(position.side),quotes(position.instrument??DEFAULT_INSTRUMENT));
   if(isManaged(position)){
    settlePosition(position,price,row,time,account,'manual');
    if(!positions.some(item=>!item.close&&isManaged(item)))account.balance=Math.max(0,account.balance);
    account.cursor=cursor;
    changes.account=true;
   }else position.close={price,time};
   changes.positions.set(position.id,position);
   result=position;
  }else if(operation==='amend'){
   const order=pending.find(item=>item.id===input.id&&item.status==='pending');
   if(!order)throw Error('変更できる未約定注文がありません。取引画面で状態を確認してください。');
   const instrument=order.instrument??DEFAULT_INSTRUMENT;
   if(!validOrderTrigger(order.side,order.type,input.target,quotes(instrument),instrument))throw Error('指定レートを確認してください。');
   if(isOlder(scene,order.cursor))throw stale();
   const next={...order,target:input.target,cursor};
   if(isManaged(order)){
    next.margin=marginFor(order,next.target,row.time);
    if(next.margin>available()+order.margin)throw insufficient();
   }
   changes.pending.set(order.id,next);
  }else if(operation==='place'||operation==='placePending'){
   const {side,quantity,instrument=DEFAULT_INSTRUMENT,leverage,type,target}=input;
   if(!Object.hasOwn(ORDER_LABELS,side)||!validOrderQuantity(quantity)||!DEMO_LEVERAGES.includes(leverage)||instrumentInfo(instrument).id!==instrument){
    throw Error('注文内容を確認してください。');
   }
   const quote=quotes(instrument),price=orderPrice(side,quote);
   const order={id:uuid(),side,quantity,instrument,leverage};
   if(operation==='placePending'){
    if(!validOrderTrigger(side,type,target,quote,instrument))throw Error('指定レートと数量を確認してください。');
    Object.assign(order,{type,target,cursor,time,status:'pending',margin:marginFor(order,target,row.time)});
    changes.pending.set(order.id,order);
   }else{
    Object.assign(order,{open:{price,time},close:null,margin:marginFor(order,price,row.time)});
    changes.positions.set(order.id,order);
    account.cursor=cursor;
    changes.account=true;
   }
   if(order.margin>available())throw insufficient();
   result=order;
  }else throw Error('注文操作を確認してください。');
 }
 return {changes,result};
}

function matchOrders({positions,pending,account},scene,time,changes){
 const checkpoint=scene.checkpoint;
 let filled=0,review=0,liquidated=0;
 const result=()=>({filled,review,liquidated});
 if(isOlder(scene,account.cursor))return result();
 const reader={...createExecutionPriceReader(checkpoint),version:scene.version};
 const managed=positions.filter(position=>!position.close&&isManaged(position));
 const schedule=new Map();

 function fill(order,price,step,row){
  const {id,side,quantity,type,target,instrument=DEFAULT_INSTRUMENT}=order;
  const position={id,side,quantity,type,target,instrument,open:{price,time:fillTime(checkpoint,step,time,order.time)},close:null};
  if(isManaged(order)){
   position.leverage=order.leverage;
   position.margin=marginFor(order,price,step);
   const available=accountSnapshot(account.balance,managed,pending,row).available+order.margin;
   if(position.margin>available){
    order.status='funds';
    changes.pending.set(order.id,order);
    review++;
    return;
   }
   managed.push(position);
  }
  order.status='filled';
  changes.pending.set(id,null);
  positions.push(position);
  changes.positions.set(id,position);
  filled++;
 }

 for(const order of pending){
  if(order.status!=='pending')continue;
  const outcome=matchPendingOrder(order,reader);
  if(outcome.status==='filled'){
   if(!isManaged(order)){fill(order,outcome.price,outcome.step,null);continue;}
   if(!schedule.has(outcome.step))schedule.set(outcome.step,[]);
   schedule.get(outcome.step).push({order,price:outcome.price});
  }else if(outcome.status==='review'){
   order.status='review';changes.pending.set(order.id,order);review++;
  }else if(outcome.cursor.time!==order.cursor.time||outcome.cursor.version!==order.cursor.version){
   order.cursor=outcome.cursor;changes.pending.set(order.id,order);
  }
 }

 function enforceMaintenance(row){
  const risk=accountSnapshot(account.balance,managed,pending,row);
  if(risk.ratio===null||risk.ratio>LIQUIDATION_RATIO)return;
  const quotes=accountMarket(row);
  for(const position of managed){
   if(position.close)continue;
   const price=orderPrice(closeSide(position.side),quotes(position.instrument));
   settlePosition(position,price,row,fillTime(checkpoint,row.time,time,position.open.time),account,'liquidation');
   changes.positions.set(position.id,position);
   liquidated++;
  }
  for(const order of pending){
   if(order.status==='pending'&&isManaged(order)){
    order.status='liquidation';
    changes.pending.set(order.id,order);
   }
  }
  account.balance=Math.max(0,account.balance);
 }

 const previous=account.cursor,priorClose=previous&&reader.closeAt(previous.time);
 const continuous=previous&&previous.time<=reader.last&&reader.first<=previous.time+1&&
   reader.last-previous.time<=MAX_REPLAY_STEPS&&(priorClose===null||Math.abs(priorClose-previous.close)<=1e-9);
 const first=continuous?Math.min(reader.last,previous.time+1):reader.last;
 const start=Math.min(first,...schedule.keys());
 if(managed.length||schedule.size){
  for(let step=start;step<=reader.last;step++){
   const close=reader.closeAt(step);
   if(close===null)continue;
   const row={time:step,close};
   if(step>=first)enforceMaintenance(row);
   for(const {order,price} of schedule.get(step)??[]){
    if(order.status==='pending')fill(order,price,step,row);
   }
   if(schedule.has(step))enforceMaintenance(row);
  }
 }
 const cursor=cursorFor(scene);
 if(liquidated||account.cursor?.time!==cursor.time||account.cursor?.version!==cursor.version||account.cursor?.close!==cursor.close){
  account.cursor=cursor;
  changes.account=true;
 }
 return result();
}
