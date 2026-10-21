-- ForgeOS Milestone 1. No production records or credentials belong in migrations.
begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke create on schema public from public;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
  role text not null check(role in ('owner','admin','member')), created_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);
create index organization_memberships_user_idx on public.organization_memberships(user_id,organization_id);
create table public.properties (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null check(length(trim(name)) between 1 and 200),
  category text not null check(category in ('rv_park','apartments','campground','mobile_home','mixed_use','rentals','commercial')),
  address text not null default '', city text not null default '', state text not null default '', postal_code text not null default '',
  country text not null default 'United States', timezone text not null default 'America/Los_Angeles',
  phone text not null default '', email text not null default '', contact_name text not null default '',
  description text not null default '', notes text not null default '', operating_status text not null default 'active' check(operating_status in ('active','inactive')),
  archived_at timestamptz, created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create index properties_organization_idx on public.properties(organization_id,archived_at);
create table public.property_memberships (
  organization_id uuid not null, property_id uuid not null, user_id uuid not null,
  role text not null check(role in ('manager','office','maintenance','meter_technician')),
  created_at timestamptz not null default now(), primary key(property_id,user_id),
  foreign key(organization_id,property_id) references public.properties(organization_id,id),
  foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id)
);
create index property_memberships_user_idx on public.property_memberships(user_id,organization_id,property_id);
create table public.sites_units (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
  label text not null check(length(trim(label)) between 1 and 40),
  kind text not null check(kind in ('rv','apartment','tent','cabin','house','commercial')), section text not null default '',
  physical_status text not null default 'ready' check(physical_status in ('ready','out_of_service','blocked','in_preparation')),
  monthly_rate_cents bigint not null default 0 check(monthly_rate_cents between 0 and 999999999),
  nightly_rate_cents bigint not null default 0 check(nightly_rate_cents between 0 and 999999999),
  weekly_rate_cents bigint not null default 0 check(weekly_rate_cents between 0 and 999999999),
  deposit_cents bigint not null default 0 check(deposit_cents between 0 and 999999999),
  bedrooms integer check(bedrooms between 0 and 100), bathrooms numeric(4,1) check(bathrooms between 0 and 100 and bathrooms*2=trunc(bathrooms*2)),
  square_feet integer check(square_feet>=0), length_ft numeric(9,2) check(length_ft>=0), width_ft numeric(9,2) check(width_ft>=0),
  max_rv_length_ft numeric(9,2) check(max_rv_length_ft>=0), amperage integer check(amperage>=0),
  pull_through boolean not null default false, electric boolean not null default false, water boolean not null default false,
  sewer boolean not null default false, gas boolean not null default false, amenities text[] not null default '{}', notes text not null default '',
  map_x integer not null default 0 check(map_x between 0 and 20), map_y integer not null default 0 check(map_y between 0 and 50),
  archived_at timestamptz, created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,property_id) references public.properties(organization_id,id),
  unique(property_id,label), unique(organization_id,property_id,id)
);
create index sites_units_scope_idx on public.sites_units(organization_id,property_id,archived_at);
create table public.customers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
  first_name text not null check(length(trim(first_name)) between 1 and 100), last_name text not null check(length(trim(last_name)) between 1 and 100),
  preferred_name text not null default '', phone text not null default '', secondary_phone text not null default '', email text not null default '',
  mailing_address text not null default '', emergency_contact text not null default '', emergency_phone text not null default '',
  communication_preference text not null default 'none' check(communication_preference in ('phone','email','none')), notes text not null default '',
  archived_at timestamptz, created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,property_id) references public.properties(organization_id,id), unique(organization_id,property_id,id)
);
create index customers_scope_idx on public.customers(organization_id,property_id,archived_at);
create index customers_name_idx on public.customers(property_id,last_name,first_name);
create table public.occupancy_stays (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
  site_id uuid not null, customer_id uuid not null, starts_on date not null, ends_on date check(ends_on>=starts_on),
  agreed_rate_cents bigint not null default 0 check(agreed_rate_cents between 0 and 999999999), notes text not null default '',
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
  foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
  -- UUID/date exclusion works for simultaneous requests as well as historical edits.
  exclude using gist (site_id with =, daterange(starts_on,ends_on,'[)') with &&)
);
create index occupancy_stays_scope_idx on public.occupancy_stays(organization_id,property_id,starts_on);
create index occupancy_stays_customer_idx on public.occupancy_stays(customer_id,starts_on);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  property_id uuid, actor_id uuid not null references auth.users(id), entity text not null, entity_id uuid,
  action text not null, before_data jsonb, after_data jsonb, occurred_at timestamptz not null default now()
);
create index audit_events_scope_idx on public.audit_events(organization_id,occurred_at desc);

-- Private membership lookups avoid recursive RLS. They derive identity exclusively from auth.uid().
create function private.org_role(org uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role=any(roles));
$$;
create function private.property_role(org uuid,prop uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.org_role(org,array['owner','admin']) or exists(
   select 1 from public.property_memberships m where m.organization_id=org and m.property_id=prop and m.user_id=(select auth.uid()) and m.role=any(roles)));
$$;
create function private.organization_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()));
$$;

create function private.stamp_record() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if TG_OP='UPDATE' then
   if new.id<>old.id or (to_jsonb(new)->>'organization_id') is distinct from (to_jsonb(old)->>'organization_id') or
      (to_jsonb(new)->>'property_id') is distinct from (to_jsonb(old)->>'property_id') then raise exception 'history_immutable'; end if;
   new.created_at=old.created_at; new.created_by=old.created_by;
 else new.created_by=auth.uid(); new.created_at=now(); end if;
 new.updated_by=auth.uid(); new.updated_at=now(); return new;
end; $$;
create function private.guard_property() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise check_violation; end if;
 if TG_OP='UPDATE' and ((new.archived_at is not null and old.archived_at is null) or (new.operating_status='inactive' and old.operating_status='active')) and
   exists(select 1 from public.occupancy_stays where property_id=new.id and ends_on is null) then raise exception 'archive_active'; end if;
 return new;
end; $$;
create function private.guard_directory() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.archived_at is not null and old.archived_at is null then
   if TG_TABLE_NAME='sites_units' then
     if exists(select 1 from public.occupancy_stays where site_id=new.id and ends_on is null) then raise exception 'archive_active'; end if;
   else
     if exists(select 1 from public.occupancy_stays where customer_id=new.id and ends_on is null) then raise exception 'archive_active'; end if;
   end if;
 end if;
 if TG_TABLE_NAME='sites_units' and to_jsonb(new)->>'physical_status'<>'ready' and
   exists(select 1 from public.occupancy_stays where site_id=new.id and ends_on is null) then raise exception 'site_unavailable'; end if;
 return new;
end; $$;
create function private.guard_stay() returns trigger language plpgsql security definer set search_path='' as $$
declare prop public.properties; site public.sites_units; customer public.customers; today date;
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if TG_OP='UPDATE' then
   if old.ends_on is not null or new.site_id<>old.site_id or new.customer_id<>old.customer_id or new.starts_on<>old.starts_on or new.agreed_rate_cents<>old.agreed_rate_cents then raise exception 'history_immutable'; end if;
 end if;
 select * into prop from public.properties where id=new.property_id and organization_id=new.organization_id for update;
 select * into site from public.sites_units where id=new.site_id and property_id=new.property_id and organization_id=new.organization_id for update;
 select * into customer from public.customers where id=new.customer_id and property_id=new.property_id and organization_id=new.organization_id for update;
 if prop.id is null or site.id is null or customer.id is null then raise foreign_key_violation; end if;
 today=(now() at time zone prop.timezone)::date;
 if new.starts_on>today then raise exception 'future_stay'; end if;
 if new.ends_on is not null and (new.ends_on<new.starts_on or new.ends_on>today) then raise exception 'invalid_moveout'; end if;
 if TG_OP='INSERT' then
   if prop.archived_at is not null or prop.operating_status<>'active' or customer.archived_at is not null then raise exception 'record_inactive'; end if;
   if site.archived_at is not null or site.physical_status<>'ready' then raise exception 'site_unavailable'; end if;
 end if;
 return new;
end; $$;
create function private.write_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; org uuid;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 row_data=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 org=case when TG_TABLE_NAME='organizations' then (row_data->>'id')::uuid else (row_data->>'organization_id')::uuid end;
 insert into public.audit_events(organization_id,property_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(org,(row_data->>'property_id')::uuid,auth.uid(),TG_TABLE_NAME,coalesce((row_data->>'id')::uuid,(row_data->>'user_id')::uuid),TG_OP,
 case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,case when TG_OP='DELETE' then null else row_data end);
 if TG_OP='DELETE' then return old; end if;
 return new;
end; $$;
do $$ declare table_name text; begin
 foreach table_name in array array['organizations','properties','sites_units','customers','occupancy_stays'] loop
   execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',table_name);
 end loop;
 foreach table_name in array array['organizations','organization_memberships','property_memberships','properties','sites_units','customers','occupancy_stays'] loop
   execute format('create trigger z_audit after insert or update or delete on public.%I for each row execute function private.write_audit()',table_name);
 end loop;
end $$;
create trigger b_property before insert or update on public.properties for each row execute function private.guard_property();
create trigger b_site before insert or update on public.sites_units for each row execute function private.guard_directory();
create trigger b_customer before insert or update on public.customers for each row execute function private.guard_directory();
create trigger b_stay before insert or update on public.occupancy_stays for each row execute function private.guard_stay();

-- Bootstrap and narrow transactional operations live in a non-exposed schema.
create function private.create_organization(organization_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 insert into public.organizations(name,created_by,updated_by) values(trim(organization_name),auth.uid(),auth.uid()) returning id into result;
 insert into public.organization_memberships(organization_id,user_id,role) values(result,auth.uid(),'owner');
 return result;
end; $$;
create function public.create_organization(organization_name text) returns uuid language sql security invoker set search_path='' as $$ select private.create_organization(organization_name); $$;
create function private.grant_property_access(organization uuid,property uuid,member uuid,member_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.org_role(organization,array['owner']) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.properties where id=property and organization_id=organization) then raise insufficient_privilege; end if;
 insert into public.organization_memberships(organization_id,user_id,role) values(organization,member,'member') on conflict do nothing;
 insert into public.property_memberships(organization_id,property_id,user_id,role) values(organization,property,member,member_role)
 on conflict(property_id,user_id) do update set role=excluded.role;
end; $$;
create function public.grant_property_access(organization uuid,property uuid,member uuid,member_role text) returns void language sql security invoker set search_path='' as $$ select private.grant_property_access(organization,property,member,member_role); $$;
create function private.revoke_property_access(organization uuid,property uuid,member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.org_role(organization,array['owner']) then raise insufficient_privilege; end if;
 delete from public.property_memberships where organization_id=organization and property_id=property and user_id=member;
end; $$;
create function public.revoke_property_access(organization uuid,property uuid,member uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_property_access(organization,property,member); $$;
create function private.complete_stay(stay uuid,departure date) returns void language plpgsql security definer set search_path='' as $$
declare record public.occupancy_stays;
begin
 select * into record from public.occupancy_stays where id=stay for update;
 if auth.uid() is null or record.id is null or not private.property_role(record.organization_id,record.property_id,array['manager','office']) then raise insufficient_privilege; end if;
 if departure is null then raise exception 'invalid_moveout'; end if;
 update public.occupancy_stays set ends_on=departure where id=stay;
 update public.sites_units set physical_status='in_preparation' where id=record.site_id;
end; $$;
create function public.complete_stay(stay uuid,departure date) returns void language sql security invoker set search_path='' as $$ select private.complete_stay(stay,departure); $$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.property_memberships enable row level security;
alter table public.properties enable row level security;
alter table public.sites_units enable row level security;
alter table public.customers enable row level security;
alter table public.occupancy_stays enable row level security;
alter table public.audit_events enable row level security;
create policy organizations_read on public.organizations for select to authenticated using(private.organization_member(id));
create policy organizations_update on public.organizations for update to authenticated using(private.org_role(id,array['owner','admin'])) with check(private.org_role(id,array['owner','admin']));
create policy org_memberships_read on public.organization_memberships for select to authenticated using(user_id=(select auth.uid()) or private.org_role(organization_id,array['owner','admin']));
create policy prop_memberships_read on public.property_memberships for select to authenticated using(user_id=(select auth.uid()) or private.org_role(organization_id,array['owner','admin']));
create policy properties_read on public.properties for select to authenticated using(private.property_role(organization_id,id,array['manager','office','maintenance','meter_technician']));
create policy properties_insert on public.properties for insert to authenticated with check(private.org_role(organization_id,array['owner','admin']));
create policy properties_update on public.properties for update to authenticated using(private.property_role(organization_id,id,array['manager'])) with check(private.property_role(organization_id,id,array['manager']));
create policy sites_read on public.sites_units for select to authenticated using(private.property_role(organization_id,property_id,array['manager','office']));
create policy sites_insert on public.sites_units for insert to authenticated with check(private.property_role(organization_id,property_id,array['manager']));
create policy sites_update on public.sites_units for update to authenticated using(private.property_role(organization_id,property_id,array['manager'])) with check(private.property_role(organization_id,property_id,array['manager']));
create policy customers_read on public.customers for select to authenticated using(private.property_role(organization_id,property_id,array['manager','office']));
create policy customers_insert on public.customers for insert to authenticated with check(private.property_role(organization_id,property_id,array['manager','office']));
create policy customers_update on public.customers for update to authenticated using(private.property_role(organization_id,property_id,array['manager','office'])) with check(private.property_role(organization_id,property_id,array['manager','office']));
create policy stays_read on public.occupancy_stays for select to authenticated using(private.property_role(organization_id,property_id,array['manager','office']));
create policy stays_insert on public.occupancy_stays for insert to authenticated with check(private.property_role(organization_id,property_id,array['manager','office']));
-- Stay updates are only available through complete_stay; no direct UPDATE/DELETE grant.
create policy audits_read on public.audit_events for select to authenticated using(private.org_role(organization_id,array['owner','admin']));

revoke all on all tables in schema public from anon,authenticated;
grant select on public.organizations,public.organization_memberships,public.property_memberships,public.properties,public.sites_units,public.customers,public.occupancy_stays,public.audit_events to authenticated;
grant update on public.organizations to authenticated;
grant insert,update on public.properties,public.sites_units,public.customers to authenticated;
grant insert on public.occupancy_stays to authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.org_role(uuid,text[]),private.property_role(uuid,uuid,text[]),private.organization_member(uuid),private.create_organization(text),private.grant_property_access(uuid,uuid,uuid,text),private.revoke_property_access(uuid,uuid,uuid),private.complete_stay(uuid,date) to authenticated;
revoke execute on function public.create_organization(text),public.grant_property_access(uuid,uuid,uuid,text),public.revoke_property_access(uuid,uuid,uuid),public.complete_stay(uuid,date) from public,anon;
grant execute on function public.create_organization(text),public.grant_property_access(uuid,uuid,uuid,text),public.revoke_property_access(uuid,uuid,uuid),public.complete_stay(uuid,date) to authenticated;
commit;
