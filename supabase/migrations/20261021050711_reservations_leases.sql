-- Milestone 2. Additive migration; existing occupancy and audit rows are retained.
begin;
create table public.reservations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
  site_id uuid not null, customer_id uuid not null,
  confirmation_code text generated always as ('FG-' || upper(substr(id::text,1,8) || substr(id::text,10,4))) stored unique,
  starts_on date not null, ends_on date not null check(ends_on>starts_on),
  status text not null default 'tentative' check(status in ('inquiry','tentative','confirmed','checked_in','completed','cancelled','no_show')),
  billing_period text not null default 'nightly' check(billing_period in ('nightly','weekly','monthly','custom')),
  agreed_rate_cents bigint not null default 0 check(agreed_rate_cents between 0 and 999999999),
  deposit_required_cents bigint not null default 0 check(deposit_required_cents between 0 and 999999999),
  deposit_recorded_cents bigint not null default 0 check(deposit_recorded_cents between 0 and deposit_required_cents),
  deposit_reference text not null default '' check(length(deposit_reference)<=500),
  guest_count integer not null default 1 check(guest_count between 1 and 99),
  rv_length_ft numeric(9,2) check(rv_length_ft between 0 and 1000),
  vehicle_details text not null default '' check(length(vehicle_details)<=2000),
  pet_notes text not null default '' check(length(pet_notes)<=1000),
  notes text not null default '' check(length(notes)<=4000),
  cancellation_reason text not null default '' check(length(cancellation_reason)<=2000),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
  foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
  unique(organization_id,property_id,id)
);
create index reservations_scope_idx on public.reservations(organization_id,property_id,starts_on,ends_on);
create index reservations_customer_idx on public.reservations(customer_id,starts_on);
create index reservations_site_idx on public.reservations(site_id,status,starts_on);

alter table public.occupancy_stays
  add column reservation_id uuid unique,
  add column previous_stay_id uuid unique references public.occupancy_stays(id),
  add column planned_ends_on date check(planned_ends_on>starts_on),
  add column billing_period text not null default 'monthly' check(billing_period in ('nightly','weekly','monthly','custom')),
  add column deposit_required_cents bigint not null default 0 check(deposit_required_cents between 0 and 999999999),
  add column guest_count integer not null default 1 check(guest_count between 1 and 99),
  add column occupants text not null default '' check(length(occupants)<=2000),
  add column vehicle_details text not null default '' check(length(vehicle_details)<=2000),
  add column arrival_condition text not null default '' check(length(arrival_condition)<=4000),
  add column initial_meter_notes text not null default '' check(length(initial_meter_notes)<=2000),
  add column document_reference text not null default '' check(length(document_reference)<=1000),
  add column departure_condition text not null default '' check(length(departure_condition)<=4000),
  add column final_meter_notes text not null default '' check(length(final_meter_notes)<=2000),
  add column deposit_notes text not null default '' check(length(deposit_notes)<=2000),
  add column handover_notes text not null default '' check(length(handover_notes)<=4000),
  add column maintenance_needed boolean not null default false,
  add column plan_notes text not null default '' check(length(plan_notes)<=2000),
  add constraint stays_reservation_scope_fk foreign key(organization_id,property_id,reservation_id) references public.reservations(organization_id,property_id,id);
create index stays_planned_departure_idx on public.occupancy_stays(property_id,planned_ends_on) where ends_on is null;

-- One exclusion constraint arbitrates both reservation holds and actual stays,
-- including simultaneous transactions. This table is never exposed through the API.
create table private.site_allocations (
  organization_id uuid not null, property_id uuid not null, site_id uuid not null,
  reservation_id uuid unique references public.reservations(id),
  stay_id uuid unique references public.occupancy_stays(id), during daterange not null,
  check(num_nonnulls(reservation_id,stay_id)=1),
  foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
  exclude using gist(site_id with =, during with &&)
);
alter table private.site_allocations enable row level security;
revoke all on private.site_allocations from public,anon,authenticated;
insert into private.site_allocations(organization_id,property_id,site_id,stay_id,during)
 select organization_id,property_id,site_id,id,daterange(starts_on,ends_on,'[)') from public.occupancy_stays where ends_on is null or ends_on>starts_on;

create table public.lease_terms (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
  stay_id uuid not null references public.occupancy_stays(id), customer_id uuid not null, site_id uuid not null,
  renewed_from_id uuid references public.lease_terms(id), starts_on date not null, ends_on date not null check(ends_on>starts_on),
  billing_period text not null default 'monthly' check(billing_period in ('nightly','weekly','monthly','custom')),
  agreed_rate_cents bigint not null check(agreed_rate_cents between 0 and 999999999),
  deposit_required_cents bigint not null default 0 check(deposit_required_cents between 0 and 999999999),
  document_reference text not null default '' check(length(document_reference)<=1000),
  notes text not null default '' check(length(notes)<=4000),
  status text not null default 'recorded' check(status in ('recorded','voided')),
  void_reason text not null default '' check(length(void_reason)<=2000),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
  foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
  exclude using gist(stay_id with =, daterange(starts_on,ends_on,'[)') with &&) where(status='recorded')
);
create index lease_terms_scope_idx on public.lease_terms(organization_id,property_id,starts_on);
create index lease_terms_customer_idx on public.lease_terms(customer_id,starts_on);
create unique index lease_terms_active_renewal_idx on public.lease_terms(renewed_from_id) where status='recorded';

create function private.guard_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare prop public.properties; site public.sites_units; customer public.customers; today date;
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 select * into prop from public.properties where id=new.property_id and organization_id=new.organization_id for update;
 select * into site from public.sites_units where id=new.site_id and property_id=new.property_id and organization_id=new.organization_id for update;
 select * into customer from public.customers where id=new.customer_id and property_id=new.property_id and organization_id=new.organization_id for update;
 if prop.id is null or site.id is null or customer.id is null then raise foreign_key_violation; end if;
 today=(now() at time zone prop.timezone)::date;
 if TG_OP='INSERT' then
   if new.status not in ('inquiry','tentative','confirmed') or new.cancellation_reason<>'' then raise exception 'invalid_transition'; end if;
   if new.starts_on<today then raise exception 'booking_in_past'; end if;
 else
   if old.status in ('completed','cancelled','no_show') then raise exception 'history_immutable'; end if;
   if old.status='checked_in' and new.status<>'completed' then raise exception 'history_immutable'; end if;
   if new.status in ('checked_in','completed') then
     if (to_jsonb(new)-array['status','confirmation_code','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['status','confirmation_code','updated_at','updated_by']) then raise exception 'history_immutable'; end if;
     if not exists(select 1 from public.occupancy_stays s where s.reservation_id=new.id and ((new.status='checked_in' and s.ends_on is null) or (new.status='completed' and s.ends_on is not null))) then raise exception 'invalid_transition'; end if;
   elsif new.status in ('cancelled','no_show') then
     if length(trim(new.cancellation_reason))=0 or (new.status='no_show' and new.starts_on>today) then raise exception 'invalid_transition'; end if;
     if (to_jsonb(new)-array['status','confirmation_code','cancellation_reason','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['status','confirmation_code','cancellation_reason','updated_at','updated_by']) then raise exception 'history_immutable'; end if;
   elsif new.status not in ('inquiry','tentative','confirmed') then raise exception 'invalid_transition';
   elsif (new.starts_on<>old.starts_on or new.ends_on<>old.ends_on or new.site_id<>old.site_id or new.status<>old.status) and new.starts_on<today then raise exception 'booking_in_past';
   end if;
   if new.site_id<>old.site_id and site.kind<>(select kind from public.sites_units where id=old.site_id) then raise exception 'incompatible_site'; end if;
 end if;
 if new.status in ('inquiry','tentative','confirmed') then
   if prop.archived_at is not null or prop.operating_status<>'active' or customer.archived_at is not null then raise exception 'record_inactive'; end if;
   if site.archived_at is not null or site.physical_status<>'ready' then raise exception 'site_unavailable'; end if;
   if new.rv_length_ft is not null and site.max_rv_length_ft is not null and new.rv_length_ft>site.max_rv_length_ft then raise exception 'incompatible_site'; end if;
   if new.status='confirmed' and exists(select 1 from public.occupancy_stays s where s.site_id=new.site_id and s.ends_on is null and s.planned_ends_on<=today) then raise exception 'overdue_departure'; end if;
 end if;
 return new;
end; $$;
create function private.sync_reservation_allocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 delete from private.site_allocations where reservation_id=new.id;
 if new.status='confirmed' then
   insert into private.site_allocations(organization_id,property_id,site_id,reservation_id,during)
    values(new.organization_id,new.property_id,new.site_id,new.id,daterange(new.starts_on,new.ends_on,'[)'));
 end if;
 return new;
end; $$;

create or replace function private.guard_stay() returns trigger language plpgsql security definer set search_path='' as $$
declare prop public.properties; site public.sites_units; customer public.customers; booking public.reservations; prior public.occupancy_stays; today date;
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if TG_OP='UPDATE' then
   if old.ends_on is not null or (to_jsonb(new)-array['ends_on','planned_ends_on','plan_notes','departure_condition','final_meter_notes','deposit_notes','handover_notes','maintenance_needed','updated_at','updated_by']) is distinct from
      (to_jsonb(old)-array['ends_on','planned_ends_on','plan_notes','departure_condition','final_meter_notes','deposit_notes','handover_notes','maintenance_needed','updated_at','updated_by']) then raise exception 'history_immutable'; end if;
   if new.ends_on is null and (to_jsonb(new)-array['planned_ends_on','plan_notes','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['planned_ends_on','plan_notes','updated_at','updated_by']) then raise exception 'history_immutable'; end if;
 end if;
 select * into prop from public.properties where id=new.property_id and organization_id=new.organization_id for update;
 select * into site from public.sites_units where id=new.site_id and property_id=new.property_id and organization_id=new.organization_id for update;
 select * into customer from public.customers where id=new.customer_id and property_id=new.property_id and organization_id=new.organization_id for update;
 if prop.id is null or site.id is null or customer.id is null then raise foreign_key_violation; end if;
 today=(now() at time zone prop.timezone)::date;
 if new.starts_on>today then raise exception 'future_stay'; end if;
 if new.ends_on is not null and (new.ends_on<new.starts_on or new.ends_on>today) then raise exception 'invalid_moveout'; end if;
 if new.ends_on is null and new.planned_ends_on is not null and (TG_OP='INSERT' or new.planned_ends_on is distinct from old.planned_ends_on) and new.planned_ends_on<today then raise exception 'invalid_departure_plan'; end if;
 if TG_OP='INSERT' then
   if prop.archived_at is not null or prop.operating_status<>'active' or customer.archived_at is not null then raise exception 'record_inactive'; end if;
   if site.archived_at is not null or site.physical_status<>'ready' then raise exception 'site_unavailable'; end if;
   if exists(select 1 from public.occupancy_stays s where s.site_id=new.site_id and s.ends_on is null) then raise exception 'site_occupied'; end if;
   if new.reservation_id is not null then
     select * into booking from public.reservations where id=new.reservation_id for update;
     if booking.status<>'confirmed' or booking.site_id<>new.site_id or booking.customer_id<>new.customer_id or new.starts_on<booking.starts_on or new.starts_on>=booking.ends_on or booking.ends_on<=today or new.planned_ends_on is distinct from booking.ends_on or new.agreed_rate_cents<>booking.agreed_rate_cents or new.billing_period<>booking.billing_period or new.deposit_required_cents<>booking.deposit_required_cents then raise exception 'invalid_checkin'; end if;
     delete from private.site_allocations where reservation_id=booking.id;
   end if;
   if new.previous_stay_id is not null then
     select * into prior from public.occupancy_stays where id=new.previous_stay_id;
     if prior.organization_id<>new.organization_id or prior.property_id<>new.property_id or prior.customer_id<>new.customer_id or prior.ends_on is distinct from new.starts_on or prior.site_id=new.site_id then raise exception 'invalid_transfer'; end if;
   end if;
 end if;
 return new;
end; $$;
create function private.sync_stay_allocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 delete from private.site_allocations where stay_id=new.id;
 if new.ends_on is null or new.ends_on>new.starts_on then
   insert into private.site_allocations(organization_id,property_id,site_id,stay_id,during)
    values(new.organization_id,new.property_id,new.site_id,new.id,daterange(new.starts_on,coalesce(new.ends_on,new.planned_ends_on),'[)'));
 end if;
 if new.reservation_id is not null then
   update public.reservations set status=case when new.ends_on is null then 'checked_in' else 'completed' end where id=new.reservation_id and status is distinct from case when new.ends_on is null then 'checked_in' else 'completed' end;
 end if;
 if TG_OP='UPDATE' and old.ends_on is null and new.ends_on is not null then
   update public.sites_units set physical_status='in_preparation' where id=new.site_id;
 end if;
 return new;
end; $$;

create function private.guard_lease_term() returns trigger language plpgsql security definer set search_path='' as $$
declare stay public.occupancy_stays; prior public.lease_terms;
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if TG_OP='UPDATE' then
   if not private.property_role(new.organization_id,new.property_id,array['manager']) then raise insufficient_privilege; end if;
   if old.status<>'recorded' or new.status<>'voided' or length(trim(new.void_reason))=0 or
      (to_jsonb(new)-array['status','void_reason','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['status','void_reason','updated_at','updated_by']) then raise exception 'history_immutable'; end if;
   if exists(select 1 from public.lease_terms where renewed_from_id=old.id and status='recorded') then raise exception 'void_renewal_first'; end if;
   return new;
 end if;
 select * into stay from public.occupancy_stays where id=new.stay_id;
 if stay.id is null or stay.organization_id<>new.organization_id or stay.property_id<>new.property_id or stay.customer_id<>new.customer_id or stay.site_id<>new.site_id then raise foreign_key_violation; end if;
 if new.status<>'recorded' or new.void_reason<>'' or new.starts_on<stay.starts_on then raise exception 'invalid_lease_term'; end if;
 if new.renewed_from_id is not null then
   select * into prior from public.lease_terms where id=new.renewed_from_id for update;
   if prior.id is null or prior.stay_id<>new.stay_id or prior.status<>'recorded' or new.starts_on<>prior.ends_on then raise exception 'invalid_renewal'; end if;
 end if;
 return new;
end; $$;

-- Archive guards include confirmed bookings. Temporary preparation after a
-- departure is allowed; existing bookings cannot be silently archived away.
create or replace function private.guard_property() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise check_violation; end if;
 if TG_OP='UPDATE' and ((new.archived_at is not null and old.archived_at is null) or (new.operating_status='inactive' and old.operating_status='active')) and (
   exists(select 1 from public.occupancy_stays where property_id=new.id and ends_on is null) or
   exists(select 1 from public.reservations where property_id=new.id and status='confirmed')) then raise exception 'archive_active'; end if;
 return new;
end; $$;
create or replace function private.guard_directory() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.archived_at is not null and old.archived_at is null then
   if TG_TABLE_NAME='sites_units' then
     if exists(select 1 from public.occupancy_stays where site_id=new.id and ends_on is null) or exists(select 1 from public.reservations where site_id=new.id and status='confirmed') then raise exception 'archive_active'; end if;
   else
     if exists(select 1 from public.occupancy_stays where customer_id=new.id and ends_on is null) or exists(select 1 from public.reservations where customer_id=new.id and status='confirmed') then raise exception 'archive_active'; end if;
   end if;
 end if;
 if TG_TABLE_NAME='sites_units' and to_jsonb(new)->>'physical_status'<>'ready' then
   if exists(select 1 from public.occupancy_stays where site_id=new.id and ends_on is null) or
      (to_jsonb(new)->>'physical_status' in ('blocked','out_of_service') and exists(select 1 from public.reservations where site_id=new.id and status='confirmed')) then raise exception 'site_unavailable'; end if;
 end if;
 return new;
end; $$;

create function private.check_in_reservation(booking uuid,arrival date,details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare record public.reservations; result uuid;
begin
 select * into record from public.reservations where id=booking for update;
 if auth.uid() is null or record.id is null or not private.property_role(record.organization_id,record.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if record.status='checked_in' then select id into result from public.occupancy_stays where reservation_id=booking; return result; end if;
 if record.status<>'confirmed' or arrival is null or jsonb_typeof(details)<>'object' then raise exception 'invalid_checkin'; end if;
 insert into public.occupancy_stays(organization_id,property_id,site_id,customer_id,reservation_id,starts_on,planned_ends_on,agreed_rate_cents,billing_period,deposit_required_cents,guest_count,occupants,vehicle_details,arrival_condition,initial_meter_notes,document_reference,notes)
 values(record.organization_id,record.property_id,record.site_id,record.customer_id,record.id,arrival,record.ends_on,record.agreed_rate_cents,record.billing_period,record.deposit_required_cents,record.guest_count,coalesce(details->>'occupants',''),record.vehicle_details,coalesce(details->>'arrival_condition',''),coalesce(details->>'initial_meter_notes',''),coalesce(details->>'document_reference',''),coalesce(details->>'notes','')) returning id into result;
 return result;
end; $$;
create function public.check_in_reservation(booking uuid,arrival date,details jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.check_in_reservation(booking,arrival,details); $$;

create function private.complete_stay_checklist(stay uuid,departure date,details jsonb) returns void language plpgsql security definer set search_path='' as $$
declare record public.occupancy_stays;
begin
 select * into record from public.occupancy_stays where id=stay for update;
 if auth.uid() is null or record.id is null or not private.property_role(record.organization_id,record.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if departure is null or jsonb_typeof(details)<>'object' then raise exception 'invalid_moveout'; end if;
 update public.occupancy_stays set ends_on=departure,departure_condition=coalesce(details->>'departure_condition',''),final_meter_notes=coalesce(details->>'final_meter_notes',''),deposit_notes=coalesce(details->>'deposit_notes',''),handover_notes=coalesce(details->>'handover_notes',''),maintenance_needed=coalesce((details->>'maintenance_needed')::boolean,false) where id=stay;
end; $$;
create function public.complete_stay_checklist(stay uuid,departure date,details jsonb) returns void language sql security invoker set search_path='' as $$ select private.complete_stay_checklist(stay,departure,details); $$;
create or replace function private.complete_stay(stay uuid,departure date) returns void language sql security definer set search_path='' as $$ select private.complete_stay_checklist(stay,departure,'{}'::jsonb); $$;

create function private.change_stay_plan(stay uuid,departure date,reason text) returns void language plpgsql security definer set search_path='' as $$
declare record public.occupancy_stays;
begin
 select * into record from public.occupancy_stays where id=stay for update;
 if auth.uid() is null or record.id is null or not private.property_role(record.organization_id,record.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if length(trim(coalesce(reason,'')))=0 then raise exception 'reason_required'; end if;
 update public.occupancy_stays set planned_ends_on=departure,plan_notes=reason where id=stay;
end; $$;
create function public.change_stay_plan(stay uuid,departure date,reason text) returns void language sql security invoker set search_path='' as $$ select private.change_stay_plan(stay,departure,reason); $$;

create function private.transfer_stay(stay uuid,destination uuid,transfer_on date,rate_cents bigint,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare record public.occupancy_stays; target public.sites_units; result uuid;
begin
 select * into record from public.occupancy_stays where id=stay for update;
 if auth.uid() is null or record.id is null or not private.property_role(record.organization_id,record.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 select * into target from public.sites_units where id=destination;
 if record.ends_on is not null or target.id is null or target.property_id<>record.property_id or target.kind<>(select kind from public.sites_units where id=record.site_id) or target.id=record.site_id or length(trim(coalesce(reason,'')))=0 then raise exception 'invalid_transfer'; end if;
 perform private.complete_stay_checklist(stay,transfer_on,jsonb_build_object('handover_notes',reason));
 insert into public.occupancy_stays(organization_id,property_id,site_id,customer_id,previous_stay_id,starts_on,planned_ends_on,agreed_rate_cents,billing_period,deposit_required_cents,guest_count,occupants,vehicle_details,notes)
 values(record.organization_id,record.property_id,target.id,record.customer_id,record.id,transfer_on,case when record.planned_ends_on>transfer_on then record.planned_ends_on else null end,rate_cents,record.billing_period,record.deposit_required_cents,record.guest_count,record.occupants,record.vehicle_details,reason) returning id into result;
 return result;
end; $$;
create function public.transfer_stay(stay uuid,destination uuid,transfer_on date,rate_cents bigint,reason text) returns uuid language sql security invoker set search_path='' as $$ select private.transfer_stay(stay,destination,transfer_on,rate_cents,reason); $$;

do $$ declare t text; begin
 foreach t in array array['reservations','lease_terms'] loop
  execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',t);
  execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.write_audit()',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy records_read on public.%I for select to authenticated using(private.property_role(organization_id,property_id,array[''manager'',''office'']))',t);
  execute format('create policy records_insert on public.%I for insert to authenticated with check(private.property_role(organization_id,property_id,array[''manager'',''office'']))',t);
  execute format('create policy records_update on public.%I for update to authenticated using(private.property_role(organization_id,property_id,array[''manager'',''office''])) with check(private.property_role(organization_id,property_id,array[''manager'',''office'']))',t);
 end loop;
end $$;
create trigger b_reservation before insert or update on public.reservations for each row execute function private.guard_reservation();
create trigger c_reservation_allocation after insert or update on public.reservations for each row execute function private.sync_reservation_allocation();
create trigger c_stay_allocation after insert or update on public.occupancy_stays for each row execute function private.sync_stay_allocation();
create trigger b_lease_term before insert or update on public.lease_terms for each row execute function private.guard_lease_term();
revoke all on public.reservations,public.lease_terms from public,anon,authenticated;
grant select,insert,update on public.reservations,public.lease_terms to authenticated;
revoke execute on function private.guard_reservation(),private.sync_reservation_allocation(),private.sync_stay_allocation(),private.guard_lease_term() from public,anon,authenticated;
revoke execute on function private.check_in_reservation(uuid,date,jsonb),private.complete_stay_checklist(uuid,date,jsonb),private.change_stay_plan(uuid,date,text),private.transfer_stay(uuid,uuid,date,bigint,text) from public,anon;
grant execute on function private.check_in_reservation(uuid,date,jsonb),private.complete_stay_checklist(uuid,date,jsonb),private.change_stay_plan(uuid,date,text),private.transfer_stay(uuid,uuid,date,bigint,text) to authenticated;
revoke execute on function public.check_in_reservation(uuid,date,jsonb),public.complete_stay_checklist(uuid,date,jsonb),public.change_stay_plan(uuid,date,text),public.transfer_stay(uuid,uuid,date,bigint,text) from public,anon;
grant execute on function public.check_in_reservation(uuid,date,jsonb),public.complete_stay_checklist(uuid,date,jsonb),public.change_stay_plan(uuid,date,text),public.transfer_stay(uuid,uuid,date,bigint,text) to authenticated;
commit;
