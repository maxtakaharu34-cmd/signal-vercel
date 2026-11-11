begin;

create table demo_private.customer_demo_accounts (
 customer_id uuid primary key references auth.users(id) on delete cascade,
 version bigint not null default 0 check (version >= 0),
 account jsonb not null default '{"id":"demo","balance":1000000,"cursor":null}'::jsonb
);
create table demo_private.customer_demo_positions (
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 id uuid not null,
 record jsonb not null,
 closed_at bigint generated always as ((record #>> '{close,time}')::bigint) stored,
 primary key (customer_id,id)
);
create index customer_demo_positions_recent on demo_private.customer_demo_positions(customer_id,closed_at desc,id) where closed_at is not null;
create index customer_demo_positions_open on demo_private.customer_demo_positions(customer_id,id) where closed_at is null;
create table demo_private.customer_demo_pending (
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 id uuid not null,
 record jsonb not null,
 primary key (customer_id,id)
);
create table demo_private.customer_demo_commands (
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 id uuid not null,
 created_at timestamptz not null default now(),
 primary key (customer_id,id)
);
create index customer_demo_commands_expiry on demo_private.customer_demo_commands(customer_id,created_at);

alter table demo_private.customer_demo_accounts enable row level security;
alter table demo_private.customer_demo_positions enable row level security;
alter table demo_private.customer_demo_pending enable row level security;
alter table demo_private.customer_demo_commands enable row level security;
revoke all on demo_private.customer_demo_accounts,demo_private.customer_demo_positions,
 demo_private.customer_demo_pending,demo_private.customer_demo_commands from public,anon,authenticated;

create function demo_private.customer_order_transaction(
 credential text, operation text, command_id uuid, payload jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 customer uuid := auth.uid();
 saved demo_private.customer_demo_accounts;
 scene_version bigint;
 positions jsonb;
 pending jsonb;
 duplicate boolean := false;
begin
 if customer is null or auth.jwt()->>'aal' is distinct from 'aal2'
  or not exists (select 1 from auth.users where id=customer and email_confirmed_at is not null and deleted_at is null)
  or not exists (select 1 from auth.mfa_factors where user_id=customer and status='verified')
  or credential is null or length(credential) <> 64 or not exists (
   select 1 from demo_private.site_bridge_keys where id=2 and token_hash=encode(extensions.digest(credential,'sha256'),'hex')
  ) then
  raise exception 'Verified demo account required' using errcode='42501';
 end if;

 if operation='read' then
  select * into saved from demo_private.customer_demo_accounts where customer_id=customer for share;
  if saved.customer_id is null then
   return jsonb_build_object('version',0,'account',null,'positions','[]'::jsonb,'pending','[]'::jsonb,'duplicate',false);
  end if;
  duplicate := command_id is not null and exists (
   select 1 from demo_private.customer_demo_commands where customer_id=customer and id=command_id
  );
 elsif operation='save' then
  select version into scene_version from public.demo_scene where id=1 for share;
  if scene_version is distinct from (payload->>'scene_version')::bigint then
   raise exception 'Scene changed' using errcode='PT409';
  end if;

  insert into demo_private.customer_demo_accounts(customer_id) values (customer) on conflict do nothing;
  select * into saved from demo_private.customer_demo_accounts where customer_id=customer for update;
  duplicate := command_id is not null and exists (
   select 1 from demo_private.customer_demo_commands where customer_id=customer and id=command_id
  );
  if not duplicate then
   if saved.version is distinct from (payload->>'version')::bigint then
    raise exception 'Account changed' using errcode='PT409';
   end if;

   update demo_private.customer_demo_accounts
    set version=version+1,account=coalesce(payload->'account',account)
    where customer_id=customer returning * into saved;
   insert into demo_private.customer_demo_positions(customer_id,id,record)
    select customer,(item->>'id')::uuid,item from jsonb_array_elements(payload->'positions') item
    on conflict(customer_id,id) do update set record=excluded.record;
   delete from demo_private.customer_demo_pending
    where customer_id=customer and id in (select value::uuid from jsonb_array_elements_text(payload->'removed_pending'));
   insert into demo_private.customer_demo_pending(customer_id,id,record)
    select customer,(item->>'id')::uuid,item from jsonb_array_elements(payload->'pending') item
    on conflict(customer_id,id) do update set record=excluded.record;
   if command_id is not null then
    insert into demo_private.customer_demo_commands(customer_id,id) values (customer,command_id);
    delete from demo_private.customer_demo_commands
     where customer_id=customer and created_at<now()-interval '7 days';
   end if;
  end if;
 else
  raise exception 'Unsupported operation' using errcode='22023';
 end if;

 select coalesce(jsonb_agg(record order by id),'[]'::jsonb) into positions from (
  (select id,record from demo_private.customer_demo_positions where customer_id=customer and closed_at is null)
  union all
  (select id,record from demo_private.customer_demo_positions where customer_id=customer and closed_at is not null
    order by closed_at desc,id limit 50)
 ) history;
 select coalesce(jsonb_agg(record order by id),'[]'::jsonb) into pending
  from demo_private.customer_demo_pending where customer_id=customer;
 return jsonb_build_object('version',saved.version,'account',saved.account,'positions',positions,'pending',pending,'duplicate',duplicate);
end
$$;
revoke all on function demo_private.customer_order_transaction(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function demo_private.customer_order_transaction(text,text,uuid,jsonb) to authenticated;

create function public.customer_order_transaction(
 bridge_token text, operation text, command_id uuid, payload jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
 select demo_private.customer_order_transaction(bridge_token,operation,command_id,payload);
$$;
revoke all on function public.customer_order_transaction(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.customer_order_transaction(text,text,uuid,jsonb) to authenticated;

commit;
