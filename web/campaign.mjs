import {subscribeRefresh} from './live.mjs';
import {CAMPAIGN_TOPIC} from './campaign-rules.mjs';
import {demoYen,portalDate} from './portal-ui.mjs';

async function viewerRequest(window,path,body){
 const response=await window.fetch(path,{
  cache:'no-store',
  signal:window.AbortSignal.timeout(15000),
  ...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
 });
 const result=await response.json();
 if(!response.ok)throw Object.assign(Error(result.message??'キャンペーンに接続できませんでした。'),{status:response.status});
 return result;
}

export function mountViewerCampaign({document,window,openLogin,onApplied}){
 const $=id=>document.getElementById(id);
 const banner=$('campaignBanner'),dialog=$('campaignDialog');
 const form=$('campaignClaim'),options=$('campaignCredit'),checkbox=$('campaignApply'),submit=$('campaignSubmit');
 const status=$('campaignStatus'),availability=$('campaignAvailability'),login=$('campaignLogin');
 let session=null,settings=null,eligibility=null,read=0,busy=false,disposed=false,request=null;

 function gates(){submit.disabled=busy||!checkbox.checked||!options.value||form.hidden;}
 function render(){
  const ready=session?.state==='ready',enabled=settings?.enabled===true;
  const available=ready&&eligibility?.enabled&&!eligibility?.claimed&&eligibility?.credits?.length>0;
  banner.hidden=!enabled||!session||(ready&&(!eligibility||eligibility.claimed));
  form.hidden=!enabled||!available;
  login.hidden=!enabled||ready||!session?.enabled;
  if(!enabled)availability.textContent='現在、キャンペーンは表示されていません。';
  else if(!ready)availability.textContent=session?.enabled?'対象額はログイン後に確認できます。':'現在はキャンペーン条件を確認できます。';
  else if(eligibility?.claimed)availability.textContent='この口座では適用済みです。';
  else if(!eligibility)availability.textContent='口座の利用状況を確認しています。';
  else availability.textContent=available?'対象の残高追加を選択してください。':'対象の仮想残高追加はありません。';
  if(available){
   const entries=eligibility.credits,prior=options.value;
   if([...options.options].map(option=>option.value).join(',')!==entries.map(item=>item.credit_id).join(',')){
    options.replaceChildren(...entries.map(item=>{
     const option=document.createElement('option');
     option.value=item.credit_id;
     option.textContent='第'+item.credit_number+'回 '+demoYen(item.credit_amount)+' → ＋'+demoYen(item.bonus_amount);
     return option;
    }));
    if(entries.some(item=>item.credit_id===prior))options.value=prior;
   }
  }else{
   options.replaceChildren();
   checkbox.checked=false;
  }
  gates();
 }

 async function refresh(){
  if(disposed)return;
  const ticket=++read;
  try{
   const publicState=await viewerRequest(window,'/api/campaign');
   if(ticket!==read||disposed)return;
   settings=publicState;
   if(settings.enabled&&session?.state==='ready'){
    const next=await viewerRequest(window,'/api/customer/campaign');
    if(ticket!==read||disposed)return;
    if(next.round!==eligibility?.round)request=null;
    eligibility=next;
   }else eligibility=null;
   render();
  }catch(error){
   if(ticket===read&&dialog.open&&!busy)status.textContent=error.message;
  }
 }
 $('campaignOpen').onclick=()=>{status.textContent='';checkbox.checked=false;render();dialog.showModal();void refresh();};
 $('campaignClose').onclick=()=>dialog.close();
 login.onclick=()=>{dialog.close();openLogin();};
 checkbox.onchange=options.onchange=gates;
 form.onsubmit=async event=>{
  event.preventDefault();
  if(busy||!checkbox.checked||!options.value||form.hidden)return;
  const values={creditId:options.value,round:eligibility.round,apply:true};
  const key=JSON.stringify(values),identity=session;
  if(request?.key!==key)request={key,commandId:window.crypto.randomUUID()};
  busy=true;
  status.textContent='';
  gates();
  try{
   const result=await viewerRequest(window,'/api/customer/campaign',{...values,commandId:request.commandId});
   if(disposed||session!==identity)return;
   read++;
   eligibility={...eligibility,claimed:true};
   request=null;
   status.textContent=result.bonus?demoYen(result.bonus)+'分の仮想残高ボーナスを適用しました。':'仮想残高ボーナスは適用済みです。';
   render();
   await onApplied();
  }catch(error){
   if(!disposed&&session===identity)status.textContent=error.message;
  }finally{
   busy=false;
   if(!disposed){gates();void refresh();}
  }
 };
 const stop=subscribeRefresh(window,CAMPAIGN_TOPIC,refresh);
 const interval=window.setInterval(()=>{if(!document.hidden)void refresh();},8000);
 return {
  setSession(value){
   session=value;
   eligibility=null;
   request=null;
   checkbox.checked=false;
   if(dialog.open)dialog.close();
   render();
   void refresh();
  },
  refresh,
  destroy(){disposed=true;read++;stop();window.clearInterval(interval);},
 };
}

export function mountAdminCampaign({document,call}){
 const $=id=>document.getElementById(id);
 const enabled=$('adminCampaignEnabled'),save=$('adminCampaignSave'),status=$('adminCampaignStatus'),list=$('adminCampaignHistory');
 const published=$('adminCampaignPublished');
 let active=false,current=null,busy=false,ticket=0;
 function render(){
  const ready=active&&!!current;
  enabled.disabled=!ready||busy;
  save.disabled=!ready||busy||enabled.checked===current.enabled;
  published.textContent=ready?(current.enabled?'顧客画面に表示中':'顧客画面で非表示'):'読み込み中…';
  const history=current?.history??[];
  list.replaceChildren(...history.map(event=>{
   const row=document.createElement('li'),label=document.createElement('strong'),time=document.createElement('time');
   label.textContent=event.action==='show'?'表示':'非表示';
   time.dateTime=event.created_at;
   time.textContent=portalDate(event.created_at);
   row.append(label,time);
   return row;
  }));
  if(ready&&!history.length){
   const row=document.createElement('li');
   row.className='caption';
   row.textContent='設定変更はありません。';
   list.append(row);
  }
 }
 async function load(){
  if(!active)return;
  const id=++ticket;
  try{
   const data=await call('/api/admin/campaign');
   if(!active||id!==ticket)return;
   current=data;
   enabled.checked=data.enabled;
   render();
  }catch(error){if(active&&id===ticket)status.textContent=error.message;}
 }
 $('adminCampaignRefresh').onclick=()=>{status.textContent='';void load();};
 enabled.onchange=render;
 $('adminCampaignForm').onsubmit=async event=>{
  event.preventDefault();
  if(!active||!current||busy||enabled.checked===current.enabled)return;
  const id=++ticket;
  busy=true;
  status.textContent='';
  render();
  try{
   const data=await call('/api/admin/campaign','POST',{enabled:enabled.checked,version:current.version});
   if(!active||id!==ticket)return;
   current={...current,...data};
   status.textContent='キャンペーンの表示設定を保存しました。';
   void load();
  }catch(error){
   if(!active||id!==ticket)return;
   status.textContent=error.message;
   if(error.status===409)void load();
  }finally{busy=false;if(active)render();}
 };
 return {
  setActive(value){
   if(active===value)return;
   active=value;
   if(active){void load();return;}
   ticket++;
   current=null;
   status.textContent='';
   enabled.checked=false;
   render();
  },
 };
}
