import {subscribeScene} from './live.mjs';
export function createSiteClient(window,options={}){
 let state=null,adminSession=null;
 async function call(path,method='GET',body){const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),method==='POST'?28000:20000);try{const response=await window.fetch(path,{signal:controller.signal,method,credentials:'same-origin',cache:'no-store',headers:{...(body?{'content-type':'application/json'}:{}),...(adminSession?{'x-signal-admin-session':adminSession}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message||'接続を確認してください。'),{code:data.code,status:response.status});return data}finally{window.clearTimeout(timer)}}
 return {siteAuth:true,
  ownerRequest(email){return call('/api/auth/request','POST',{email})},
  ownerVerify(email,token){return call('/api/auth/verify','POST',{email,token})},
  subscribeScene(onRecord,onStatus){return subscribeScene({window,call,onRecord,onStatus,...options})},
  auth:{async getSession(){try{state=await call('/api/session');return {data:{session:state.user?{user:{id:state.user.id,email:state.user.email}}:null}}}catch(error){return {data:{session:null},error:error.status===401?null:error}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},async signOut(){try{await call('/api/admin/logout','POST',{});adminSession=null;state=null;return {error:null}}catch(error){return {error}}}},
  adminCustomerRequest:call,
  async automation(action,direction,expected_version,settings){return call('/api/admin/automation','POST',{action,direction,expected_version,...(settings?{settings}:{})})},
  async pinLogin(pin){const result=await call('/api/admin/login','POST',{pin});adminSession=result.session;state=await call('/api/session')},
  async rpc(name,args){try{if(name==='get_demo_access'){state=await call('/api/session');return {data:{is_admin:state.is_admin}}}if(name==='get_demo_scene_events')return {data:await call('/api/events')};if(name==='publish_demo_scene')return {data:await call('/api/admin/publish','POST',args)};throw Error('未対応の操作です。')}catch(error){return {error}}},
  from(){return {select:()=>({eq:()=>({single:async()=>{try{return {data:await call('/api/scene')}}catch(error){return {error}}}})})}}
 }
}
