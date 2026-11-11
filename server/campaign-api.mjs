import {input,json} from './auth-session.mjs';
import {notifyRefresh} from './live-notify.mjs';
import {CAMPAIGN_TOPIC} from '../web/campaign-rules.mjs';

const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positive=value=>Number.isSafeInteger(value)&&value>=1;
const errors={
 PT404:[404,'対象のデモ口座が見つかりません。'],
 PT409:[409,'キャンペーンの状態が更新されました。最新の内容を確認してください。'],
 PT422:[422,'デモ残高の上限を超えるため、ボーナスを適用できません。'],
 '42501':[403,'この操作を行う権限がありません。'],
 '22023':[400,'キャンペーンの入力内容を確認してください。'],
};

async function rpc(env,fetcher,name,body,access){
 const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json',...(access?{authorization:'Bearer '+access}:{})},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(12000),
 });
 const data=await response.json();
 if(!response.ok){
  const [status,message]=errors[data.code]??[502,'キャンペーンに接続できませんでした。'];
  throw Object.assign(Error(message),{status});
 }
 return data;
}

export async function publicCampaign(env,fetcher){
 return json(await rpc(env,fetcher,'demo_campaign_public_state',{}));
}

export async function campaignApi(request,env,fetcher,access,{admin=false}={}){
 const url=new URL(request.url),path=url.pathname;
 const read=request.method==='GET',post=request.method==='POST';
 const call=(operation,payload={})=>rpc(env,fetcher,'demo_campaign_transaction',{bridge_token:env.DEMO_BRIDGE_SECRET,operation,payload},access);
 const invalid=()=>json({message:'キャンペーンの入力内容を確認してください。'},400);
 const notifyAccount=async({notifyToken,...result})=>{
  if(id.test(notifyToken??''))await notifyRefresh(env,'demo-account-refresh-'+notifyToken,fetcher);
  return json(result);
 };

 if(admin&&path==='/api/admin/campaign'){
  if(read)return json(await call('admin_settings'));
  if(post){
   const body=await input(request);
   if(typeof body?.enabled!=='boolean'||!positive(body.version))return invalid();
   const result=await call('admin_publish',{enabled:body.enabled,version:body.version});
   if(result.changed)await notifyRefresh(env,CAMPAIGN_TOPIC,fetcher);
   return json(result);
  }
 }
 if(admin&&path==='/api/admin/customers/campaign'){
  const customerId=url.searchParams.get('customer');
  if(!id.test(customerId??''))return invalid();
  if(read)return json(await call('admin_status',{customerId}));
  if(post){
   const body=await input(request);
   if(!positive(body?.round))return invalid();
   return notifyAccount(await call('admin_reset',{customerId,round:body.round}));
  }
 }
 if(!admin&&path==='/api/customer/campaign'){
  if(read)return json(await call('status'));
  if(post){
   const body=await input(request);
   if(!id.test(body?.commandId??'')||!id.test(body.creditId??'')||!positive(body.round)||body.apply!==true)return invalid();
   return notifyAccount(await call('claim',{commandId:body.commandId,creditId:body.creditId,round:body.round,apply:true}));
  }
 }
 return json({message:'ページが見つかりません。'},404);
}
