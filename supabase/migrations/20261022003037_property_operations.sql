-- Milestone 6: property operations. Append stock, cost and work history; never overwrite quantities.
begin;
create table public.staff_profiles (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,user_id uuid not null references auth.users(id),
 employee_code text not null check(length(trim(employee_code)) between 1 and 60),name text not null check(length(trim(name)) between 1 and 160),email text not null check(length(email)<=320),phone text not null check(length(phone)<=100),
 employment_status text not null check(employment_status in ('active','inactive')),starts_on date not null,supervisor_id uuid references auth.users(id),notes text not null check(length(notes)<=2000),version integer not null default 1,
 unique(property_id,user_id),unique(property_id,employee_code)
);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,name text not null check(length(trim(name)) between 1 and 160),
 contact text not null check(length(contact)<=160),email text not null check(length(email)<=320),phone text not null check(length(phone)<=100),address text not null check(length(address)<=1000),notes text not null check(length(notes)<=2000),archived boolean not null default false,version integer not null default 1
);
create table public.inventory_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,sku text not null check(length(trim(sku)) between 1 and 60),name text not null check(length(trim(name)) between 1 and 160),category text not null check(length(category)<=100),unit text not null check(length(trim(unit)) between 1 and 30),location text not null check(length(location)<=160),supplier_id uuid references public.suppliers(id),
 unit_cost_cents bigint not null check(unit_cost_cents between 0 and 999999999999),reorder_milli bigint not null check(reorder_milli between 0 and 999999999999),restock_milli bigint not null check(restock_milli between 0 and 999999999999),notes text not null check(length(notes)<=2000),archived boolean not null default false,version integer not null default 1,
 unique(organization_id,property_id,id)
);
create unique index inventory_sku_idx on public.inventory_items(property_id,lower(sku));
create table public.operations_plans (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,kind text not null check(kind in ('maintenance','checklist')),label text not null check(length(trim(label)) between 1 and 160),description text not null check(length(description)<=2000),category text not null check(length(category)<=100),site_id uuid,assigned_to uuid references auth.users(id),anchor_on date not null,interval_days integer not null check(interval_days between 1 and 366),ends_on date check(ends_on>=anchor_on),items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=50),active boolean not null default true,version integer not null default 1,
 foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),unique(organization_id,property_id,id)
);
create table public.work_orders (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,number text not null,title text not null check(length(trim(title)) between 1 and 160),description text not null check(length(trim(description)) between 3 and 4000),category text not null check(length(category)<=100),priority text not null check(priority in ('low','normal','high','urgent')),site_id uuid,customer_id uuid,requested_on date not null,due_on date,assigned_to uuid references auth.users(id),status text not null check(status in ('new','assigned','scheduled','in_progress','waiting_parts','completed','closed','cancelled')),parts_required text not null check(length(parts_required)<=2000),plan_id uuid references public.operations_plans(id),scheduled_for date,plan_snapshot jsonb,completed_on date,closed_on date,approved_by uuid references auth.users(id),version integer not null default 1,
 foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),unique(property_id,number),unique(organization_id,property_id,id)
);
create table public.work_order_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,work_order_id uuid not null,kind text not null check(kind in ('created','edited','status','note','time','approval')),body text not null check(length(trim(body)) between 3 and 4000),minutes integer not null default 0 check(minutes between 0 and 1440),performed_on date not null,from_status text,to_status text,
 foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.work_order_costs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,work_order_id uuid not null,kind text not null check(kind in ('estimate','expense','reversal','material','material_return')),amount_cents bigint not null check(abs(amount_cents)<=999999999999),description text not null check(length(trim(description)) between 3 and 2000),reference text not null check(length(reference)<=500),reverses_id uuid unique references public.work_order_costs(id),source_id uuid,
 foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,item_id uuid not null,kind text not null check(kind in ('receipt','adjustment','use','return','transfer_out','transfer_in','purchase_receive','purchase_return')),delta_milli bigint not null check(abs(delta_milli) between 1 and 999999999999),unit_cost_cents bigint not null check(unit_cost_cents between 0 and 999999999999),total_cost_cents bigint not null check(abs(total_cost_cents)<=999999999999),effective_on date not null,work_order_id uuid,transfer_id uuid,reference text not null check(length(reference)<=500),reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,item_id) references public.inventory_items(organization_id,property_id,id),foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.work_order_materials (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,work_order_id uuid not null,item_id uuid not null,quantity_milli bigint not null check(abs(quantity_milli) between 1 and 999999999999),item_snapshot jsonb not null,movement_id uuid not null unique references public.inventory_movements(id),returns_id uuid references public.work_order_materials(id),reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id),foreign key(organization_id,property_id,item_id) references public.inventory_items(organization_id,property_id,id),check((quantity_milli>0 and returns_id is null) or (quantity_milli<0 and returns_id is not null))
);
create table public.work_order_photos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,work_order_id uuid not null,kind text not null check(kind in ('request','before','after')),caption text not null check(length(caption)<=500),mime text not null check(mime in ('image/jpeg','image/png','image/webp')),byte_size integer not null check(byte_size between 1 and 5242880),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),object_path text not null unique,status text not null default 'pending' check(status in ('pending','uploaded','voided')),void_reason text not null default '',
 foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.equipment (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,code text not null check(length(trim(code)) between 1 and 60),name text not null check(length(trim(name)) between 1 and 160),serial_number text not null check(length(serial_number)<=160),condition text not null check(condition in ('good','fair','needs_repair','out_of_service','retired')),next_service_on date,notes text not null check(length(notes)<=2000),archived boolean not null default false,version integer not null default 1,unique(property_id,code),unique(organization_id,property_id,id)
);
create table public.equipment_loans (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,equipment_id uuid not null,employee_id uuid not null references auth.users(id),work_order_id uuid,checked_out_on date not null,due_on date not null check(due_on>=checked_out_on),returned_on date check(returned_on>=checked_out_on),checkout_condition text not null,return_condition text,reason text not null check(length(trim(reason)) between 3 and 2000),return_reason text not null default '',
 foreign key(organization_id,property_id,equipment_id) references public.equipment(organization_id,property_id,id),foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create unique index equipment_one_loan_idx on public.equipment_loans(equipment_id) where returned_on is null;
create table public.equipment_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,equipment_id uuid not null,work_order_id uuid,kind text not null check(kind in ('checkout','return','service','edit')),body text not null check(length(trim(body)) between 3 and 2000),condition text not null,performed_on date not null,
 foreign key(organization_id,property_id,equipment_id) references public.equipment(organization_id,property_id,id),foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.purchase_requests (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,work_order_id uuid,item_id uuid not null,quantity_milli bigint not null check(quantity_milli between 1 and 999999999999),needed_on date not null,description text not null check(length(trim(description)) between 3 and 2000),status text not null default 'open' check(status in ('open','approved','declined','ordered','fulfilled','cancelled')),decision_reason text not null default '',version integer not null default 1,
 foreign key(organization_id,property_id,item_id) references public.inventory_items(organization_id,property_id,id),foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id)
);
create table public.purchase_orders (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,supplier_id uuid not null references public.suppliers(id),number text not null,supplier_snapshot jsonb not null,status text not null default 'draft' check(status in ('draft','approved','ordered','cancelled')),expected_on date,reference text not null check(length(reference)<=500),reason text not null check(length(trim(reason)) between 3 and 2000),approval_reason text not null default '',approved_by uuid references auth.users(id),version integer not null default 1,unique(property_id,number),unique(organization_id,property_id,id)
);
create table public.purchase_order_lines (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,purchase_order_id uuid not null,item_id uuid not null,quantity_milli bigint not null check(quantity_milli between 1 and 999999999999),unit_cost_cents bigint not null check(unit_cost_cents between 0 and 999999999999),total_cost_cents bigint not null check(total_cost_cents between 0 and 999999999999),item_snapshot jsonb not null,request_id uuid references public.purchase_requests(id),
 foreign key(organization_id,property_id,purchase_order_id) references public.purchase_orders(organization_id,property_id,id),foreign key(organization_id,property_id,item_id) references public.inventory_items(organization_id,property_id,id),unique(purchase_order_id,item_id)
);
create table public.purchase_receipts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,line_id uuid not null references public.purchase_order_lines(id),quantity_milli bigint not null check(abs(quantity_milli) between 1 and 999999999999),movement_id uuid not null unique references public.inventory_movements(id),returns_id uuid references public.purchase_receipts(id),effective_on date not null,reference text not null check(length(reference)<=500),reason text not null check(length(trim(reason)) between 3 and 2000),check((quantity_milli>0 and returns_id is null) or (quantity_milli<0 and returns_id is not null))
);
create table public.checklist_runs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,plan_id uuid not null references public.operations_plans(id),label text not null,scheduled_for date not null,assigned_to uuid not null references auth.users(id),items jsonb not null,status text not null default 'open' check(status in ('open','closed','cancelled')),closed_on date,version integer not null default 1,unique(organization_id,property_id,id)
);
create table public.checklist_entries (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,run_id uuid not null,item_key text not null,status text not null check(status in ('done','skipped','reopen')),notes text not null check(length(notes)<=2000),
 foreign key(organization_id,property_id,run_id) references public.checklist_runs(organization_id,property_id,id)
);
create table public.operations_notifications (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,property_id uuid not null,recipient_id uuid not null references auth.users(id),work_order_id uuid,run_id uuid,title text not null check(length(title)<=200),body text not null check(length(body)<=1000),read_at timestamptz,
 foreign key(organization_id,property_id,work_order_id) references public.work_orders(organization_id,property_id,id),foreign key(organization_id,property_id,run_id) references public.checklist_runs(organization_id,property_id,id)
);
create table private.operations_requests(id uuid primary key,actor_id uuid not null references auth.users(id),command text not null,payload jsonb not null,result jsonb not null);
create table private.operations_counters(property_id uuid not null references public.properties(id),kind text not null,next_number bigint not null,primary key(property_id,kind));
create table private.operations_occurrences(plan_id uuid not null references public.operations_plans(id),scheduled_for date not null,entity_id uuid not null,primary key(plan_id,scheduled_for));
create table private.purchase_request_claims(request_id uuid primary key references public.purchase_requests(id),purchase_order_id uuid not null references public.purchase_orders(id));
-- Uniform stamping and explicit grants. Reads are assigned below by data sensitivity.
do $$ declare t text; begin
 foreach t in array array['staff_profiles','suppliers','inventory_items','inventory_movements','operations_plans','work_orders','work_order_events','work_order_costs','work_order_materials','work_order_photos','equipment','equipment_loans','equipment_events','purchase_requests','purchase_orders','purchase_order_lines','purchase_receipts','checklist_runs','checklist_entries','operations_notifications'] loop
  execute format('alter table public.%I add column created_by uuid not null references auth.users(id),add column updated_by uuid not null references auth.users(id),add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now(),add foreign key(organization_id,property_id) references public.properties(organization_id,id)',t);
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
  execute format('create index on public.%I(organization_id,property_id)',t);
  execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',t);
  execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.write_audit()',t);
 end loop;
 foreach t in array array['operations_requests','operations_counters','operations_occurrences','purchase_request_claims'] loop
  execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create index stock_item_idx on public.inventory_movements(item_id,effective_on);
create index work_assigned_idx on public.work_orders(assigned_to,property_id,status,due_on);
create index work_site_idx on public.work_orders(site_id);
create index work_customer_idx on public.work_orders(customer_id);
create index work_events_idx on public.work_order_events(work_order_id,created_at,id);
create index work_costs_idx on public.work_order_costs(work_order_id);
create index work_materials_idx on public.work_order_materials(work_order_id,returns_id);
create index work_photo_idx on public.work_order_photos(work_order_id,status);
create index supplier_item_idx on public.inventory_items(supplier_id);
create index equipment_loan_employee_idx on public.equipment_loans(employee_id,returned_on);
create index equipment_events_idx on public.equipment_events(equipment_id);
create index purchase_requests_work_idx on public.purchase_requests(work_order_id);
create index purchase_lines_order_idx on public.purchase_order_lines(purchase_order_id);
create index purchase_lines_item_idx on public.purchase_order_lines(item_id);
create index purchase_receipts_line_idx on public.purchase_receipts(line_id,returns_id);
create index checklist_assigned_idx on public.checklist_runs(assigned_to,scheduled_for);
create index checklist_entries_run_idx on public.checklist_entries(run_id,item_key,created_at desc,id desc);
create index notifications_user_idx on public.operations_notifications(recipient_id,read_at,created_at desc);

create function private.operations_manager(org uuid,prop uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.property_role(org,prop,array['manager','office']); $$;
create function private.operations_worker(org uuid,prop uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (person=auth.uid() or private.operations_manager(org,prop)) and exists(select 1 from public.staff_profiles s where s.organization_id=org and s.property_id=prop and s.user_id=person and s.employment_status='active') and
 (exists(select 1 from public.property_memberships m where m.organization_id=org and m.property_id=prop and m.user_id=person and m.role in ('manager','office','maintenance')) or exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=person and m.role in ('owner','admin')));
$$;
create function private.work_access(target uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.work_orders w where w.id=target and (private.operations_manager(w.organization_id,w.property_id) or (w.assigned_to=(select auth.uid()) and private.operations_worker(w.organization_id,w.property_id,auth.uid()))) and (not writing or (w.status not in ('completed','closed','cancelled') and exists(select 1 from public.properties p where p.id=w.property_id and p.organization_id=w.organization_id and p.archived_at is null and p.operating_status='active'))));
$$;
create function private.checklist_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.checklist_runs r where r.id=target and (private.operations_manager(r.organization_id,r.property_id) or (r.assigned_to=(select auth.uid()) and private.operations_worker(r.organization_id,r.property_id,auth.uid()))));
$$;
create function private.equipment_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.equipment e where e.id=target and (private.operations_manager(e.organization_id,e.property_id) or exists(select 1 from public.equipment_loans l where l.equipment_id=e.id and (l.employee_id=(select auth.uid()) and private.operations_worker(l.organization_id,l.property_id,auth.uid()) or l.work_order_id is not null and private.work_access(l.work_order_id,false)))));
$$;
-- Material and job information can be read by assigned workers; cost and supplier records cannot.
do $$ declare t text; begin
 foreach t in array array['suppliers','inventory_items','inventory_movements','operations_plans','work_order_costs','purchase_orders','purchase_order_lines','purchase_receipts'] loop
  execute format('create policy operations_office on public.%I for select to authenticated using(private.operations_manager(organization_id,property_id))',t);
 end loop;
end $$;
create policy staff_read on public.staff_profiles for select to authenticated using(private.operations_manager(organization_id,property_id) or (user_id=(select auth.uid()) and private.property_role(organization_id,property_id,array['maintenance'])));
create policy work_read on public.work_orders for select to authenticated using(private.work_access(id,false));
create policy work_events_read on public.work_order_events for select to authenticated using(private.work_access(work_order_id,false));
create policy work_material_read on public.work_order_materials for select to authenticated using(private.work_access(work_order_id,false));
create policy work_photo_read on public.work_order_photos for select to authenticated using(private.work_access(work_order_id,false));
create policy equipment_read on public.equipment for select to authenticated using(private.equipment_access(id));
create policy equipment_loan_read on public.equipment_loans for select to authenticated using(private.operations_manager(organization_id,property_id) or (employee_id=(select auth.uid()) and private.operations_worker(organization_id,property_id,auth.uid())) or (work_order_id is not null and private.work_access(work_order_id,false)));
create policy equipment_event_read on public.equipment_events for select to authenticated using(private.equipment_access(equipment_id));
create policy purchase_request_read on public.purchase_requests for select to authenticated using(private.operations_manager(organization_id,property_id) or (created_by=(select auth.uid()) and work_order_id is not null and private.work_access(work_order_id,false)));
create policy checklist_run_read on public.checklist_runs for select to authenticated using(private.checklist_access(id));
create policy checklist_entry_read on public.checklist_entries for select to authenticated using(private.checklist_access(run_id));
create policy notification_read on public.operations_notifications for select to authenticated using(recipient_id=(select auth.uid()) and (private.operations_manager(organization_id,property_id) or private.operations_worker(organization_id,property_id,auth.uid())));

create function private.stock_quantity(target uuid) returns numeric language sql stable security invoker set search_path='' as $$ select coalesce(sum(delta_milli),0) from public.inventory_movements where item_id=target; $$;
create function private.operations_cost(quantity numeric,unit_cost numeric) returns bigint language plpgsql immutable set search_path='' as $$
declare result numeric; begin result=private.billing_round_ratio(quantity*unit_cost,1000); if abs(result)>999999999999 then raise exception 'operations_amount_limit'; end if; return result::bigint; end; $$;
create function private.operations_number(prop uuid,counter_kind text) returns text language plpgsql security invoker set search_path='' as $$
declare n bigint; begin insert into private.operations_counters values(prop,counter_kind,1) on conflict(property_id,kind) do update set next_number=private.operations_counters.next_number+1 returning next_number into n; return counter_kind||'-'||lpad(n::text,greatest(6,length(n::text)),'0'); end; $$;
create function private.operations_notice(org uuid,prop uuid,recipient uuid,title text,body text,work_id uuid,run_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin if recipient is not null then insert into public.operations_notifications(organization_id,property_id,recipient_id,title,body,work_order_id,run_id) values(org,prop,recipient,title,left(body,1000),work_id,run_id); end if; end; $$;
create function private.operations_quantity(value text,signed boolean default false) returns bigint language plpgsql immutable set search_path='' as $$
begin if value is null or value !~ '^-?[0-9]{1,12}$' then raise exception 'invalid_quantity'; end if; if abs(value::numeric) not between 1 and 999999999999 or (not signed and value::numeric<0) then raise exception 'invalid_quantity'; end if; return value::bigint; end; $$;
create function private.operations_command(command text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid=(input->>'organization_id')::uuid; prop uuid=(input->>'property_id')::uuid; op uuid=(input->>'request_id')::uuid; target uuid=nullif(input->>'id','')::uuid;
 result_id uuid; result jsonb; prior private.operations_requests; today date; effective date; manager boolean; supervisor boolean; reason text=trim(coalesce(input->>'reason','')); person uuid=nullif(input->>'assigned_to','')::uuid;
 row_version integer; staff public.staff_profiles; supplier public.suppliers; item public.inventory_items; destination public.inventory_items; work public.work_orders; plan public.operations_plans; cost public.work_order_costs; material public.work_order_materials; eq public.equipment; loan public.equipment_loans; request public.purchase_requests; po public.purchase_orders; line public.purchase_order_lines; received public.purchase_receipts; run public.checklist_runs; photo public.work_order_photos;
 qty bigint; value bigint; movement uuid; additional uuid; counter text; destination_prop uuid=nullif(input->>'destination_property_id','')::uuid; kind text; new_status text; entry jsonb; qty_returned numeric; value_returned numeric; amount numeric; keys text[]; scheduled date;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 manager=private.operations_manager(org,prop);supervisor=private.property_role(org,prop,array['manager']);
 if not manager and not private.operations_worker(org,prop,auth.uid()) then raise insufficient_privilege; end if;
 if command='transfer_stock' then
  if not supervisor or destination_prop is null or destination_prop=prop or not private.property_role(org,destination_prop,array['manager']) then raise insufficient_privilege; end if;
  perform 1 from public.properties where organization_id=org and id in (prop,destination_prop) order by id for update;
  if (select count(*) from public.properties where organization_id=org and id in (prop,destination_prop) and archived_at is null and operating_status='active')<>2 then raise exception 'property_unavailable'; end if;
 end if;
 select (now() at time zone timezone)::date into today from public.properties where organization_id=org and id=prop and archived_at is null and operating_status='active' for update;
 if not found then raise exception 'property_unavailable'; end if;
 if op is null then raise exception 'operation_id_required'; end if;
 select * into prior from private.operations_requests where operations_requests.id=op;
 if found then if prior.actor_id<>auth.uid() or prior.command<>command or prior.payload<>input then raise exception 'operation_conflict'; end if;return prior.result;end if;
 if length(reason) not between 3 and 2000 then raise exception 'operations_reason_required'; end if;
 effective=coalesce(nullif(input->>'effective_on','')::date,today);
 if effective>today or effective<'2000-01-01'::date then raise exception 'invalid_operations_date'; end if;
 if command in ('save_staff','save_supplier','save_item','save_plan','save_equipment') then
  if not supervisor then raise insufficient_privilege; end if;
  if target is not null then
   if command='save_staff' then select version into row_version from public.staff_profiles where id=target and organization_id=org and property_id=prop for update;
   elsif command='save_supplier' then select version into row_version from public.suppliers where id=target and organization_id=org and property_id=prop for update;
   elsif command='save_item' then select version into row_version from public.inventory_items where id=target and organization_id=org and property_id=prop for update;
   elsif command='save_plan' then select version into row_version from public.operations_plans where id=target and organization_id=org and property_id=prop for update;
   else select version into row_version from public.equipment where id=target and organization_id=org and property_id=prop for update; end if;
   if row_version is null then raise insufficient_privilege; end if;
   if row_version is distinct from (input->>'version')::int then raise exception 'operations_conflict'; end if;
  end if;
  result_id=coalesce(target,gen_random_uuid());
  if command='save_staff' then
   person=(input->>'user_id')::uuid;
   if not exists(select 1 from public.property_memberships m where m.organization_id=org and m.property_id=prop and m.user_id=person and m.role in ('manager','office','maintenance')) and not exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=person and m.role in ('owner','admin')) then raise exception 'employee_access_required'; end if;
   if nullif(input->>'supervisor_id','') is not null and not exists(select 1 from public.property_memberships m where m.organization_id=org and m.property_id=prop and m.user_id=(input->>'supervisor_id')::uuid and m.role='manager') and not exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=(input->>'supervisor_id')::uuid and m.role in ('owner','admin')) then raise exception 'invalid_supervisor'; end if;
   if target is not null and exists(select 1 from public.staff_profiles s where s.id=target and s.user_id<>person) then raise exception 'employee_identity_immutable'; end if;
   insert into public.staff_profiles(id,organization_id,property_id,user_id,employee_code,name,email,phone,employment_status,starts_on,supervisor_id,notes)
   values(result_id,org,prop,person,input->>'employee_code',input->>'name',input->>'email',input->>'phone',input->>'employment_status',(input->>'starts_on')::date,nullif(input->>'supervisor_id','')::uuid,input->>'notes')
   on conflict(id) do update set employee_code=excluded.employee_code,name=excluded.name,email=excluded.email,phone=excluded.phone,employment_status=excluded.employment_status,starts_on=excluded.starts_on,supervisor_id=excluded.supervisor_id,notes=excluded.notes,version=staff_profiles.version+1;
  elsif command='save_supplier' then
   insert into public.suppliers(id,organization_id,property_id,name,contact,email,phone,address,notes,archived) values(result_id,org,prop,input->>'name',input->>'contact',input->>'email',input->>'phone',input->>'address',input->>'notes',(input->>'archived')::boolean)
   on conflict(id) do update set name=excluded.name,contact=excluded.contact,email=excluded.email,phone=excluded.phone,address=excluded.address,notes=excluded.notes,archived=excluded.archived,version=suppliers.version+1;
  elsif command='save_item' then
   if nullif(input->>'supplier_id','') is not null and not exists(select 1 from public.suppliers s where s.id=(input->>'supplier_id')::uuid and s.organization_id=org and s.property_id=prop and not s.archived) then raise exception 'supplier_unavailable'; end if;
   if target is not null and coalesce((input->>'archived')::boolean,false) and (private.stock_quantity(target)<>0 or exists(select 1 from public.purchase_order_lines l join public.purchase_orders p on p.id=l.purchase_order_id where l.item_id=target and p.status<>'cancelled' and l.quantity_milli>coalesce((select sum(r.quantity_milli) from public.purchase_receipts r where r.line_id=l.id),0))) then raise exception 'item_in_use'; end if;
   if target is not null and exists(select 1 from public.inventory_items i where i.id=target and (i.unit<>input->>'unit' or lower(i.sku)<>lower(input->>'sku')) and exists(select 1 from public.inventory_movements m where m.item_id=i.id)) then raise exception 'stock_identity_immutable'; end if;
   insert into public.inventory_items(id,organization_id,property_id,sku,name,category,unit,location,supplier_id,unit_cost_cents,reorder_milli,restock_milli,notes,archived) values(result_id,org,prop,trim(input->>'sku'),input->>'name',input->>'category',input->>'unit',input->>'location',nullif(input->>'supplier_id','')::uuid,(input->>'unit_cost_cents')::bigint,(input->>'reorder_milli')::bigint,(input->>'restock_milli')::bigint,input->>'notes',(input->>'archived')::boolean)
   on conflict(id) do update set sku=excluded.sku,name=excluded.name,category=excluded.category,unit=excluded.unit,location=excluded.location,supplier_id=excluded.supplier_id,unit_cost_cents=excluded.unit_cost_cents,reorder_milli=excluded.reorder_milli,restock_milli=excluded.restock_milli,notes=excluded.notes,archived=excluded.archived,version=inventory_items.version+1;
  elsif command='save_plan' then
   if person is not null and not private.operations_worker(org,prop,person) then raise exception 'employee_unavailable'; end if;
   if nullif(input->>'site_id','') is not null and not exists(select 1 from public.sites_units s where s.id=(input->>'site_id')::uuid and s.organization_id=org and s.property_id=prop and s.archived_at is null) then raise exception 'operations_scope'; end if;
   if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items')>50 or exists(select 1 from jsonb_array_elements(input->'items') i where jsonb_typeof(i)<>'string' or length(trim(i#>>'{}')) not between 1 and 200) or (input->>'kind'='checklist' and (person is null or jsonb_array_length(input->'items')=0)) then raise exception 'invalid_checklist'; end if;
   if target is not null and exists(select 1 from public.operations_plans p where p.id=target and p.kind<>input->>'kind') then raise exception 'plan_kind_immutable'; end if;
   insert into public.operations_plans(id,organization_id,property_id,kind,label,description,category,site_id,assigned_to,anchor_on,interval_days,ends_on,items,active) values(result_id,org,prop,input->>'kind',input->>'label',input->>'description',input->>'category',nullif(input->>'site_id','')::uuid,person,(input->>'anchor_on')::date,(input->>'interval_days')::int,nullif(input->>'ends_on','')::date,input->'items',(input->>'active')::boolean)
   on conflict(id) do update set label=excluded.label,description=excluded.description,category=excluded.category,site_id=excluded.site_id,assigned_to=excluded.assigned_to,anchor_on=excluded.anchor_on,interval_days=excluded.interval_days,ends_on=excluded.ends_on,items=excluded.items,active=excluded.active,version=operations_plans.version+1;
  else
   if target is not null and (coalesce((input->>'archived')::boolean,false) or input->>'condition'='retired') and exists(select 1 from public.equipment_loans l where l.equipment_id=target and l.returned_on is null) then raise exception 'equipment_checked_out'; end if;
   insert into public.equipment(id,organization_id,property_id,code,name,serial_number,condition,next_service_on,notes,archived) values(result_id,org,prop,input->>'code',input->>'name',input->>'serial_number',input->>'condition',nullif(input->>'next_service_on','')::date,input->>'notes',(input->>'archived')::boolean)
   on conflict(id) do update set code=excluded.code,name=excluded.name,serial_number=excluded.serial_number,condition=excluded.condition,next_service_on=excluded.next_service_on,notes=excluded.notes,archived=excluded.archived,version=equipment.version+1;
   insert into public.equipment_events(organization_id,property_id,equipment_id,kind,body,condition,performed_on) values(org,prop,result_id,'edit',reason,input->>'condition',today);
  end if;
 elsif command='new_work' then
  if not manager then raise insufficient_privilege; end if;
  if person is not null and not private.operations_worker(org,prop,person) then raise exception 'employee_unavailable'; end if;
  if nullif(input->>'site_id','') is not null and not exists(select 1 from public.sites_units s where s.id=(input->>'site_id')::uuid and s.organization_id=org and s.property_id=prop and s.archived_at is null) then raise exception 'operations_scope'; end if;
  if nullif(input->>'customer_id','') is not null and not exists(select 1 from public.customers c where c.id=(input->>'customer_id')::uuid and c.organization_id=org and c.property_id=prop) then raise exception 'operations_scope'; end if;
  if (input->>'requested_on')::date>today or (input->>'requested_on')::date<'2000-01-01'::date or (input->>'due_on')::date<(input->>'requested_on')::date then raise exception 'invalid_operations_date'; end if;
  insert into public.work_orders(organization_id,property_id,number,title,description,category,priority,site_id,customer_id,requested_on,due_on,assigned_to,status,parts_required)
  values(org,prop,private.operations_number(prop,'WO'),input->>'title',input->>'description',input->>'category',input->>'priority',nullif(input->>'site_id','')::uuid,nullif(input->>'customer_id','')::uuid,(input->>'requested_on')::date,nullif(input->>'due_on','')::date,person,case when person is null then 'new' when nullif(input->>'due_on','') is null then 'assigned' else 'scheduled' end,input->>'parts_required') returning id into result_id;
  insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,performed_on) values(org,prop,result_id,'created',reason,today);
  perform private.operations_notice(org,prop,person,'Work assigned',input->>'title',result_id,null);
 elsif command in ('edit_work','work_status','work_note','work_cost','reverse_cost') then
  select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop for update;
  if work.id is null or not private.work_access(work.id,false) then raise insufficient_privilege; end if;
  result_id=work.id;
  if command in ('edit_work','work_status') and work.version is distinct from (input->>'version')::int then raise exception 'operations_conflict'; end if;
  if command='edit_work' then
   if not manager or work.status in ('completed','closed','cancelled') then raise insufficient_privilege; end if;
   if person is not null and not private.operations_worker(org,prop,person) then raise exception 'employee_unavailable'; end if;
   if nullif(input->>'due_on','')::date<work.requested_on then raise exception 'invalid_operations_date'; end if;
   update public.work_orders set title=input->>'title',description=input->>'description',category=input->>'category',priority=input->>'priority',due_on=nullif(input->>'due_on','')::date,parts_required=input->>'parts_required',assigned_to=person,status=case when status in ('new','assigned','scheduled') then case when person is null then 'new' when nullif(input->>'due_on','') is null then 'assigned' else 'scheduled' end else status end,version=version+1 where id=work.id;
   insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,performed_on) values(org,prop,work.id,'edited',reason,today);
   if person is distinct from work.assigned_to then perform private.operations_notice(org,prop,person,'Work assignment changed',input->>'title',work.id,null); end if;
  elsif command='work_status' then
   new_status=input->>'status';
   if new_status=work.status or new_status not in ('in_progress','waiting_parts','completed','closed','cancelled') then raise exception 'invalid_work_transition'; end if;
   if not manager and (new_status not in ('in_progress','waiting_parts','completed') or work.status in ('completed','closed','cancelled')) then raise insufficient_privilege; end if;
   if new_status='closed' and (not supervisor or work.status<>'completed') then raise exception 'completion_approval_required'; end if;
   if work.status='closed' and not supervisor then raise insufficient_privilege; end if;
   if work.status in ('closed','cancelled','completed') and new_status not in ('in_progress','closed','cancelled') then raise exception 'invalid_work_transition'; end if;
   if new_status='in_progress' and work.assigned_to is not null and not private.operations_worker(org,prop,work.assigned_to) then raise exception 'employee_unavailable'; end if;
   update public.work_orders set status=new_status,completed_on=case when new_status in ('completed','closed') then coalesce(completed_on,today) else null end,closed_on=case when new_status='closed' then today else null end,approved_by=case when new_status='closed' then auth.uid() else null end,version=version+1 where id=work.id;
   insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,performed_on,from_status,to_status) values(org,prop,work.id,case when new_status='closed' then 'approval' else 'status' end,reason,today,work.status,new_status);
   if new_status='completed' then
    for person in select user_id from public.organization_memberships where organization_id=org and role in ('owner','admin') union select user_id from public.property_memberships where property_id=prop and organization_id=org and role='manager' loop perform private.operations_notice(org,prop,person,'Completion awaiting approval',work.title,work.id,null);end loop;
   else perform private.operations_notice(org,prop,work.assigned_to,'Work status: '||replace(new_status,'_',' '),work.title,work.id,null); end if;
  elsif command='work_note' then
   if not private.work_access(work.id,true) then raise insufficient_privilege; end if;
   if effective<work.requested_on then raise exception 'invalid_operations_date'; end if;
   insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,minutes,performed_on) values(org,prop,work.id,case when (input->>'minutes')::int>0 then 'time' else 'note' end,reason,(input->>'minutes')::int,effective) returning id into result_id;
  elsif command='work_cost' then
   if not manager or work.status in ('closed','cancelled') then raise insufficient_privilege; end if;
   insert into public.work_order_costs(organization_id,property_id,work_order_id,kind,amount_cents,description,reference) values(org,prop,work.id,input->>'kind',(input->>'amount_cents')::bigint,reason,input->>'reference') returning id into result_id;
   if input->>'kind' not in ('estimate','expense') or (input->>'amount_cents')::bigint<0 then raise exception 'invalid_work_cost'; end if;
  else
   if not manager or work.status in ('closed','cancelled') then raise insufficient_privilege; end if;
   select * into cost from public.work_order_costs c where c.id=(input->>'cost_id')::uuid and c.work_order_id=work.id and c.kind='expense';
   if cost.id is null then raise exception 'invalid_work_cost'; end if;
   insert into public.work_order_costs(organization_id,property_id,work_order_id,kind,amount_cents,description,reference,reverses_id) values(org,prop,work.id,'reversal',-cost.amount_cents,reason,input->>'reference',cost.id) returning id into result_id;
  end if;
 elsif command in ('receive_stock','adjust_stock','transfer_stock','use_material','return_material','receive_purchase','return_purchase') then
  if command in ('use_material','return_material') then
   select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop for update;
   if work.id is null or not private.work_access(work.id,true) then raise insufficient_privilege; end if;
   if effective<work.requested_on then raise exception 'invalid_operations_date'; end if;
  elsif not manager then raise insufficient_privilege; end if;
  if command='adjust_stock' and not supervisor then raise insufficient_privilege; end if;
  qty=private.operations_quantity(input->>'quantity_milli',command='adjust_stock');
  if command='return_material' then
   select * into material from public.work_order_materials m where m.id=(input->>'material_id')::uuid and m.work_order_id=work.id and m.returns_id is null;
   if material.id is null then raise exception 'invalid_material_return'; end if;
   select * into item from public.inventory_items where id=material.item_id for update;
  elsif command in ('receive_purchase','return_purchase') then
   if command='return_purchase' then
    if not supervisor then raise insufficient_privilege; end if;
    select * into received from public.purchase_receipts r where r.id=(input->>'receipt_id')::uuid and r.organization_id=org and r.property_id=prop and r.returns_id is null;
    if received.id is null or effective<received.effective_on then raise exception 'invalid_purchase_return'; end if;
    select * into line from public.purchase_order_lines where id=received.line_id;
   else select * into line from public.purchase_order_lines l where l.id=(input->>'line_id')::uuid and l.organization_id=org and l.property_id=prop; end if;
   select * into po from public.purchase_orders where id=line.purchase_order_id for update;
   if line.id is null or po.id is null or po.status<>'ordered' then raise exception 'purchase_not_ordered'; end if;
   select * into item from public.inventory_items where id=line.item_id for update;
  else select * into item from public.inventory_items i where i.id=(input->>'item_id')::uuid and i.organization_id=org and i.property_id=prop for update; end if;
  if item.id is null or item.archived then raise exception 'item_unavailable'; end if;
  value=item.unit_cost_cents;kind=case command when 'receive_stock' then 'receipt' when 'adjust_stock' then 'adjustment' when 'use_material' then 'use' when 'return_material' then 'return' when 'transfer_stock' then 'transfer_out' when 'receive_purchase' then 'purchase_receive' else 'purchase_return' end;
  if command in ('use_material','transfer_stock','return_purchase') then qty=-qty; end if;
  if command='receive_stock' then value=(input->>'unit_cost_cents')::bigint;
  elsif command='return_material' then
   select coalesce(-sum(quantity_milli),0) into qty_returned from public.work_order_materials where returns_id=material.id;
   if qty+qty_returned>material.quantity_milli then raise exception 'invalid_material_return'; end if;
   select unit_cost_cents,total_cost_cents into value,amount from public.inventory_movements where id=material.movement_id;
   select coalesce(sum(total_cost_cents),0) into value_returned from public.inventory_movements where id in (select movement_id from public.work_order_materials where returns_id=material.id);
   amount=private.billing_round_ratio(abs(amount)*(qty+qty_returned),material.quantity_milli)-value_returned;
  elsif command='receive_purchase' then
   if qty+coalesce((select sum(quantity_milli) from public.purchase_receipts where line_id=line.id),0)>line.quantity_milli then raise exception 'purchase_exceeds_order'; end if;value=line.unit_cost_cents;
   -- Allocate the exact ordered line cost over partial receipts, so rounding cannot change the total.
   select coalesce(sum(quantity_milli),0) into qty_returned from public.purchase_receipts where line_id=line.id;
   select coalesce(sum(m.total_cost_cents),0) into value_returned from public.purchase_receipts r join public.inventory_movements m on m.id=r.movement_id where r.line_id=line.id;
   amount=private.billing_round_ratio(line.total_cost_cents*(qty_returned+qty),line.quantity_milli)-value_returned;
  elsif command='return_purchase' then
   select coalesce(-sum(quantity_milli),0) into qty_returned from public.purchase_receipts where returns_id=received.id;
   if -qty+qty_returned>received.quantity_milli then raise exception 'invalid_purchase_return'; end if;
   select unit_cost_cents,total_cost_cents into value,amount from public.inventory_movements where id=received.movement_id;
   select coalesce(-sum(m.total_cost_cents),0) into value_returned from public.purchase_receipts r join public.inventory_movements m on m.id=r.movement_id where r.returns_id=received.id;
   amount=-(private.billing_round_ratio(amount*(qty_returned-qty),received.quantity_milli)-value_returned);
  end if;
  amount=coalesce(amount,private.operations_cost(qty,value));
  if private.stock_quantity(item.id)+qty<0 then raise exception 'insufficient_stock'; end if;
  additional=case when command='transfer_stock' then gen_random_uuid() else null end;
  insert into public.inventory_movements(organization_id,property_id,item_id,kind,delta_milli,unit_cost_cents,total_cost_cents,effective_on,work_order_id,transfer_id,reference,reason) values(org,prop,item.id,kind,qty,value,amount,effective,work.id,additional,coalesce(input->>'reference',''),reason) returning id into movement;
  result_id=movement;
  if command='transfer_stock' then
   select * into destination from public.inventory_items i where i.id=(input->>'destination_item_id')::uuid and i.organization_id=org and i.property_id=destination_prop and not i.archived for update;
   if destination.id is null or lower(destination.sku)<>lower(item.sku) or destination.unit<>item.unit then raise exception 'incompatible_stock_transfer'; end if;
   if effective>(select (now() at time zone timezone)::date from public.properties where id=destination_prop) then raise exception 'invalid_operations_date'; end if;
   insert into public.inventory_movements(organization_id,property_id,item_id,kind,delta_milli,unit_cost_cents,total_cost_cents,effective_on,transfer_id,reference,reason) values(org,destination_prop,destination.id,'transfer_in',-qty,value,-amount,effective,additional,coalesce(input->>'reference',''),reason);
  elsif command in ('use_material','return_material') then
   insert into public.work_order_materials(organization_id,property_id,work_order_id,item_id,quantity_milli,item_snapshot,movement_id,returns_id,reason) values(org,prop,work.id,item.id,-qty,jsonb_build_object('name',item.name,'sku',item.sku,'unit',item.unit,'location',item.location),movement,material.id,reason) returning id into result_id;
   insert into public.work_order_costs(organization_id,property_id,work_order_id,kind,amount_cents,description,reference,source_id) values(org,prop,work.id,case when command='use_material' then 'material' else 'material_return' end,-amount,reason,coalesce(input->>'reference',''),result_id);
  elsif command in ('receive_purchase','return_purchase') then
   insert into public.purchase_receipts(organization_id,property_id,line_id,quantity_milli,movement_id,returns_id,effective_on,reference,reason) values(org,prop,line.id,qty,movement,received.id,effective,coalesce(input->>'reference',''),reason) returning id into result_id;
   if line.request_id is not null then update public.purchase_requests set status=case when coalesce((select sum(quantity_milli) from public.purchase_receipts where line_id=line.id),0)=line.quantity_milli then 'fulfilled' else 'ordered' end,version=version+1 where id=line.request_id;end if;
  end if;
  if exists(select 1 from (select sum(d) over(order by effective_on) as balance from (select effective_on,sum(delta_milli) d from public.inventory_movements where item_id=item.id group by effective_on) days) running where balance<0) then raise exception 'stock_date_overdraw'; end if;
 elsif command='purchase_request' then
  if not manager then
   select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop;
   if work.id is null or not private.work_access(work.id,true) then raise insufficient_privilege; end if;
  elsif nullif(input->>'work_order_id','') is not null then
   select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop;
   if work.id is null then raise exception 'operations_scope'; end if;
  end if;
  select * into item from public.inventory_items i where i.id=(input->>'item_id')::uuid and i.organization_id=org and i.property_id=prop and not i.archived;
  if item.id is null then raise exception 'item_unavailable'; end if;
  insert into public.purchase_requests(organization_id,property_id,work_order_id,item_id,quantity_milli,needed_on,description) values(org,prop,work.id,item.id,private.operations_quantity(input->>'quantity_milli'),(input->>'needed_on')::date,reason) returning id into result_id;
 elsif command='decide_purchase' then
  if not supervisor then raise insufficient_privilege; end if;
  select * into request from public.purchase_requests r where r.id=target and r.organization_id=org and r.property_id=prop for update;
  if request.id is null then raise insufficient_privilege; end if;
  if request.version is distinct from (input->>'version')::int then raise exception 'operations_conflict'; end if;
  if request.status not in ('open','approved','declined') or exists(select 1 from private.purchase_request_claims where request_id=request.id) or input->>'status' not in ('approved','declined','cancelled') then raise exception 'invalid_purchase_transition'; end if;
  update public.purchase_requests set status=input->>'status',decision_reason=reason,version=version+1 where id=request.id;result_id=request.id;
 elsif command='new_purchase' then
  if not manager then raise insufficient_privilege; end if;
  select * into supplier from public.suppliers s where s.id=(input->>'supplier_id')::uuid and s.organization_id=org and s.property_id=prop and not s.archived;
  if supplier.id is null then raise exception 'supplier_unavailable'; end if;
  if jsonb_typeof(input->'lines') is distinct from 'array' or jsonb_array_length(input->'lines') not between 1 and 30 then raise exception 'invalid_purchase_lines'; end if;
  insert into public.purchase_orders(organization_id,property_id,supplier_id,number,supplier_snapshot,expected_on,reference,reason) values(org,prop,supplier.id,private.operations_number(prop,'PO'),jsonb_build_object('name',supplier.name,'contact',supplier.contact,'email',supplier.email,'phone',supplier.phone,'address',supplier.address),nullif(input->>'expected_on','')::date,input->>'reference',reason) returning id into result_id;
  for entry in select x from jsonb_array_elements(input->'lines') x loop
   select * into item from public.inventory_items i where i.id=(entry->>'item_id')::uuid and i.organization_id=org and i.property_id=prop and not i.archived;
   if item.id is null then raise exception 'item_unavailable'; end if;
   qty=private.operations_quantity(entry->>'quantity_milli');value=(entry->>'unit_cost_cents')::bigint;
   request=null;
   if nullif(entry->>'purchase_request_id','') is not null then
    select * into request from public.purchase_requests r where r.id=(entry->>'purchase_request_id')::uuid and r.organization_id=org and r.property_id=prop and r.item_id=item.id and r.status='approved' and r.quantity_milli=qty for update;
    if request.id is null then raise exception 'approved_purchase_request_required'; end if;
    insert into private.purchase_request_claims values(request.id,result_id);
   end if;
   insert into public.purchase_order_lines(organization_id,property_id,purchase_order_id,item_id,quantity_milli,unit_cost_cents,total_cost_cents,item_snapshot,request_id) values(org,prop,result_id,item.id,qty,value,private.operations_cost(qty,value),jsonb_build_object('name',item.name,'sku',item.sku,'unit',item.unit),request.id);
  end loop;
 elsif command='purchase_status' then
  if not supervisor then raise insufficient_privilege; end if;
  select * into po from public.purchase_orders p where p.id=target and p.organization_id=org and p.property_id=prop for update;
  if po.id is null then raise insufficient_privilege; end if;
  if po.version is distinct from (input->>'version')::int then raise exception 'operations_conflict'; end if;
  new_status=input->>'status';
  if not ((po.status='draft' and new_status in ('approved','cancelled')) or (po.status='approved' and new_status in ('ordered','cancelled')) or (po.status='ordered' and new_status='cancelled')) then raise exception 'invalid_purchase_transition'; end if;
  if new_status='cancelled' and exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=po.id and coalesce((select sum(r.quantity_milli) from public.purchase_receipts r where r.line_id=l.id),0)<>0) then raise exception 'purchase_has_receipts'; end if;
  if new_status='ordered' and length(trim(input->>'reference'))<3 then raise exception 'purchase_reference_required'; end if;
  update public.purchase_orders set status=new_status,approval_reason=trim(input->>'reason'),approved_by=case when new_status='approved' then auth.uid() else approved_by end,reference=coalesce(input->>'reference',reference),version=version+1 where id=po.id;
  if new_status='ordered' then update public.purchase_requests set status='ordered',version=version+1 where id in (select request_id from private.purchase_request_claims where purchase_order_id=po.id);
  elsif new_status='cancelled' then update public.purchase_requests set status='approved',version=version+1 where id in (select request_id from private.purchase_request_claims where purchase_order_id=po.id);delete from private.purchase_request_claims where purchase_order_id=po.id;end if;
  result_id=po.id;
 elsif command in ('checkout_equipment','return_equipment','service_equipment') then
  if command='return_equipment' then
   select * into loan from public.equipment_loans l where l.id=(input->>'loan_id')::uuid and l.organization_id=org and l.property_id=prop for update;
   if loan.id is null or loan.returned_on is not null or (not manager and loan.employee_id<>auth.uid()) then raise insufficient_privilege; end if;
   select * into eq from public.equipment where id=loan.equipment_id for update;
  else select * into eq from public.equipment e where e.id=(input->>'equipment_id')::uuid and e.organization_id=org and e.property_id=prop for update; end if;
  if eq.id is null then raise insufficient_privilege; end if;
  if command='checkout_equipment' then
   person=(input->>'employee_id')::uuid;
   if not private.operations_worker(org,prop,person) or (not manager and person<>auth.uid()) then raise exception 'employee_unavailable'; end if;
   if eq.archived or eq.condition not in ('good','fair') or (eq.next_service_on is not null and eq.next_service_on<today) then raise exception 'equipment_unavailable'; end if;
   if nullif(input->>'work_order_id','') is not null then
    select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop;
    if work.id is null or not private.work_access(work.id,true) or (not manager and work.assigned_to<>person) then raise insufficient_privilege; end if;
   elsif not manager then raise insufficient_privilege; end if;
   if effective<coalesce((select max(returned_on) from public.equipment_loans where equipment_id=eq.id),'2000-01-01'::date) or (input->>'due_on')::date<effective or (input->>'due_on')::date>effective+366 then raise exception 'invalid_operations_date'; end if;
   insert into public.equipment_loans(organization_id,property_id,equipment_id,employee_id,work_order_id,checked_out_on,due_on,checkout_condition,reason) values(org,prop,eq.id,person,work.id,effective,(input->>'due_on')::date,eq.condition,reason) returning id into result_id;
   kind='checkout';
  elsif command='return_equipment' then
   if effective<loan.checked_out_on then raise exception 'invalid_operations_date'; end if;
   if input->>'condition' not in ('good','fair','needs_repair','out_of_service') then raise exception 'invalid_equipment_condition'; end if;
   update public.equipment_loans set returned_on=effective,return_condition=input->>'condition',return_reason=trim(input->>'reason') where id=loan.id;
   update public.equipment set condition=input->>'condition',version=version+1 where id=eq.id;kind='return';result_id=loan.id;work.id=loan.work_order_id;
  else
   if not supervisor then raise insufficient_privilege; end if;
   if exists(select 1 from public.equipment_loans l where l.equipment_id=eq.id and l.returned_on is null) then raise exception 'equipment_checked_out'; end if;
   if nullif(input->>'work_order_id','') is not null then
    select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop and w.status in ('completed','closed');
    if work.id is null then raise exception 'completed_repair_required'; end if;
   end if;
   update public.equipment set condition=input->>'condition',next_service_on=nullif(input->>'next_service_on','')::date,version=version+1 where id=eq.id;kind='service';result_id=eq.id;
  end if;
  insert into public.equipment_events(organization_id,property_id,equipment_id,work_order_id,kind,body,condition,performed_on) values(org,prop,eq.id,work.id,kind,reason,case when command='checkout_equipment' then eq.condition else input->>'condition' end,effective);
 elsif command='generate_occurrence' then
  if not manager then raise insufficient_privilege; end if;
  select * into plan from public.operations_plans p where p.id=(input->>'plan_id')::uuid and p.organization_id=org and p.property_id=prop and p.active;
  scheduled=(input->>'scheduled_for')::date;
  if plan.id is null or scheduled<plan.anchor_on or scheduled>today+366 or (plan.ends_on is not null and scheduled>plan.ends_on) or mod(scheduled-plan.anchor_on,plan.interval_days)<>0 then raise exception 'invalid_occurrence'; end if;
  if plan.assigned_to is not null and not private.operations_worker(org,prop,plan.assigned_to) then raise exception 'employee_unavailable'; end if;
  select entity_id into result_id from private.operations_occurrences where plan_id=plan.id and scheduled_for=scheduled;
  if result_id is null then
   if plan.kind='maintenance' then
    insert into public.work_orders(organization_id,property_id,number,title,description,category,priority,site_id,requested_on,due_on,assigned_to,status,parts_required,plan_id,scheduled_for,plan_snapshot)
    values(org,prop,private.operations_number(prop,'WO'),plan.label,case when length(trim(plan.description))>=3 then plan.description else 'Scheduled preventive maintenance' end,plan.category,'normal',plan.site_id,today,scheduled,plan.assigned_to,case when plan.assigned_to is null then 'new' else 'scheduled' end,'',plan.id,scheduled,to_jsonb(plan)) returning id into result_id;
    insert into public.work_order_events(organization_id,property_id,work_order_id,kind,body,performed_on) values(org,prop,result_id,'created',reason,today);
    perform private.operations_notice(org,prop,plan.assigned_to,'Preventive work assigned',plan.label,result_id,null);
   else
    if plan.assigned_to is null then raise exception 'employee_unavailable'; end if;
    insert into public.checklist_runs(organization_id,property_id,plan_id,label,scheduled_for,assigned_to,items) select org,prop,plan.id,plan.label,scheduled,plan.assigned_to,jsonb_agg(jsonb_build_object('key','item-'||x.n,'label',x.value) order by x.n) from jsonb_array_elements_text(plan.items) with ordinality x(value,n) returning id into result_id;
    perform private.operations_notice(org,prop,plan.assigned_to,'Checklist assigned',plan.label,null,result_id);
   end if;
   insert into private.operations_occurrences values(plan.id,scheduled,result_id);
  end if;
 elsif command in ('checklist_entry','checklist_status') then
  select * into run from public.checklist_runs r where r.id=(input->>'run_id')::uuid and r.organization_id=org and r.property_id=prop for update;
  if run.id is null or not private.checklist_access(run.id) then raise insufficient_privilege; end if;
  if command='checklist_entry' then
   if run.status<>'open' or run.scheduled_for>today or not exists(select 1 from jsonb_array_elements(run.items) i where i->>'key'=input->>'item_key') then raise exception 'invalid_checklist_entry'; end if;
   if input->>'status'='reopen' and not manager then raise insufficient_privilege; end if;
   insert into public.checklist_entries(organization_id,property_id,run_id,item_key,status,notes) values(org,prop,run.id,input->>'item_key',input->>'status',reason) returning id into result_id;
  else
   if run.version is distinct from (input->>'version')::int then raise exception 'operations_conflict'; end if;
   new_status=input->>'status';
   if new_status=run.status or new_status not in ('open','closed','cancelled') or (not manager and new_status<>'closed') then raise exception 'invalid_checklist_transition'; end if;
   if new_status='closed' and (run.scheduled_for>today or exists(select 1 from jsonb_array_elements(run.items) i where coalesce((select e.status from public.checklist_entries e where e.run_id=run.id and e.item_key=i->>'key' order by e.created_at desc,e.id desc limit 1),'reopen')='reopen')) then raise exception 'checklist_incomplete'; end if;
   update public.checklist_runs set status=new_status,closed_on=case when new_status='closed' then today else null end,version=version+1 where id=run.id;result_id=run.id;
  end if;
 elsif command='queue_work_photo' then
  select * into work from public.work_orders w where w.id=(input->>'work_order_id')::uuid and w.organization_id=org and w.property_id=prop;
  if work.id is null or not private.work_access(work.id,true) then raise insufficient_privilege; end if;
  result_id=op;
  insert into public.work_order_photos(id,organization_id,property_id,work_order_id,kind,caption,mime,byte_size,sha256,object_path) values(result_id,org,prop,work.id,input->>'kind',input->>'caption',input->>'mime',(input->>'byte_size')::int,input->>'sha256',org||'/'||prop||'/'||auth.uid()||'/'||result_id);
 elsif command='void_work_photo' then
  if not supervisor then raise insufficient_privilege; end if;
  select * into photo from public.work_order_photos p where p.id=target and p.organization_id=org and p.property_id=prop;
  if photo.id is null or photo.status='voided' then raise insufficient_privilege; end if;
  update public.work_order_photos set status='voided',void_reason=reason where id=photo.id;result_id=photo.id;
 elsif command='read_notification' then
  update public.operations_notifications set read_at=coalesce(read_at,now()) where id=target and organization_id=org and property_id=prop and recipient_id=auth.uid() returning id into result_id;
  if result_id is null then raise insufficient_privilege; end if;
 else raise exception 'unknown_command'; end if;
 result=jsonb_build_object('id',result_id);
 insert into private.operations_requests values(op,auth.uid(),command,input,result);return result;
end; $$;
create function public.operations_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.operations_command(command,payload); $$;

create function public.operations_summary(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('stock',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'quantity_milli',private.stock_quantity(i.id)::text,'last_purchase_on',(select max(effective_on) from public.inventory_movements m where m.item_id=i.id and kind in ('receipt','purchase_receive')))) from public.inventory_items i where i.organization_id=org),'[]'::jsonb),
 'work_costs',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'actual_cents',coalesce((select sum(amount_cents) from public.work_order_costs c where c.work_order_id=w.id and c.kind<>'estimate'),0)::text,'estimate_cents',(select amount_cents::text from public.work_order_costs c where c.work_order_id=w.id and kind='estimate' order by created_at desc,id desc limit 1))) from public.work_orders w where w.organization_id=org and private.operations_manager(w.organization_id,w.property_id)),'[]'::jsonb),
 'purchase_lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'received_milli',coalesce((select sum(quantity_milli) from public.purchase_receipts r where r.line_id=l.id),0)::text)) from public.purchase_order_lines l where l.organization_id=org),'[]'::jsonb));
$$;
create function private.operations_context(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('work',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'site_label',s.label,'section',s.section,'assigned_name',p.name)) from public.work_orders w left join public.sites_units s on s.id=w.site_id left join public.staff_profiles p on p.property_id=w.property_id and p.user_id=w.assigned_to where w.organization_id=org and auth.uid() is not null and private.work_access(w.id,false)),'[]'::jsonb),
 'parts',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'property_id',i.property_id,'name',i.name,'sku',i.sku,'unit',i.unit,'location',i.location,'quantity_milli',private.stock_quantity(i.id)::text)) from public.inventory_items i where i.organization_id=org and not i.archived and auth.uid() is not null and (private.operations_manager(i.organization_id,i.property_id) or exists(select 1 from public.work_orders w where w.property_id=i.property_id and w.assigned_to=auth.uid() and private.work_access(w.id,true)))),'[]'::jsonb),
 'equipment',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'property_id',e.property_id,'name',e.name,'code',e.code,'condition',e.condition,'next_service_on',e.next_service_on,'available',not exists(select 1 from public.equipment_loans l where l.equipment_id=e.id and l.returned_on is null))) from public.equipment e where e.organization_id=org and not e.archived and auth.uid() is not null and (private.operations_manager(e.organization_id,e.property_id) or exists(select 1 from public.work_orders w where w.property_id=e.property_id and w.assigned_to=auth.uid() and private.work_access(w.id,true)))),'[]'::jsonb),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('property_id',s.property_id,'user_id',s.user_id,'role',coalesce((select m.role from public.organization_memberships m where m.organization_id=s.organization_id and m.user_id=s.user_id and m.role in ('owner','admin')),(select m.role from public.property_memberships m where m.property_id=s.property_id and m.user_id=s.user_id)))) from public.staff_profiles s where s.organization_id=org and auth.uid() is not null and (private.operations_manager(s.organization_id,s.property_id) or s.user_id=auth.uid())),'[]'::jsonb));
$$;
create function public.operations_context(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.operations_context(org); $$;
create function private.operations_schedule(org uuid,window_start date,window_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or window_start is null or window_end is null or window_end<window_start or window_end>window_start+366 then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('plan_id',p.id,'property_id',p.property_id,'kind',p.kind,'label',p.label,'scheduled_for',d::date,'entity_id',o.entity_id) order by d,p.id) from public.operations_plans p cross join generate_series(window_start::timestamp,window_end::timestamp,interval '1 day') d left join private.operations_occurrences o on o.plan_id=p.id and o.scheduled_for=d::date where p.organization_id=org and p.active and private.operations_manager(p.organization_id,p.property_id) and d::date>=p.anchor_on and (p.ends_on is null or d::date<=p.ends_on) and mod(d::date-p.anchor_on,p.interval_days)=0),'[]'::jsonb);
end; $$;
create function public.operations_schedule(org uuid,starts_on date,ends_on date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.operations_schedule(org,starts_on,ends_on); $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-photos','work-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.work_photo_access(object_name text,writing boolean) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.work_order_photos p where p.object_path=object_name and private.work_access(p.work_order_id,writing) and (case when writing then p.status='pending' and p.created_by=auth.uid() else p.status='uploaded' or (p.status='pending' and p.created_by=auth.uid() and private.work_access(p.work_order_id,true)) end));
$$;
create policy forgeos_work_photo_insert on storage.objects for insert to authenticated with check(bucket_id='work-photos' and private.work_photo_access(name,true));
create policy forgeos_work_photo_select on storage.objects for select to authenticated using(bucket_id='work-photos' and private.work_photo_access(name,false));
create function private.complete_work_photo(photo_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.work_order_photos;
begin
 select * into p from public.work_order_photos where id=photo_id;
 if auth.uid() is null or p.id is null or p.created_by<>auth.uid() or not private.work_access(p.work_order_id,true) then raise insufficient_privilege; end if;
 perform 1 from public.properties where id=p.property_id and organization_id=p.organization_id and archived_at is null and operating_status='active' for update;
 if not found then raise exception 'property_unavailable'; end if;
 select * into p from public.work_order_photos where id=photo_id for update;
 if not private.work_access(p.work_order_id,true) then raise insufficient_privilege; end if;
 if p.status='uploaded' then return; end if;
 if p.status<>'pending' then raise exception 'photo_unavailable'; end if;
 if not exists(select 1 from storage.objects where bucket_id='work-photos' and name=p.object_path and (metadata->>'size')::bigint=p.byte_size and metadata->>'mimetype'=p.mime) then raise exception 'photo_missing'; end if;
 update public.work_order_photos set status='uploaded' where id=p.id;
end; $$;
create function public.complete_work_photo(photo_id uuid) returns void language sql security invoker set search_path='' as $$ select private.complete_work_photo(photo_id); $$;

revoke execute on function private.operations_cost(numeric,numeric),private.operations_number(uuid,text),private.operations_notice(uuid,uuid,uuid,text,text,uuid,uuid),private.operations_quantity(text,boolean) from public,anon,authenticated;
revoke execute on function private.operations_manager(uuid,uuid),private.operations_worker(uuid,uuid,uuid),private.work_access(uuid,boolean),private.checklist_access(uuid),private.equipment_access(uuid),private.stock_quantity(uuid),private.operations_command(text,jsonb),private.operations_context(uuid),private.operations_schedule(uuid,date,date),private.work_photo_access(text,boolean),private.complete_work_photo(uuid) from public,anon;
grant execute on function private.operations_manager(uuid,uuid),private.operations_worker(uuid,uuid,uuid),private.work_access(uuid,boolean),private.checklist_access(uuid),private.equipment_access(uuid),private.stock_quantity(uuid),private.operations_command(text,jsonb),private.operations_context(uuid),private.operations_schedule(uuid,date,date),private.work_photo_access(text,boolean),private.complete_work_photo(uuid) to authenticated;
revoke execute on function public.operations_command(text,jsonb),public.operations_summary(uuid),public.operations_context(uuid),public.operations_schedule(uuid,date,date),public.complete_work_photo(uuid) from public,anon;
grant execute on function public.operations_command(text,jsonb),public.operations_summary(uuid),public.operations_context(uuid),public.operations_schedule(uuid,date,date),public.complete_work_photo(uuid) to authenticated;
commit;
