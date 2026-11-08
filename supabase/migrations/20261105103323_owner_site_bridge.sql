-- Narrow capability for this owner-private Site. The random credential is configured separately.
begin;
create table demo_private.site_bridge_keys(id integer primary key check(id=1),token_hash text not null check(char_length(token_hash)=64));
alter table demo_private.site_bridge_keys enable row level security;
revoke all on demo_private.site_bridge_keys from public,anon,authenticated;
alter table demo_private.scene_audit add column actor_site_id text;
create or replace function demo_private.audit_demo_scene() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into demo_private.scene_audit(version,actor_id,actor_site_id,label,detail) values(new.version,auth.uid(),nullif(current_setting('demo.site_actor',true),''),left(coalesce(nullif(current_setting('demo.scene_event_label',true),''),'シナリオを変更'),140),jsonb_build_object('config',new.checkpoint->'config','signal',new.signal,'announcement',new.announcement,'total',new.checkpoint->'total','seed',new.checkpoint->'seed'));
 return new;
end;
$$;
create function demo_private.site_bridge(credential text,action text,site_actor jsonb,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.demo_scene;event_data jsonb;actor_id text;label_value text;
begin
 if credential is null or char_length(credential)<>64 or not exists(select 1 from demo_private.site_bridge_keys where id=1 and token_hash=encode(extensions.digest(credential,'sha256'),'hex')) then raise exception 'Site capability required' using errcode='42501';end if;
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
revoke all on function demo_private.site_bridge(text,text,jsonb,jsonb) from public;
grant usage on schema demo_private to anon;
grant execute on function demo_private.site_bridge(text,text,jsonb,jsonb) to anon,authenticated;
create function public.site_demo_bridge(bridge_token text,operation text,site_actor jsonb,payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select demo_private.site_bridge(bridge_token,operation,site_actor,payload);
$$;
revoke all on function public.site_demo_bridge(text,text,jsonb,jsonb) from public;
grant execute on function public.site_demo_bridge(text,text,jsonb,jsonb) to anon,authenticated;
commit;
