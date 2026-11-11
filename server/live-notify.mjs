// This public topic carries invalidation hints only. Never put scene data,
// account identifiers, signed sessions, or server capabilities in Broadcast.
export const LIVE_TOPIC='demo-scene-refresh-v1';
export const LIVE_EVENT='refresh';
export async function notifySceneSaved(env){
 return notifyRefresh(env,LIVE_TOPIC,fetch);
}
export async function notifyRefresh(env,topic,fetcher){
 try{
  const response=await fetcher(env.SUPABASE_URL+'/realtime/v1/api/broadcast',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({messages:[{topic,event:LIVE_EVENT,payload:{changed:true}}]}),signal:AbortSignal.timeout(1200)});
  if(!response.ok)console.warn('Refresh notification unavailable:',response.status);
  return response.ok;
 }catch{console.warn('Refresh notification timed out; periodic synchronization remains available.');return false}
}
