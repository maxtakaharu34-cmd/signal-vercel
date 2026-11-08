export function createSceneRepository(client){return {
 async access(){const r=await client.rpc('get_demo_access');if(r.error)throw r.error;return r.data},
 async load(){const r=await client.from('demo_scene').select('id,version,checkpoint,signal,announcement,updated_at').eq('id',1).single();if(r.error)throw r.error;return r.data},
 async events(){const r=await client.rpc('get_demo_scene_events');if(r.error)throw r.error;return r.data||[]},
 async publish(expectedVersion,value,label){const r=await client.rpc('publish_demo_scene',{expected_version:expectedVersion,new_checkpoint:value.checkpoint,new_signal:value.signal,new_announcement:value.announcement,event_label:label});if(r.error)throw r.error;return r.data},
 subscribe(callback,status){if(client.siteAuth)return client.subscribeScene(callback,status);const channel=client.channel('shared-demo-scene').on('postgres_changes',{event:'UPDATE',schema:'public',table:'demo_scene',filter:'id=eq.1'},event=>callback(event.new)).subscribe(status);return ()=>{void client.removeChannel(channel)}}
}}
