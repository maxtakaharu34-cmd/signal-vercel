// This public topic carries invalidation hints only. Never put scene data,
// account identifiers, signed sessions, or server capabilities in Broadcast.
export const LIVE_TOPIC='demo-scene-refresh-v1';
export const LIVE_EVENT='refresh';
export async function notifySceneSaved(env){
 try{
  const response=await fetch(env.SUPABASE_URL+'/realtime/v1/api/broadcast',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({messages:[{topic:LIVE_TOPIC,event:LIVE_EVENT,payload:{changed:true}}]}),signal:AbortSignal.timeout(1200)});
  if(!response.ok)console.warn('Scene notification unavailable:',response.status);
  return response.ok;
 }catch{console.warn('Scene notification timed out; periodic synchronization remains available.');return false}
}
