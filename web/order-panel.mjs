import {createPaperOrderStore,closeSide,orderPrice,positionProfit,ORDER_LABELS} from './paper-orders.mjs';

const number = new Intl.NumberFormat('ja-JP', {minimumFractionDigits:3,maximumFractionDigits:3});
const signed = new Intl.NumberFormat('ja-JP', {minimumFractionDigits:3,maximumFractionDigits:3,signDisplay:'exceptZero'});
const clock = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

export function mountOrderPanel({document,window,getQuote,showTrades,notify}) {
 const $ = id => document.getElementById(id);
 const dialog = $('orderDialog');
 const form = $('orderForm');
 const quantity = $('orderQuantity');
 const submit = $('orderSubmit');
 const store = createPaperOrderStore(window);
 const triggers = document.querySelectorAll('[data-order-side]');
 let action = null, busy = false, readId = 0, destroyed = false;
 let marks = [];

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

 function open(side, position=null) {
  if (!getQuote() || dialog.open) return;
  action = {side, position};
  $('orderDialogTitle').textContent = position ? 'デモ決済' : 'デモ注文';
  $('orderDirection').textContent = ORDER_LABELS[side];
  $('orderDirection').dataset.side = side;
  $('orderRateType').textContent = side === 'buy' ? '買値（Ask）' : '売値（Bid）';
  $('orderProfitRow').hidden = !position;
  quantity.value = String(position?.quantity ?? 1);
  quantity.readOnly = !!position;
  submit.textContent = position ? '決済を確定' : ORDER_LABELS[side] + '注文を確定';
  submit.dataset.side = side;
  $('orderError').hidden = true;
  dialog.showModal();
  updateQuote();
 }

 function render(positions) {
  const openPositions = positions.filter(position => !position.close).sort((a,b)=>b.open.time-a.open.time);
  const fills = positions.flatMap(position => [
   {side:position.side,quantity:position.quantity,kind:'新規',...position.open},
   ...(position.close ? [{side:closeSide(position.side),quantity:position.quantity,kind:'決済',profit:positionProfit(position,position.close.price),...position.close}] : []),
  ]).sort((a,b)=>b.time-a.time).slice(0,50);

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
   const positions = await store.read();
   if (destroyed || id !== readId) return;
   $('ordersStatus').hidden = true;
   render(positions);
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
  const price = orderPrice(side,quote),time = Date.now();
  busy = true;
  $('orderDialogClose').disabled = true;
  $('orderError').hidden = true;
  updateQuote();
  try {
   if (position) await store.close(position.id,quote,time);
   else await store.place({side,quantity:quantity.valueAsNumber,price,time});
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
  notify((position?'決済':ORDER_LABELS[side]+'注文')+'が約定しました。');
  showTrades();
 };
 $('orderDialogClose').onclick = () => dialog.close();
 const cancel = event => {if (busy) event.preventDefault();};
 dialog.addEventListener('cancel',cancel);
 for (const trigger of triggers) trigger.onclick = () => open(trigger.dataset.orderSide);
 const onFocus = () => {if (document.body.dataset.view === 'trades') void refresh();};
 window.addEventListener('focus',onFocus);
 return {updateQuote,refresh,destroy(){destroyed=true;dialog.removeEventListener('cancel',cancel);window.removeEventListener('focus',onFocus);}};
}
