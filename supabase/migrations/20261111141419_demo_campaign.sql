begin;

alter table demo_private.customer_balance_adjustments
 add column source text not null default 'admin' check (source in ('admin','campaign'));

create table demo_private.demo_campaign_settings (
 id smallint primary key check (id=1),
 enabled boolean not null default false,
 version bigint not null default 1
);
insert into demo_private.demo_campaign_settings(id) values (1);

create table demo_private.demo_campaign_rounds (
 customer_id uuid primary key references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 round_number bigint not null check (round_number>=2)
);
create table demo_private.demo_campaign_claims (
 customer_id uuid not null references demo_private.customer_demo_accounts(customer_id) on delete cascade,
 round_number bigint not null check (round_number>=1),
 command_id uuid not null,
 credit_id uuid not null,
 credit_amount bigint not null,
 bonus_amount bigint not null,
 created_at timestamptz not null default now(),
 primary key (customer_id,round_number),
 unique (customer_id,command_id)
);
create table demo_private.demo_campaign_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 customer_id uuid,
 action text not null check (action in ('show','hide','reset')),
 detail jsonb not null,
 created_at timestamptz not null default now()
);

alter table demo_private.demo_campaign_settings enable row level security;
alter table demo_private.demo_campaign_rounds enable row level security;
alter table demo_private.demo_campaign_claims enable row level security;
alter table demo_private.demo_campaign_audit enable row level security;
revoke all on demo_private.demo_campaign_settings,demo_private.demo_campaign_rounds,
 demo_private.demo_campaign_claims,demo_private.demo_campaign_audit from public,anon,authenticated;
revoke all on sequence demo_private.demo_campaign_audit_id_seq from public,anon,authenticated;

create function demo_private.demo_campaign_credits(target uuid)
returns table(credit_id uuid,credit_number integer,credit_amount bigint,bonus_amount bigint)
language sql stable security invoker set search_path='' as $$
 select q.command_id, row_number() over (order by q.created_at,q.command_id)::integer, q.credit_amount,
  case q.credit_amount when 100000 then 50000::bigint when 200000 then 150000::bigint when 300000 then 300000::bigint end
 from (
  select command_id,created_at,new_balance-previous_balance as credit_amount
  from demo_private.customer_balance_adjustments
  where customer_id=target and source='admin' and new_balance>previous_balance
  order by created_at,command_id limit 5
 ) q
$$;
revoke all on function demo_private.demo_campaign_credits(uuid) from public,anon,authenticated;

create function demo_private.demo_campaign_public_state()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'version',version) from demo_private.demo_campaign_settings where id=1
$$;
revoke all on function demo_private.demo_campaign_public_state() from public,anon,authenticated;
grant execute on function demo_private.demo_campaign_public_state() to anon,authenticated;

create function public.demo_campaign_public_state()
returns jsonb language sql stable security invoker set search_path='' as $$
 select demo_private.demo_campaign_public_state()
$$;
revoke all on function public.demo_campaign_public_state() from public,anon,authenticated;
grant execute on function public.demo_campaign_public_state() to anon,authenticated;

create function demo_private.demo_campaign_transaction(credential text,operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 caller uuid := auth.uid();
 target uuid;
 is_admin boolean := left(operation,6)='admin_';
 settings demo_private.demo_campaign_settings;
 account_row demo_private.customer_demo_accounts;
 credit record;
 current_claim demo_private.demo_campaign_claims;
 current_round bigint;
 command uuid;
 selected_credit uuid;
 booked bigint;
 adjusted bigint;
 show_campaign boolean;
 items jsonb;
begin
 if caller is null or credential is null or length(credential)<>64 or not exists (
  select 1 from demo_private.site_bridge_keys where id=2 and token_hash=encode(extensions.digest(credential,'sha256'),'hex')
 ) then raise exception 'Verified session required' using errcode='42501'; end if;

 if is_admin then
  if not exists (
   select 1 from auth.users u join demo_private.admin_allowlist a on a.email=lower(u.email)
   where u.id=caller and u.email_confirmed_at is not null and u.deleted_at is null
  ) then raise exception 'Owner required' using errcode='42501'; end if;
  target := (payload->>'customerId')::uuid;
 else
  if auth.jwt()->>'aal' is distinct from 'aal2'
   or not exists (select 1 from auth.users where id=caller and email_confirmed_at is not null and deleted_at is null)
   or not exists (select 1 from auth.mfa_factors where user_id=caller and status='verified')
  then raise exception 'Verified customer and second factor required' using errcode='42501'; end if;
  target := caller;
 end if;

 if operation='admin_publish' then
  select * into settings from demo_private.demo_campaign_settings where id=1 for update;
  if settings.version is distinct from (payload->>'version')::bigint
  then raise exception 'Campaign settings changed' using errcode='PT409'; end if;
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean'
  then raise exception 'Invalid campaign settings' using errcode='22023'; end if;
  show_campaign := (payload->>'enabled')::boolean;
  if show_campaign is distinct from settings.enabled then
   update demo_private.demo_campaign_settings set enabled=show_campaign,version=version+1 where id=1 returning * into settings;
   insert into demo_private.demo_campaign_audit(actor_id,action,detail)
    values(caller,case when show_campaign then 'show' else 'hide' end,jsonb_build_object('version',settings.version));
   return jsonb_build_object('enabled',settings.enabled,'version',settings.version,'changed',true);
  end if;
  return jsonb_build_object('enabled',settings.enabled,'version',settings.version,'changed',false);
 end if;

 select * into settings from demo_private.demo_campaign_settings where id=1 for share;
 if operation='admin_settings' then
  select coalesce(jsonb_agg(to_jsonb(row) order by row.id desc),'[]'::jsonb) into items from (
   select id,action,detail,created_at from demo_private.demo_campaign_audit where customer_id is null
   order by id desc limit 15
  ) row;
  return jsonb_build_object('enabled',settings.enabled,'version',settings.version,'history',items);
 end if;

 if operation not in ('status','claim','admin_status','admin_reset') or operation is null
 then raise exception 'Unsupported campaign operation' using errcode='22023'; end if;

 if operation in ('claim','admin_reset') then
  select * into account_row from demo_private.customer_demo_accounts where customer_id=target for update;
 else
  select * into account_row from demo_private.customer_demo_accounts where customer_id=target for share;
 end if;
 if account_row.customer_id is null or not exists (
  select 1 from auth.users where id=target and email_confirmed_at is not null and deleted_at is null
 ) then raise exception 'Demo account not found' using errcode='PT404'; end if;

 select round_number into current_round from demo_private.demo_campaign_rounds where customer_id=target;
 current_round := coalesce(current_round,1);
 select * into current_claim from demo_private.demo_campaign_claims
  where customer_id=target and round_number=current_round;

 if operation='admin_reset' then
  if current_round is distinct from (payload->>'round')::bigint or current_claim.command_id is null
  then raise exception 'Campaign eligibility changed' using errcode='PT409'; end if;
  insert into demo_private.demo_campaign_rounds(customer_id,round_number) values(target,current_round+1)
   on conflict (customer_id) do update set round_number=excluded.round_number;
  insert into demo_private.demo_campaign_audit(actor_id,customer_id,action,detail)
   values(caller,target,'reset',jsonb_build_object('fromRound',current_round,'toRound',current_round+1));
  return jsonb_build_object('reset',true,'notifyToken',account_row.notification_channel);
 end if;

 if operation='claim' then
  command := (payload->>'commandId')::uuid;
  selected_credit := (payload->>'creditId')::uuid;
  if command is null or selected_credit is null or (payload->'apply') is distinct from 'true'::jsonb
  then raise exception 'Explicit bonus selection required' using errcode='22023'; end if;
  if exists(select 1 from demo_private.demo_campaign_claims where customer_id=target and command_id=command and credit_id=selected_credit)
  then return jsonb_build_object('applied',true,'duplicate',true); end if;
  if not settings.enabled or current_claim.command_id is not null or current_round is distinct from (payload->>'round')::bigint
  then raise exception 'Campaign eligibility changed' using errcode='PT409'; end if;
  select * into credit from demo_private.demo_campaign_credits(target) c
   where c.credit_id=selected_credit and c.bonus_amount is not null;
  if not found then raise exception 'Eligible demo credit required' using errcode='PT409'; end if;

  booked := (account_row.account->>'balance')::bigint;
  adjusted := booked+credit.bonus_amount;
  if adjusted>1000000000 then raise exception 'Demo balance limit exceeded' using errcode='PT422'; end if;
  update demo_private.customer_demo_accounts
   set account=jsonb_set(account,'{balance}',to_jsonb(adjusted)),version=version+1 where customer_id=target;
  insert into demo_private.demo_campaign_claims(customer_id,round_number,command_id,credit_id,credit_amount,bonus_amount)
   values(target,current_round,command,credit.credit_id,credit.credit_amount,credit.bonus_amount);
  insert into demo_private.customer_balance_adjustments(customer_id,command_id,actor_id,previous_balance,new_balance,reason,source)
   values(target,command,caller,booked,adjusted,'デモキャンペーンボーナス','campaign');
  return jsonb_build_object('applied',true,'bonus',credit.bonus_amount,'balance',adjusted,'notifyToken',account_row.notification_channel);
 end if;

 select coalesce(jsonb_agg(to_jsonb(c) order by c.credit_number),'[]'::jsonb) into items
 from demo_private.demo_campaign_credits(target) c where c.bonus_amount is not null;
 return jsonb_build_object('enabled',settings.enabled,'round',current_round,'claimed',current_claim.command_id is not null,
  'usedBonus',current_claim.bonus_amount,'credits',items);
end
$$;
revoke all on function demo_private.demo_campaign_transaction(text,text,jsonb) from public,anon,authenticated;
grant execute on function demo_private.demo_campaign_transaction(text,text,jsonb) to authenticated;

create function public.demo_campaign_transaction(bridge_token text,operation text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select demo_private.demo_campaign_transaction(bridge_token,operation,payload)
$$;
revoke all on function public.demo_campaign_transaction(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.demo_campaign_transaction(text,text,jsonb) to authenticated;

commit;
