begin;

alter table demo_private.customer_demo_accounts
 add column notification_channel uuid not null default gen_random_uuid();

create table demo_private.customer_balance_adjustments (
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 command_id uuid not null,
 actor_id uuid not null,
 previous_balance bigint not null,
 new_balance bigint not null check (new_balance between 0 and 1000000000),
 reason text not null check (length(reason) between 1 and 120),
 created_at timestamptz not null default now(),
 primary key (customer_id,command_id)
);
create index customer_balance_adjustments_recent
 on demo_private.customer_balance_adjustments(customer_id,created_at desc,command_id);

create table demo_private.customer_support_messages (
 id bigint generated always as identity primary key,
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 command_id uuid not null,
 sender text not null check (sender in ('customer','admin')),
 actor_id uuid not null,
 message text not null check (length(message) between 1 and 800),
 created_at timestamptz not null default now(),
 unique (customer_id,command_id)
);
create index customer_support_messages_recent on demo_private.customer_support_messages(customer_id,id desc);

alter table demo_private.customer_balance_adjustments enable row level security;
alter table demo_private.customer_support_messages enable row level security;
revoke all on demo_private.customer_balance_adjustments,demo_private.customer_support_messages from public,anon,authenticated;
revoke all on sequence demo_private.customer_support_messages_id_seq from public,anon,authenticated;

create function demo_private.customer_portal(
 credential text, operation text, payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := auth.uid();
 target uuid;
 role_name text;
 is_admin boolean := left(operation,6)='admin_';
 saved demo_private.customer_demo_accounts;
 adjustment demo_private.customer_balance_adjustments;
 sent demo_private.customer_support_messages;
 requested_id uuid;
 booked_balance bigint;
 next_balance bigint;
 before_id bigint;
 why text;
 message_text text;
 results jsonb;
begin
 if caller is null or credential is null or length(credential)<>64 or not exists (
  select 1 from demo_private.site_bridge_keys where id=2 and token_hash=encode(extensions.digest(credential,'sha256'),'hex')
 ) then
  raise exception 'Verified session required' using errcode='42501';
 end if;

 if is_admin then
  if not exists (
   select 1 from auth.users u join demo_private.admin_allowlist a on a.email=lower(u.email)
   where u.id=caller and u.email_confirmed_at is not null and u.deleted_at is null
  ) then raise exception 'Owner required' using errcode='42501'; end if;
  role_name := 'admin';
  target := (payload->>'customerId')::uuid;
 else
  if auth.jwt()->>'aal' is distinct from 'aal2'
   or not exists (select 1 from auth.users where id=caller and email_confirmed_at is not null and deleted_at is null)
   or not exists (select 1 from auth.mfa_factors where user_id=caller and status='verified')
  then raise exception 'Verified customer and second factor required' using errcode='42501'; end if;
  role_name := 'customer';
  target := caller;
 end if;

 if operation='open' then
  insert into demo_private.customer_demo_accounts(customer_id) values (target) on conflict do nothing;
  select * into saved from demo_private.customer_demo_accounts where customer_id=target;
  return jsonb_build_object('notifyToken',saved.notification_channel);
 end if;

 if operation='admin_list' then
  select coalesce(jsonb_agg(to_jsonb(row) order by row.id),'[]'::jsonb) into results from (
   select a.customer_id as id, u.email, (a.account->>'balance')::bigint as balance,
    u.email_confirmed_at as confirmed_at, a.notification_channel as notify_token, coalesce(latest.sender='customer',false) as reply_pending
   from demo_private.customer_demo_accounts a
   join auth.users u on u.id=a.customer_id and u.deleted_at is null and u.email_confirmed_at is not null
   left join lateral (
    select m.sender from demo_private.customer_support_messages m where m.customer_id=a.customer_id order by m.id desc limit 1
   ) latest on true
   where (payload->>'after' is null or a.customer_id>(payload->>'after')::uuid)
    and (coalesce(payload->>'query','')='' or strpos(lower(u.email),lower(payload->>'query'))>0)
   order by a.customer_id limit 26
  ) row;
  return jsonb_build_object('customers',results);
 end if;

 if target is null or not exists (
  select 1 from demo_private.customer_demo_accounts a join auth.users u on u.id=a.customer_id
  where a.customer_id=target and u.deleted_at is null and u.email_confirmed_at is not null
 ) then
  raise exception 'Demo account not found' using errcode='PT404';
 end if;

 if operation in ('activity','admin_activity') then
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc,row.command_id),'[]'::jsonb) into results from (
   select command_id,previous_balance,new_balance,reason,created_at
   from demo_private.customer_balance_adjustments where customer_id=target
   order by created_at desc,command_id limit 20
  ) row;
  return jsonb_build_object('adjustments',results);
 end if;

 if operation='admin_adjust' then
  requested_id := (payload->>'commandId')::uuid;
  next_balance := (payload->>'balance')::bigint;
  why := btrim(payload->>'reason');
  if requested_id is null or next_balance is null or next_balance not between 0 and 1000000000
   or why is null or length(why) not between 1 and 120
  then raise exception 'Invalid adjustment' using errcode='22023'; end if;

  select * into saved from demo_private.customer_demo_accounts where customer_id=target for update;
  if not found then raise exception 'Demo account not found' using errcode='PT404'; end if;
  booked_balance := (saved.account->>'balance')::bigint;
  select * into adjustment from demo_private.customer_balance_adjustments a
   where a.customer_id=target and a.command_id=requested_id;
  if found then
   if adjustment.new_balance<>next_balance or adjustment.reason<>why
   then raise exception 'Adjustment already used' using errcode='PT409'; end if;
   return jsonb_build_object('balance',booked_balance,'changed',false,'duplicate',true);
  end if;
  if booked_balance is distinct from (payload->>'expectedBalance')::bigint
  then raise exception 'Balance changed' using errcode='PT409'; end if;
  if next_balance=booked_balance then return jsonb_build_object('balance',booked_balance,'changed',false); end if;
  if next_balance<booked_balance and (
   exists (select 1 from demo_private.customer_demo_positions where customer_id=target and closed_at is null)
   or exists (select 1 from demo_private.customer_demo_pending where customer_id=target and record->>'status'='pending')
  ) then raise exception 'Active exposure' using errcode='PT422'; end if;

  update demo_private.customer_demo_accounts
   set account=jsonb_set(account,'{balance}',to_jsonb(next_balance)),version=version+1
   where customer_id=target;
  insert into demo_private.customer_balance_adjustments(customer_id,command_id,actor_id,previous_balance,new_balance,reason)
   values(target,requested_id,caller,booked_balance,next_balance,why);
  return jsonb_build_object('balance',next_balance,'changed',true,'notifyToken',saved.notification_channel);
 end if;

 if operation in ('messages','admin_messages') then
  before_id := (payload->>'before')::bigint;
  select coalesce(jsonb_agg(to_jsonb(row) order by row.id desc),'[]'::jsonb) into results from (
   select id,sender,message,created_at from demo_private.customer_support_messages
   where customer_id=target and (before_id is null or id<before_id)
   order by id desc limit 31
  ) row;
  return jsonb_build_object('messages',results);
 end if;

 if operation in ('send','admin_send') then
  requested_id := (payload->>'commandId')::uuid;
  message_text := btrim(payload->>'message');
  if requested_id is null or message_text is null or length(message_text) not between 1 and 800
  then raise exception 'Invalid message' using errcode='22023'; end if;
  insert into demo_private.customer_support_messages(customer_id,command_id,sender,actor_id,message)
   values(target,requested_id,role_name,caller,message_text)
   on conflict (customer_id,command_id) do nothing
   returning * into sent;
  if not found then
   select * into sent from demo_private.customer_support_messages m
    where m.customer_id=target and m.command_id=requested_id;
   if sent.sender is distinct from role_name or sent.message is distinct from message_text
   then raise exception 'Message already used' using errcode='PT409'; end if;
  end if;
  select * into saved from demo_private.customer_demo_accounts where customer_id=target;
  return jsonb_build_object('notifyToken',saved.notification_channel,'message',jsonb_build_object('id',sent.id,'sender',sent.sender,'message',sent.message,'created_at',sent.created_at));
 end if;

 raise exception 'Unsupported portal operation' using errcode='22023';
end
$$;
revoke all on function demo_private.customer_portal(text,text,jsonb) from public,anon,authenticated;
grant execute on function demo_private.customer_portal(text,text,jsonb) to authenticated;

create function public.customer_portal(bridge_token text,operation text,payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
 select demo_private.customer_portal(bridge_token,operation,payload);
$$;
revoke all on function public.customer_portal(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.customer_portal(text,text,jsonb) to authenticated;

commit;
