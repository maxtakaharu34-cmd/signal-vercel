import {campaignApi} from './campaign-api.mjs';
import {auth,email,encode,input,json,readSealed,seal} from './auth-session.mjs';
import {customerPortal,portalRpc} from './customer-portal.mjs';
import {customerOrders} from './customer-orders.mjs';

const SESSION='__Host-fx-customer';
const FACTOR='__Host-fx-customer-factor';
const CUSTOMER_PENDING='__Host-fx-customer-pkce';
const SESSION_AGE=28800, PENDING_AGE=1200;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cookie=(name,value,age,lax=false)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${lax?'Lax':'Strict'}; Max-Age=${age}`;
const secureUser=user=>uuid.test(user?.id??'')&&user.email_confirmed_at&&!user.is_anonymous;
const verifiedFactors=user=>(user?.factors??[]).filter(factor=>factor.factor_type==='totp'&&factor.status==='verified'&&uuid.test(factor.id));
const needSignIn=()=>json({code:'SIGN_IN_REQUIRED',message:'口座にログインしてください。'},401);

function verifiedAssurance(session,user){
 // Only decode a token that /auth/v1/user has accepted for this request.
 try{
  const claims=JSON.parse(Buffer.from(session.access.split('.')[1],'base64url').toString());
  return claims.sub===user.id&&claims.aal==='aal2'&&verifiedFactors(user).length>0;
 }catch{return false;}
}

function tokenSession(tokens,until=Date.now()+SESSION_AGE*1000){
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||!(tokens.expires_in>0))throw Error('認証を確認できませんでした。');
 return {access:tokens.access_token,refresh:tokens.refresh_token,expires:Date.now()+tokens.expires_in*1000,until};
}
async function attachSession(response,session,env){
 if(session)response.headers.append('set-cookie',cookie(SESSION,await seal(session,env,SESSION),Math.max(1,Math.floor((session.until-Date.now())/1000))));
 return response;
}
function authReturn(env,result){
 const response=new Response(null,{status:303,headers:{location:env.SITE_ORIGIN+'/?account='+result+'#trades','cache-control':'private, no-store','referrer-policy':'no-referrer'}});
 response.headers.append('set-cookie',cookie(CUSTOMER_PENDING,'',0,true));
 return response;
}
function status(session,user){
 if(verifiedAssurance(session,user))return {enabled:true,state:'ready',email:user.email};
 return {enabled:true,state:verifiedFactors(user).length?'challenge':'enroll'};
}

export async function customerRoutes(request,env,{fetcher,siteHandler}){
 const url=new URL(request.url),path=url.pathname,post=request.method==='POST';
 if(env.CUSTOMER_AUTH_ENABLED!=='true'){
  return path==='/api/customer/session'&&!post?json({enabled:false,state:'guest'}):json({message:'口座のログインは準備中です。'},503);
 }
 const call=(path,method,body,token)=>auth(env,path,method,body,token,fetcher);
 if(path==='/api/customer/email'&&post){
  const body=await input(request),address=email(body?.email);
  if(address.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||!['login','register'].includes(body?.mode))return json({message:'メールアドレスを確認してください。'},400);
  const verifier=encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  try{
   await call('otp?redirect_to='+encodeURIComponent(env.SITE_ORIGIN+'/api/customer/callback'),'POST',{email:address,create_user:body.mode==='register',code_challenge:challenge,code_challenge_method:'s256'});
  }catch(error){
   if(error.providerCode==='email_address_not_authorized')return json({message:'メール認証サービスの設定が必要です。'},503);
   if(!['otp_disabled','user_not_found','signup_disabled'].includes(error.providerCode))throw error;
   if(error.providerCode==='signup_disabled'&&body.mode==='register')return json({message:'新規登録は現在停止中です。'},503);
   // The login response does not disclose whether an address is registered.
  }
  const response=json({ok:true});
  const pending=await seal({verifier,email:address,until:Date.now()+PENDING_AGE*1000},env,CUSTOMER_PENDING);
  response.headers.append('set-cookie',cookie(CUSTOMER_PENDING,pending,PENDING_AGE,true));
  return response;
 }
 if(path==='/api/customer/callback'&&!post){
  const pending=await readSealed(request,env,CUSTOMER_PENDING),code=url.searchParams.get('code');
  if(url.origin!==env.SITE_ORIGIN||!pending?.verifier||!code||code.length>2048)return authReturn(env,'failed');
  try{
   const tokens=await call('token?grant_type=pkce','POST',{auth_code:code,code_verifier:pending.verifier});
   const user=await call('user','GET',null,tokens.access_token);
   if(!secureUser(user)||email(user.email)!==pending.email)return authReturn(env,'failed');
   return await attachSession(authReturn(env,'verified'),tokenSession(tokens),env);
  }catch{return authReturn(env,'failed');}
 }
 let session=await readSealed(request,env,SESSION),user,updated=false;
 if(path==='/api/customer/logout'&&post){
  if(session)await call('logout?scope=local','POST',null,session.access).catch(()=>{});
  const response=json({ok:true});
  for(const name of [SESSION,FACTOR,CUSTOMER_PENDING])response.headers.append('set-cookie',cookie(name,'',0,name===CUSTOMER_PENDING));
  return response;
 }
 if(session){
  try{
   if(session.expires<Date.now()+45000){
    session=tokenSession(await call('token?grant_type=refresh_token','POST',{refresh_token:session.refresh}),session.until);
    updated=true;
   }
   user=await call('user','GET',null,session.access);
   if(!secureUser(user))user=null;
  }catch(error){if(error.status!==401)throw error;user=null;}
 }
 const reply=response=>updated&&user?attachSession(response,session,env):response;
 if(path==='/api/customer/session'&&!post){
  const state=user?status(session,user):{enabled:true,state:'guest'};
  if(state.state==='ready')Object.assign(state,await portalRpc(env,session.access,fetcher,'open'));
  return reply(json(state));
 }
 if(!user)return needSignIn();

 if(path==='/api/customer/mfa/enroll'&&post){
  if(verifiedFactors(user).length)return reply(json({message:'登録済みの認証アプリを使用してください。'},409));
  // Remove abandoned, unverified enrollment attempts for this application only.
  for(const factor of user.factors??[]){
   if(['FX SIM','FX DEMO'].includes(factor.friendly_name)&&factor.status==='unverified'&&uuid.test(factor.id))await call('factors/'+factor.id,'DELETE',null,session.access);
  }
  const factor=await call('factors','POST',{factor_type:'totp',friendly_name:'FX SIM',issuer:'FX SIM'},session.access);
  if(!uuid.test(factor.id??'')||!factor.totp?.qr_code||!factor.totp.secret)throw Error('認証アプリの登録情報を取得できませんでした。');
  const response=json({qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(factor.totp.qr_code),secret:factor.totp.secret});
  response.headers.append('set-cookie',cookie(FACTOR,await seal({id:factor.id,user:user.id,until:Date.now()+PENDING_AGE*1000},env,FACTOR),PENDING_AGE));
  return reply(response);
 }
 if(path==='/api/customer/mfa/verify'&&post){
  const body=await input(request);
  if(!/^\d{6}$/.test(body?.code??''))return reply(json({message:'6桁の認証コードを入力してください。'},400));
  const pending=await readSealed(request,env,FACTOR);
  const factor=verifiedFactors(user)[0]?.id??(pending?.user===user.id?pending.id:null);
  if(!uuid.test(factor??''))return reply(json({message:'認証アプリを先に設定してください。'},409));
  try{
   const challenge=await call('factors/'+factor+'/challenge','POST',{},session.access);
   const tokens=await call('factors/'+factor+'/verify','POST',{challenge_id:challenge.id,code:body.code},session.access);
   const next=tokenSession(tokens,session.until),confirmed=await call('user','GET',null,next.access);
   if(confirmed.id!==user.id||!secureUser(confirmed)||!verifiedAssurance(next,confirmed))throw Error('二段階認証を確認できませんでした。');
   const profile=await portalRpc(env,next.access,fetcher,'open');
   const response=json({...status(next,confirmed),...profile});
   response.headers.append('set-cookie',cookie(FACTOR,'',0));
   return await attachSession(response,next,env);
  }catch(error){
   if(error.status===401)return reply(json({message:'認証アプリの最新コードを確認してください。'},401));
   throw error;
  }
 }
 if(!verifiedAssurance(session,user))return reply(json({code:'MFA_REQUIRED',message:'認証アプリで二段階認証を完了してください。'},403));
 if(path==='/api/customer/campaign')return reply(await campaignApi(request,env,fetcher,session.access));
 if(path==='/api/customer/orders')return reply(await customerOrders(request,env,session.access,{fetcher,siteHandler}));
 if(['/api/customer/activity','/api/customer/messages'].includes(path))return reply(await customerPortal(request,env,session.access,fetcher));
 return json({message:'ページが見つかりません。'},404);
}
