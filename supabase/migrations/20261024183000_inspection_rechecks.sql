begin;
create table public.inspection_rechecks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 property_id uuid not null,
 inspection_link_id uuid not null references public.inspection_work_links(id),
 outcome text not null check (outcome in ('verified','needs_more_work')),
 notes text not null check (char_length(trim(notes)) between 3 and 2000),
 signed_by uuid not null default auth.uid(),
 signed_at timestamptz not null default now()
);
create index inspection_rechecks_link_history on public.inspection_rechecks(inspection_link_id,signed_at desc);
create function private.inspection_recheck_valid(org uuid, prop uuid, link uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.inspection_work_links l join public.work_orders w on w.id=l.work_order_id
 where l.id=link and l.organization_id=org and l.property_id=prop
 and w.organization_id=org and w.property_id=prop
 and w.status in ('completed','closed'));
$$;
revoke all on function private.inspection_recheck_valid(uuid,uuid,uuid) from public,anon;
grant execute on function private.inspection_recheck_valid(uuid,uuid,uuid) to authenticated;
alter table public.inspection_rechecks enable row level security;
create policy inspection_rechecks_read on public.inspection_rechecks for select to authenticated
 using (private.operations_worker(organization_id,property_id));
create policy inspection_rechecks_insert on public.inspection_rechecks for insert to authenticated
 with check (signed_by=auth.uid() and private.operations_manager(organization_id,property_id)
 and private.inspection_recheck_valid(organization_id,property_id,inspection_link_id));
revoke all on public.inspection_rechecks from public,anon;
grant select,insert on public.inspection_rechecks to authenticated;
commit;