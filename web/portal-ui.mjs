const yen=new Intl.NumberFormat('ja-JP');
const date=new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tokyo'});

export const demoYen=value=>yen.format(value)+' 円';
export const portalDate=value=>date.format(new Date(value));

export function renderBalanceHistory(list,items,empty='残高調整はありません。'){
 const doc=list.ownerDocument;
 if(!items.length){
  const item=doc.createElement('li');
  item.className='caption';
  item.textContent=empty;
  list.replaceChildren(item);
  return;
 }
 list.replaceChildren(...items.map(item=>{
  const row=doc.createElement('li'),amount=doc.createElement('strong'),time=doc.createElement('time'),reason=doc.createElement('p');
  amount.textContent=demoYen(item.previous_balance)+' → '+demoYen(item.new_balance);
  time.dateTime=item.created_at;
  time.textContent=portalDate(item.created_at);
  reason.textContent=item.reason;
  row.append(amount,time,reason);
  return row;
 }));
}

export function mountMessageThread(root,window,role,{read,send,active}){
 const list=root.querySelector('[data-thread-messages]');
 const form=root.querySelector('[data-thread-form]');
 const input=form.querySelector('textarea'),submit=form.querySelector('button');
 const older=root.querySelector('[data-thread-older]');
 const status=root.querySelector('[data-thread-status]');
 let generation=0,readNumber=0,next=null,loadedOlder=false,loadingOlder=false,messages=new Map(),request=null,busy=false,rendered='';

 function render({prepend=false,follow=false}={}){
  older.hidden=!next;
  const ordered=[...messages.values()].sort((a,b)=>a.id-b.id);
  const fingerprint=ordered.map(message=>message.id).join(',');
  if(rendered===fingerprint&&list.childElementCount)return;
  rendered=fingerprint;
  const priorTop=list.scrollTop,priorHeight=list.scrollHeight;
  const nearEnd=priorHeight-list.clientHeight-priorTop<=24;
  const doc=root.ownerDocument;
  const nodes=ordered.map(message=>{
   const row=doc.createElement('li'),line=doc.createElement('div'),from=doc.createElement('strong');
   const time=doc.createElement('time'),body=doc.createElement('p');
   row.className='support-message';
   row.dataset.mine=String(message.sender===role);
   line.className='support-message-meta';
   from.textContent=message.sender==='admin'?'サポート':role==='customer'?'あなた':'顧客';
   time.dateTime=message.created_at;
   time.textContent=portalDate(message.created_at);
   body.textContent=message.message;
   line.append(from,time);
   row.append(line,body);
   return row;
  });
  if(!nodes.length){
   const row=doc.createElement('li');
   row.className='caption';
   row.textContent='メッセージはありません。';
   nodes.push(row);
  }
  list.replaceChildren(...nodes);
  if(prepend)list.scrollTop=priorTop+list.scrollHeight-priorHeight;
  else if(follow||nearEnd)list.scrollTop=list.scrollHeight;
 }

 async function refresh(before=null){
  if(!active()||loadingOlder)return;
  const current=generation,ticket=++readNumber;
  if(before)loadingOlder=older.disabled=true;
  try{
   const data=await read(before);
   if(current!==generation||ticket!==readNumber||!active())return;
   if(!before&&!loadedOlder)messages.clear();
   for(const item of data.messages)messages.set(item.id,item);
   if(before||!loadedOlder)next=data.next;
   if(before)loadedOlder=true;
   render({prepend:!!before});
  }catch(error){
   if(current===generation&&ticket===readNumber&&active())status.textContent=error.message;
  }finally{if(current===generation&&before)loadingOlder=older.disabled=false;}
 }
 older.onclick=()=>void refresh(next);
 form.onsubmit=async event=>{
  event.preventDefault();
  const message=input.value.trim();
  if(!active()||busy||!message)return;
  if(request?.message!==message)request={message,commandId:window.crypto.randomUUID()};
  const current=generation;
  busy=submit.disabled=true;
  status.textContent='';
  try{
   const data=await send(request);
   if(current!==generation||!active())return;
   messages.set(data.message.id,data.message);
   input.value='';
   request=null;
   status.textContent='送信しました。';
   render({follow:true});
   void refresh();
  }catch(error){if(current===generation&&active())status.textContent=error.message;}
  finally{if(current===generation)busy=submit.disabled=false;}
 };
 function reset(){
  generation++;
  messages.clear();
  next=null;
  loadedOlder=false;
  loadingOlder=older.disabled=false;
  rendered='';
  request=null;
  busy=submit.disabled=false;
  status.textContent='';
  input.value='';
  list.replaceChildren();
  older.hidden=true;
 }
 return {refresh,reset};
}
