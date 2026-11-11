import {notifyRefresh} from './live-notify.mjs';
import {input,json} from './auth-session.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>json({message},status);
const errors={
 PT404:[404,'仮想口座が見つかりません。'],
 PT409:[409,'他の操作でデータが更新されました。内容を確認してからやり直してください。'],
 PT422:[422,'保有建玉または未約定注文がある間は残高を減額できません。'],
 '42501':[403,'この操作を行う権限がありません。'],
 '22023':[400,'入力内容を確認してください。'],
};
const isMoney=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!value.includes('\0')?value.trim():null;

export async function portalRpc(env,access,fetcher,operation,payload={}){
 const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/customer_portal',{
  method:'POST',
  headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+access,'content-type':'application/json'},
  body:JSON.stringify({bridge_token:env.DEMO_BRIDGE_SECRET,operation,payload}),
  signal:AbortSignal.timeout(12000),
 });
 const data=await response.json();
 if(!response.ok){
  const [status,message]=errors[data.code]??[502,'仮想口座との接続を確認してください。'];
  throw Object.assign(Error(message),{status});
 }
 return data;
}

export async function customerPortal(request,env,access,fetcher,{admin=false}={}){
 const {pathname,searchParams}=new URL(request.url);
 const post=request.method==='POST';
 const rpc=(action,payload)=>portalRpc(env,access,fetcher,admin?'admin_'+action:action,payload);
 const publish=async({notifyToken,...result})=>{
  if(uuid.test(notifyToken??''))await notifyRefresh(env,'demo-account-refresh-'+notifyToken,fetcher);
  return json(result);
 };

 if(admin&&pathname==='/api/admin/customers'&&!post){
  const query=text(searchParams.get('q')??'',120),after=searchParams.get('after');
  if(query===null||(after&&!uuid.test(after)))return fail('検索条件を確認してください。');
  const {customers}=await rpc('list',{query,after});
  return json({customers:customers.slice(0,25),next:customers.length>25?customers[24].id:null});
 }

 const payload=admin?{customerId:searchParams.get('customer')}:{};
 if(admin&&!uuid.test(payload.customerId??''))return fail('対象の仮想口座を選択してください。');

 if(pathname.endsWith('/balance')&&admin&&post){
  const body=await input(request);
  const reason=text(body?.reason,120);
  if(!reason||!uuid.test(body?.commandId??'')||!isMoney(body.balance)||!Number.isSafeInteger(body.expectedBalance)){
   return fail('仮想残高と変更理由を確認してください。');
  }
  return publish(await rpc('adjust',{...payload,commandId:body.commandId,balance:body.balance,expectedBalance:body.expectedBalance,reason}));
 }
 if(pathname.endsWith('/activity')&&!post)return json(await rpc('activity',payload));

 if(pathname.endsWith('/messages')){
  if(!post){
   const before=searchParams.get('before');
   if(before!==null&&(!/^\d{1,15}$/.test(before)||Number(before)<1))return fail('取得位置を確認してください。');
   const {messages}=await rpc('messages',{...payload,before});
   return json({messages:messages.slice(0,30),next:messages.length>30?String(messages[29].id):null});
  }
  const body=await input(request,6500),message=text(body?.message,800);
  if(!message||!uuid.test(body?.commandId??''))return fail('メッセージの内容を確認してください。');
  return publish(await rpc('send',{...payload,commandId:body.commandId,message}));
 }
 return fail('ページが見つかりません。',404);
}
