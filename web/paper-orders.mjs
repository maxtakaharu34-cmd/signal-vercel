import {quotePair} from './market-quotes.mjs';
import {createExecutionPriceReader,simulationTimestamp} from './timeline.mjs';

const POSITIONS = 'positions';
const PENDING = 'pending';
const MAX_REPLAY_STEPS = 7200;
export const ORDER_QUANTITY_MAX = 1000;
export const ORDER_LABELS = {buy:'買い', sell:'売り'};
export const ORDER_TYPES = {market:'成行',limit:'指値',stop:'逆指値'};

export function orderPrice(side, quote) {
 return side === 'buy' ? quote.ask : quote.bid;
}

export function closeSide(side) {
 return side === 'buy' ? 'sell' : 'buy';
}

export function positionProfit(position, exitPrice) {
 const entryTicks = Math.round(position.open.price * 1000);
 const exitTicks = Math.round(exitPrice * 1000);
 const ticks = (exitTicks - entryTicks) * position.quantity;
 return (position.side === 'buy' ? ticks : -ticks) / 1000 || 0;
}

export function validOrderQuantity(quantity) {
 return Number.isInteger(quantity) && quantity >= 1 && quantity <= ORDER_QUANTITY_MAX;
}

export function triggerReached(side,type,target,price) {
 const below = (side === 'buy') === (type === 'limit');
 return below ? price <= target : price >= target;
}

export function validOrderTrigger(side,type,target,quote) {
 const ticks = Math.round(target*1000);
 return Object.hasOwn(ORDER_LABELS,side) && (type==='limit'||type==='stop') &&
  Number.isSafeInteger(ticks) && ticks>0 && ticks/1000===target &&
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
  const price = orderPrice(order.side,quotePair(close));
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
    const request = window.indexedDB.open('fx-demo-orders', 2);
    request.onupgradeneeded = event => {
     if (event.oldVersion < 1) request.result.createObjectStore(POSITIONS, {keyPath:'id'});
     request.result.createObjectStore(PENDING, {keyPath:'id'});
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
  read:() => transaction([POSITIONS,PENDING], 'readonly', (tx, complete) => {
   const positions = tx.objectStore(POSITIONS).getAll();
   const pending = tx.objectStore(PENDING).getAll();
   pending.onsuccess = () => complete({positions:positions.result,pending:pending.result});
  }),
  place:({side, quantity, price, time}) => transaction(POSITIONS, 'readwrite', (tx, complete, abort) => {
   if (!Object.hasOwn(ORDER_LABELS, side) || !validOrderQuantity(quantity) || !Number.isFinite(price) || price <= 0) {
    abort(Error('注文内容を確認してください。'));
    return;
   }
   const position = {id:window.crypto.randomUUID(), side, quantity, open:{price,time}, close:null};
   tx.objectStore(POSITIONS).add(position);
   complete(position);
  }),
  close:(id, quote, time) => transaction(POSITIONS, 'readwrite', (tx, complete, abort) => {
   const table=tx.objectStore(POSITIONS);
   const request = table.get(id);
   request.onsuccess = () => {
    const position = request.result;
    if (!position || position.close) {
     abort(Error('この建玉はすでに決済されています。'));
     return;
    }
    position.close = {price:orderPrice(closeSide(position.side), quote), time};
    table.put(position);
    complete(position);
   };
  }),
  placePending:({side,quantity,type,target,cursor,time}) => transaction(PENDING,'readwrite',(tx,complete,abort)=>{
   if(!validOrderQuantity(quantity)||!validOrderTrigger(side,type,target,quotePair(cursor.close))){
    abort(Error('指定レートと数量を確認してください。'));
    return;
   }
   const order={id:window.crypto.randomUUID(),side,quantity,type,target,cursor,time,status:'pending'};
   tx.objectStore(PENDING).add(order);
   complete(order);
  }),
  cancel:(id) => transaction(PENDING,'readwrite',(tx,_complete,abort)=>{
   const table=tx.objectStore(PENDING),request=table.get(id);
   request.onsuccess=()=>{
    if(!request.result){abort(Error('すでに約定または取消されています。'));return;}
    table.delete(id);
   };
  }),
  amend:(id,{target,cursor}) => transaction(PENDING,'readwrite',(tx,_complete,abort)=>{
   const table=tx.objectStore(PENDING),request=table.get(id);
   request.onsuccess=()=>{
    const order=request.result;
    if(!order||order.status!=='pending'){
     abort(Error('変更できる未約定注文がありません。取引画面で状態を確認してください。'));
     return;
    }
    if(!validOrderTrigger(order.side,order.type,target,quotePair(cursor.close))){
     abort(Error('指定レートを確認してください。'));
     return;
    }
    // The order may have been checked in another tab after this quote was read.
    if(order.cursor.time>cursor.time||order.cursor.version>cursor.version){abort(Error('価格が更新されました。レートを確認してください。'));return;}
    table.put({...order,target,cursor});
   };
  }),
  match:({checkpoint,version},time) => transaction([POSITIONS,PENDING],'readwrite',(tx,complete)=>{
   const pending=tx.objectStore(PENDING),positions=tx.objectStore(POSITIONS),request=pending.getAll();
   request.onsuccess=()=>{
    const reader={...createExecutionPriceReader(checkpoint),version};
    let filled=0,review=0;
    for(const order of request.result){
     if(order.status!=='pending')continue;
     const outcome=matchPendingOrder(order,reader);
     if(outcome.status==='filled'){
      const {id,side,quantity,type,target}=order;
      const quotedAt=Date.parse(simulationTimestamp(checkpoint,outcome.step));
      const executionTime=Number.isFinite(quotedAt)?Math.max(order.time,Math.min(time,quotedAt)):time;
      positions.add({id,side,quantity,type,target,open:{price:outcome.price,time:executionTime},close:null});
      pending.delete(id);
      filled++;
     }else if(outcome.status==='review'){
      pending.put({...order,status:'review'});
      review++;
     }else if(outcome.cursor.time!==order.cursor.time||outcome.cursor.version!==order.cursor.version){
      pending.put({...order,cursor:outcome.cursor});
     }
    }
    complete({filled,review});
   };
  }),
 };
}
