import {subscribeAccountRefresh} from './live.mjs';
import {demoYen,portalDate,renderBalanceHistory,mountMessageThread} from './portal-ui.mjs';

export function mountAdminCustomers({document,window,call}){
 const $=id=>document.getElementById(id);
 const pane=$('adminCustomers');
 const list=$('adminCustomerRows'),listStatus=$('adminCustomerListStatus');
 const detail=$('adminCustomerDetail'),balance=$('adminCustomerBalance'),input=$('adminBalanceValue');
 const reason=$('adminBalanceReason'),save=$('adminBalanceSave'),balanceStatus=$('adminBalanceStatus');
 const history=$('adminBalanceHistory'),nextButton=$('adminCustomerNext'),previousButton=$('adminCustomerPrevious');
 let active=false,selected=null,customers=[],next=null,cursors=[null],query='',listRequest=0;
 let detailGeneration=0,stopNotify=()=>{},busy=false,lastWrite=null,draftBase=null;
 const targetPath=(segment,customer=selected,before=null)=>{
  const params=new URLSearchParams({customer:customer.id});
  if(before)params.set('before',before);
  return '/api/admin/customers/'+segment+'?'+params;
 };
 const thread=mountMessageThread($('adminSupportThread'),window,'admin',{
  active:()=>active&&!!selected,
  read:before=>call(targetPath('messages',selected,before)),
  send:async body=>{
   const customer=selected;
   const result=await call(targetPath('messages',customer),'POST',body);
   if(active&&selected?.id===customer.id)void loadList({silent:true});
   return result;
  },
 });

 function renderList(){
  const focused=list.contains(document.activeElement)?document.activeElement.dataset.customerId:null;
  list.replaceChildren(...customers.map(customer=>{
   const row=document.createElement('li'),button=document.createElement('button');
   const address=document.createElement('span'),cash=document.createElement('strong');
   button.type='button';
   button.dataset.customerId=customer.id;
   button.setAttribute('aria-pressed',String(selected?.id===customer.id));
   button.onclick=()=>select(customer);
   address.textContent=customer.email;
   cash.textContent=demoYen(customer.balance);
   button.append(address,cash);
   if(customer.reply_pending){
    const badge=document.createElement('small');
    badge.textContent='返信待ち';
    button.append(badge);
   }
   row.append(button);
   return row;
  }));
  if(focused)list.querySelector('[data-customer-id="'+focused+'"]')?.focus();
  listStatus.textContent=customers.length?'':'該当するデモ口座はありません。';
  nextButton.hidden=!next;
  previousButton.hidden=cursors.length<2;
 }

 async function loadList({silent=false,resetDraft=false}={}){
  if(!active)return;
  const ticket=++listRequest;
  if(!silent)listStatus.textContent='読み込み中…';
  try{
   const params=new URLSearchParams({q:query});
   if(cursors.at(-1))params.set('after',cursors.at(-1));
   const data=await call('/api/admin/customers?'+params);
   if(!active||ticket!==listRequest)return;
   const listChanged=JSON.stringify(customers)!==JSON.stringify(data.customers)||next!==data.next||!silent;
   customers=data.customers;
   next=data.next;
   const current=customers.find(customer=>customer.id===selected?.id);
   if(current&&selected.balance!==current.balance){
    const editing=input.value!==String(draftBase)||reason.value.trim()!=='';
    selected=current;
    balance.textContent=demoYen(current.balance);
    if(!editing&&!busy){input.value=String(current.balance);draftBase=current.balance;}
   }
   if(selected&&!current&&!busy)clearSelection();
   if(resetDraft&&current){draftBase=current.balance;input.value=String(current.balance);}
   if(listChanged)renderList();
  }catch(error){if(active&&ticket===listRequest)listStatus.textContent=error.message;}
 }

 async function loadActivity(){
  if(!active||!selected)return;
  const ticket=detailGeneration;
  try{
   const {adjustments}=await call(targetPath('activity'));
   if(active&&ticket===detailGeneration)renderBalanceHistory(history,adjustments);
  }catch(error){if(active&&ticket===detailGeneration)renderBalanceHistory(history,[],error.message);}
 }
 function select(customer){
  if(busy||selected?.id===customer.id)return;
  detailGeneration++;
  stopNotify();
  thread.reset();
  selected=customer;
  lastWrite=null;
  detail.hidden=false;
  $('adminCustomerEmail').textContent=customer.email;
  $('adminCustomerConfirmed').textContent='認証 '+portalDate(customer.confirmed_at);
  balance.textContent=demoYen(customer.balance);
  draftBase=customer.balance;
  input.value=String(customer.balance);
  reason.value='';
  balanceStatus.textContent='';
  history.replaceChildren();
  renderList();
  void loadActivity();
  void thread.refresh();
  stopNotify=subscribeAccountRefresh(window,customer.notify_token,()=>Promise.all([thread.refresh(),loadActivity(),loadList({silent:true})]));
 }

 function clearSelection(){
  detailGeneration++;
  stopNotify();
  stopNotify=()=>{};
  selected=null;
  draftBase=null;
  busy=save.disabled=false;
  detail.hidden=true;
  $('adminCustomerEmail').textContent='';
  $('adminCustomerConfirmed').textContent='';
  balanceStatus.textContent='';
  balance.textContent='—';
  input.value='';
  reason.value='';
  lastWrite=null;
  history.replaceChildren();
  thread.reset();
 }

 $('adminCustomerSearch').onsubmit=event=>{
  event.preventDefault();
  if(busy)return;
  clearSelection();
  query=$('adminCustomerQuery').value.trim();
  cursors=[null];
  void loadList();
 };
 $('adminCustomersRefresh').onclick=()=>{void loadList();void loadActivity();void thread.refresh();};
 nextButton.onclick=()=>{if(next&&!busy){clearSelection();cursors.push(next);void loadList();}};
 previousButton.onclick=()=>{if(cursors.length>1&&!busy){clearSelection();cursors.pop();void loadList();}};
 $('adminBalanceForm').onsubmit=async event=>{
  event.preventDefault();
  if(!active||!selected||busy)return;
  const value=input.valueAsNumber,why=reason.value.trim();
  if(!Number.isSafeInteger(value)||!why){
   balanceStatus.textContent='金額と変更理由を入力してください。';
   return;
  }
  const ticket=detailGeneration,customer=selected;
  const payload={balance:value,expectedBalance:draftBase,reason:why};
  if(lastWrite?.key!==JSON.stringify(payload))lastWrite={key:JSON.stringify(payload),commandId:window.crypto.randomUUID()};
  busy=save.disabled=true;
  balanceStatus.textContent='';
  try{
   const result=await call(targetPath('balance',customer),'POST',{...payload,commandId:lastWrite.commandId});
   if(!active||ticket!==detailGeneration)return;
   listRequest++;
   selected={...customer,balance:result.balance};
   draftBase=result.balance;
   balance.textContent=demoYen(result.balance);
   input.value=String(result.balance);
   reason.value='';
   lastWrite=null;
   balanceStatus.textContent=result.changed?'デモ残高を更新しました。':result.duplicate?'この調整は反映済みです。':'デモ残高は同じ金額です。';
   void loadActivity();
   void loadList({silent:true});
  }catch(error){
   if(!active||ticket!==detailGeneration)return;
   balanceStatus.textContent=error.message;
   if(error.status===409)void loadList({silent:true,resetDraft:true});
  }finally{if(ticket===detailGeneration)busy=save.disabled=false;}
 };

 const timer=window.setInterval(()=>{
  if(active&&!document.hidden){void loadList({silent:true});void thread.refresh();}
 },8000);
 return {
  setActive(value){
   if(active===value)return;
   active=value;
   if(active){void loadList();return;}
   listRequest++;
   clearSelection();
   customers=[];
   next=null;
   query='';
   cursors=[null];
   $('adminCustomerQuery').value='';
   listStatus.textContent='';
   list.replaceChildren();
   nextButton.hidden=previousButton.hidden=true;
  },
  destroy(){this.setActive(false);window.clearInterval(timer);},
 };
}
