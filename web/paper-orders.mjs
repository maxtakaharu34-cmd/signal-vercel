const TABLE = 'positions';
export const ORDER_QUANTITY_MAX = 1000;
export const ORDER_LABELS = {buy:'買い', sell:'売り'};

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

// IndexedDB keeps the read/check/write of a close in one transaction. Two tabs
// closing the same position therefore cannot create a duplicate execution.
export function createPaperOrderStore(window) {
 let connection;
 function open() {
  if (!connection) {
   connection = new Promise((resolve, reject) => {
    const request = window.indexedDB.open('fx-demo-orders', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TABLE, {keyPath:'id'});
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

 async function transaction(mode, operation) {
  const database = await open();
  return new Promise((resolve, reject) => {
   const tx = database.transaction(TABLE, mode);
   const table = tx.objectStore(TABLE);
   let result, failure;
   const complete = value => {result = value;};
   const abort = error => {failure = error;tx.abort();};
   tx.oncomplete = () => resolve(result);
   tx.onabort = () => reject(failure ?? tx.error ?? Error('デモ注文を保存できませんでした。'));
   operation(table, complete, abort);
  });
 }

 return {
  read:() => transaction('readonly', (table, complete) => {
   const request = table.getAll();
   request.onsuccess = () => complete(request.result);
  }),
  place:({side, quantity, price, time}) => transaction('readwrite', (table, complete, abort) => {
   if (!Object.hasOwn(ORDER_LABELS, side) || !validOrderQuantity(quantity) || !Number.isFinite(price) || price <= 0) {
    abort(Error('注文内容を確認してください。'));
    return;
   }
   const position = {id:window.crypto.randomUUID(), side, quantity, open:{price,time}, close:null};
   table.add(position);
   complete(position);
  }),
  close:(id, quote, time) => transaction('readwrite', (table, complete, abort) => {
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
 };
}
