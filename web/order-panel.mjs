import {createPaperOrderStore,closeSide,orderPrice,positionProfit,validOrderQuantity,validOrderTrigger,ORDER_LABELS,ORDER_TYPES} from './paper-orders.mjs';
import {DEFAULT_INSTRUMENT,instrumentInfo,formatRate} from './instruments.mjs';
import {DEMO_DEFAULT_LEVERAGE,isManaged,accountSnapshot,accountProfit,marginFor} from './demo-account.mjs';

const clock = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const yen=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:0});
const money=value=>value==null?'—':yen.format(value)+' 円';

export function mountOrderPanel({document,window,getQuote,getScene,getInstrument,showTrades,notify,onOrdersChange}) {
 const $ = id => document.getElementById(id);
 const dialog = $('orderDialog');
 const form = $('orderForm');
 const quantity = $('orderQuantity');
 const orderType = $('orderType');
 const target = $('orderTarget');
 const leverage = $('orderLeverage');
 const submit = $('orderSubmit');
 const store = createPaperOrderStore(window);
 const triggers = document.querySelectorAll('[data-order-side]');
 let action = null, busy = false, readId = 0, destroyed = false;
 let marks = [];
 let amendments = [];
 let currentOrders = {positions:[],pending:[],account:null};
 let needsMatching = false, matching = false, lastMatched = null;
 const channel = typeof window.BroadcastChannel === 'function' ? new window.BroadcastChannel('fx-demo-order-updates') : null;

 function matchLatest() {
  const scene = getScene();
  if (!scene || !getQuote() || !needsMatching || matching || lastMatched === scene || destroyed) return;
  lastMatched = scene;
  matching = true;
  void store.match(scene,Date.now()).then(async outcome=>{
   if (destroyed || (!outcome.filled && !outcome.review && !outcome.liquidated)) return;
   if (outcome.liquidated) notify(outcome.liquidated+'件の建玉をロスカットしました。');
   else if (outcome.filled) notify(outcome.filled+'件のデモ注文が約定しました。');
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
  const row=getScene()?.checkpoint.rows.at(-1);
  const {account,positions,pending}=currentOrders;
  const totals=account?accountSnapshot(account.balance,positions,pending,row):null;
  for(const [id,key] of Object.entries({accountBalance:'balance',accountEquity:'equity',accountProfit:'profit',accountMargin:'margin',accountReserved:'reserved',accountAvailable:'available'}))set(id,money(totals?.[key]));
  set('accountRatio',totals?.ratio==null?'—':(totals.ratio*100).toFixed(1)+'%');
  matchLatest();
  for (const trigger of triggers) trigger.disabled = !quote;
  for (const button of amendments) button.disabled = !quote;
  for (const {position, value, button} of marks) {
   const instrument=position.instrument??DEFAULT_INSTRUMENT,mark=getQuote(instrument);
   button.disabled = !mark;
   const exit=mark?orderPrice(closeSide(position.side),mark):null;
   const profit=exit===null?null:isManaged(position)?accountProfit(position,exit,row.time):positionProfit(position,exit);
   value.textContent=profit===null?'—':isManaged(position)?(profit>0?'+':'')+money(profit):formatRate(profit,instrument,true)+' pt';
   value.dataset.profit = profit > 0 ? 'up' : profit < 0 ? 'down' : 'neutral';
  }
  if (!action || !dialog.open) return;
  const live=getQuote(action.instrument),price=live?orderPrice(action.side,live):null;
  set('orderRate',formatRate(price,action.instrument));
  if (action.position) {
   const {position}=action;
   set('orderProfit',price===null?'—':isManaged(position)?money(accountProfit(position,price,row.time)):formatRate(positionProfit(position,price),action.instrument,true)+' pt');
  }
  if(!$('orderMarginInfo').hidden){
   const orderPrice=orderType.value==='market'?price:target.valueAsNumber;
   const required=live&&validOrderQuantity(quantity.valueAsNumber)&&orderPrice>0?
    marginFor({instrument:action.instrument,quantity:quantity.valueAsNumber,leverage:Number(leverage.value)},orderPrice,row.time):null;
   const available=totals?totals.available+(isManaged(action.pending??{})?action.pending.margin:0):null;
   set('orderMargin',money(required));
   set('orderAvailable',money(available));
   $('orderFundsMessage').hidden=required===null||available===null||required<=available;
  }
  $('orderNoQuote').hidden = !!live;
  submit.disabled = busy || !live;
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
  updateQuote();
 }

 function open(side, {position=null,pending=null,fromChart=false}={}) {
  const instrument=position||pending?(position??pending).instrument??DEFAULT_INSTRUMENT:getInstrument();
  if (!getQuote(instrument) || dialog.open) return false;
  action = {side, position, pending, fromChart,instrument};
  $('orderInstrument').textContent=instrumentInfo(instrument).label;
  target.step=String(10**-instrumentInfo(instrument).digits);
  target.min=target.step;
  $('orderDialogTitle').textContent = position ? 'デモ決済' : pending ? 'デモ注文の変更' : 'デモ注文';
  $('orderDirection').textContent = ORDER_LABELS[side];
  $('orderDirection').dataset.side = side;
  $('orderRateType').textContent = side === 'buy' ? '買値（Ask）' : '売値（Bid）';
  $('orderProfitRow').hidden = !position;
  $('orderTypeRow').hidden = !!position;
  $('orderCloseType').hidden = !position;
  orderType.value = pending?.type ?? 'market';
  orderType.disabled = !!pending;
  target.value = pending ? String(pending.target) : '';
  quantity.value = String(position?.quantity ?? pending?.quantity ?? 1);
  quantity.readOnly = !!position || !!pending;
  set('orderUnits',instrument===DEFAULT_INSTRUMENT?'1単位＝1指数単位':position&&!isManaged(position)||pending&&!isManaged(pending)?'従来の数量単位':'1単位＝0.01 BTC');
  const usesMargin=!position&&(!pending||isManaged(pending));
  $('orderLeverageRow').hidden=!usesMargin;
  $('orderMarginInfo').hidden=!usesMargin;
  $('orderFundsMessage').hidden=true;
  leverage.value=String(pending?.leverage??DEMO_DEFAULT_LEVERAGE);
  leverage.disabled=!!pending;
  submit.textContent = position ? '決済を確定' : pending ? '変更を確定' : ORDER_LABELS[side] + '注文を確定';
  submit.dataset.side = side;
  updateOrderType();
  dialog.showModal();
  updateQuote();
  return true;
 }

 function selectLevel(id) {
  const pending=currentOrders.pending.find(order=>order.id===id && order.status==='pending');
  if(pending)return open(pending.side,{pending,fromChart:true});
  const position=currentOrders.positions.find(order=>order.id===id && !order.close);
  return position ? open(closeSide(position.side),{position,fromChart:true}) : false;
 }

 function render({positions,pending,account}) {
  currentOrders={positions,pending,account};
  needsMatching=pending.some(order=>order.status==='pending')||positions.some(position=>!position.close&&isManaged(position));
  const openPositions = positions.filter(position => !position.close).sort((a,b)=>b.open.time-a.open.time);
  const fills = positions.flatMap(position => [
   {side:position.side,quantity:position.quantity,instrument:position.instrument,kind:position.type?'新規 '+ORDER_TYPES[position.type]:'新規',...position.open},
   ...(position.close ? [{side:closeSide(position.side),quantity:position.quantity,instrument:position.instrument,kind:position.close.reason==='liquidation'?'ロスカット':'決済',profit:positionProfit(position,position.close.price),cash:isManaged(position),...position.close}] : []),
  ]).sort((a,b)=>b.time-a.time).slice(0,50);

  amendments=[];
  $('orderPending').replaceChildren(...[...pending].sort((a,b)=>b.time-a.time).map(order=>{
   const row=element('li','','order-pending');
   const side=element('b',ORDER_LABELS[order.side],'order-direction');
   side.dataset.side=order.side;
   const info=element('span','','order-entry');
   info.append(element('small',instrumentInfo(order.instrument).label),element('b',formatRate(order.target,order.instrument),'mono'),element('small',ORDER_TYPES[order.type]+' · 数量 '+order.quantity));
   const status=element('span',({review:'履歴不足 · 停止',funds:'証拠金不足',liquidation:'ロスカット取消'})[order.status]??'待機中','order-pending-status');
   status.dataset.state=order.status;
   const button=element('button','取消','order-close-position');
   button.type='button';
   button.setAttribute('aria-label',ORDER_LABELS[order.side]+ORDER_TYPES[order.type]+'注文を取り消す');
   button.onclick=async()=>{
    button.disabled=true;
    try{
     if(getQuote())await store.match(getScene(),Date.now());
     await store.cancel(order.id);
     notify('デモ注文を取り消しました。');
     channel?.postMessage('changed');
    }catch(error){notify(error.message);}
    await refresh();
   };
   const actions=element('span','','order-row-actions');
   if(order.status==='pending'){
    const edit=element('button','変更','order-close-position');
    edit.type='button';
    edit.setAttribute('aria-label',ORDER_LABELS[order.side]+ORDER_TYPES[order.type]+'注文を変更');
    edit.onclick=()=>open(order.side,{pending:order});
    actions.append(edit);
    amendments.push(edit);
   }
   actions.append(button);
   row.append(side,info,status,actions);
   return row;
  }));
  $('orderEmptyPending').hidden=pending.length>0;
  marks = [];
  $('orderPositions').replaceChildren(...openPositions.map(position=>{
   const row = element('li','','order-position');
   const side = element('b',ORDER_LABELS[position.side],'order-direction');
   side.dataset.side = position.side;
   const entry = element('span','','order-entry');
   entry.append(element('small',instrumentInfo(position.instrument).label),element('b',formatRate(position.open.price,position.instrument),'mono'),element('small','数量 '+position.quantity));
   const value = element('b','—','mono order-profit');
   const button = element('button','決済','order-close-position');
   button.type = 'button';
   button.setAttribute('aria-label',ORDER_LABELS[position.side]+'建玉を決済');
   button.onclick = () => open(closeSide(position.side),{position});
   row.append(side,entry,value,button);
   marks.push({position,value,button});
   return row;
  }));
  $('orderHistory').replaceChildren(...fills.map(fill=>{
   const row = element('li','','order-fill');
   const side = element('b',ORDER_LABELS[fill.side],'order-direction');
   side.dataset.side = fill.side;
   const info = element('span','','order-entry');
   info.append(element('small',instrumentInfo(fill.instrument).label),element('b',formatRate(fill.price,fill.instrument),'mono'),element('small',fill.kind+' · 数量 '+fill.quantity));
   const time = element('span','','order-entry order-fill-time');
   time.append(element('time',clock.format(fill.time),'mono'));
   if (fill.profit !== undefined) time.append(element('small',fill.cash?money(fill.profit):formatRate(fill.profit,fill.instrument,true)+' pt','mono'));
   row.append(side,info,time);
   return row;
  }));
  $('orderEmptyPositions').hidden = openPositions.length > 0;
  $('orderEmptyHistory').hidden = fills.length > 0;
  $('legacyTradeNote').hidden=!openPositions.some(position=>!isManaged(position));
  onOrdersChange(currentOrders);
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
  const quote = getQuote(action?.instrument);
  if (busy || !action || !quote || !form.reportValidity()) return;
  const {side,position,pending,fromChart,instrument} = action;
  const type=position?'market':orderType.value;
  const condition=target.valueAsNumber;
  if(type!=='market'&&!validOrderTrigger(side,type,condition,quote,instrument)){
   set('orderError',$('orderTargetHelp').textContent+'してください。');
   $('orderError').hidden=false;
   return;
  }
  const price = orderPrice(side,quote),time = Date.now();
  const scene=getScene();
  const selectedLeverage=Number(leverage.value);
  busy = true;
  $('orderDialogClose').disabled = true;
  $('orderError').hidden = true;
  updateQuote();
  try {
   await store.match(scene,time);
   if (position) await store.close(position.id,quote,time,scene);
   else if(type==='market')await store.place({side,quantity:quantity.valueAsNumber,price,time,instrument,leverage:selectedLeverage,scene});
   else{
    const row=scene.checkpoint.rows.at(-1),cursor={time:row.time,close:row.close,version:scene.version};
    if(pending){
     await store.amend(pending.id,{target:condition,cursor,scene});
    }else await store.placePending({side,quantity:quantity.valueAsNumber,type,target:condition,cursor,time,instrument,leverage:selectedLeverage,scene});
    lastMatched=null;
   }
  } catch(error) {
   const errors=['この建玉はすでに決済されています。','変更できる未約定注文がありません。取引画面で状態を確認してください。','価格が更新されました。レートを確認してください。','余力が不足しています。数量またはレバレッジを確認してください。'];
   set('orderError',errors.includes(error.message)?error.message:'保存できませんでした。ブラウザーの保存設定を確認してください。');
   $('orderError').hidden = false;
   channel?.postMessage('changed');void refresh();
   return;
  } finally {
   busy = false;
   $('orderDialogClose').disabled = false;
   updateQuote();
  }
  dialog.close();
  notify(pending?'指定レートを変更しました。':type==='market'?(position?'決済':ORDER_LABELS[side]+'注文')+'が約定しました。':ORDER_TYPES[type]+'注文を受け付けました。');
  channel?.postMessage('changed');
  if(fromChart)void refresh();
  else showTrades();
 };
 orderType.onchange=updateOrderType;
 quantity.oninput=target.oninput=leverage.onchange=updateQuote;
 $('orderDialogClose').onclick = () => dialog.close();
 const cancel = event => {if (busy) event.preventDefault();};
 dialog.addEventListener('cancel',cancel);
 for (const trigger of triggers) trigger.onclick = () => open(trigger.dataset.orderSide);
 const onFocus = () => {void refresh();};
 window.addEventListener('focus',onFocus);
 if(channel)channel.onmessage=onFocus;
 void refresh();
 return {updateQuote,refresh,selectLevel,destroy(){destroyed=true;channel?.close();dialog.removeEventListener('cancel',cancel);window.removeEventListener('focus',onFocus);}};
}
