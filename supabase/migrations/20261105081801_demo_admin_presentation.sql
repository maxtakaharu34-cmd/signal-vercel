-- A shared, explicitly simulated scene. Editing is restricted to a verified owner email.
begin;
create table demo_private.admin_allowlist(email text primary key check(email=lower(email)));
alter table demo_private.admin_allowlist enable row level security;
revoke all on demo_private.admin_allowlist from public,anon,authenticated;
insert into demo_private.admin_allowlist(email) values ('maxtakaharu3.4@gmail.com');
create function demo_private.is_demo_admin() returns boolean language sql stable security definer set search_path='' as $$
 select (select demo_private.session_allowed()) and exists(
  select 1 from auth.users u join demo_private.admin_allowlist a on a.email=lower(u.email)
  where u.id=(select auth.uid()) and u.email_confirmed_at is not null and u.deleted_at is null
 );
$$;
revoke all on function demo_private.is_demo_admin() from public,anon;
grant execute on function demo_private.is_demo_admin() to authenticated;
create function public.get_demo_access() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('is_admin',demo_private.is_demo_admin());
$$;
revoke all on function public.get_demo_access() from public,anon;
grant execute on function public.get_demo_access() to authenticated;

create table public.demo_scene(
 id smallint primary key default 1 check(id=1),
 version bigint not null check(version>0),
 checkpoint jsonb not null check(pg_column_size(checkpoint)<=100000),
 signal jsonb not null check(pg_column_size(signal)<=4000),
 announcement text not null default '' check(char_length(announcement)<=180),
 updated_at timestamptz not null default now()
);
alter table public.demo_scene enable row level security;
revoke all on public.demo_scene from public,anon,authenticated;
grant select,update on public.demo_scene to authenticated;
create policy scene_read on public.demo_scene for select to authenticated using((select demo_private.session_allowed()));
create policy scene_update on public.demo_scene for update to authenticated using((select demo_private.is_demo_admin())) with check((select demo_private.is_demo_admin()));

create table demo_private.scene_audit(
 id bigint generated always as identity primary key,
 version bigint not null unique,
 actor_id uuid references auth.users(id) on delete set null,
 label text not null,
 detail jsonb not null,
 created_at timestamptz not null default now()
);
alter table demo_private.scene_audit enable row level security;
revoke all on demo_private.scene_audit from public,anon,authenticated;
create function public.validate_demo_signal(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 return jsonb_typeof(value)='object'
  and jsonb_typeof(value->'direction')='number' and (value->>'direction')::int in (-1,0,1)
  and jsonb_typeof(value->'level')='string' and value->>'level' in ('極寒','寒気','晩秋','新春','初夏','猛暑')
  and jsonb_typeof(value->'note')='string' and char_length(value->>'note')<=280
  and value ?& array['direction','level','note'];
exception when others then return false;
end;
$$;
create function demo_private.guard_demo_scene() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.validate_demo_checkpoint(new.checkpoint) or public.validate_demo_signal(new.signal) is distinct from true then
  raise exception 'Invalid simulated scene' using errcode='22023';
 end if;
 if new.id<>old.id or new.version<>old.version+1 then raise exception 'Reload the published scene before saving' using errcode='PT409';end if;
 new.updated_at=now();return new;
end;
$$;
revoke all on function demo_private.guard_demo_scene() from public,anon;
create function demo_private.audit_demo_scene() returns trigger language plpgsql security definer set search_path='' as $$
declare label_value text;
begin
 label_value=left(coalesce(nullif(current_setting('demo.scene_event_label',true),''),'シナリオを変更'),140);
 insert into demo_private.scene_audit(version,actor_id,label,detail) values(new.version,auth.uid(),label_value,jsonb_build_object('config',new.checkpoint->'config','signal',new.signal,'announcement',new.announcement,'total',new.checkpoint->'total','seed',new.checkpoint->'seed'));
 return new;
end;
$$;
revoke all on function demo_private.audit_demo_scene() from public,anon,authenticated;
create function public.publish_demo_scene(expected_version bigint,new_checkpoint jsonb,new_signal jsonb,new_announcement text,event_label text default 'シナリオ・表示設定を変更') returns public.demo_scene language plpgsql security invoker set search_path='' as $$
declare saved public.demo_scene;
begin
 if not demo_private.is_demo_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if public.validate_demo_checkpoint(new_checkpoint) is distinct from true or public.validate_demo_signal(new_signal) is distinct from true or new_announcement is null or char_length(new_announcement)>180 or event_label is null or char_length(event_label)>140 then raise exception 'Invalid scene input' using errcode='22023';end if;
 perform set_config('demo.scene_event_label',event_label,true);
 update public.demo_scene set checkpoint=new_checkpoint,signal=new_signal,announcement=new_announcement,version=expected_version+1 where id=1 and version=expected_version returning * into saved;
 if saved.id is null then raise exception 'Another administrator session changed this scene. Reload first.' using errcode='PT409';end if;
 return saved;
end;
$$;
revoke all on function public.publish_demo_scene(bigint,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.publish_demo_scene(bigint,jsonb,jsonb,text,text) to authenticated;

create function demo_private.read_scene_events() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not demo_private.session_allowed() then raise exception 'Verified authentication required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('version',e.version,'label',e.label,'detail',e.detail,'created_at',e.created_at) order by e.version desc),'[]'::jsonb) into result from (select version,label,detail,created_at from demo_private.scene_audit order by version desc limit 30) e;
 return result;
end;
$$;
revoke all on function demo_private.read_scene_events() from public,anon;
grant execute on function demo_private.read_scene_events() to authenticated;
create function public.get_demo_scene_events() returns jsonb language sql stable security invoker set search_path='' as $$
 select demo_private.read_scene_events();
$$;
revoke all on function public.get_demo_scene_events() from public,anon;
grant execute on function public.get_demo_scene_events() to authenticated;

insert into public.demo_scene(id,version,checkpoint,signal) values(1,1,'{"schemaVersion":1,"seed":20261105,"total":72,"config":{"direction":0,"volatility":3,"speed":1},"rows":[{"time":0,"open":100,"high":100,"low":99.51107868663766,"close":99.51107868663766},{"time":1,"open":99.51107868663766,"high":99.54757522756773,"low":99.1770394212026,"close":99.1770394212026},{"time":2,"open":99.1770394212026,"high":99.1770394212026,"low":98.61943186554039,"close":98.66798282320889},{"time":3,"open":98.66798282320889,"high":99.19910337703406,"low":98.61832596873508,"close":99.19910337703406},{"time":4,"open":99.19910337703406,"high":99.21716703422722,"low":98.77672477101825,"close":99.12886089358935},{"time":5,"open":99.12886089358935,"high":99.2492591099023,"low":98.67542338643594,"close":98.67542338643594},{"time":6,"open":98.67542338643594,"high":98.74217152548268,"low":98.23258592009414,"close":98.31157794413933},{"time":7,"open":98.31157794413933,"high":98.32458940380212,"low":97.84744900827208,"close":97.84744900827208},{"time":8,"open":97.84744900827208,"high":98.37724198165083,"low":97.84744900827208,"close":97.96702363853267},{"time":9,"open":97.96702363853267,"high":98.28641812946111,"low":97.51545898849388,"close":97.65312270819284},{"time":10,"open":97.65312270819284,"high":98.11499033880062,"low":97.48198787737253,"close":98.11499033880062},{"time":11,"open":98.11499033880062,"high":98.37259027405295,"low":97.69958077325715,"close":97.69958077325715},{"time":12,"open":97.69958077325715,"high":97.93007020997652,"low":97.54454783982429,"close":97.67517664437851},{"time":13,"open":97.67517664437851,"high":98.24953879653606,"low":97.61299178109529,"close":98.24953879653606},{"time":14,"open":98.24953879653606,"high":98.51153283183884,"low":98.15842879459824,"close":98.22365417584543},{"time":15,"open":98.22365417584543,"high":98.22365417584543,"low":97.88574701364278,"close":97.93482965356188},{"time":16,"open":97.93482965356188,"high":98.296831746668,"low":97.86813665301068,"close":98.170324103984},{"time":17,"open":98.170324103984,"high":98.48836371791975,"low":97.92217027777673,"close":98.48836371791975},{"time":18,"open":98.48836371791975,"high":99.5365370576173,"low":98.48836371791975,"close":99.29623150898742},{"time":19,"open":99.29623150898742,"high":99.44543858026393,"low":98.8275349200457,"close":98.87976961486933},{"time":20,"open":98.87976961486933,"high":99.573583646743,"low":98.87976961486933,"close":99.56071509087391},{"time":21,"open":99.56071509087391,"high":100.1135995922601,"low":99.50372766275501,"close":100.07229057532672},{"time":22,"open":100.07229057532672,"high":100.24702398792756,"low":99.80973802486714,"close":99.80973802486714},{"time":23,"open":99.80973802486714,"high":100.03727531029658,"low":99.63880234486946,"close":99.90358710699236},{"time":24,"open":99.90358710699236,"high":100.07091093166099,"low":99.6195136969515,"close":100.05420883536601},{"time":25,"open":100.05420883536601,"high":100.05420883536601,"low":99.30389000495212,"close":99.94988261167087},{"time":26,"open":99.94988261167087,"high":99.94988261167087,"low":99.48742279060718,"close":99.48742279060718},{"time":27,"open":99.48742279060718,"high":100.22310477477049,"low":99.48742279060718,"close":100.22310477477049},{"time":28,"open":100.22310477477049,"high":100.80601976777437,"low":100.1720476496076,"close":100.80601976777437},{"time":29,"open":100.80601976777437,"high":100.94542890682384,"low":100.43289289718858,"close":100.68418758258218},{"time":30,"open":100.68418758258218,"high":100.93365061002044,"low":100.13724396912502,"close":100.13724396912502},{"time":31,"open":100.13724396912502,"high":100.41309929095476,"low":99.95633932249821,"close":100.1823579399181},{"time":32,"open":100.1823579399181,"high":100.47831091907382,"low":99.93218864554055,"close":100.47831091907382},{"time":33,"open":100.47831091907382,"high":100.7680985263328,"low":100.3449901998113,"close":100.64058976975757},{"time":34,"open":100.64058976975757,"high":100.81350342064813,"low":100.24827334838047,"close":100.3390212645297},{"time":35,"open":100.3390212645297,"high":100.3533519940539,"low":99.8927509508288,"close":99.8927509508288},{"time":36,"open":99.8927509508288,"high":99.90432494634383,"low":99.47133004972991,"close":99.8483394585201},{"time":37,"open":99.8483394585201,"high":99.8483394585201,"low":98.83288851385787,"close":98.83288851385787},{"time":38,"open":98.83288851385787,"high":98.95875968543977,"low":98.67412735221019,"close":98.84839977095054},{"time":39,"open":98.84839977095054,"high":99.62618650692988,"low":98.84839977095054,"close":99.3371628669668},{"time":40,"open":99.3371628669668,"high":99.86470907589728,"low":99.13667326442712,"close":99.7411169691428},{"time":41,"open":99.7411169691428,"high":99.7411169691428,"low":98.9317053683803,"close":99.38315506890953},{"time":42,"open":99.38315506890953,"high":99.42265300773623,"low":99.15151019738866,"close":99.42265300773623},{"time":43,"open":99.42265300773623,"high":99.99766426021728,"low":99.34510173794166,"close":99.34510173794166},{"time":44,"open":99.34510173794166,"high":99.92534671523279,"low":99.2111727458065,"close":99.92534671523279},{"time":45,"open":99.92534671523279,"high":100.40240510128854,"low":99.92534671523279,"close":100.29838356077214},{"time":46,"open":100.29838356077214,"high":100.61846705190901,"low":99.959988620864,"close":100.14625369120358},{"time":47,"open":100.14625369120358,"high":100.18419817664757,"low":99.65742471831236,"close":99.65742471831236},{"time":48,"open":99.65742471831236,"high":100.7030580552196,"low":99.65035709828021,"close":100.7030580552196},{"time":49,"open":100.7030580552196,"high":100.86214630645686,"low":100.49389473855578,"close":100.78889741834666},{"time":50,"open":100.78889741834666,"high":101.25526293848102,"low":100.70558858056025,"close":100.72621232257545},{"time":51,"open":100.72621232257545,"high":100.93320156831155,"low":100.54913489895162,"close":100.90980834108551},{"time":52,"open":100.90980834108551,"high":100.90980834108551,"low":100.22330678601077,"close":100.39866275245954},{"time":53,"open":100.39866275245954,"high":100.52946933745268,"low":99.69793184063285,"close":99.69793184063285},{"time":54,"open":99.69793184063285,"high":99.73375537162639,"low":99.3660549775556,"close":99.49524914453767},{"time":55,"open":99.49524914453767,"high":99.78631589589452,"low":99.1411258777467,"close":99.52167963733153},{"time":56,"open":99.52167963733153,"high":99.66537139288006,"low":99.008028380631,"close":99.19497040836745},{"time":57,"open":99.19497040836745,"high":99.41189244933163,"low":98.96260217410854,"close":98.96260217410854},{"time":58,"open":98.96260217410854,"high":98.9680244744316,"low":98.5650442944939,"close":98.74460165477001},{"time":59,"open":98.74460165477001,"high":98.9454366856637,"low":98.70242188693761,"close":98.86438564280822},{"time":60,"open":98.86438564280822,"high":99.31395373770509,"low":98.86438564280822,"close":99.04764298937872},{"time":61,"open":99.04764298937872,"high":99.31959562223611,"low":98.96835338944663,"close":98.96835338944663},{"time":62,"open":98.96835338944663,"high":99.34244720048576,"low":98.75208619476922,"close":98.96845737606779},{"time":63,"open":98.96845737606779,"high":99.27254604865051,"low":98.83935139833012,"close":99.26523559924888},{"time":64,"open":99.26523559924888,"high":99.26523559924888,"low":98.87392700418273,"close":98.87642803759962},{"time":65,"open":98.87642803759962,"high":99.16700716586985,"low":98.87642803759962,"close":98.90940510395241},{"time":66,"open":98.90940510395241,"high":99.43461272146462,"low":98.79390717838582,"close":99.28036314495996},{"time":67,"open":99.28036314495996,"high":100.14967443641339,"low":99.28036314495996,"close":99.89536667520846},{"time":68,"open":99.89536667520846,"high":99.89536667520846,"low":99.32646495192226,"close":99.32646495192226},{"time":69,"open":99.32646495192226,"high":99.63265821962132,"low":99.07394938938701,"close":99.44286893827238},{"time":70,"open":99.44286893827238,"high":99.44286893827238,"low":98.41623850757567,"close":98.41623850757567},{"time":71,"open":98.41623850757567,"high":98.41623850757567,"low":97.66456175997146,"close":97.81797443508476}],"rngState":1945158609}'::jsonb,'{"direction":0,"level":"新春","note":"管理者が設定したシミュレーション用の参考シグナルです。"}'::jsonb);
create trigger demo_scene_guard before update on public.demo_scene for each row execute function demo_private.guard_demo_scene();
create trigger demo_scene_audit after update on public.demo_scene for each row execute function demo_private.audit_demo_scene();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='demo_scene') then alter publication supabase_realtime add table public.demo_scene;end if;
end $$;
commit;
