-- Milestone 5: manually recorded money, immutable receipts, deposits and collections.
begin;
create table public.collection_policies (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 manual_issuance_enabled boolean not null, grace_days integer not null check(grace_days between 0 and 90),
 fees_enabled boolean not null, fee_flat_cents bigint not null check(fee_flat_cents between 0 and 999999999999),
 fee_bps integer not null check(fee_bps between 0 and 10000), fee_cap_cents bigint not null check(fee_cap_cents between 0 and 999999999999),
 fee_tax_bps integer not null check(fee_tax_bps between 0 and 10000), fee_tax_label text not null check(length(fee_tax_label)<=100),
 deposit_deductions_enabled boolean not null, authorization_reference text not null check(length(trim(authorization_reference)) between 3 and 500),
 reason text not null check(length(trim(reason)) between 3 and 2000),
 check(not fees_enabled or (fee_cap_cents>0 and (fee_flat_cents>0 or fee_bps>0))),
 check(fee_tax_bps=0 or length(trim(fee_tax_label))>0)
);
create table public.invoice_issues (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 invoice_id uuid not null unique, policy_id uuid not null references public.collection_policies(id),
 issued_on date not null, due_on date not null check(due_on>=issued_on and due_on<=issued_on+366),
 grace_days integer not null check(grace_days between 0 and 90), reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id)
);
create table public.manual_payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 amount_cents bigint not null check(amount_cents between 1 and 999999999999), received_on date not null,
 method text not null check(method in ('cash','check','bank_transfer','external_card','other')),
 reference text not null check(length(reference)<=500), notes text not null check(length(notes)<=2000),
 corrects_payment_id uuid references public.manual_payments(id),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 check(method='cash' or length(trim(reference))>=3), unique(organization_id,property_id,customer_id,id)
);
create table public.payment_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 payment_id uuid not null, invoice_id uuid, method text check(method in ('cash','check','bank_transfer','external_card','other')), kind text not null check(kind in ('allocation','allocation_reversal','refund','refund_reversal','void')),
 amount_cents bigint not null check(abs(amount_cents) between 1 and 999999999999), effective_on date not null,
 reverses_id uuid unique references public.payment_events(id), reference text not null check(length(reference)<=500),
 reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,customer_id,payment_id) references public.manual_payments(organization_id,property_id,customer_id,id),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 check((kind in ('allocation','allocation_reversal') and invoice_id is not null) or (kind not in ('allocation','allocation_reversal') and invoice_id is null)),
 check((kind in ('allocation','refund','void') and amount_cents>0 and reverses_id is null) or (kind in ('allocation_reversal','refund_reversal') and amount_cents<0 and reverses_id is not null))
);
create unique index payment_void_once_idx on public.payment_events(payment_id) where kind='void';
create table public.deposit_accounts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 kind text not null check(kind in ('security','reservation')), label text not null check(length(trim(label)) between 1 and 120),
 stay_id uuid, reservation_id uuid, reference text not null check(length(reference)<=500), reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 foreign key(organization_id,property_id,stay_id) references public.occupancy_stays(organization_id,property_id,id),
 foreign key(reservation_id) references public.reservations(id),
 check(stay_id is null or reservation_id is null), unique(organization_id,property_id,customer_id,id)
);
create table public.deposit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 deposit_id uuid not null, invoice_id uuid, kind text not null check(kind in ('received','returned','applied','deduction','reversal')),
 amount_cents bigint not null check(abs(amount_cents) between 1 and 999999999999), effective_on date not null,
 method text check(method in ('cash','check','bank_transfer','external_card','other')),
 reverses_id uuid unique references public.deposit_events(id), reference text not null check(length(reference)<=500),
 reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,customer_id,deposit_id) references public.deposit_accounts(organization_id,property_id,customer_id,id),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 check((kind='received' and amount_cents>0 and reverses_id is null and invoice_id is null and method is not null)
  or (kind='returned' and amount_cents<0 and reverses_id is null and invoice_id is null and method is not null)
  or (kind in ('applied','deduction') and amount_cents<0 and reverses_id is null and invoice_id is not null and method is null)
  or (kind='reversal' and reverses_id is not null))
);
create table public.collection_receipts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 number text not null, source_kind text not null check(source_kind in ('payment','payment_event','deposit_event')), source_id uuid not null,
 snapshot jsonb not null, unique(property_id,number),unique(source_kind,source_id),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id)
);
create table public.late_fee_assessments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 invoice_id uuid not null, fee_invoice_id uuid not null unique, policy_id uuid not null references public.collection_policies(id),
 assessed_on date not null, basis_cents bigint not null check(basis_cents>0), fee_cents bigint not null check(fee_cents>0),
 policy_snapshot jsonb not null, reason text not null check(length(trim(reason)) between 3 and 2000),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 foreign key(organization_id,property_id,fee_invoice_id) references public.invoices(organization_id,property_id,id)
);
create table public.late_fee_waivers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 assessment_id uuid not null references public.late_fee_assessments(id), credit_entry_id uuid not null unique references public.billing_ledger_entries(id),
 reason text not null check(length(trim(reason)) between 3 and 2000)
);
create table public.account_notes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, customer_id uuid not null,
 invoice_id uuid, kind text not null check(kind in ('note','arrangement','resolution')), body text not null check(length(trim(body)) between 3 and 2000),
 follow_up_on date, promised_on date, promised_amount_cents bigint check(promised_amount_cents between 1 and 999999999999),
 resolves_id uuid unique references public.account_notes(id),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 check((kind='note' and promised_on is null and promised_amount_cents is null and resolves_id is null)
  or (kind='arrangement' and invoice_id is not null and promised_on is not null and promised_amount_cents is not null and resolves_id is null)
  or (kind='resolution' and resolves_id is not null and promised_on is null and promised_amount_cents is null))
);
create table public.reconciliations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 starts_on date not null, ends_on date not null check(ends_on>starts_on and ends_on<=starts_on+366),
 method text not null check(method in ('all','cash','check','bank_transfer','external_card','other')),
 opening_cents bigint not null check(abs(opening_cents)<=999999999999), closing_cents bigint not null check(abs(closing_cents)<=999999999999),
 net_cents numeric not null, variance_cents numeric not null, snapshot jsonb not null,
 statement_reference text not null check(length(trim(statement_reference)) between 3 and 500),
 reason text not null check(length(trim(reason)) between 3 and 2000),variance_reason text not null check(length(variance_reason)<=2000),
 check(variance_cents=0 or length(trim(variance_reason))>=3)
);
create table public.reconciliation_voids (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 reconciliation_id uuid not null unique references public.reconciliations(id), reason text not null check(length(trim(reason)) between 3 and 2000)
);
create table private.collection_requests(id uuid primary key,actor_id uuid not null references auth.users(id),command text not null,payload jsonb not null,result jsonb not null);
create table private.receipt_counters(property_id uuid primary key references public.properties(id),next_number bigint not null);
create table private.reconciliation_claims(source_key text primary key,reconciliation_id uuid not null references public.reconciliations(id));
create table private.late_fee_claims(invoice_id uuid primary key references public.invoices(id),assessment_id uuid not null references public.late_fee_assessments(id));

-- Uniform scope, immutable application grants and audit identity on every financial record.
do $$ declare t text; begin
 foreach t in array array['collection_policies','invoice_issues','manual_payments','payment_events','deposit_accounts','deposit_events','collection_receipts','late_fee_assessments','late_fee_waivers','account_notes','reconciliations','reconciliation_voids'] loop
  execute format('alter table public.%I add column created_by uuid not null references auth.users(id), add column updated_by uuid not null references auth.users(id), add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now(), add foreign key(organization_id,property_id) references public.properties(organization_id,id)',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy finance_read on public.%I for select to authenticated using(private.property_role(organization_id,property_id,array[''manager'',''office'']))',t);
  execute format('create index on public.%I(organization_id,property_id)',t);
  execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',t);
  execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.write_audit()',t);
 end loop;
 foreach t in array array['collection_requests','receipt_counters','reconciliation_claims','late_fee_claims'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create index policies_latest_idx on public.collection_policies(property_id,created_at desc,id desc);
create index payments_customer_idx on public.manual_payments(customer_id,received_on,id);
create index payments_reference_idx on public.manual_payments(property_id,method,lower(reference));
create index payment_event_payment_idx on public.payment_events(payment_id,kind);
create index payment_event_invoice_idx on public.payment_events(invoice_id);
create index deposit_customer_idx on public.deposit_accounts(customer_id);
create index deposit_event_account_idx on public.deposit_events(deposit_id);
create index deposit_event_invoice_idx on public.deposit_events(invoice_id);
create index receipts_customer_idx on public.collection_receipts(customer_id,created_at);
create index fee_origin_idx on public.late_fee_assessments(invoice_id);
create index notes_customer_idx on public.account_notes(customer_id,follow_up_on);
create index reconciliation_claim_batch_idx on private.reconciliation_claims(reconciliation_id);

create function private.collection_amount(value text) returns bigint language plpgsql immutable set search_path='' as $$
begin
 if value is null or value !~ '^[0-9]{1,12}$' or value::numeric not between 1 and 999999999999 then raise exception 'invalid_money'; end if;
 return value::bigint;
end; $$;
create function private.invoice_allocated(target uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce((select sum(amount_cents) from public.payment_events where invoice_id=target and kind in ('allocation','allocation_reversal')),0)
 -coalesce((select sum(amount_cents) from public.deposit_events where invoice_id=target),0);
$$;
create function private.invoice_outstanding(target uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce((select sum(amount_cents) from public.billing_ledger_entries where invoice_id=target),0)-private.invoice_allocated(target);
$$;
create function private.payment_available(target uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce((select amount_cents from public.manual_payments where id=target),0)-coalesce((select sum(amount_cents) from public.payment_events where payment_id=target),0);
$$;
create function private.deposit_held(target uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(amount_cents),0) from public.deposit_events where deposit_id=target;
$$;
-- An invoker query preserves ordinary RLS and produces a consistent status/aging snapshot.
create function private.collection_account(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with record as (
  select i.*,s.issued_on,s.due_on as actual_due_on,s.grace_days,s.id as issue_id,s.policy_id,
   (now() at time zone p.timezone)::date as today,private.invoice_allocated(i.id) as allocated,private.invoice_outstanding(i.id) as outstanding,
   coalesce((select sum(amount_cents) from public.billing_ledger_entries where invoice_id=i.id),0) as adjusted
  from public.invoices i join public.properties p on p.id=i.property_id left join public.invoice_issues s on s.invoice_id=i.id where i.id=target)
 select jsonb_build_object('invoice_id',id,'property_id',property_id,'customer_id',customer_id,'number',number,'issued_on',issued_on,'due_on',actual_due_on,'grace_days',grace_days,'grace_ends_on',actual_due_on+grace_days,'policy_id',policy_id,'as_of',today,
  'adjusted_cents',adjusted::text,'allocated_cents',allocated::text,'outstanding_cents',case when status='voided' then '0' else outstanding::text end,
  'days_past_due',case when issue_id is null then 0 else greatest(today-actual_due_on,0) end,
  'state',case when status='voided' then 'voided' when status='draft' then 'draft' when issue_id is null then 'approved_unissued' when outstanding=0 then 'paid' when today>actual_due_on+grace_days then 'overdue' when allocated>0 then 'partially_paid' else 'issued' end,
  'aging_bucket',case when issue_id is null or status='voided' or outstanding<=0 then null when today<=actual_due_on then 'current' when today-actual_due_on<=30 then '1_30' when today-actual_due_on<=60 then '31_60' when today-actual_due_on<=90 then '61_90' else '90_plus' end,
  'history',coalesce((select jsonb_agg(x order by x->>'effective_on',x->>'id') from (
   select jsonb_build_object('id',e.id,'source','payment','source_id',e.payment_id,'kind',e.kind,'amount_cents',e.amount_cents::text,'effective_on',e.effective_on,'reference',e.reference,'reason',e.reason) as x from public.payment_events e where e.invoice_id=record.id
   union all select jsonb_build_object('id',e.id,'source','deposit','source_id',e.deposit_id,'kind',e.kind,'amount_cents',(-e.amount_cents)::text,'effective_on',e.effective_on,'reference',e.reference,'reason',e.reason) from public.deposit_events e where e.invoice_id=record.id) h),'[]'::jsonb)) from record;
$$;
create function public.collection_accounts(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(private.collection_account(id) order by created_at,id),'[]'::jsonb) from public.invoices where organization_id=org;
$$;
create or replace function public.billing_statement(invoice_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('invoice',to_jsonb(i),'revision',to_jsonb(v),'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at,l.id) from public.billing_ledger_entries l where l.invoice_id=i.id),'[]'::jsonb),'collection',private.collection_account(i.id))
 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.id=$1;
$$;

create function private.create_collection_receipt(org uuid,prop uuid,customer uuid,source_kind text,source uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; counter bigint; record jsonb; record_kind text; amount numeric; effective date; method text; reference text; receipt_notes text;
begin
 if source_kind='payment' then
  select to_jsonb(p)||jsonb_build_object('amount_cents',p.amount_cents::text),p.amount_cents,p.received_on,p.method,p.reference,p.notes into record,amount,effective,method,reference,receipt_notes from public.manual_payments p where p.id=source and p.organization_id=org and p.property_id=prop and p.customer_id=customer; record_kind='payment_received';
 elsif source_kind='payment_event' then
  select to_jsonb(e)||jsonb_build_object('amount_cents',e.amount_cents::text),e.amount_cents,e.effective_on,coalesce(e.method,p.method),e.reference,e.reason,e.kind into record,amount,effective,method,reference,receipt_notes,record_kind from public.payment_events e join public.manual_payments p on p.id=e.payment_id where e.id=source and e.organization_id=org and e.property_id=prop and e.customer_id=customer;
 else
  select to_jsonb(e)||jsonb_build_object('amount_cents',e.amount_cents::text),e.amount_cents,e.effective_on,e.method,e.reference,e.reason,'deposit_'||e.kind into record,amount,effective,method,reference,receipt_notes,record_kind from public.deposit_events e where e.id=source and e.organization_id=org and e.property_id=prop and e.customer_id=customer;
 end if;
 if record is null then raise exception 'receipt_source_missing'; end if;
 insert into private.receipt_counters values(prop,1) on conflict(property_id) do update set next_number=private.receipt_counters.next_number+1 returning next_number into counter;
 insert into public.collection_receipts(organization_id,property_id,customer_id,number,source_kind,source_id,snapshot)
 select org,prop,customer,'RCT-'||lpad(counter::text,greatest(6,length(counter::text)),'0'),source_kind,source,
  jsonb_build_object('currency','USD','kind',record_kind,'amount_cents',abs(amount)::text,'effective_on',effective,'method',method,'reference',reference,'notes',receipt_notes,'source',record,
   'property',jsonb_build_object('name',p.name,'address',p.address,'city',p.city,'state',p.state,'postal_code',p.postal_code),
   'customer',jsonb_build_object('name',trim(c.first_name||' '||c.last_name),'mailing_address',c.mailing_address,'email',c.email))
 from public.properties p join public.customers c on c.id=customer and c.organization_id=org and c.property_id=prop where p.id=prop and p.organization_id=org returning id into result;
 return result;
end; $$;

create function private.collection_cash_rows(org uuid) returns table(source_key text,organization_id uuid,property_id uuid,customer_id uuid,effective_on date,method text,amount_cents numeric,reference text,label text) language sql stable security invoker set search_path='' as $$
 select 'payment:'||p.id,p.organization_id,p.property_id,p.customer_id,p.received_on,p.method,p.amount_cents::numeric,p.reference,'Payment received' from public.manual_payments p where p.organization_id=org
 union all
 select 'payment_event:'||e.id,e.organization_id,e.property_id,e.customer_id,e.effective_on,coalesce(e.method,p.method),-e.amount_cents::numeric,e.reference,replace(e.kind,'_',' ') from public.payment_events e join public.manual_payments p on p.id=e.payment_id where e.organization_id=org and e.kind in ('refund','refund_reversal','void')
 union all
 select 'deposit_event:'||e.id,e.organization_id,e.property_id,e.customer_id,e.effective_on,e.method,e.amount_cents::numeric,e.reference,'Deposit '||e.kind from public.deposit_events e where e.organization_id=org and e.method is not null;
$$;
create function private.collection_cash(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount_cents',x.amount_cents::text) order by x.effective_on,x.source_key),'[]'::jsonb)
 from private.collection_cash_rows(org) x where auth.uid() is not null and private.property_role(x.organization_id,x.property_id,array['manager','office'])
 and not exists(select 1 from private.reconciliation_claims c where c.source_key=x.source_key);
$$;
create function public.collection_summary(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('accounts',public.collection_accounts(org),'cash',private.collection_cash(org),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'available_cents',private.payment_available(p.id)::text,'allocated_cents',coalesce((select sum(e.amount_cents) from public.payment_events e where e.payment_id=p.id and e.kind in ('allocation','allocation_reversal')),0)::text,'refunded_cents',coalesce((select sum(e.amount_cents) from public.payment_events e where e.payment_id=p.id and e.kind in ('refund','refund_reversal')),0)::text,'voided',exists(select 1 from public.payment_events e where e.payment_id=p.id and e.kind='void')) order by p.id) from public.manual_payments p where p.organization_id=org),'[]'::jsonb),
  'deposits',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'held_cents',private.deposit_held(d.id)::text) order by d.id) from public.deposit_accounts d where d.organization_id=org),'[]'::jsonb));
$$;
create function public.collection_receipt(receipt_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('receipt',to_jsonb(r),'history',case when r.source_kind='payment' then coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('amount_cents',e.amount_cents::text) order by e.created_at,e.id) from public.payment_events e where e.payment_id=r.source_id),'[]'::jsonb) else '[]'::jsonb end,
 'available_cents',case when r.source_kind='payment' then private.payment_available(r.source_id)::text else null end,
 'voided',case when r.source_kind='payment' then exists(select 1 from public.payment_events e where e.payment_id=r.source_id and e.kind='void') when r.source_kind='deposit_event' then exists(select 1 from public.deposit_events e where e.reverses_id=r.source_id) else exists(select 1 from public.payment_events e where e.reverses_id=r.source_id) end)
 from public.collection_receipts r where r.id=$1;
$$;

-- The old billing RPC remains valid, with allocation-aware guards added here.
create function private.guard_collection_ledger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.property_role(new.organization_id,new.property_id,array['manager']) then raise insufficient_privilege; end if;
 perform 1 from public.properties where id=new.property_id for update;
 if new.kind='void' and private.invoice_allocated(new.invoice_id)<>0 then raise exception 'invoice_has_payments'; end if;
 if new.kind in ('credit','void') and private.invoice_outstanding(new.invoice_id)+new.amount_cents<0 then raise exception 'credit_exceeds_outstanding'; end if;
 return new;
end; $$;
create trigger b_collection_balance before insert on public.billing_ledger_entries for each row execute function private.guard_collection_ledger();
create function private.guard_collection_invoice() returns trigger language plpgsql security definer set search_path='' as $$
declare assessment public.late_fee_assessments; policy public.collection_policies; issue public.invoice_issues; balance numeric; amount numeric; base public.invoices;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if new.status='voided' and old.status<>'voided' then
  if private.invoice_allocated(new.id)<>0 then raise exception 'invoice_has_payments'; end if;
  if exists(select 1 from public.late_fee_assessments a join public.invoices f on f.id=a.fee_invoice_id where a.invoice_id=new.id and f.status<>'voided') then raise exception 'invoice_has_fee_drafts'; end if;
 elsif old.status='draft' and new.status='approved' then
  select * into assessment from public.late_fee_assessments where fee_invoice_id=new.id;
  if found then
   select * into policy from public.collection_policies where property_id=new.property_id order by created_at desc,id desc limit 1;
   select * into base from public.invoices where id=assessment.invoice_id;
   select * into issue from public.invoice_issues where invoice_id=base.id;
   balance=private.invoice_outstanding(base.id);
   amount=least(policy.fee_cap_cents,policy.fee_flat_cents+private.billing_round_ratio(balance*policy.fee_bps,10000));
   if base.status<>'approved' or policy.id<>assessment.policy_id or not policy.fees_enabled or balance<>assessment.basis_cents or amount<>assessment.fee_cents or issue.id is null or assessment.assessed_on<=issue.due_on+issue.grace_days then raise exception 'fee_sources_changed'; end if;
  end if;
 end if;
 return new;
end; $$;
create trigger b_collection_invoice before update on public.invoices for each row execute function private.guard_collection_invoice();
create function private.release_fee_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if new.status='voided' and old.status<>'voided' then delete from private.late_fee_claims where assessment_id in (select id from public.late_fee_assessments where fee_invoice_id=new.id); end if;
 return new;
end; $$;
create trigger c_release_fee_claim after update on public.invoices for each row execute function private.release_fee_claim();

create function private.reconciliation_preview(org uuid,prop uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare first_day date=(input->>'starts_on')::date; last_day date=(input->>'ends_on')::date; chosen_method text=input->>'method'; today date;
 keys text[]; sources jsonb; net numeric; opening numeric; closing numeric; previous public.reconciliations;
begin
 if auth.uid() is null or not private.property_role(org,prop,array['manager','office']) then raise insufficient_privilege; end if;
 select (now() at time zone timezone)::date into today from public.properties where id=prop and organization_id=org;
 if first_day is null or last_day is null or last_day<=first_day or last_day>first_day+366 or last_day>today+1 or chosen_method not in ('all','cash','check','bank_transfer','external_card','other') then raise exception 'invalid_reconciliation'; end if;
 if coalesce(input->>'opening_cents','') !~ '^-?[0-9]{1,12}$' or coalesce(input->>'closing_cents','') !~ '^-?[0-9]{1,12}$' then raise exception 'invalid_money'; end if;
 opening=(input->>'opening_cents')::numeric;closing=(input->>'closing_cents')::numeric;
 if jsonb_typeof(input->'source_keys') is distinct from 'array' or jsonb_array_length(input->'source_keys') not between 1 and 1000 then raise exception 'reconciliation_sources_required'; end if;
 select array_agg(value order by value) into keys from jsonb_array_elements_text(input->'source_keys');
 if cardinality(keys)<>(select count(distinct value) from unnest(keys) value) then raise exception 'duplicate_reconciliation_source'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount_cents',x.amount_cents::text) order by x.effective_on,x.source_key),'[]'::jsonb),coalesce(sum(x.amount_cents),0) into sources,net from private.collection_cash_rows(org) x where x.property_id=prop and x.source_key=any(keys) and x.effective_on<last_day and (chosen_method='all' or x.method=chosen_method) and not exists(select 1 from private.reconciliation_claims c where c.source_key=x.source_key);
 if jsonb_array_length(sources)<>cardinality(keys) then raise exception 'reconciliation_source_changed'; end if;
 if exists(select 1 from public.reconciliations r where r.property_id=prop and (r.method=chosen_method or r.method='all' or chosen_method='all') and daterange(r.starts_on,r.ends_on,'[)') && daterange(first_day,last_day,'[)') and not exists(select 1 from public.reconciliation_voids v where v.reconciliation_id=r.id)) then raise exception 'reconciliation_overlap'; end if;
 select * into previous from public.reconciliations r where r.property_id=prop and r.method=chosen_method and r.ends_on=first_day and not exists(select 1 from public.reconciliation_voids v where v.reconciliation_id=r.id) order by r.created_at desc,r.id desc limit 1;
 if previous.id is not null and previous.closing_cents<>opening then raise exception 'reconciliation_opening_mismatch'; end if;
 return jsonb_build_object('starts_on',first_day,'ends_on',last_day,'method',chosen_method,'opening_cents',opening::text,'closing_cents',closing::text,'net_cents',net::text,'expected_closing_cents',(opening+net)::text,'variance_cents',(closing-opening-net)::text,'sources',sources,'source_count',cardinality(keys),'carried_forward_count',(select count(*) from jsonb_array_elements(sources) x where (x->>'effective_on')::date<first_day));
end; $$;

create function private.collections_command(command text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid=(input->>'organization_id')::uuid; prop uuid=(input->>'property_id')::uuid; op uuid=(input->>'request_id')::uuid;
 previous private.collection_requests; result jsonb; result_id uuid; receipt uuid; customer uuid; today date; effective date; amount bigint; reason text=trim(coalesce(input->>'reason',input->>'body',''));
 policy public.collection_policies; bill public.invoices; issue public.invoice_issues; pay public.manual_payments; evt public.payment_events;
 dep public.deposit_accounts; dev public.deposit_events; note public.account_notes; fee public.late_fee_assessments; batch public.reconciliations;
 balance numeric; event_kind text; selected_method text; snapshot jsonb; key text; expected numeric; child uuid;
begin
 if auth.uid() is null or not private.property_role(org,prop,array['manager','office']) then raise insufficient_privilege; end if;
 select (now() at time zone timezone)::date into today from public.properties where id=prop and organization_id=org and archived_at is null and operating_status='active' for update;
 if not found then raise exception 'property_unavailable'; end if;
 if command='preview_reconciliation' then return jsonb_build_object('preview',private.reconciliation_preview(org,prop,input)); end if;
 if op is null then raise exception 'operation_id_required'; end if;
 select * into previous from private.collection_requests where collection_requests.id=op;
 if found then
  if previous.actor_id<>auth.uid() or previous.command<>command or previous.payload<>input then raise exception 'operation_conflict'; end if;
  return previous.result;
 end if;
 if length(reason) not between 3 and 2000 then raise exception 'collection_reason_required'; end if;
 if command not in ('record_payment','allocate_payment','new_deposit','record_deposit','account_note') and not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
 select * into policy from public.collection_policies where property_id=prop order by created_at desc,id desc limit 1;
 if command='configure_collections' then
  if not private.org_role(org,array['owner','admin']) then raise insufficient_privilege; end if;
  insert into public.collection_policies(organization_id,property_id,manual_issuance_enabled,grace_days,fees_enabled,fee_flat_cents,fee_bps,fee_cap_cents,fee_tax_bps,fee_tax_label,deposit_deductions_enabled,authorization_reference,reason)
   values(org,prop,(input->>'manual_issuance_enabled')::boolean,(input->>'grace_days')::int,(input->>'fees_enabled')::boolean,(input->>'fee_flat_cents')::bigint,(input->>'fee_bps')::int,(input->>'fee_cap_cents')::bigint,(input->>'fee_tax_bps')::int,input->>'fee_tax_label',(input->>'deposit_deductions_enabled')::boolean,input->>'authorization_reference',reason) returning id into result_id;
 elsif command='issue_invoice' then
  if policy.id is null or not policy.manual_issuance_enabled then raise exception 'manual_issuance_not_configured'; end if;
  select * into bill from public.invoices i where i.id=(input->>'invoice_id')::uuid and i.organization_id=org and i.property_id=prop for update;
  if bill.id is null then raise insufficient_privilege; end if;
  if bill.status<>'approved' or bill.current_revision_id is distinct from (input->>'revision_id')::uuid then raise exception 'invoice_conflict'; end if;
  effective=(input->>'issued_on')::date;
  if effective is null or effective>today or effective<'2000-01-01'::date then raise exception 'invalid_financial_date'; end if;
  insert into public.invoice_issues(organization_id,property_id,invoice_id,policy_id,issued_on,due_on,grace_days,reason) values(org,prop,bill.id,policy.id,effective,(input->>'due_on')::date,policy.grace_days,reason) returning id into result_id;
 elsif command='record_payment' then
  customer=(input->>'customer_id')::uuid;amount=private.collection_amount(input->>'amount_cents');effective=(input->>'received_on')::date;selected_method=input->>'method';
  if not exists(select 1 from public.customers c where c.id=customer and c.organization_id=org and c.property_id=prop) then raise insufficient_privilege; end if;
  if effective is null or effective>today or effective<'2000-01-01'::date then raise exception 'invalid_financial_date'; end if;
  if nullif(trim(input->>'reference'),'') is not null and exists(select 1 from public.manual_payments p where p.property_id=prop and p.method=selected_method and lower(trim(p.reference))=lower(trim(input->>'reference')) and not exists(select 1 from public.payment_events e where e.payment_id=p.id and e.kind='void')) then raise exception 'duplicate_payment_reference'; end if;
  if nullif(input->>'corrects_payment_id','') is not null and not exists(select 1 from public.manual_payments p where p.id=(input->>'corrects_payment_id')::uuid and p.property_id=prop and p.customer_id=customer and exists(select 1 from public.payment_events e where e.payment_id=p.id and e.kind='void')) then raise exception 'invalid_payment_correction'; end if;
  insert into public.manual_payments(organization_id,property_id,customer_id,amount_cents,received_on,method,reference,notes,corrects_payment_id) values(org,prop,customer,amount,effective,selected_method,trim(input->>'reference'),reason,nullif(input->>'corrects_payment_id','')::uuid) returning id into result_id;
  receipt=private.create_collection_receipt(org,prop,customer,'payment',result_id);
 elsif command in ('allocate_payment','refund_payment','reverse_payment_event','void_payment') then
  if command='reverse_payment_event' then
   select * into evt from public.payment_events e where e.id=(input->>'event_id')::uuid and e.organization_id=org and e.property_id=prop;
   if evt.id is null or evt.kind not in ('allocation','refund') then raise exception 'invalid_payment_reversal'; end if;
   select * into pay from public.manual_payments where manual_payments.id=evt.payment_id for update;
  else select * into pay from public.manual_payments p where p.id=(input->>'payment_id')::uuid and p.organization_id=org and p.property_id=prop for update; end if;
  if pay.id is null then raise insufficient_privilege; end if;
  if exists(select 1 from public.payment_events e where e.payment_id=pay.id and e.kind='void') then raise exception 'payment_voided'; end if;
  effective=(input->>'effective_on')::date;
  if effective is null or effective>today or effective<pay.received_on or (command='reverse_payment_event' and effective<evt.effective_on) then raise exception 'invalid_financial_date'; end if;
  if command='allocate_payment' then
   amount=private.collection_amount(input->>'amount_cents');
   select * into bill from public.invoices i where i.id=(input->>'invoice_id')::uuid and i.organization_id=org and i.property_id=prop and i.customer_id=pay.customer_id for update;
   select * into issue from public.invoice_issues where invoice_id=bill.id;
   if bill.id is null or bill.status<>'approved' or issue.id is null or effective<issue.issued_on then raise exception 'issued_invoice_required'; end if;
   if amount>private.payment_available(pay.id) or amount>private.invoice_outstanding(bill.id) then raise exception 'allocation_exceeds_balance'; end if;
   insert into public.payment_events(organization_id,property_id,customer_id,payment_id,invoice_id,kind,amount_cents,effective_on,reference,reason) values(org,prop,pay.customer_id,pay.id,bill.id,'allocation',amount,effective,coalesce(input->>'reference',''),reason) returning id into result_id;
  elsif command='refund_payment' then
   amount=private.collection_amount(input->>'amount_cents');selected_method=input->>'method';
   if amount>private.payment_available(pay.id) then raise exception 'refund_exceeds_available'; end if;
   if selected_method is null or selected_method not in ('cash','check','bank_transfer','external_card','other') or (selected_method<>'cash' and length(trim(coalesce(input->>'reference','')))<3) then raise exception 'refund_reference_required'; end if;
   insert into public.payment_events(organization_id,property_id,customer_id,payment_id,kind,amount_cents,effective_on,method,reference,reason) values(org,prop,pay.customer_id,pay.id,'refund',amount,effective,selected_method,input->>'reference',reason) returning id into result_id;
   receipt=private.create_collection_receipt(org,prop,pay.customer_id,'payment_event',result_id);
  elsif command='reverse_payment_event' then
   event_kind=case evt.kind when 'allocation' then 'allocation_reversal' else 'refund_reversal' end;
   insert into public.payment_events(organization_id,property_id,customer_id,payment_id,invoice_id,kind,amount_cents,effective_on,method,reverses_id,reference,reason) values(org,prop,pay.customer_id,pay.id,evt.invoice_id,event_kind,-evt.amount_cents,effective,evt.method,evt.id,coalesce(input->>'reference',''),reason) returning id into result_id;
   if event_kind='refund_reversal' then receipt=private.create_collection_receipt(org,prop,pay.customer_id,'payment_event',result_id); end if;
  else
   if private.payment_available(pay.id)<>pay.amount_cents then raise exception 'payment_has_active_movements'; end if;
   insert into public.payment_events(organization_id,property_id,customer_id,payment_id,kind,amount_cents,effective_on,method,reference,reason) values(org,prop,pay.customer_id,pay.id,'void',pay.amount_cents,effective,pay.method,coalesce(input->>'reference',''),reason) returning id into result_id;
   receipt=private.create_collection_receipt(org,prop,pay.customer_id,'payment_event',result_id);
  end if;
 elsif command='new_deposit' then
  customer=(input->>'customer_id')::uuid;
  if not exists(select 1 from public.customers c where c.id=customer and c.organization_id=org and c.property_id=prop) then raise insufficient_privilege; end if;
  if nullif(input->>'stay_id','') is not null and not exists(select 1 from public.occupancy_stays s where s.id=(input->>'stay_id')::uuid and s.property_id=prop and s.customer_id=customer) then raise exception 'invalid_deposit_link'; end if;
  if nullif(input->>'reservation_id','') is not null and not exists(select 1 from public.reservations r where r.id=(input->>'reservation_id')::uuid and r.organization_id=org and r.property_id=prop and r.customer_id=customer) then raise exception 'invalid_deposit_link'; end if;
  insert into public.deposit_accounts(organization_id,property_id,customer_id,kind,label,stay_id,reservation_id,reference,reason) values(org,prop,customer,input->>'kind',input->>'label',nullif(input->>'stay_id','')::uuid,nullif(input->>'reservation_id','')::uuid,coalesce(input->>'reference',''),reason) returning id into result_id;
 elsif command in ('record_deposit','reverse_deposit') then
  if command='reverse_deposit' then
   select * into dev from public.deposit_events e where e.id=(input->>'event_id')::uuid and e.organization_id=org and e.property_id=prop;
   if dev.id is null or dev.kind='reversal' then raise exception 'invalid_deposit_reversal'; end if;
   select * into dep from public.deposit_accounts where deposit_accounts.id=dev.deposit_id for update;
  else select * into dep from public.deposit_accounts d where d.id=(input->>'deposit_id')::uuid and d.organization_id=org and d.property_id=prop for update; end if;
  if dep.id is null then raise insufficient_privilege; end if;
  effective=(input->>'effective_on')::date;
  if effective is null or effective>today or effective<'2000-01-01'::date or (command='reverse_deposit' and effective<dev.effective_on) then raise exception 'invalid_financial_date'; end if;
  if command='reverse_deposit' then
   amount=-dev.amount_cents;
   if private.deposit_held(dep.id)+amount<0 then raise exception 'deposit_exceeds_held'; end if;
   insert into public.deposit_events(organization_id,property_id,customer_id,deposit_id,invoice_id,kind,amount_cents,effective_on,method,reverses_id,reference,reason) values(org,prop,dep.customer_id,dep.id,dev.invoice_id,'reversal',amount,effective,dev.method,dev.id,coalesce(input->>'reference',''),reason) returning id into result_id;
  else
   event_kind=input->>'kind';amount=private.collection_amount(input->>'amount_cents');selected_method=nullif(input->>'method','');
   if event_kind<>'received' and not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
   if event_kind not in ('received','returned','applied','deduction') then raise exception 'invalid_deposit_event'; end if;
   if event_kind<>'received' and amount>private.deposit_held(dep.id) then raise exception 'deposit_exceeds_held'; end if;
   if event_kind in ('applied','deduction') then
    select * into bill from public.invoices i where i.id=(input->>'invoice_id')::uuid and i.organization_id=org and i.property_id=prop and i.customer_id=dep.customer_id for update;
    select * into issue from public.invoice_issues where invoice_id=bill.id;
    if bill.id is null or bill.status<>'approved' or issue.id is null or effective<issue.issued_on then raise exception 'issued_invoice_required'; end if;
    if amount>private.invoice_outstanding(bill.id) then raise exception 'allocation_exceeds_balance'; end if;
    if event_kind='deduction' then
     if policy.id is null or not policy.deposit_deductions_enabled then raise exception 'deduction_not_configured'; end if;
     if exists(select 1 from public.invoice_revisions v cross join lateral jsonb_array_elements(v.calculation->'lines') l where v.id=bill.current_revision_id and (l->>'total_cents')::numeric>0 and l->>'category'<>'fee') then raise exception 'deduction_fee_invoice_required'; end if;
    end if;
    selected_method=null;
   else
    if selected_method is null or selected_method not in ('cash','check','bank_transfer','external_card','other') or (selected_method<>'cash' and length(trim(coalesce(input->>'reference','')))<3) then raise exception 'refund_reference_required'; end if;
    if event_kind='received' and nullif(trim(input->>'reference'),'') is not null and exists(select 1 from public.deposit_events e where e.deposit_id=dep.id and e.kind='received' and e.method=selected_method and lower(trim(e.reference))=lower(trim(input->>'reference')) and not exists(select 1 from public.deposit_events r where r.reverses_id=e.id)) then raise exception 'duplicate_deposit_reference'; end if;
   end if;
   insert into public.deposit_events(organization_id,property_id,customer_id,deposit_id,invoice_id,kind,amount_cents,effective_on,method,reference,reason) values(org,prop,dep.customer_id,dep.id,case when event_kind in ('applied','deduction') then bill.id else null end,event_kind,amount*case when event_kind='received' then 1 else -1 end,effective,selected_method,coalesce(input->>'reference',''),reason) returning id into result_id;
  end if;
  receipt=private.create_collection_receipt(org,prop,dep.customer_id,'deposit_event',result_id);
 elsif command='prepare_fee' then
  if policy.id is null or not policy.fees_enabled then raise exception 'late_fees_not_configured'; end if;
  select * into bill from public.invoices i where i.id=(input->>'invoice_id')::uuid and i.organization_id=org and i.property_id=prop for update;
  select * into issue from public.invoice_issues where invoice_id=bill.id;
  if bill.id is null or bill.status<>'approved' or issue.id is null or today<=issue.due_on+issue.grace_days then raise exception 'invoice_not_overdue'; end if;
  if exists(select 1 from public.late_fee_assessments where fee_invoice_id=bill.id) then raise exception 'fee_on_fee_forbidden'; end if;
  balance=private.invoice_outstanding(bill.id);
  if balance<=0 then raise exception 'invoice_not_overdue'; end if;
  amount=least(policy.fee_cap_cents,policy.fee_flat_cents+private.billing_round_ratio(balance*policy.fee_bps,10000));
  if amount<=0 then raise exception 'zero_fee'; end if;
  child=gen_random_uuid();
  perform private.billing_command('create_draft',jsonb_build_object('organization_id',org,'property_id',prop,'request_id',child,'stay_id',bill.stay_id,'starts_on',bill.starts_on,'ends_on',bill.ends_on,'due_on',greatest(bill.starts_on,least(today,bill.ends_on+366)),'rent_mode','none','manual_rent_cents',null,'rent_reason','No rent: separate reviewed late fee','include_utilities',false,'utilities_reason','No utility usage: separate reviewed late fee','accept_estimates',false,
   'adjustments',jsonb_build_array(jsonb_build_object('kind','fee','description','Reviewed late fee for '||bill.number,'amount_cents',amount::text,'reason',reason,'tax_bps',policy.fee_tax_bps,'tax_label',policy.fee_tax_label,'authorization_reference',policy.authorization_reference,'collection_policy',to_jsonb(policy),'source_invoice_id',bill.id,'basis_cents',balance::text))));
  insert into public.late_fee_assessments(organization_id,property_id,invoice_id,fee_invoice_id,policy_id,assessed_on,basis_cents,fee_cents,policy_snapshot,reason) values(org,prop,bill.id,child,policy.id,today,balance,amount,to_jsonb(policy),reason) returning id into result_id;
  insert into private.late_fee_claims values(bill.id,result_id);
  result=jsonb_build_object('id',result_id,'invoice_id',child);
 elsif command='waive_fee' then
  select * into fee from public.late_fee_assessments a where a.id=(input->>'assessment_id')::uuid and a.organization_id=org and a.property_id=prop;
  select * into bill from public.invoices where invoices.id=fee.fee_invoice_id;
  if fee.id is null or bill.status<>'approved' then raise exception 'approved_fee_required'; end if;
  amount=private.collection_amount(input->>'amount_cents');
  child=private.billing_command('credit',jsonb_build_object('organization_id',org,'property_id',prop,'request_id',gen_random_uuid(),'invoice_id',bill.id,'revision_id',bill.current_revision_id,'amount_cents',amount::text,'reference','Reviewed late fee waiver','reason',reason));
  insert into public.late_fee_waivers(organization_id,property_id,assessment_id,credit_entry_id,reason) values(org,prop,fee.id,child,reason) returning id into result_id;
 elsif command='account_note' then
  customer=(input->>'customer_id')::uuid;event_kind=input->>'kind';
  if not exists(select 1 from public.customers c where c.id=customer and c.organization_id=org and c.property_id=prop) then raise insufficient_privilege; end if;
  if nullif(input->>'invoice_id','') is not null and not exists(select 1 from public.invoices i where i.id=(input->>'invoice_id')::uuid and i.organization_id=org and i.property_id=prop and i.customer_id=customer) then raise exception 'invalid_account_note'; end if;
  if event_kind='arrangement' then
   if not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
   select * into bill from public.invoices where invoices.id=(input->>'invoice_id')::uuid;
   if not exists(select 1 from public.invoice_issues where invoice_id=bill.id) or bill.status<>'approved' or private.collection_amount(input->>'promised_amount_cents')>private.invoice_outstanding(bill.id) or (input->>'promised_on')::date<today or (input->>'promised_on')::date>today+366 then raise exception 'invalid_arrangement'; end if;
  elsif event_kind='resolution' then
   select * into note from public.account_notes n where n.id=(input->>'resolves_id')::uuid and n.organization_id=org and n.property_id=prop and n.customer_id=customer and n.kind<>'resolution';
   if note.id is null then raise exception 'invalid_account_note'; end if;
   if note.kind='arrangement' and not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
  end if;
  insert into public.account_notes(organization_id,property_id,customer_id,invoice_id,kind,body,follow_up_on,promised_on,promised_amount_cents,resolves_id) values(org,prop,customer,nullif(input->>'invoice_id','')::uuid,event_kind,reason,nullif(input->>'follow_up_on','')::date,nullif(input->>'promised_on','')::date,nullif(input->>'promised_amount_cents','')::bigint,nullif(input->>'resolves_id','')::uuid) returning id into result_id;
 elsif command='close_reconciliation' then
  snapshot=private.reconciliation_preview(org,prop,input);
  if (snapshot->>'variance_cents')::numeric<>0 and (not private.org_role(org,array['owner','admin']) or not coalesce((input->>'acknowledge_variance')::boolean,false) or length(trim(coalesce(input->>'variance_reason','')))<3) then raise exception 'reconciliation_variance_requires_owner'; end if;
  insert into public.reconciliations(organization_id,property_id,starts_on,ends_on,method,opening_cents,closing_cents,net_cents,variance_cents,snapshot,statement_reference,reason,variance_reason) values(org,prop,(snapshot->>'starts_on')::date,(snapshot->>'ends_on')::date,snapshot->>'method',(snapshot->>'opening_cents')::bigint,(snapshot->>'closing_cents')::bigint,(snapshot->>'net_cents')::numeric,(snapshot->>'variance_cents')::numeric,snapshot,input->>'statement_reference',reason,coalesce(input->>'variance_reason','')) returning id into result_id;
  for key in select value from jsonb_array_elements_text(input->'source_keys') loop insert into private.reconciliation_claims values(key,result_id); end loop;
 elsif command='void_reconciliation' then
  if not private.org_role(org,array['owner','admin']) then raise insufficient_privilege; end if;
  select * into batch from public.reconciliations r where r.id=(input->>'reconciliation_id')::uuid and r.organization_id=org and r.property_id=prop;
  if batch.id is null then raise insufficient_privilege; end if;
  if exists(select 1 from public.reconciliations r where r.property_id=prop and r.method=batch.method and r.starts_on=batch.ends_on and not exists(select 1 from public.reconciliation_voids v where v.reconciliation_id=r.id)) then raise exception 'reconciliation_has_later_period'; end if;
  insert into public.reconciliation_voids(organization_id,property_id,reconciliation_id,reason) values(org,prop,batch.id,reason) returning id into result_id;
  delete from private.reconciliation_claims where reconciliation_id=batch.id;
 else raise exception 'unknown_command'; end if;
 -- Dates cannot borrow funds from a later day's receipt or reversal.
 if command in ('allocate_payment','refund_payment','reverse_payment_event','void_payment') and exists(
  select 1 from (select sum(day_amount) over(order by effective_on) as spent from
   (select effective_on,sum(amount_cents) as day_amount from public.payment_events where payment_id=pay.id group by effective_on) days) running
  where spent>pay.amount_cents or spent<0
 ) then raise exception 'financial_date_overdraw'; end if;
 if command in ('record_deposit','reverse_deposit') and exists(
  select 1 from (select sum(day_amount) over(order by effective_on) as held from
   (select effective_on,sum(amount_cents) as day_amount from public.deposit_events where deposit_id=dep.id group by effective_on) days) running
  where held<0
 ) then raise exception 'financial_date_overdraw'; end if;
 result=coalesce(result,jsonb_build_object('id',result_id,'receipt_id',receipt));
 insert into private.collection_requests values(op,auth.uid(),command,input,result);
 return result;
end; $$;
create function public.collections_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.collections_command(command,payload); $$;

revoke execute on function private.collection_amount(text),private.create_collection_receipt(uuid,uuid,uuid,text,uuid),private.collection_cash_rows(uuid),private.guard_collection_ledger(),private.guard_collection_invoice(),private.release_fee_claim() from public,anon,authenticated;
revoke execute on function private.invoice_allocated(uuid),private.invoice_outstanding(uuid),private.payment_available(uuid),private.deposit_held(uuid),private.collection_account(uuid),private.collection_cash(uuid),private.reconciliation_preview(uuid,uuid,jsonb),private.collections_command(text,jsonb),public.collections_command(text,jsonb),public.collection_accounts(uuid),public.collection_summary(uuid),public.collection_receipt(uuid) from public,anon;
grant execute on function private.invoice_allocated(uuid),private.invoice_outstanding(uuid),private.payment_available(uuid),private.deposit_held(uuid),private.collection_account(uuid),private.collection_cash(uuid),private.collections_command(text,jsonb),public.collections_command(text,jsonb),public.collection_accounts(uuid),public.collection_summary(uuid),public.collection_receipt(uuid) to authenticated;
-- Preview can only be reached through the scoped command; it reads private claim state.
revoke execute on function private.reconciliation_preview(uuid,uuid,jsonb) from authenticated;
commit;
