export const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const encode=bytes=>Buffer.from(bytes).toString('base64url');
const decode=value=>Buffer.from(value,'base64url');
export const email=value=>String(value??'').trim().toLowerCase();
async function sessionKey(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vercel-owner-cookie-v1:'+env.DEMO_BRIDGE_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export async function seal(value,env,purpose){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(purpose)},await sessionKey(env),new TextEncoder().encode(JSON.stringify(value)));return encode(iv)+'.'+encode(cipher)}
export async function readSealed(request,env,name){try{const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);if(!value||value.length>6000)return null;const [iv,cipher,extra]=value.split('.');if(extra||!iv||!cipher)return null;const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(name)},await sessionKey(env),decode(cipher));const data=JSON.parse(new TextDecoder().decode(clear));return data.until>Date.now()?data:null}catch{return null}}
export async function auth(env,path,method='GET',body,token,fetcher=fetch){
 const response=await fetcher(env.SUPABASE_URL+'/auth/v1/'+path,{method,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 const data=response.status===204?{}:await response.json();if(!response.ok)throw Object.assign(Error(response.status===429?'少し時間をおいてから再度お試しください。':'認証できませんでした。メールアドレスと認証コードを確認してください。'),{status:response.status===429?429:response.status>=500?502:401,providerCode:data.error_code??data.code});return data;
}
export async function input(request,limit=2048){const text=await request.text();if(text.length>limit)throw Object.assign(Error('入力が大きすぎます。'),{status:413});try{return JSON.parse(text)}catch{throw Object.assign(Error('入力内容を確認してください。'),{status:400})}}
