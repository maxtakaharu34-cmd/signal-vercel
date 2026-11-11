import {applyDemoOrder,newDemoOrders} from './demo-order-engine.mjs';
export {closeSide,orderPrice,positionProfit,validOrderQuantity,validOrderTrigger,matchPendingOrder,ORDER_LABELS,ORDER_TYPES,ORDER_QUANTITY_MAX} from './demo-order-engine.mjs';

const POSITIONS='positions',PENDING='pending',ACCOUNTS='accounts';
const ACCOUNT_STORES=[POSITIONS,PENDING,ACCOUNTS];

function readAccount(tx,read){
 const positions=tx.objectStore(POSITIONS).getAll();
 const pending=tx.objectStore(PENDING).getAll();
 const account=tx.objectStore(ACCOUNTS).get('demo');
 account.onsuccess=()=>read({
  positions:positions.result,pending:pending.result,
  account:account.result??newDemoOrders().account,
 });
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
   tx.onabort = () => reject(failure ?? tx.error ?? Error('仮想注文を保存できませんでした。'));
   operation(tx, complete, abort);
  });
 }

 function change(operation,input,scene,time){
  return transaction(ACCOUNT_STORES,'readwrite',(tx,complete,abort)=>{
   readAccount(tx,state=>{
    try{
     const {changes,result}=applyDemoOrder(state,operation,input,{scene,time,uuid:()=>window.crypto.randomUUID()});
     for(const [key,edits] of [[POSITIONS,changes.positions],[PENDING,changes.pending]]){
      const table=tx.objectStore(key);
      for(const [id,value] of edits)if(value)table.put(value);else table.delete(id);
     }
     if(changes.account)tx.objectStore(ACCOUNTS).put(state.account);
     complete(result);
    }catch(error){abort(error);}
   });
  });
 }

 return {
  read:()=>transaction(ACCOUNT_STORES,'readonly',readAccount),
  place:input=>change('place',input,input.scene,input.time),
  placePending:input=>change('placePending',input,input.scene,input.time),
  close:(id,_quote,time,scene)=>change('close',{id},scene,time),
  amend:(id,input)=>change('amend',{id,target:input.target},input.scene),
  cancel:id=>change('cancel',{id}),
  match:(scene,time)=>change('match',{},scene,time),
 };
}
