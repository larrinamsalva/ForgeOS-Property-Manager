begin;
create table public.inspection_run_locations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 property_id uuid not null,
 run_id uuid not null unique references public.checklist_runs(id),
 site_id uuid references public.sites_units(id),
 area_label text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 constraint inspection_location_choice check (
 (site_id is not null and area_label is null)
 or (site_id is null and area_label is not null and length(trim(area_label)) between 2 and 120)
 )
);
create index on public.inspection_run_locations(organization_id,property_id);
create function private.inspection_location_allowed(org uuid, prop uuid, run uuid, site uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.operations_worker(org,prop,auth.uid())
 and exists (select 1 from public.checklist_runs r where r.id=run and r.organization_id=org and r.property_id=prop)
 and (site is null or exists(select 1 from public.sites_units s where s.id=site and s.organization_id=org and s.property_id=prop));
$$;
revoke all on function private.inspection_location_allowed(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.inspection_location_allowed(uuid,uuid,uuid,uuid) to authenticated;
alter table public.inspection_run_locations enable row level security;
create policy inspection_run_locations_read on public.inspection_run_locations for select to authenticated
using(private.inspection_location_allowed(organization_id,property_id,run_id,site_id));
create policy inspection_run_locations_insert on public.inspection_run_locations for insert to authenticated
with check(private.inspection_location_allowed(organization_id,property_id,run_id,site_id) and created_by=auth.uid());
revoke all on public.inspection_run_locations from public,anon;
grant select,insert on public.inspection_run_locations to authenticated;
commit;