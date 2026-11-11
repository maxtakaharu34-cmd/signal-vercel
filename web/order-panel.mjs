import {createPaperOrderStore,closeSide,orderPrice,positionProfit,validOrderTrigger,ORDER_LABELS,ORDER_TYPES} from './paper-orders.mjs';

const number = new Intl.NumberFormat('ja-JP', {minimumFractionDigits:3,maximumFractionDigits:3});
const signed = new Intl.NumberFormat('ja-JP', {minimumFractionDigits:3,maximumFractionDigits:3,signDisplay:'exceptZero'});
const clock = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

export function mountOrderPanel({document,window,getQuote,getScene,showTrades,notify}) {
 const $ = id => document.getElementById(id);
 const dialog = $('orderDialog');
 const form = $('orderForm');
 const quantity = $('orderQuantity');
 const orderType = $('orderType');
 const target = $('orderTarget');
 const submit = $('orderSubmit');
 const store = createPaperOrderStore(window);
 const triggers = document.querySelectorAll('[data-order-side]');
 let action = null, busy = false, readId = 0, destroyed = false;
 let marks = [];
 let hasPending = false, matching = false, lastMatched = null;
 const channel = typeof window.BroadcastChannel === 'function' ? new window.BroadcastChannel('fx-demo-order-updates') : null;

 function matchLatest() {
  const scene = getScene();
  if (!scene || !getQuote() || !hasPending || matching || lastMatched === scene || destroyed) return;
  lastMatched = scene;
  matching = true;
  void store.match(scene.checkpoint,Date.now()).then(async outcome=>{
   if (destroyed || (!outcome.filled && !outcome.review)) return;
   if (outcome.filled) notify(outcome.filled+'件のデモ注文が約定しました。');
   channel?.postMessage('changed');
   await refresh();
  }).catch(()=>{
   if (destroyed) return;
   set('ordersStatus','注文の照合に失敗しました。次の価格更新で再試行します。');
   $('ordersStatus').hidden = false;
  }).finally(()=>{matching=false;matchLatest();});
 }

 function set(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
 }

 function element(tag, text, className='') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
 }

 function updateQuote() {
  const quote = getQuote();
  matchLatest();
  for (const trigger of triggers) trigger.disabled = !quote;
  for (const {position, value, button} of marks) {
   button.disabled = !quote;
   const profit = quote ? positionProfit(position, orderPrice(closeSide(position.side), quote)) : null;
   value.textContent = profit === null ? '—' : signed.format(profit) + ' pt';
   value.dataset.profit = profit > 0 ? 'up' : profit < 0 ? 'down' : 'neutral';
  }
  if (!action || !dialog.open) return;
  const price = quote ? orderPrice(action.side, quote) : null;
  set('orderRate', price === null ? '—' : number.format(price));
  if (action.position) {
   set('orderProfit', price === null ? '—' : signed.format(positionProfit(action.position, price)) + ' pt');
  }
  $('orderNoQuote').hidden = !!quote;
  submit.disabled = busy || !quote;
 }

 function updateOrderType() {
  const type=orderType.value;
  const conditional=!!action && !action.position && type!=='market';
  $('orderTargetRow').hidden=!conditional;
  target.disabled=!conditional;
  target.required=conditional;
  if(conditional){
   const below=(action.side==='buy')===(type==='limit');
   set('orderTargetHelp','現在の'+(action.side==='buy'?'買値':'売値')+'より'+(below?'低い':'高い')+'レートを指定');
  }
  set('orderNote',conditional?'条件を満たした仮想レートで約定します。このブラウザーの価格同期時に照合します。':'注文を確定した時点の仮想レートで約定し、このブラウザーに記録します。');
  $('orderError').hidden=true;
 }

 function open(side, position=null) {
  if (!getQuote() || dialog.open) return;
  action = {side, position};
  $('orderDialogTitle').textContent = position ? 'デモ決済' : 'デモ注文';
  $('orderDirection').textContent = ORDER_LABELS[side];
  $('orderDirection').dataset.side = side;
  $('orderRateType').textContent = side === 'buy' ? '買値（Ask）' : '売値（Bid）';
  $('orderProfitRow').hidden = !position;
  $('orderTypeRow').hidden = !!position;
  $('orderCloseType').hidden = !position;
  orderType.value = 'market';
  target.value = '';
  quantity.value = String(position?.quantity ?? 1);
  quantity.readOnly = !!position;
  submit.textContent = position ? '決済を確定' : ORDER_LABELS[side] + '注文を確定';
  submit.dataset.side = side;
  updateOrderType();
  dialog.showModal();
  updateQuote();
 }

 function render({positions,pending}) {
  hasPending=pending.some(order=>order.status==='pending');
  const openPositions = positions.filter(position => !position.close).sort((a,b)=>b.open.time-a.open.time);
  const fills = positions.flatMap(position => [
   {side:position.side,quantity:position.quantity,kind:position.type?'新規 '+ORDER_TYPES[position.type]:'新規',...position.open},
   ...(position.close ? [{side:closeSide(position.side),quantity:position.quantity,kind:'決済',profit:positionProfit(position,position.close.price),...position.close}] : []),
  ]).sort((a,b)=>b.time-a.time).slice(0,50);

  $('orderPending').replaceChildren(...pending.sort((a,b)=>b.time-a.time).map(order=>{
   const row=element('li','','order-pending');
   const side=element('b',ORDER_LABELS[order.side],'order-direction');
   side.dataset.side=order.side;
   const info=element('span','','order-entry');
   info.append(element('b',number.format(order.target),'mono'),element('small',ORDER_TYPES[order.type]+' · 数量 '+order.quantity));
   const status=element('span',order.status==='review'?'履歴不足 · 停止':'待機中','order-pending-status');
   status.dataset.state=order.status;
   const button=element('button','取消','order-close-position');
   button.type='button';
   button.setAttribute('aria-label',ORDER_LABELS[order.side]+ORDER_TYPES[order.type]+'注文を取り消す');
   button.onclick=async()=>{
    button.disabled=true;
    try{
     await store.cancel(order.id);
     notify('デモ注文を取り消しました。');
     channel?.postMessage('changed');
    }catch(error){notify(error.message);}
    await refresh();
   };
   row.append(side,info,status,button);
   return row;
  }));
  $('orderEmptyPending').hidden=pending.length>0;
  marks = [];
  $('orderPositions').replaceChildren(...openPositions.map(position=>{
   const row = element('li','','order-position');
   const side = element('b',ORDER_LABELS[position.side],'order-direction');
   side.dataset.side = position.side;
   const entry = element('span','','order-entry');
   entry.append(element('b',number.format(position.open.price),'mono'),element('small','数量 '+position.quantity));
   const value = element('b','—','mono order-profit');
   const button = element('button','決済','order-close-position');
   button.type = 'button';
   button.setAttribute('aria-label',ORDER_LABELS[position.side]+'建玉を決済');
   button.onclick = () => open(closeSide(position.side),position);
   row.append(side,entry,value,button);
   marks.push({position,value,button});
   return row;
  }));
  $('orderHistory').replaceChildren(...fills.map(fill=>{
   const row = element('li','','order-fill');
   const side = element('b',ORDER_LABELS[fill.side],'order-direction');
   side.dataset.side = fill.side;
   const info = element('span','','order-entry');
   info.append(element('b',number.format(fill.price),'mono'),element('small',fill.kind+' · 数量 '+fill.quantity));
   const time = element('span','','order-entry order-fill-time');
   time.append(element('time',clock.format(fill.time),'mono'));
   if (fill.profit !== undefined) time.append(element('small',signed.format(fill.profit)+' pt','mono'));
   row.append(side,info,time);
   return row;
  }));
  $('orderEmptyPositions').hidden = openPositions.length > 0;
  $('orderEmptyHistory').hidden = fills.length > 0;
  updateQuote();
 }

 async function refresh() {
  const id = ++readId;
  try {
   const orders = await store.read();
   if (destroyed || id !== readId) return;
   $('ordersStatus').hidden = true;
   render(orders);
  } catch {
   if (destroyed || id !== readId) return;
   set('ordersStatus','このブラウザーでデモ注文の保存領域を開けません。');
   $('ordersStatus').hidden = false;
  }
 }

 form.onsubmit = async event => {
  event.preventDefault();
  const quote = getQuote();
  if (busy || !action || !quote || !form.reportValidity()) return;
  const {side,position} = action;
  const type=position?'market':orderType.value;
  const condition=target.valueAsNumber;
  if(type!=='market'&&!validOrderTrigger(side,type,condition,quote)){
   set('orderError',$('orderTargetHelp').textContent+'してください。');
   $('orderError').hidden=false;
   return;
  }
  const price = orderPrice(side,quote),time = Date.now();
  busy = true;
  $('orderDialogClose').disabled = true;
  $('orderError').hidden = true;
  updateQuote();
  try {
   if (position) await store.close(position.id,quote,time);
   else if(type==='market')await store.place({side,quantity:quantity.valueAsNumber,price,time});
   else{
    const row=getScene().checkpoint.rows.at(-1);
    await store.placePending({side,quantity:quantity.valueAsNumber,type,target:condition,cursor:{time:row.time,close:row.close},time});
    lastMatched=null;
   }
  } catch(error) {
   set('orderError',error.message==='この建玉はすでに決済されています。'?error.message:'保存できませんでした。ブラウザーの保存設定を確認してください。');
   $('orderError').hidden = false;
   return;
  } finally {
   busy = false;
   $('orderDialogClose').disabled = false;
   updateQuote();
  }
  dialog.close();
  notify(type==='market'?(position?'決済':ORDER_LABELS[side]+'注文')+'が約定しました。':ORDER_TYPES[type]+'注文を受け付けました。');
  channel?.postMessage('changed');
  showTrades();
 };
 orderType.onchange=updateOrderType;
 $('orderDialogClose').onclick = () => dialog.close();
 const cancel = event => {if (busy) event.preventDefault();};
 dialog.addEventListener('cancel',cancel);
 for (const trigger of triggers) trigger.onclick = () => open(trigger.dataset.orderSide);
 const onFocus = () => {void refresh();};
 window.addEventListener('focus',onFocus);
 if(channel)channel.onmessage=onFocus;
 void refresh();
 return {updateQuote,refresh,destroy(){destroyed=true;channel?.close();dialog.removeEventListener('cancel',cancel);window.removeEventListener('focus',onFocus);}};
}
