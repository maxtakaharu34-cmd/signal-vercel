import {subscribeAccountRefresh} from './live.mjs';
import {mountMessageThread,renderBalanceHistory} from './portal-ui.mjs';

const emptyOutcome={filled:0,review:0,liquidated:0};

async function api(window,path,body){
 const response=await window.fetch('/api/customer/'+path,{
  cache:'no-store',
  signal:window.AbortSignal.timeout(26000),
  ...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
 });
 const data=await response.json();
 if(!response.ok)throw Object.assign(Error(data.message??'デモ口座との接続を確認してください。'),{status:response.status,code:data.code});
 return data;
}

export function createCustomerOrderStore(window,onAuthLost){
 let lastMatch=0,latest=null;
 function remember({orders}){
  if(!latest||orders.version>=latest.version)latest=orders;
  return latest;
 }
 async function request(body){
  try{return await api(window,'orders',body);}
  catch(error){
   if(['SIGN_IN_REQUIRED','MFA_REQUIRED'].includes(error.code))onAuthLost();
   throw error;
  }
 }
 async function command(operation,values){
  const body={operation,commandId:window.crypto.randomUUID(),...values};
  try{remember(await request(body));}
  catch(error){
   if(error.status)throw error;
   try{remember(await request(body));}
   catch{throw Error('注文の結果を確認できませんでした。再注文の前に取引履歴を確認してください。');}
  }
 }
 return {
  remote:true,
  read:async()=>remember(await request()),
  place:({side,quantity,instrument,leverage})=>command('place',{side,quantity,instrument,leverage}),
  placePending:({side,quantity,instrument,leverage,type,target})=>command('placePending',{side,quantity,instrument,leverage,type,target}),
  close:id=>command('close',{id}),
  amend:(id,{target})=>command('amend',{id,target}),
  cancel:id=>command('cancel',{id}),
  match:async()=>{
   const now=Date.now();
   if(now-lastMatch<4000)return emptyOutcome;
   lastMatch=now;
   const reply=await request({operation:'match'});
   remember(reply);
   return reply.outcome??emptyOutcome;
  },
 };
}

export function mountCustomerAccount({document,window,orderPanel}){
 const byId=id=>document.getElementById(id);
 const button=byId('customerAccountOpen'),dialog=byId('customerAccountDialog');
 if(!button||!dialog)return {destroy(){}};
 const message=byId('customerAccountMessage'),email=byId('customerEmail'),mfaCode=byId('customerMfaCode');
 const register=byId('customerRegister'),login=byId('customerLogin');
 const supportDialog=byId('customerSupportDialog'),supportButton=byId('customerSupportOpen');
 const activity=byId('customerBalanceActivity'),history=byId('customerBalanceHistory');
 let state='guest',destroyed=false,busy=false,identity=null,store=null,notificationToken=null;
 let stopNotify=()=>{},activityTicket=0;
 const thread=supportDialog?mountMessageThread(byId('customerSupportThread'),window,'customer',{
  active:()=>!destroyed&&state==='ready'&&supportDialog.open,
  read:before=>api(window,'messages'+(before?'?before='+encodeURIComponent(before):'')),
  send:body=>api(window,'messages',body),
 }):null;
 const timer=window.setInterval(()=>{
  if(!document.hidden)void thread?.refresh();
 },8000);

 async function refreshActivity(){
  if(!activity?.open||state!=='ready')return;
  const ticket=++activityTicket;
  try{
   const {adjustments}=await api(window,'activity');
   if(ticket===activityTicket&&state==='ready'&&!destroyed)renderBalanceHistory(history,adjustments);
  }catch(error){
   if(ticket===activityTicket&&state==='ready'&&!destroyed)renderBalanceHistory(history,[],error.message);
  }
 }
 if(supportButton){
  supportButton.onclick=()=>{supportDialog.showModal();void thread.refresh();};
  byId('customerSupportClose').onclick=()=>supportDialog.close();
  supportDialog.addEventListener('close',()=>thread.reset());
 }
 activity?.addEventListener('toggle',()=>void refreshActivity());
 const controls=[register,login,byId('customerEnroll'),byId('customerMfaConfirm'),byId('customerLogout')];

 function render(data,{clearMessage=true}={}){
  if(destroyed)return;
  state=data.state;
  button.hidden=!data.enabled;
  button.textContent=state==='ready'?'口座設定':'ログイン・登録';
  byId('customerEmailForm').hidden=state!=='guest';
  byId('customerMfaArea').hidden=!['enroll','challenge'].includes(state);
  byId('customerEnroll').hidden=state!=='enroll';
  byId('customerMfaForm').hidden=state!=='challenge';
  byId('customerProfile').hidden=state!=='ready';
  byId('customerLogout').hidden=state==='guest';
  byId('customerAccountEmail').textContent=data.email??'';
  mfaCode.value='';
  clearFactor();
  if(clearMessage)message.textContent='';
  if(supportButton)supportButton.hidden=state!=='ready';
  if(activity)activity.hidden=state!=='ready';
  if(state==='ready'){
   if(identity!==data.email){
    identity=data.email;
    store=createCustomerOrderStore(window,()=>void lost());
   }
   orderPanel.setStore(store);
   if(notificationToken!==data.notifyToken){
    stopNotify();
    notificationToken=data.notifyToken;
    stopNotify=subscribeAccountRefresh(window,notificationToken,()=>Promise.all([orderPanel.refresh(),thread?.refresh(),refreshActivity()]));
   }
  }else{
   activityTicket++;
   stopNotify();
   notificationToken=null;
   if(supportDialog?.open)supportDialog.close();
   thread?.reset();
   if(activity)activity.open=false;
   history?.replaceChildren();
   identity=null;
   orderPanel.setStore(null);
  }
 }
 function clearFactor(){
  byId('customerQr').hidden=true;
  byId('customerQr').removeAttribute('src');
  byId('customerSecret').textContent='';
  byId('customerManualKey').hidden=true;
 }
 async function status(){
  const result=await api(window,'session');
  render(result);
  return result;
 }
 async function lost(){
  if(!identity||destroyed)return;
  identity=null;
  // Clear this account from view immediately; don't retain data on auth loss.
  render({enabled:true,state:'guest'});
  if(!dialog.open)dialog.showModal();
  message.textContent='口座に再ログインしてください。';
 }
 async function action(run){
  if(busy||destroyed)return;
  busy=true;
  for(const control of controls)control.disabled=true;
  message.textContent='';
  try{await run();}
  catch(error){if(!destroyed)message.textContent=error.status?error.message:'接続を確認して、もう一度お試しください。';}
  finally{busy=false;for(const control of controls)control.disabled=false;}
 }

 button.onclick=()=>{if(!dialog.open)dialog.showModal();};
 byId('customerAccountClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{
  if(state==='enroll'){
   clearFactor();
   byId('customerEnroll').hidden=false;
   byId('customerMfaForm').hidden=true;
   mfaCode.value='';
  }
 });
 byId('customerEmailForm').onsubmit=event=>{
  event.preventDefault();
  const mode=event.submitter===register?'register':'login';
  void action(async()=>{
   await api(window,'email',{email:email.value,mode});
   message.textContent='メールを送信しました。メール内のリンクをこのブラウザーで開いてください。';
  });
 };
 byId('customerEnroll').onclick=()=>void action(async()=>{
  const data=await api(window,'mfa/enroll',{});
  if(!dialog.open||destroyed)return;
  const qr=byId('customerQr');
  qr.src=data.qr;
  qr.hidden=false;
  byId('customerSecret').textContent=data.secret;
  byId('customerManualKey').hidden=false;
  byId('customerMfaForm').hidden=false;
  byId('customerEnroll').hidden=true;
  mfaCode.focus();
 });
 byId('customerMfaForm').onsubmit=event=>{
  event.preventDefault();
  void action(async()=>{
   const result=await api(window,'mfa/verify',{code:mfaCode.value});
   render(result);
   if(dialog.open)dialog.close();
   byId('customerOrderStatus').textContent='デモ口座にログインしました。';
  });
 };
 byId('customerLogout').onclick=()=>void action(async()=>{
  await api(window,'logout',{});
  render({enabled:true,state:'guest'});
  dialog.close();
  byId('customerOrderStatus').textContent='デモ口座からログアウトしました。';
 });

 void status().then(result=>{
  if(!result.enabled||destroyed)return;
  const url=new URL(window.location.href),returned=url.searchParams.get('account');
  if(!returned)return;
  url.searchParams.delete('account');
  window.history.replaceState(null,'',url);
  if(state==='ready')return;
  if(!dialog.open)dialog.showModal();
  if(returned==='failed')message.textContent='メール認証を完了できませんでした。リンクの有効期限を確認してください。';
 }).catch(()=>{});
 return {destroy(){destroyed=true;stopNotify();window.clearInterval(timer);thread?.reset();}};
}
