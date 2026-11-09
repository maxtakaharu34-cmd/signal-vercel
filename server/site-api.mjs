import {projectScene,startAutomation,stopAutomation,tuneAutomation,validAutomation,validAutomationSettings} from '../web/timeline.mjs';
import {validateScene,directionLabel} from '../web/engine.mjs';
import {LIVE_TOPIC,LIVE_EVENT,notifySceneSaved} from './live-notify.mjs';
const SESSION='signal_admin';const encoder=new TextEncoder();
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'private, no-store',...extra}});
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function mint(identity,secret){const payload=encode(encoder.encode(JSON.stringify({id:identity.id,exp:Date.now()+8*60*60*1000})));const signature=await crypto.subtle.sign('HMAC',await key(secret),encoder.encode('admin-v1:'+payload));return payload+'.'+encode(new Uint8Array(signature))}
async function validCookie(request,identity,secret){try{const cookie=request.headers.get('cookie')||'',value=request.headers.get('x-signal-admin-session')||cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION+'='))?.slice(SESSION.length+1);if(!value)return false;const [payload,signature,...rest]=value.split('.');if(rest.length||!payload||!signature)return false;const claim=JSON.parse(new TextDecoder().decode(decode(payload)));if(claim.id!==identity.id||!Number.isFinite(claim.exp)||claim.exp<=Date.now())return false;return await crypto.subtle.verify('HMAC',await key(secret),decode(signature),encoder.encode('admin-v1:'+payload))}catch{return false}}
function principal(request,env,user){if(user?.userId&&user.email)return {id:user.userId,email:user.email,name:user.displayName||user.email};const service=request.headers.get('x-signal-owner-service');if(env.DEMO_BRIDGE_SECRET?.length>=64&&same(service,env.DEMO_BRIDGE_SECRET))return {id:'site-owner-service',email:env.OWNER_EMAIL,name:'管理者'};return null}
async function body(request){const text=await request.text();if(text.length>130000)throw Object.assign(Error('送信データが大きすぎます。'),{status:413});try{return JSON.parse(text)}catch{throw Object.assign(Error('入力内容を確認してください。'),{status:400})}}
async function bridge(env,identity,operation,payload={}){
 if(!env.DEMO_BRIDGE_SECRET||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw Object.assign(Error('接続設定を確認してください。'),{status:503});
 const response=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/site_demo_bridge',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({bridge_token:env.DEMO_BRIDGE_SECRET,operation,site_actor:{id:identity.id,email:identity.email},payload}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.code==='PT409'?'他の画面で更新されました。公開中の状態を読み込み直してください。':'保存内容またはアクセス権を確認してください。'),{status:response.status,code:data.code});return data;
}
/** @param {{userId: string, email: string, displayName?: string}|null} user */
export async function handleSiteApi(request,env,user=null){
 const path=new URL(request.url).pathname;
 // Dispatch enforces the Site audience. These routes expose only the common,
 // explicitly simulated presentation; account data and all writes stay gated.
 const sharedRead=request.method==='GET'&&['/api/scene','/api/events','/api/live-config'].includes(path);
 const identity=principal(request,env,user)||(sharedRead?{id:'shared-demo-viewer',email:'',name:'閲覧者'}:null);if(!identity)return json({message:'サイトへのログインが必要です。',code:'SIGN_IN_REQUIRED'},401);
 const owner=!!identity.email&&identity.email.toLowerCase()===String(env.OWNER_EMAIL||'').toLowerCase();
 if(request.method==='POST'&&request.headers.get('origin')!==env.SITE_ORIGIN)return json({message:'同じサイトから操作してください。',code:'ORIGIN_DENIED'},403);
 try{
  if(path==='/api/session'&&request.method==='GET')return json({user:identity,owner_eligible:owner,is_admin:owner&&await validCookie(request,identity,env.DEMO_BRIDGE_SECRET||'')});
  if(path==='/api/live-config'&&request.method==='GET')return json({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,topic:LIVE_TOPIC,event:LIVE_EVENT});
  if(path==='/api/admin/login'&&request.method==='POST'){
   if(!owner)return json({message:'管理者専用です。',code:'FORBIDDEN'},403);const input=await body(request);
   if(!same(input.pin,env.ADMIN_ENTRY_PIN))return json({message:'コードが違います。',code:'INVALID_PIN'},401);
   if(!env.DEMO_BRIDGE_SECRET||env.DEMO_BRIDGE_SECRET.length<64)return json({message:'管理画面の接続設定を確認してください。'},503);
   const cookie=await mint(identity,env.DEMO_BRIDGE_SECRET);return json({ok:true,session:cookie},200,{'set-cookie':`${SESSION}=${cookie}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=28800`});
  }
  if(path==='/api/admin/logout'&&request.method==='POST')return json({ok:true},200,{'set-cookie':`${SESSION}=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0`});
  if((path==='/api/scene'||path==='/api/events')&&request.method==='GET'){const data=await bridge(env,identity,'read');return json(path==='/api/scene'?projectScene(data.scene):data.events)}
  if(path==='/api/admin/automation'&&request.method==='POST'){
   if(!owner||!await validCookie(request,identity,env.DEMO_BRIDGE_SECRET||''))return json({message:'管理画面にコードでログインしてください。',code:'FORBIDDEN'},403);
   const input=await body(request);
   if(!Number.isSafeInteger(input.expected_version)||input.expected_version<1||!['start','stop','tune'].includes(input.action)||(input.action==='start'&&![-1,0,1].includes(input.direction))||(input.action==='tune'&&!validAutomationSettings(input.settings)))return json({message:'操作内容を確認してください。',code:'INVALID_AUTOMATION'},400);
   const source=await bridge(env,identity,'read');
   if(source.scene.version!==input.expected_version)return json({message:'他の画面で更新されています。再同期してください。',code:'PT409'},409);
   if(!validateScene(source.scene))return json({message:'保存データを確認してください。'},502);
   if(input.action==='tune'&&!validAutomation(source.scene.checkpoint.automation))return json({message:'先に自動シミュレーションを開始してください。',code:'AUTOMATION_STOPPED'},409);
   const now=Date.now(),next=input.action==='stop'?stopAutomation(source.scene,now):input.action==='tune'?tuneAutomation(source.scene,input.settings,now):startAutomation(source.scene,input.direction,now);
   const label=input.action==='stop'?'自動シミュレーションを停止':input.action==='tune'?'自動更新の速さ・値動きの大きさを変更':'自動シミュレーションを'+directionLabel(input.direction)+'へ変更';
   const payload={expected_version:input.expected_version,new_checkpoint:next.checkpoint,new_signal:next.signal,new_announcement:next.announcement,event_label:label};
   const saved=await bridge(env,identity,'publish',payload),notified=await notifySceneSaved(env);
   return json({...projectScene(saved.scene,now),delivery:{notified}});
  }
  if(path==='/api/admin/publish'&&request.method==='POST'){
   if(!owner||!await validCookie(request,identity,env.DEMO_BRIDGE_SECRET||''))return json({message:'管理画面にコードでログインしてください。',code:'FORBIDDEN'},403);
   const input=await body(request);const data=await bridge(env,identity,'publish',input);const notified=await notifySceneSaved(env);return json({...data.scene,delivery:{notified}});
  }
  return json({message:'ページが見つかりません。'},404);
 }catch(error){return json({message:error.message||'接続を確認してください。',code:error.code||'REQUEST_FAILED'},error.status||502)}
}
