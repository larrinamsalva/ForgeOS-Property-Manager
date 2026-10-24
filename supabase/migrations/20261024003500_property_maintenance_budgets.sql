-- Scoped monthly maintenance budgets: never alter invoices, payments or inventory.
begin;
create table public.property_maintenance_budgets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 property_id uuid not null references public.properties(id),
 budget_month date not null,
 category text not null default 'all',
 limit_cents bigint not null check (limit_cents between 1 and 99999999999),
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint budget_first_day check (budget_month = date_trunc('month', budget_month)::date),
 constraint budget_category_length check (length(category) between 1 and 100),
 unique(property_id,budget_month,category)
);
create table public.property_maintenance_budget_audit (
 id uuid primary key default gen_random_uuid(),
 budget_id uuid not null references public.property_maintenance_budgets(id),
 organization_id uuid not null,
 property_id uuid not null,
 actor_id uuid not null,
 recorded_at timestamptz not null default now(),
 budget_month date not null,
 category text not null,
 old_limit_cents bigint,
 new_limit_cents bigint not null
);
create or replace function private.can_manage_maintenance_budget(org uuid, prop uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.properties p where p.id=prop and p.organization_id=org and p.archived_at is null)
 and (
   exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))
   or exists(select 1 from public.property_memberships pm where pm.organization_id=org and pm.property_id=prop and pm.user_id=(select auth.uid()) and pm.role='manager')
 );
$$;
create or replace function private.audit_maintenance_budget()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.can_manage_maintenance_budget(new.organization_id,new.property_id) then raise insufficient_privilege; end if;
 if tg_op='UPDATE' and (old.organization_id<>new.organization_id or old.property_id<>new.property_id or old.budget_month<>new.budget_month or old.category<>new.category)
 then raise exception 'budget_identity_immutable'; end if;
 if tg_op='INSERT' then
   new.created_by:=auth.uid();
 else
   new.created_at:=old.created_at;
 end if;
 new.updated_by:=auth.uid();
 new.updated_at:=now();
 insert into public.property_maintenance_budget_audit(budget_id,organization_id,property_id,actor_id,budget_month,category,old_limit_cents,new_limit_cents)
 values(new.id,new.organization_id,new.property_id,auth.uid(),new.budget_month,new.category,
 case when tg_op='UPDATE' then old.limit_cents else null end,new.limit_cents);
 return new;
end;
$$;
-- AFTER trigger: audit row is persisted in the same transaction as the budget.
create or replace function private.budget_before_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.can_manage_maintenance_budget(new.organization_id,new.property_id) then raise insufficient_privilege; end if;
 if tg_op='UPDATE' and (old.organization_id<>new.organization_id or old.property_id<>new.property_id or old.budget_month<>new.budget_month or old.category<>new.category)
 then raise exception 'budget_identity_immutable'; end if;
 if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=now(); else new.created_at:=old.created_at; new.created_by:=old.created_by; end if;
 new.updated_by:=auth.uid(); new.updated_at:=now();
 return new;
end;
$$;
create or replace function private.budget_after_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.property_maintenance_budget_audit(budget_id,organization_id,property_id,actor_id,budget_month,category,old_limit_cents,new_limit_cents)
 values(new.id,new.organization_id,new.property_id,auth.uid(),new.budget_month,new.category,
 case when tg_op='UPDATE' then old.limit_cents else null end,new.limit_cents);
 return null;
end;
$$;
create trigger budget_before_write before insert or update on public.property_maintenance_budgets for each row execute function private.budget_before_write();
create trigger budget_after_write after insert or update on public.property_maintenance_budgets for each row execute function private.budget_after_write();
alter table public.property_maintenance_budgets enable row level security;
alter table public.property_maintenance_budget_audit enable row level security;
create policy budget_select on public.property_maintenance_budgets for select to authenticated using (private.can_manage_maintenance_budget(organization_id,property_id));
create policy budget_insert on public.property_maintenance_budgets for insert to authenticated with check (private.can_manage_maintenance_budget(organization_id,property_id));
create policy budget_update on public.property_maintenance_budgets for update to authenticated using (private.can_manage_maintenance_budget(organization_id,property_id)) with check (private.can_manage_maintenance_budget(organization_id,property_id));
create policy budget_audit_select on public.property_maintenance_budget_audit for select to authenticated using (private.can_manage_maintenance_budget(organization_id,property_id));
revoke all on public.property_maintenance_budgets,public.property_maintenance_budget_audit from anon,public;
grant select,insert,update on public.property_maintenance_budgets to authenticated;
grant select on public.property_maintenance_budget_audit to authenticated;
revoke all on function private.can_manage_maintenance_budget(uuid,uuid) from public,anon;
grant execute on function private.can_manage_maintenance_budget(uuid,uuid) to authenticated;
commit;
