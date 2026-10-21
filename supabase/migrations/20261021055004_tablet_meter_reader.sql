-- Milestone 3: immutable captures, dated assignments and retry-safe route collection.
begin;
create table public.meters (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 100), utility text not null check(utility in ('electric','water','gas')),
 serial_number text not null check(length(trim(serial_number)) between 1 and 150), location text not null default '' check(length(location)<=1000),
 unit text not null check(length(trim(unit)) between 1 and 30), register_digits integer not null check(register_digits between 1 and 12),
 multiplier text not null default '1' check(multiplier ~ '^[0-9]{1,8}(\.[0-9]{1,6})?$' and multiplier::numeric>0),
 max_delta text check(max_delta ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' and max_delta::numeric>0),
 installed_at timestamptz not null, removed_at timestamptz check(removed_at>installed_at), notes text not null default '' check(length(notes)<=2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 unique(property_id,serial_number), unique(organization_id,property_id,id)
);
create table public.meter_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, meter_id uuid not null,
 site_id uuid not null, site_label text not null, starts_at timestamptz not null, ends_at timestamptz check(ends_at>starts_at),
 close_reason text not null default '' check(length(close_reason)<=2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,meter_id) references public.meters(organization_id,property_id,id),
 foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
 unique(organization_id,property_id,id), exclude using gist(meter_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
create table public.meter_routes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 120), assigned_to uuid not null references auth.users(id),
 starts_on date not null, ends_on date not null check(ends_on>starts_on and ends_on<=starts_on+31),
 cadence text not null check(cadence in ('weekly','monthly','custom')), status text not null default 'open' check(status in ('open','cancelled')),
 cancel_reason text not null default '' check(length(cancel_reason)<=2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id) references public.properties(organization_id,id), unique(organization_id,property_id,id)
);
create table public.meter_route_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, route_id uuid not null,
 assignment_id uuid not null, position integer not null check(position between 1 and 500),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,route_id) references public.meter_routes(organization_id,property_id,id),
 foreign key(organization_id,property_id,assignment_id) references public.meter_assignments(organization_id,property_id,id),
 unique(route_id,assignment_id),unique(route_id,position),unique(organization_id,property_id,id)
);
create table public.meter_readings (
 id uuid primary key, organization_id uuid not null, property_id uuid not null, route_item_id uuid not null unique,
 assignment_id uuid not null, meter_id uuid not null, captured_at timestamptz not null, captured_by uuid not null references auth.users(id),
 device_id uuid not null, previous_reading_id uuid references public.meter_readings(id), previous_review_id uuid,
 value text check(value ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'), kind text not null check(kind in ('actual','estimated')),
 flag text not null check(flag in ('none','rollover','reset','damaged','missing','problem')),
 notes text not null default '' check(length(notes)<=2000), exceptions text[] not null default '{}',
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,route_item_id) references public.meter_route_items(organization_id,property_id,id),
 foreign key(organization_id,property_id,assignment_id) references public.meter_assignments(organization_id,property_id,id),
 foreign key(organization_id,property_id,meter_id) references public.meters(organization_id,property_id,id), unique(organization_id,property_id,id)
);
create table public.meter_reading_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, reading_id uuid not null,
 previous_review_id uuid references public.meter_reading_reviews(id), decision text not null check(decision in ('accepted','rejected')),
 corrected_value text check(corrected_value ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'), reason text not null check(length(trim(reason)) between 3 and 2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,reading_id) references public.meter_readings(organization_id,property_id,id)
);
alter table public.meter_readings add foreign key(previous_review_id) references public.meter_reading_reviews(id);
create table public.meter_photos (
 id uuid primary key, organization_id uuid not null, property_id uuid not null, reading_id uuid not null unique,
 object_path text not null unique, mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 5242880), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','uploaded')),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,reading_id) references public.meter_readings(organization_id,property_id,id)
);
-- Rejected offline operations have their own append-only supervisor inbox.
create table public.meter_sync_conflicts (
 id uuid primary key, organization_id uuid not null, property_id uuid not null, route_item_id uuid not null,
 actor_id uuid not null references auth.users(id), payload jsonb not null, reason_code text not null check(length(reason_code)<=100),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,route_item_id) references public.meter_route_items(organization_id,property_id,id),unique(organization_id,property_id,id)
);
create table public.meter_conflict_resolutions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, conflict_id uuid not null unique,
 decision text not null check(decision in ('duplicate','discarded')), reading_id uuid, reason text not null check(length(trim(reason)) between 3 and 2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,conflict_id) references public.meter_sync_conflicts(organization_id,property_id,id),
 foreign key(organization_id,property_id,reading_id) references public.meter_readings(organization_id,property_id,id),
 check((decision='duplicate' and reading_id is not null) or (decision='discarded' and reading_id is null))
);
create index meter_conflicts_scope_idx on public.meter_sync_conflicts(organization_id,property_id,actor_id);

-- Capture payloads and occupant attribution are deliberately outside the exposed schema.
create table private.meter_sync_operations (
 id uuid primary key references public.meter_readings(id), actor_id uuid not null references auth.users(id), payload jsonb not null
);
create table private.meter_reading_occupancy (
 reading_id uuid primary key references public.meter_readings(id), stay_id uuid references public.occupancy_stays(id),
 customer_id uuid references public.customers(id), site_id uuid not null references public.sites_units(id), captured_on date not null
);
alter table private.meter_sync_operations enable row level security;
alter table private.meter_reading_occupancy enable row level security;
revoke all on private.meter_sync_operations,private.meter_reading_occupancy from public,anon,authenticated;
create index meters_scope_idx on public.meters(organization_id,property_id);
create index assignments_scope_idx on public.meter_assignments(organization_id,property_id,site_id);
create index routes_assignee_idx on public.meter_routes(assigned_to,organization_id,property_id);
create index route_items_assignment_idx on public.meter_route_items(assignment_id,route_id);
create index readings_history_idx on public.meter_readings(assignment_id,created_at desc,id);
create index readings_meter_idx on public.meter_readings(meter_id,captured_at desc,id);
create index readings_actor_idx on public.meter_readings(captured_by);
create index reviews_reading_idx on public.meter_reading_reviews(reading_id,created_at desc,id);
create index photos_scope_idx on public.meter_photos(organization_id,property_id,reading_id);

create function private.meter_route_access(org uuid,prop uuid,route uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.property_role(org,prop,array['manager']) or
 (private.property_role(org,prop,array['meter_technician']) and exists(select 1 from public.meter_routes r where r.id=route and r.organization_id=org and r.property_id=prop and r.assigned_to=auth.uid())));
$$;
create function private.meter_access(org uuid,prop uuid,meter uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.property_role(org,prop,array['manager']) or exists(select 1 from public.meter_assignments a join public.meter_route_items i on i.assignment_id=a.id where a.meter_id=meter and a.organization_id=org and a.property_id=prop and private.meter_route_access(org,prop,i.route_id));
$$;
create function private.meter_reading_access(reading uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.meter_readings r join public.meter_route_items i on i.id=r.route_item_id where r.id=reading and private.meter_route_access(r.organization_id,r.property_id,i.route_id));
$$;
-- RPC is the only write path. Public wrappers are invoker; privileged work stays private.
create function private.meter_command(command text,input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; prop uuid; result uuid; m public.meters; a public.meter_assignments; r public.meter_routes; rd public.meter_readings;
 site public.sites_units; current_review public.meter_reading_reviews; assignee uuid; assignment uuid; pos integer=0; ending timestamptz; conflict public.meter_sync_conflicts;
begin
 org=(input->>'organization_id')::uuid; prop=(input->>'property_id')::uuid;
 if auth.uid() is null or not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
 -- Serialize property shutdown, assignment changes, reviews and captures.
 perform 1 from public.properties where id=prop and organization_id=org and archived_at is null and operating_status='active' for update;
 if not found then raise exception 'property_unavailable'; end if;
 if command='new_meter' then
  insert into public.meters(organization_id,property_id,label,utility,serial_number,location,unit,register_digits,multiplier,max_delta,installed_at,notes)
   values(org,prop,trim(input->>'label'),input->>'utility',trim(input->>'serial_number'),coalesce(input->>'location',''),input->>'unit',(input->>'register_digits')::int,coalesce(input->>'multiplier','1'),nullif(input->>'max_delta',''),(input->>'installed_at')::timestamptz,coalesce(input->>'notes','')) returning id into result;
 elsif command='new_assignment' then
  select * into m from public.meters where id=(input->>'meter_id')::uuid and organization_id=org and property_id=prop for update;
  select * into site from public.sites_units where id=(input->>'site_id')::uuid and organization_id=org and property_id=prop and archived_at is null;
  if m.id is null or site.id is null or m.removed_at is not null or (input->>'starts_at')::timestamptz<m.installed_at then raise exception 'invalid_assignment'; end if;
  insert into public.meter_assignments(organization_id,property_id,meter_id,site_id,site_label,starts_at)
   values(org,prop,m.id,site.id,site.label,(input->>'starts_at')::timestamptz) returning id into result;
 elsif command='close_assignment' then
  select * into a from public.meter_assignments where id=(input->>'assignment_id')::uuid and organization_id=org and property_id=prop for update;
  ending=(input->>'ends_at')::timestamptz;
  if a.id is null or a.ends_at is not null or ending<=a.starts_at or ending>now()+interval '5 minutes' or length(trim(coalesce(input->>'reason','')))<3 then raise exception 'invalid_assignment'; end if;
  if exists(select 1 from public.meter_readings where assignment_id=a.id and captured_at>=ending) then raise exception 'assignment_has_readings'; end if;
  update public.meter_assignments set ends_at=ending,close_reason=input->>'reason' where id=a.id;
  if coalesce((input->>'remove_meter')::boolean,false) then update public.meters set removed_at=ending where id=a.meter_id; end if;
  result=a.id;
 elsif command='new_route' then
  assignee=(input->>'assigned_to')::uuid;
  if not exists(select 1 from public.organization_memberships where organization_id=org and user_id=assignee and role in ('owner','admin')) and not exists(select 1 from public.property_memberships where organization_id=org and property_id=prop and user_id=assignee and role in ('manager','meter_technician')) then raise exception 'invalid_assignee'; end if;
  if jsonb_typeof(input->'assignments')<>'array' or jsonb_array_length(input->'assignments') not between 1 and 500 then raise exception 'invalid_route'; end if;
  insert into public.meter_routes(organization_id,property_id,label,assigned_to,starts_on,ends_on,cadence) values(org,prop,input->>'label',assignee,(input->>'starts_on')::date,(input->>'ends_on')::date,input->>'cadence') returning id into result;
  for assignment in select value::uuid from jsonb_array_elements_text(input->'assignments') loop
   select * into a from public.meter_assignments where id=assignment and organization_id=org and property_id=prop and ends_at is null;
   if a.id is null then raise exception 'invalid_assignment'; end if;
   pos=pos+1;
   insert into public.meter_route_items(organization_id,property_id,route_id,assignment_id,position) values(org,prop,result,assignment,pos);
  end loop;
 elsif command='cancel_route' then
  select * into r from public.meter_routes where id=(input->>'route_id')::uuid and organization_id=org and property_id=prop for update;
  if r.id is null or r.status<>'open' or length(trim(coalesce(input->>'reason','')))<3 then raise exception 'invalid_route'; end if;
  update public.meter_routes set status='cancelled',cancel_reason=input->>'reason' where id=r.id; result=r.id;
 elsif command='review' then
  select * into rd from public.meter_readings where id=(input->>'reading_id')::uuid and organization_id=org and property_id=prop for update;
  if rd.id is null then raise insufficient_privilege; end if;
  select * into current_review from public.meter_reading_reviews where reading_id=rd.id order by created_at desc,id desc limit 1;
  if current_review.id is distinct from nullif(input->>'previous_review_id','')::uuid then raise exception 'review_conflict'; end if;
  select * into m from public.meters where id=rd.meter_id;
  if input->>'decision'='accepted' then
   if coalesce(nullif(input->>'corrected_value',''),rd.value) is null then raise exception 'value_required'; end if;
   if coalesce(nullif(input->>'corrected_value',''),rd.value) !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then raise exception 'invalid_reading'; end if;
   if coalesce(nullif(input->>'corrected_value',''),rd.value)::numeric>=power(10::numeric,m.register_digits) then raise exception 'register_overflow'; end if;
   if exists(select 1 from public.meter_photos where reading_id=rd.id and status<>'uploaded') then raise exception 'photo_pending'; end if;
  end if;
  insert into public.meter_reading_reviews(organization_id,property_id,reading_id,previous_review_id,decision,corrected_value,reason)
   values(org,prop,rd.id,current_review.id,input->>'decision',nullif(input->>'corrected_value',''),input->>'reason') returning id into result;
 elsif command='resolve_conflict' then
  select * into conflict from public.meter_sync_conflicts where id=(input->>'conflict_id')::uuid and organization_id=org and property_id=prop for update;
  if conflict.id is null then raise insufficient_privilege; end if;
  if input->>'decision'='duplicate' and not exists(select 1 from public.meter_readings where id=(input->>'reading_id')::uuid and assignment_id=(conflict.payload->>'assignment_id')::uuid and organization_id=org and property_id=prop) then raise exception 'invalid_resolution'; end if;
  insert into public.meter_conflict_resolutions(organization_id,property_id,conflict_id,decision,reading_id,reason) values(org,prop,conflict.id,input->>'decision',nullif(input->>'reading_id','')::uuid,input->>'reason') returning id into result;
 else raise exception 'unknown_command'; end if;
 return result;
end; $$;
create function public.meter_command(command text,payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.meter_command(command,payload); $$;

create function private.submit_meter_reading(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare op uuid; org uuid; prop uuid; item public.meter_route_items; route public.meter_routes; a public.meter_assignments; m public.meters;
 prior public.meter_readings; prior_review public.meter_reading_reviews; operation private.meter_sync_operations;
 captured timestamptz; captured_date date; tz text; number text; flags text[]='{}'; previous_value numeric; person public.occupancy_stays; path text;
begin
 op=(payload->>'id')::uuid; org=(payload->>'organization_id')::uuid; prop=(payload->>'property_id')::uuid;
 if auth.uid() is null or not private.property_role(org,prop,array['manager','meter_technician']) then raise insufficient_privilege; end if;
 select timezone into tz from public.properties where id=prop and organization_id=org and archived_at is null and operating_status='active' for update;
 if not found then raise insufficient_privilege; end if;
 select * into item from public.meter_route_items where id=(payload->>'route_item_id')::uuid and organization_id=org and property_id=prop;
 select * into route from public.meter_routes where id=item.route_id for update;
 if route.id is null or route.assigned_to<>auth.uid() then raise insufficient_privilege; end if;
 select * into operation from private.meter_sync_operations where id=op;
 if found then
  if operation.actor_id<>auth.uid() or operation.payload<>payload then raise exception 'operation_conflict'; end if;
  return op;
 end if;
 if route.status<>'open' then raise insufficient_privilege; end if;
 select * into a from public.meter_assignments where id=item.assignment_id for update;
 select * into m from public.meters where id=a.meter_id;
 captured=(payload->>'captured_at')::timestamptz; captured_date=(captured at time zone tz)::date;
 if captured is null or captured>now()+interval '5 minutes' or captured<now()-interval '14 days' or captured<route.created_at-interval '5 minutes' or captured_date<route.starts_on or captured_date>=route.ends_on then raise exception 'capture_window'; end if;
 if a.id is null or a.id is distinct from (payload->>'assignment_id')::uuid or captured<a.starts_at or (a.ends_at is not null and captured>=a.ends_at) or captured<m.installed_at or (m.removed_at is not null and captured>=m.removed_at) then raise exception 'assignment_conflict'; end if;
 if exists(select 1 from public.meter_readings where route_item_id=item.id) then raise exception 'capture_conflict'; end if;
 select * into prior from public.meter_readings where assignment_id=a.id order by created_at desc,id desc limit 1;
 if prior.id is distinct from nullif(payload->>'previous_reading_id','')::uuid then raise exception 'baseline_conflict'; end if;
 if prior.id is not null then
  select * into prior_review from public.meter_reading_reviews where reading_id=prior.id order by created_at desc,id desc limit 1;
  if prior_review.id is distinct from nullif(payload->>'previous_review_id','')::uuid then raise exception 'baseline_conflict'; end if;
  if captured<=prior.captured_at then raise exception 'capture_order'; end if;
  previous_value=coalesce(case when prior_review.decision='accepted' then prior_review.corrected_value end,prior.value)::numeric;
 elsif nullif(payload->>'previous_review_id','') is not null then raise exception 'baseline_conflict'; end if;
 -- Missing or rejected observations must not erase the last known numeric register.
 select coalesce(case when v.decision='accepted' then v.corrected_value end,r.value)::numeric into previous_value
 from public.meter_readings r left join lateral(select decision,corrected_value from public.meter_reading_reviews where reading_id=r.id order by created_at desc,id desc limit 1) v on true
 where r.assignment_id=a.id and coalesce(v.decision,'pending')<>'rejected' and coalesce(case when v.decision='accepted' then v.corrected_value end,r.value) is not null
 order by r.created_at desc,r.id desc limit 1;
 number=nullif(payload->>'value','');
 if number is null and payload->>'flag' not in ('missing','damaged','problem') then raise exception 'value_required'; end if;
 if number is not null then
  if number !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then raise exception 'invalid_reading'; end if;
  if number::numeric>=power(10::numeric,m.register_digits) then raise exception 'register_overflow'; end if;
  if number::numeric<previous_value and payload->>'flag' not in ('rollover','reset') then raise exception 'lower_reading'; end if;
  if number::numeric=previous_value then flags=array_append(flags,'zero'); end if;
  if number::numeric<previous_value then flags=array_append(flags,'lower_register'); end if;
  if m.max_delta is not null and number::numeric-previous_value>m.max_delta::numeric then flags=array_append(flags,'unusual'); end if;
 end if;
 if payload->>'flag'<>'none' then
  if length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'reason_required'; end if;
  flags=array_append(flags,payload->>'flag');
 end if;
 if payload->>'kind'='estimated' then
  if not private.property_role(org,prop,array['manager']) or length(trim(coalesce(payload->>'notes','')))<3 then raise insufficient_privilege; end if;
  flags=array_append(flags,'estimated');
 end if;
 insert into public.meter_readings(id,organization_id,property_id,route_item_id,assignment_id,meter_id,captured_at,captured_by,device_id,previous_reading_id,previous_review_id,value,kind,flag,notes,exceptions)
  values(op,org,prop,item.id,a.id,m.id,captured,auth.uid(),(payload->>'device_id')::uuid,prior.id,prior_review.id,number,payload->>'kind',payload->>'flag',coalesce(payload->>'notes',''),flags);
 select * into person from public.occupancy_stays where site_id=a.site_id and starts_on<=captured_date and (ends_on is null or ends_on>captured_date);
 insert into private.meter_reading_occupancy(reading_id,stay_id,customer_id,site_id,captured_on) values(op,person.id,person.customer_id,a.site_id,captured_date);
 if jsonb_typeof(payload->'photo')='object' then
  path=org::text||'/'||prop::text||'/'||auth.uid()::text||'/'||op::text;
  insert into public.meter_photos(id,organization_id,property_id,reading_id,object_path,mime,byte_size,sha256)
   values(op,org,prop,op,path,payload->'photo'->>'mime',(payload->'photo'->>'byte_size')::int,payload->'photo'->>'sha256');
 end if;
 insert into private.meter_sync_operations values(op,auth.uid(),payload);
 return op;
end; $$;
create function public.submit_meter_reading(payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.submit_meter_reading(payload); $$;

create function private.report_meter_conflict(payload jsonb,reason_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.meter_route_items; route public.meter_routes; existing public.meter_sync_conflicts;
begin
 if auth.uid() is null or not private.property_role((payload->>'organization_id')::uuid,(payload->>'property_id')::uuid,array['manager','meter_technician']) then raise insufficient_privilege; end if;
 select * into item from public.meter_route_items where id=(payload->>'route_item_id')::uuid and organization_id=(payload->>'organization_id')::uuid and property_id=(payload->>'property_id')::uuid;
 select * into route from public.meter_routes where id=item.route_id;
 if route.id is null or route.assigned_to is distinct from auth.uid() or item.assignment_id is distinct from (payload->>'assignment_id')::uuid then raise insufficient_privilege; end if;
 if octet_length(payload::text)>32768 or reason_code not in ('assignment_conflict','baseline_conflict','capture_conflict','capture_window','capture_order','lower_reading','register_overflow') then raise exception 'invalid_conflict'; end if;
 select * into existing from public.meter_sync_conflicts where id=(report_meter_conflict.payload->>'id')::uuid;
 if found then
  if existing.actor_id<>auth.uid() or existing.payload<>payload then raise exception 'operation_conflict'; end if;
  return existing.id;
 end if;
 insert into public.meter_sync_conflicts(id,organization_id,property_id,route_item_id,actor_id,payload,reason_code)
 values((payload->>'id')::uuid,item.organization_id,item.property_id,item.id,auth.uid(),payload,reason_code);
 return (payload->>'id')::uuid;
end; $$;
create function public.report_meter_conflict(payload jsonb,reason_code text) returns uuid language sql security invoker set search_path='' as $$ select private.report_meter_conflict(payload,reason_code); $$;

-- A dedicated private bucket. No overwrite/delete policy: original evidence is retained.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('meter-photos','meter-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.meter_photo_access(object_name text,writing boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.meter_photos p where p.object_path=object_name and private.meter_reading_access(p.reading_id) and
 (not writing or (p.created_by=auth.uid() and p.status='pending')));
$$;
create policy forgeos_meter_photo_insert on storage.objects for insert to authenticated with check(bucket_id='meter-photos' and private.meter_photo_access(name,true));
create policy forgeos_meter_photo_select on storage.objects for select to authenticated using(bucket_id='meter-photos' and private.meter_photo_access(name,false));
create function private.complete_meter_photo(photo uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.meter_photos;
begin
 select * into p from public.meter_photos where id=photo for update;
 if auth.uid() is null or p.created_by is distinct from auth.uid() or not private.meter_reading_access(p.reading_id) then raise insufficient_privilege; end if;
 if not exists(select 1 from storage.objects where bucket_id='meter-photos' and name=p.object_path and (metadata->>'size')::bigint=p.byte_size and metadata->>'mimetype'=p.mime) then raise exception 'photo_missing'; end if;
 if p.status='uploaded' then return; end if;
 update public.meter_photos set status='uploaded' where id=p.id;
end; $$;
create function public.complete_meter_photo(photo uuid) returns void language sql security invoker set search_path='' as $$ select private.complete_meter_photo(photo); $$;
-- Occupant linkage is returned only to supervisors, never to a technician/offline cache.
create function private.meter_occupancy(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('reading_id',o.reading_id,'site_id',o.site_id,'stay_id',o.stay_id,'customer_id',o.customer_id,'captured_on',o.captured_on)),'[]'::jsonb)
 from private.meter_reading_occupancy o join public.meter_readings r on r.id=o.reading_id where r.organization_id=org and private.property_role(r.organization_id,r.property_id,array['manager']);
$$;
create function public.meter_occupancy(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.meter_occupancy(org); $$;

do $$ declare t text; begin
 foreach t in array array['meters','meter_assignments','meter_routes','meter_route_items','meter_readings','meter_reading_reviews','meter_photos','meter_sync_conflicts','meter_conflict_resolutions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',t);
  execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.write_audit()',t);
 end loop;
end $$;
create policy meters_read on public.meters for select to authenticated using(private.meter_access(organization_id,property_id,id));
create policy assignments_read on public.meter_assignments for select to authenticated using(private.meter_access(organization_id,property_id,meter_id));
create policy routes_read on public.meter_routes for select to authenticated using(private.meter_route_access(organization_id,property_id,id));
create policy route_items_read on public.meter_route_items for select to authenticated using(private.meter_route_access(organization_id,property_id,route_id));
create policy readings_read on public.meter_readings for select to authenticated using(private.meter_access(organization_id,property_id,meter_id));
create policy reviews_read on public.meter_reading_reviews for select to authenticated using(exists(select 1 from public.meter_readings r where r.id=reading_id and private.meter_access(r.organization_id,r.property_id,r.meter_id)));
create policy photos_read on public.meter_photos for select to authenticated using(private.meter_reading_access(reading_id));
create policy conflicts_read on public.meter_sync_conflicts for select to authenticated using(private.property_role(organization_id,property_id,array['manager']) or (actor_id=auth.uid() and private.property_role(organization_id,property_id,array['meter_technician'])));
create policy resolutions_read on public.meter_conflict_resolutions for select to authenticated using(exists(select 1 from public.meter_sync_conflicts c where c.id=conflict_id));
revoke execute on function private.report_meter_conflict(jsonb,text),public.report_meter_conflict(jsonb,text) from public,anon;
grant execute on function private.report_meter_conflict(jsonb,text),public.report_meter_conflict(jsonb,text) to authenticated;
revoke execute on function private.meter_route_access(uuid,uuid,uuid),private.meter_access(uuid,uuid,uuid),private.meter_reading_access(uuid),private.meter_photo_access(text,boolean),private.meter_command(text,jsonb),private.submit_meter_reading(jsonb),private.complete_meter_photo(uuid),private.meter_occupancy(uuid) from public,anon;
grant execute on function private.meter_route_access(uuid,uuid,uuid),private.meter_access(uuid,uuid,uuid),private.meter_reading_access(uuid),private.meter_photo_access(text,boolean),private.meter_command(text,jsonb),private.submit_meter_reading(jsonb),private.complete_meter_photo(uuid),private.meter_occupancy(uuid) to authenticated;
revoke execute on function public.meter_command(text,jsonb),public.submit_meter_reading(jsonb),public.complete_meter_photo(uuid),public.meter_occupancy(uuid) from public,anon;
grant execute on function public.meter_command(text,jsonb),public.submit_meter_reading(jsonb),public.complete_meter_photo(uuid),public.meter_occupancy(uuid) to authenticated;
commit;
