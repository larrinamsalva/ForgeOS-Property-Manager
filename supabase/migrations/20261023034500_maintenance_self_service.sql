-- Maintenance workers with active staff profiles may open their own scoped
-- non-financial service tasks. Managers continue to control other assignees,
-- customer linkage, billable costs, close approval and work reassignment.
begin;
create function private.maintenance_self_task(input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org uuid=(input->>'organization_id')::uuid;
  prop uuid=(input->>'property_id')::uuid;
  request_uuid uuid=(input->>'request_id')::uuid;
  actor uuid=auth.uid();
  site uuid=nullif(input->>'site_id','')::uuid;
  today date;
  due date=nullif(input->>'due_on','')::date;
  requested date=(input->>'requested_on')::date;
  title text=btrim(coalesce(input->>'title',''));
  description text=btrim(coalesce(input->>'description',''));
  category text=btrim(coalesce(input->>'category',''));
  work_area text=btrim(coalesce(input->>'work_area',''));
  reason text=btrim(coalesce(input->>'reason',''));
  priority text=input->>'priority';
  parts text=coalesce(input->>'parts_required','');
  prior private.operations_requests;
  work_id uuid;
  result jsonb;
begin
  if actor is null or request_uuid is null or
    not private.operations_worker(org,prop,actor) or
    not exists(select 1 from public.property_memberships pm
      where pm.organization_id=org and pm.property_id=prop
        and pm.user_id=actor and pm.role='maintenance')
    then raise insufficient_privilege; end if;
  select (now() at time zone timezone)::date into today from public.properties
    where id=prop and organization_id=org and archived_at is null and operating_status='active' for update;
  if not found then raise exception 'property_unavailable'; end if;
  select * into prior from private.operations_requests where id=request_uuid;
  if found then
    if prior.actor_id<>actor or prior.command<>'maintenance_self_task' or prior.payload<>input
      then raise exception 'operation_conflict'; end if;
    return prior.result;
  end if;
  if length(title) not between 1 and 160 or length(description) not between 3 and 4000 or
    length(category) not between 1 and 100 or length(work_area) not between 1 and 160 or
    length(parts)>2000 or length(reason) not between 3 and 2000 or
    priority not in ('low','normal','high','urgent') or
    requested is distinct from today or due<requested or due>requested+366
    then raise exception 'invalid_maintenance_task'; end if;
  if site is not null and not exists(select 1 from public.sites_units s
    where s.id=site and s.organization_id=org and s.property_id=prop and s.archived_at is null)
    then raise exception 'operations_scope'; end if;
  insert into public.work_orders(
    organization_id,property_id,number,title,description,category,priority,
    site_id,customer_id,requested_on,due_on,assigned_to,status,parts_required)
  values(org,prop,private.operations_number(prop,'WO'),title,description,category,
    priority,site,null,today,due,actor,
    case when due is null then 'assigned' else 'scheduled' end,parts)
  returning id into work_id;
  insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,performed_on)
    values(org,prop,work_id,'created',reason,today);
  result=jsonb_build_object('id',work_id);
  insert into private.operations_requests(id,actor_id,command,payload,result)
    values(request_uuid,actor,'maintenance_self_task',input,result);
  return result;
end; $$;
create function public.submit_maintenance_task(payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.maintenance_self_task(payload);
$$;
revoke execute on function private.maintenance_self_task(jsonb),
  public.submit_maintenance_task(jsonb) from public,anon;
grant execute on function private.maintenance_self_task(jsonb),
  public.submit_maintenance_task(jsonb) to authenticated;
commit;
