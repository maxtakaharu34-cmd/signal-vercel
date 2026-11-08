-- Private, owner-scoped demo state only. No money, orders or customer profit records.
begin;
create table public.demo_workspaces (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 version bigint not null check(version > 0),
 checkpoint jsonb not null check(pg_column_size(checkpoint) <= 100000),
 updated_at timestamptz not null default now()
);
create table public.demo_workspace_events (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 label text not null check(char_length(label) between 1 and 240),
 config jsonb not null,
 created_at timestamptz not null default now()
);
create index demo_workspace_events_owner_time on public.demo_workspace_events(owner_id,created_at desc);
alter table public.demo_workspaces enable row level security;
alter table public.demo_workspace_events enable row level security;
create schema if not exists demo_private;
revoke all on schema demo_private from public,anon;
grant usage on schema demo_private to authenticated;
create function demo_private.session_allowed() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (
  (auth.jwt()->>'aal') = 'aal2'
  or not exists(select 1 from auth.mfa_factors where user_id = (select auth.uid()) and status='verified')
 );
$$;
revoke all on function demo_private.session_allowed() from public,anon;
grant execute on function demo_private.session_allowed() to authenticated;
-- Restrictive policies also gate future permissive owner policies.
create policy workspace_mfa on public.demo_workspaces as restrictive for all to authenticated using((select demo_private.session_allowed())) with check((select demo_private.session_allowed()));
create policy events_mfa on public.demo_workspace_events as restrictive for all to authenticated using((select demo_private.session_allowed())) with check((select demo_private.session_allowed()));
create policy workspace_read on public.demo_workspaces for select to authenticated using(owner_id = (select auth.uid()));
create policy workspace_insert on public.demo_workspaces for insert to authenticated with check(owner_id = (select auth.uid()));
create policy workspace_update on public.demo_workspaces for update to authenticated using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
create policy event_read on public.demo_workspace_events for select to authenticated using(owner_id = (select auth.uid()));
create policy event_insert on public.demo_workspace_events for insert to authenticated with check(owner_id = (select auth.uid()));
revoke all on public.demo_workspaces,public.demo_workspace_events from anon;
revoke all on public.demo_workspaces,public.demo_workspace_events from authenticated;
grant select,insert,update on public.demo_workspaces to authenticated;
grant select,insert on public.demo_workspace_events to authenticated;
grant usage,select on sequence public.demo_workspace_events_id_seq to authenticated;
create function public.validate_demo_checkpoint(value jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare row_value jsonb;
begin
 if value is null or jsonb_typeof(value) <> 'object' or (value->>'schemaVersion')::int <> 1 then return false; end if;
 if exists(select 1 from unnest(array['schemaVersion','total','seed','rngState']) k where jsonb_typeof(value->k) is distinct from 'number') then return false; end if;
 if exists(select 1 from unnest(array['direction','volatility','speed']) k where jsonb_typeof(value->'config'->k) is distinct from 'number') then return false; end if;
 if (value->>'total')::bigint < 72 or (value->>'seed')::bigint < 0 or (value->>'rngState')::bigint not between 0 and 4294967295 then return false; end if;
 if (value->'config'->>'direction')::int not in (-1,0,1) or (value->'config'->>'volatility')::int not between 1 and 10 or (value->'config'->>'speed')::int not in (1,2,5,10) then return false; end if;
 if jsonb_typeof(value->'rows') <> 'array' or jsonb_array_length(value->'rows') not between 72 and 120 then return false; end if;
 for row_value in select * from jsonb_array_elements(value->'rows') loop
  if exists(select 1 from unnest(array['open','high','low','close','time']) k where jsonb_typeof(row_value->k) is distinct from 'number') then return false; end if;
  if (row_value->>'open')::numeric <= 0 or (row_value->>'close')::numeric <= 0 or (row_value->>'low')::numeric <= 0 or (row_value->>'time')::bigint < 0 then return false; end if;
  if (row_value->>'high')::numeric < greatest((row_value->>'open')::numeric,(row_value->>'close')::numeric) or (row_value->>'low')::numeric > least((row_value->>'open')::numeric,(row_value->>'close')::numeric) then return false; end if;
  if not row_value ?& array['open','high','low','close','time'] then return false; end if;
 end loop;
 return value ?& array['schemaVersion','total','seed','rngState','config','rows'] and (value->'config') ?& array['direction','volatility','speed'];
exception when others then return false;
end;
$$;
create function public.guard_demo_workspace() returns trigger language plpgsql set search_path = '' as $$
begin
 if not public.validate_demo_checkpoint(new.checkpoint) then raise exception 'Invalid demo checkpoint' using errcode='22023'; end if;
 if tg_op='UPDATE' then
  if new.owner_id <> old.owner_id or new.version <> old.version+1 then raise exception 'Invalid workspace version' using errcode='40001'; end if;
 elsif new.version <> 1 then raise exception 'Initial version must be 1' using errcode='22023'; end if;
 new.updated_at=now(); return new;
end;
$$;
create trigger demo_workspace_guard before insert or update on public.demo_workspaces for each row execute function public.guard_demo_workspace();
create function public.save_demo_workspace(expected_version bigint,new_checkpoint jsonb,event_label text default null) returns public.demo_workspaces language plpgsql security invoker set search_path = '' as $$
declare saved public.demo_workspaces;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.validate_demo_checkpoint(new_checkpoint) then raise exception 'Invalid demo checkpoint' using errcode='22023'; end if;
 if expected_version=0 then
  insert into public.demo_workspaces(owner_id,version,checkpoint) values(auth.uid(),1,new_checkpoint) on conflict do nothing returning * into saved;
 else
  update public.demo_workspaces set checkpoint=new_checkpoint,version=expected_version+1 where owner_id=auth.uid() and version=expected_version returning * into saved;
 end if;
 if saved.owner_id is null then raise exception 'Another session changed this workspace. Reload before saving.' using errcode='40001'; end if;
 if event_label is not null then insert into public.demo_workspace_events(owner_id,label,config) values(auth.uid(),event_label,new_checkpoint->'config'); end if;
 return saved;
end;
$$;
revoke all on function public.save_demo_workspace(bigint,jsonb,text) from public,anon;
grant execute on function public.save_demo_workspace(bigint,jsonb,text) to authenticated;
-- PostgreSQL Changes broadcasts are filtered by the row-level policies above.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='demo_workspaces') then
  alter publication supabase_realtime add table public.demo_workspaces;
 end if;
end $$;
commit;
