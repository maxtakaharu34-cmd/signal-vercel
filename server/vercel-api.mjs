import {auth,email,encode,input,json,readSealed,seal} from './auth-session.mjs';
import {customerRoutes} from './customer-api.mjs';
import {handleSiteApi} from './site-api.mjs';

const COOKIE='__Host-fx-owner';
const PKCE_COOKIE='__Host-fx-owner-pkce';
const cookie=(value,age=28800)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const pkceCookie=(value,age=1200)=>`${PKCE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const configured=env=>env.SUPABASE_URL?.startsWith('https://')&&env.SUPABASE_PUBLISHABLE_KEY&&env.DEMO_BRIDGE_SECRET?.length>=64&&env.OWNER_EMAIL&&env.SITE_ORIGIN;
async function unseal(request,env){const data=await readSealed(request,env,COOKIE);return data?.id&&data.access&&data.refresh?data:null}
function ownerSession(tokens){if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw Error('認証情報を確認できませんでした。');return {id:crypto.randomUUID(),access:tokens.access_token,refresh:tokens.refresh_token,expires:Date.now()+tokens.expires_in*1000,until:Date.now()+28800000}}
function authRedirect(env,result){return new Response(null,{status:303,headers:{location:env.SITE_ORIGIN+'/admin'+(result?'?auth='+result:''),'cache-control':'private, no-store','referrer-policy':'no-referrer'}})}
function owner(user,env){return user?.id&&user.email_confirmed_at&&!user.is_anonymous&&email(user.email)===email(env.OWNER_EMAIL)}

/** Node/Vercel adapter. Identity headers from public callers are never trusted. */
export async function handleVercelApi(original,env,{fetcher=fetch,siteHandler=handleSiteApi}={}){
 const url=new URL(original.url);url.pathname=url.pathname.replace(/\/$/,'');const headers=new Headers(original.headers);headers.delete('x-signal-owner-service');headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
 const request=new Request(url,original);for(const name of [...request.headers.keys()])if(!headers.has(name))request.headers.delete(name);
 const shared=request.method==='GET'&&['/api/scene','/api/events','/api/live-config'].includes(url.pathname);
 // Optional local UI verification against the already-public simulator; never used in production.
 if(env.NODE_ENV!=='production'&&env.SIGNAL_READ_FALLBACK_URL&&shared){const source=new URL(env.SIGNAL_READ_FALLBACK_URL);if(source.origin!=='https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site')return json({message:'プレビュー接続先を確認してください。'},503);return fetcher(new URL(url.pathname,source),{signal:AbortSignal.timeout(12000),cache:'no-store'})}
 if(!configured(env))return json({message:'管理者がサーバーの接続設定を確認する必要があります。',code:'SERVER_NOT_CONFIGURED'},503);
 if(request.method==='POST'&&request.headers.get('origin')!==env.SITE_ORIGIN)return json({message:'同じサイトから操作してください。',code:'ORIGIN_DENIED'},403);
 try{
  if(url.pathname.startsWith('/api/customer/')){
   return await customerRoutes(request,env,{fetcher,siteHandler});
  }
  if(url.pathname==='/api/auth/request'&&request.method==='POST'){
   const body=await input(request);if(email(body.email)!==email(env.OWNER_EMAIL))return json({message:'所有者のメールアドレスを使用してください。'},403);
   if(env.OWNER_AUTH_METHOD==='code'){await auth(env,'otp','POST',{email:email(body.email),create_user:true},null,fetcher);return json({ok:true,method:'code'})}
   const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
   const redirect=env.SITE_ORIGIN+'/api/auth/callback';
   await auth(env,'otp?redirect_to='+encodeURIComponent(redirect),'POST',{email:email(body.email),create_user:true,code_challenge:challenge,code_challenge_method:'s256'},null,fetcher);
   const response=json({ok:true,method:'link'});response.headers.append('set-cookie',pkceCookie(await seal({verifier,until:Date.now()+1200000},env,PKCE_COOKIE)));return response;
  }
  if(url.pathname==='/api/auth/callback'&&request.method==='GET'){
   if(url.origin!==env.SITE_ORIGIN)return json({message:'正しい管理画面から認証してください。'},403);
   const pending=await readSealed(request,env,PKCE_COOKIE),code=url.searchParams.get('code');
   if(!pending?.verifier||!code||code.length>2048)return authRedirect(env,'wrong_browser');
   try{
    const tokens=await auth(env,'token?grant_type=pkce','POST',{auth_code:code,code_verifier:pending.verifier},null,fetcher);
    const verified=await auth(env,'user','GET',null,tokens.access_token,fetcher);if(!owner(verified,env))throw Error('Owner required');
    const response=authRedirect(env);response.headers.append('set-cookie',cookie(await seal(ownerSession(tokens),env,COOKIE)));response.headers.append('set-cookie',pkceCookie('',0));return response;
   }catch{const response=authRedirect(env,'link_failed');response.headers.append('set-cookie',pkceCookie('',0));return response}
  }
  if(url.pathname==='/api/auth/verify'&&request.method==='POST'){
   const body=await input(request);if(email(body.email)!==email(env.OWNER_EMAIL)||!/^\d{6}$/.test(body.token??''))return json({message:'メールアドレスと6桁のコードを確認してください。'},400);
   const tokens=await auth(env,'verify','POST',{email:email(body.email),token:body.token,type:'email'},null,fetcher);
   const user=await auth(env,'user','GET',null,tokens.access_token,fetcher);if(!owner(user,env))return json({message:'所有者の認証を確認できませんでした。'},403);
   const session=ownerSession(tokens);
   const response=json({ok:true});response.headers.append('set-cookie',cookie(await seal(session,env,COOKIE)));return response;
  }
  if(shared)return siteHandler(request,env,null);
  let session=await unseal(request,env),user=null,updated=false;
  if(session){try{
   if(session.expires<Date.now()+60000){const tokens=await auth(env,'token?grant_type=refresh_token','POST',{refresh_token:session.refresh},null,fetcher);session={...session,access:tokens.access_token,refresh:tokens.refresh_token,expires:Date.now()+tokens.expires_in*1000};updated=true}
   const verified=await auth(env,'user','GET',null,session.access,fetcher);if(owner(verified,env))user={userId:'vercel:'+verified.id+':'+session.id,email:verified.email};
  }catch{session=null}}
  if(url.pathname==='/api/admin/logout'&&request.method==='POST'){
   if(session)await auth(env,'logout?scope=local','POST',null,session.access,fetcher).catch(()=>{});
   const response=json({ok:true});response.headers.append('set-cookie',cookie('',0));response.headers.append('set-cookie',pkceCookie('',0));response.headers.append('set-cookie','signal_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return response;
  }
  if(!user)return json({message:'所有者のメール認証が必要です。',code:'SIGN_IN_REQUIRED'},401);
  const response=await siteHandler(request,env,user);if(updated)response.headers.append('set-cookie',cookie(await seal(session,env,COOKIE)));return response;
 }catch(error){return json({message:error.message||'通信を確認してください。',code:'AUTH_FAILED'},error.status||502)}
}
