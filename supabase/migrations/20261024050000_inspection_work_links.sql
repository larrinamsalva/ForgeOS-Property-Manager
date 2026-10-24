begin;
create table public.inspection_work_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 property_id uuid not null,
 run_id uuid not null references public.checklist_runs(id),
 item_key text not null check (item_key ~ '^item-[0-9]{1,2}$'),
 work_order_id uuid not null references public.work_orders(id),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(run_id,item_key,work_order_id)
);
create index on public.inspection_work_links(organization_id,property_id,run_id);
create function private.inspection_link_allowed(org uuid, prop uuid, run uuid, item text, work uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
  and private.operations_worker(org,prop,auth.uid())
  and exists(select 1 from public.checklist_runs r
    where r.id=run and r.organization_id=org and r.property_id=prop
      and exists(select 1 from jsonb_array_elements(r.items::jsonb) entry where entry->>'key'=item))
  and exists(select 1 from public.work_orders w where w.id=work and w.organization_id=org and w.property_id=prop);
$$;
revoke all on function private.inspection_link_allowed(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function private.inspection_link_allowed(uuid,uuid,uuid,text,uuid) to authenticated;
alter table public.inspection_work_links enable row level security;
create policy inspection_link_read on public.inspection_work_links for select to authenticated
 using(private.inspection_link_allowed(organization_id,property_id,run_id,item_key,work_order_id));
create policy inspection_link_write on public.inspection_work_links for insert to authenticated
 with check(private.inspection_link_allowed(organization_id,property_id,run_id,item_key,work_order_id) and created_by=auth.uid());
revoke all on public.inspection_work_links from anon,public;
grant select,insert on public.inspection_work_links to authenticated;
commit;