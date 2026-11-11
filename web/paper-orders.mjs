import {quotePair} from './market-quotes.mjs';
import {createExecutionPriceReader,simulationTimestamp} from './timeline.mjs';
import {DEFAULT_INSTRUMENT,instrumentInfo,instrumentPrice} from './instruments.mjs';
import {DEMO_START_BALANCE,DEMO_LEVERAGES,LIQUIDATION_RATIO,isManaged,marginFor,accountProfit,accountMarket,accountSnapshot} from './demo-account.mjs';

const POSITIONS = 'positions';
const PENDING = 'pending';
const ACCOUNTS = 'accounts';
const ACCOUNT_STORES=[POSITIONS,PENDING,ACCOUNTS];
const MAX_REPLAY_STEPS = 7200;
export const ORDER_QUANTITY_MAX = 1000;
export const ORDER_LABELS = {buy:'買い', sell:'売り'};
export const ORDER_TYPES = {market:'成行',limit:'指値',stop:'逆指値'};

function sceneRow(scene){return scene.checkpoint.rows.at(-1);}
function cursorFor(scene){return {version:scene.version,time:sceneRow(scene).time,close:sceneRow(scene).close};}
function isOlder(scene,cursor){
 return !!cursor&&(scene.version<cursor.version||scene.version===cursor.version&&sceneRow(scene).time<cursor.time);
}

function readAccount(tx,read){
 const positions=tx.objectStore(POSITIONS).getAll();
 const pending=tx.objectStore(PENDING).getAll();
 const account=tx.objectStore(ACCOUNTS).get('demo');
 account.onsuccess=()=>read({
  positions:positions.result,pending:pending.result,
  account:account.result??{id:'demo',balance:DEMO_START_BALANCE,cursor:null},
 });
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

// IndexedDB keeps the read/check/write of a close in one transaction. Two tabs
// closing the same position therefore cannot create a duplicate execution.
export function createPaperOrderStore(window) {
 let connection;
 function open() {
  if (!connection) {
   connection = new Promise((resolve, reject) => {
    const request = window.indexedDB.open('fx-demo-orders', 3);
    request.onupgradeneeded = event => {
     if (event.oldVersion < 1) request.result.createObjectStore(POSITIONS, {keyPath:'id'});
     if (event.oldVersion < 2) request.result.createObjectStore(PENDING, {keyPath:'id'});
     request.result.createObjectStore(ACCOUNTS,{keyPath:'id'});
    };
    request.onsuccess = () => {
     const database = request.result;
     database.onversionchange = () => {database.close();connection = null;};
     resolve(database);
    };
    request.onerror = () => reject(request.error);
   }).catch(error => {connection = null;throw error;});
  }
  return connection;
 }

 async function transaction(tables, mode, operation) {
  const database = await open();
  return new Promise((resolve, reject) => {
   const tx = database.transaction(tables, mode);
   let result, failure;
   const complete = value => {result = value;};
   const abort = error => {failure = error;tx.abort();};
   tx.oncomplete = () => resolve(result);
   tx.onabort = () => reject(failure ?? tx.error ?? Error('デモ注文を保存できませんでした。'));
   operation(tx, complete, abort);
  });
 }

 return {
  read:() => transaction(ACCOUNT_STORES, 'readonly', readAccount),
  place:({side, quantity, price, time, instrument=DEFAULT_INSTRUMENT, leverage, scene}) => transaction(ACCOUNT_STORES, 'readwrite', (tx, complete, abort) => {
   if (!Object.hasOwn(ORDER_LABELS, side) || !validOrderQuantity(quantity) || !Number.isFinite(price) || price <= 0) {
    abort(Error('注文内容を確認してください。'));
    return;
   }
   readAccount(tx,({positions,pending,account})=>{
    if(!DEMO_LEVERAGES.includes(leverage)||isOlder(scene,account.cursor)){abort(Error('価格が更新されました。レートを確認してください。'));return;}
    const row=sceneRow(scene);
    const position={id:window.crypto.randomUUID(),side,quantity,instrument,leverage,open:{price,time},close:null};
    position.margin=marginFor(position,price,row.time);
    if(position.margin>accountSnapshot(account.balance,positions,pending,row).available){abort(Error('余力が不足しています。数量またはレバレッジを確認してください。'));return;}
    tx.objectStore(POSITIONS).add(position);
    tx.objectStore(ACCOUNTS).put({...account,cursor:cursorFor(scene)});
    complete(position);
   });
  }),
  close:(id, quote, time,scene) => transaction(ACCOUNT_STORES, 'readwrite', (tx, complete, abort) => {
   const table=tx.objectStore(POSITIONS);
   readAccount(tx,({positions,account})=>{
    const position=positions.find(position=>position.id===id);
    if (!position || position.close) {
     abort(Error('この建玉はすでに決済されています。'));
     return;
    }
    const price=orderPrice(closeSide(position.side),quote);
    if(isManaged(position)){
     if(isOlder(scene,account.cursor)){abort(Error('価格が更新されました。レートを確認してください。'));return;}
     settlePosition(position,price,sceneRow(scene),time,account,'manual');
     if(!positions.some(item=>!item.close&&isManaged(item)))account.balance=Math.max(0,account.balance);
     tx.objectStore(ACCOUNTS).put({...account,cursor:cursorFor(scene)});
    }else position.close={price,time};
    table.put(position);
    complete(position);
   });
  }),
  placePending:({side,quantity,type,target,cursor,time,instrument=DEFAULT_INSTRUMENT,leverage,scene}) => transaction(ACCOUNT_STORES,'readwrite',(tx,complete,abort)=>{
   const quote=quotePair(instrumentPrice(instrument,cursor.time,cursor.close),instrument);
   if(!validOrderQuantity(quantity)||!validOrderTrigger(side,type,target,quote,instrument)){
    abort(Error('指定レートと数量を確認してください。'));
    return;
   }
   readAccount(tx,({positions,pending,account})=>{
    if(!DEMO_LEVERAGES.includes(leverage)||isOlder(scene,account.cursor)){abort(Error('価格が更新されました。レートを確認してください。'));return;}
    const order={id:window.crypto.randomUUID(),side,quantity,type,target,cursor,time,instrument,leverage,status:'pending'};
    order.margin=marginFor(order,target,cursor.time);
    if(order.margin>accountSnapshot(account.balance,positions,pending,sceneRow(scene)).available){abort(Error('余力が不足しています。数量またはレバレッジを確認してください。'));return;}
    tx.objectStore(PENDING).add(order);
    complete(order);
   });
  }),
  cancel:(id) => transaction(PENDING,'readwrite',(tx,_complete,abort)=>{
   const table=tx.objectStore(PENDING),request=table.get(id);
   request.onsuccess=()=>{
    if(!request.result){abort(Error('すでに約定または取消されています。'));return;}
    table.delete(id);
   };
  }),
  amend:(id,{target,cursor,scene}) => transaction(ACCOUNT_STORES,'readwrite',(tx,_complete,abort)=>{
   const table=tx.objectStore(PENDING);
   readAccount(tx,({positions,pending,account})=>{
    const order=pending.find(order=>order.id===id);
    if(!order||order.status!=='pending'){
     abort(Error('変更できる未約定注文がありません。取引画面で状態を確認してください。'));
     return;
    }
    const instrument=order.instrument??DEFAULT_INSTRUMENT;
    const quote=quotePair(instrumentPrice(instrument,cursor.time,cursor.close),instrument);
    if(!validOrderTrigger(order.side,order.type,target,quote,instrument)){
     abort(Error('指定レートを確認してください。'));
     return;
    }
    // The order may have been checked in another tab after this quote was read.
    if(order.cursor.time>cursor.time||order.cursor.version>cursor.version){abort(Error('価格が更新されました。レートを確認してください。'));return;}
    const next={...order,target,cursor};
    if(isManaged(order)){
     if(isOlder(scene,account.cursor)){abort(Error('価格が更新されました。レートを確認してください。'));return;}
     next.margin=marginFor(order,target,cursor.time);
     const funds=accountSnapshot(account.balance,positions,pending,sceneRow(scene)).available+order.margin;
     if(next.margin>funds){abort(Error('余力が不足しています。数量またはレバレッジを確認してください。'));return;}
    }
    table.put(next);
   });
  }),
  match:(scene,time) => transaction(ACCOUNT_STORES,'readwrite',(tx,complete)=>{
   const checkpoint=scene.checkpoint;
   readAccount(tx,({positions,pending,account})=>{
    let filled=0,review=0,liquidated=0;
    const result=()=>({filled,review,liquidated});
    if(isOlder(scene,account.cursor)){complete(result());return;}
    const pendingTable=tx.objectStore(PENDING),positionTable=tx.objectStore(POSITIONS);
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
       pendingTable.put(order);
       review++;
       return;
      }
      managed.push(position);
     }
     order.status='filled';
     pendingTable.delete(id);
     positionTable.add(position);
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
      order.status='review';pendingTable.put(order);review++;
     }else if(outcome.cursor.time!==order.cursor.time||outcome.cursor.version!==order.cursor.version){
      order.cursor=outcome.cursor;pendingTable.put(order);
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
      positionTable.put(position);
      liquidated++;
     }
     for(const order of pending){
      if(order.status==='pending'&&isManaged(order)){
       order.status='liquidation';
       pendingTable.put(order);
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
     tx.objectStore(ACCOUNTS).put({...account,cursor});
    }
    complete(result());
   });
  }),
 };
}
