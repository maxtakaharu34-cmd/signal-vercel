-- Keep the existing Sites capability valid while adding an independently revocable Vercel credential.
begin;
alter table demo_private.site_bridge_keys drop constraint site_bridge_keys_id_check;
alter table demo_private.site_bridge_keys add constraint site_bridge_keys_id_check check(id>0);
create or replace function demo_private.site_bridge(credential text,action text,site_actor jsonb,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.demo_scene;event_data jsonb;actor_id text;label_value text;
begin
 if credential is null or char_length(credential)<>64 or not exists(select 1 from demo_private.site_bridge_keys where token_hash=encode(extensions.digest(credential,'sha256'),'hex')) then raise exception 'Site capability required' using errcode='42501';end if;
 actor_id=site_actor->>'id';
 if actor_id is null or char_length(actor_id) not between 1 and 300 then raise exception 'Site identity required' using errcode='42501';end if;
 if action='publish' then
  if not exists(select 1 from demo_private.admin_allowlist where email=lower(site_actor->>'email')) then raise exception 'Owner identity required' using errcode='42501';end if;
  if public.validate_demo_checkpoint(payload->'new_checkpoint') is distinct from true or public.validate_demo_signal(payload->'new_signal') is distinct from true or jsonb_typeof(payload->'new_announcement') is distinct from 'string' or char_length(payload->>'new_announcement')>180 then raise exception 'Invalid scene' using errcode='22023';end if;
  label_value=coalesce(payload->>'event_label','シナリオ・表示設定を変更');if char_length(label_value)>140 then raise exception 'Invalid label' using errcode='22023';end if;
  perform set_config('demo.site_actor',actor_id,true);perform set_config('demo.scene_event_label',label_value,true);
  update public.demo_scene set checkpoint=payload->'new_checkpoint',signal=payload->'new_signal',announcement=payload->>'new_announcement',version=version+1 where id=1 and version=(payload->>'expected_version')::bigint returning * into saved;
  if saved.id is null then raise exception 'Reload the published scene' using errcode='PT409';end if;
 elsif action='read' then select * into saved from public.demo_scene where id=1;
 else raise exception 'Unsupported action' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.version desc),'[]'::jsonb) into event_data from (select version,label,detail,created_at from demo_private.scene_audit order by version desc limit 30) e;
 return jsonb_build_object('scene',to_jsonb(saved),'events',event_data);
end;
$$;

commit;
