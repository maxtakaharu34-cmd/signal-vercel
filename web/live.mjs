import {RealtimeClient} from '@supabase/supabase-js';

export function subscribeScene({window,call,onRecord,onStatus,createRealtime=(url,options)=>new RealtimeClient(url,options)}){
 let closed=false,realtime=null,channel=null,retry=null,timer=null,running=false,pending=false,lastRead=0,attempt=0;
 // Broadcast is an untrusted wake-up hint. Only server-authoritative same-origin API reads
 // can supply records. Coalesce bursts to at most four reads per second.
 const invalidate=()=>{if(closed)return;pending=true;if(running||timer||window.document.hidden)return;timer=window.setTimeout(async()=>{
  timer=null;if(closed||window.document.hidden)return;pending=false;running=true;lastRead=Date.now();
  try{const record=await call('/api/scene');if(!closed)onRecord(record)}catch{if(!closed)onStatus('CHANNEL_ERROR')}
  finally{running=false;if(pending&&!closed)invalidate()}
 },Math.max(0,250-(Date.now()-lastRead)))};
 const connect=async()=>{try{
  const config=await call('/api/live-config');if(closed)return;
  realtime=createRealtime(config.url+'/realtime/v1',{params:{apikey:config.publishableKey},timeout:10000});
  channel=realtime.channel(config.topic,{config:{private:false,broadcast:{self:false},presence:{enabled:false}}});
  channel.on('broadcast',{event:config.event},message=>{if(message.payload?.changed===true)invalidate()}).subscribe(status=>{if(closed)return;onStatus(status);if(status==='SUBSCRIBED'){attempt=0;invalidate()}});
 }catch{if(closed)return;onStatus('CHANNEL_ERROR');retry=window.setTimeout(connect,Math.min(30000,2000*2**attempt++))}};
 const foreground=()=>{if(!window.document.hidden)invalidate()};
 window.addEventListener('online',foreground);window.document.addEventListener('visibilitychange',foreground);
 if(typeof window.WebSocket==='function')void connect();else onStatus('UNAVAILABLE');
 return ()=>{closed=true;window.clearTimeout(timer);window.clearTimeout(retry);window.removeEventListener('online',foreground);window.document.removeEventListener('visibilitychange',foreground);if(channel)void realtime.removeChannel(channel).catch(()=>{});if(realtime)void realtime.disconnect().catch(()=>{})};
}
