-- Business conflicts must return HTTP 409; SQLSTATE 40001 triggers PostgREST transaction retries.
-- https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
begin;
create or replace function public.guard_demo_workspace() returns trigger language plpgsql set search_path = '' as $$
begin
 if not public.validate_demo_checkpoint(new.checkpoint) then raise exception 'Invalid demo checkpoint' using errcode='22023'; end if;
 if tg_op='UPDATE' then
  if new.owner_id <> old.owner_id or new.version <> old.version+1 then raise exception 'Invalid workspace version' using errcode='PT409'; end if;
 elsif new.version <> 1 then raise exception 'Initial version must be 1' using errcode='22023'; end if;
 new.updated_at=now(); return new;
end;
$$;
create or replace function public.save_demo_workspace(expected_version bigint,new_checkpoint jsonb,event_label text default null) returns public.demo_workspaces language plpgsql security invoker set search_path = '' as $$
declare saved public.demo_workspaces;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.validate_demo_checkpoint(new_checkpoint) then raise exception 'Invalid demo checkpoint' using errcode='22023'; end if;
 if expected_version=0 then
  insert into public.demo_workspaces(owner_id,version,checkpoint) values(auth.uid(),1,new_checkpoint) on conflict do nothing returning * into saved;
 else
  update public.demo_workspaces set checkpoint=new_checkpoint,version=expected_version+1 where owner_id=auth.uid() and version=expected_version returning * into saved;
 end if;
 if saved.owner_id is null then raise exception 'Another session changed this workspace. Reload before saving.' using errcode='PT409'; end if;
 if event_label is not null then insert into public.demo_workspace_events(owner_id,label,config) values(auth.uid(),event_label,new_checkpoint->'config'); end if;
 return saved;
end;
$$;
commit;
