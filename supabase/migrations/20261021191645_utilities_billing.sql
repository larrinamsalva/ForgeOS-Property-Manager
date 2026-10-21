-- Milestone 4: exact, source-backed, explicitly unissued billing.
begin;
alter table public.occupancy_stays add constraint stays_billing_scope_key unique(organization_id,property_id,id);
create table public.billing_policies (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 currency text not null default 'USD' check(currency='USD'),
 proration text not null check(proration='actual_calendar_days'), due_days integer not null check(due_days between 0 and 90),
 rent_tax_bps integer not null check(rent_tax_bps between 0 and 10000), tax_label text not null, authorization_reference text not null,
 reason text not null check(length(trim(reason)) between 3 and 2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 check(rent_tax_bps=0 or (length(trim(tax_label))>0 and length(trim(authorization_reference))>=3))
);
create table public.utility_rate_plans (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 utility text not null check(utility in ('electric','water','gas')), starts_on date not null, ends_on date check(ends_on>starts_on),
 status text not null default 'active' check(status in ('active','voided')), void_reason text not null default '',
 label text not null check(length(trim(label)) between 1 and 100), billed_unit text not null check(length(trim(billed_unit)) between 1 and 30),
 conversions jsonb not null, tiers jsonb not null, monthly_base_cents bigint not null check(monthly_base_cents between 0 and 999999999),
 sewer_unit_price text not null check(sewer_unit_price ~ '^[0-9]{1,7}(\.[0-9]{1,6})?$'),
 sewer_base_cents bigint not null check(sewer_base_cents between 0 and 999999999),
 tax_bps integer not null check(tax_bps between 0 and 10000), tax_label text not null, authorization_reference text not null,
 included_in_rent boolean not null, reason text not null check(length(trim(reason)) between 3 and 2000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 check(tax_bps=0 or (length(trim(tax_label))>0 and length(trim(authorization_reference))>=3)),
 check(utility='water' or (sewer_unit_price::numeric=0 and sewer_base_cents=0)),
 exclude using gist(property_id with =,utility with =,daterange(starts_on,ends_on,'[)') with &&) where(status='active')
);
create table public.meter_register_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 reading_id uuid not null references public.meter_readings(id), review_id uuid not null references public.meter_reading_reviews(id),
 kind text not null check(kind in ('reset','rollover')), before_value text, after_value text, rollover_count integer,
 status text not null default 'active' check(status in ('active','voided')), reason text not null check(length(trim(reason)) between 3 and 2000),
 void_reason text not null default '',
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 check((kind='reset' and before_value is not null and after_value is not null and before_value ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' and after_value ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' and rollover_count is null)
 or (kind='rollover' and rollover_count is not null and rollover_count between 1 and 100 and before_value is null and after_value is null))
);
create unique index register_event_active_idx on public.meter_register_events(reading_id) where status='active';
create table public.invoices (
 id uuid primary key, organization_id uuid not null, property_id uuid not null,
 customer_id uuid not null, site_id uuid not null, stay_id uuid not null,
 number text not null, starts_on date not null, ends_on date not null check(ends_on>starts_on and ends_on<=starts_on+366), due_on date not null,
 status text not null default 'draft' check(status in ('draft','approved','voided')), current_revision_id uuid,
 approved_by uuid references auth.users(id), approved_at timestamptz, approval_reason text not null default '', void_reason text not null default '',
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 foreign key(organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id),
 foreign key(organization_id,property_id,stay_id) references public.occupancy_stays(organization_id,property_id,id),
 unique(property_id,number),unique(organization_id,property_id,id)
);
create table public.invoice_revisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null, invoice_id uuid not null,
 revision integer not null check(revision>0), request jsonb not null, calculation jsonb not null,
 total_cents bigint not null check(total_cents between 0 and 999999999999), reason text not null,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 unique(invoice_id,revision),unique(invoice_id,id)
);
alter table public.invoices add foreign key(id,current_revision_id) references public.invoice_revisions(invoice_id,id) deferrable initially deferred;
create table public.billing_ledger_entries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 customer_id uuid not null, invoice_id uuid not null,
 kind text not null check(kind in ('approval','credit','credit_reversal','void')),
 amount_cents bigint not null check(abs(amount_cents)<=999999999999), reverses_id uuid unique references public.billing_ledger_entries(id),
 reason text not null check(length(trim(reason)) between 3 and 2000), reference text not null default '',
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,property_id,invoice_id) references public.invoices(organization_id,property_id,id),
 foreign key(organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 check((kind in ('approval','credit_reversal') and amount_cents>=0) or (kind in ('credit','void') and amount_cents<=0))
);
create unique index invoice_approval_once_idx on public.billing_ledger_entries(invoice_id) where kind='approval';
create unique index invoice_void_once_idx on public.billing_ledger_entries(invoice_id) where kind='void';
create table private.billing_requests(id uuid primary key,actor_id uuid not null references auth.users(id),command text not null,payload jsonb not null,result uuid not null);
create table private.invoice_counters(property_id uuid primary key references public.properties(id),next_number bigint not null);
create table private.billing_rent_claims(invoice_id uuid primary key references public.invoices(id),stay_id uuid not null references public.occupancy_stays(id),period daterange not null,
 exclude using gist(stay_id with =,period with &&));
create table private.billing_usage_claims(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.invoices(id),assignment_id uuid not null references public.meter_assignments(id),period tstzrange not null,
 exclude using gist(assignment_id with =,period with &&));
create index billing_policy_scope_idx on public.billing_policies(organization_id,property_id,created_at desc,id desc);
create index rates_scope_idx on public.utility_rate_plans(organization_id,property_id);
create index events_scope_idx on public.meter_register_events(organization_id,property_id,reading_id);
create index invoices_scope_idx on public.invoices(organization_id,property_id,customer_id);
create index revisions_scope_idx on public.invoice_revisions(organization_id,property_id,invoice_id);
create index ledger_scope_idx on public.billing_ledger_entries(organization_id,property_id,customer_id,invoice_id);
create index billing_readings_boundary_idx on public.meter_readings(assignment_id,captured_at,id);
create index usage_invoice_idx on private.billing_usage_claims(invoice_id);

-- Exact money lives in PostgreSQL numeric/bigint. JSON sends cents and decimals as strings.
create function private.billing_line(category text,description text,quantity text,unit text,subtotal numeric,tax_bps integer,source jsonb) returns jsonb
 language plpgsql immutable set search_path='' as $$
declare net numeric=round(subtotal); tax numeric;
begin
 if abs(net)>999999999999 then raise exception 'billing_limit'; end if;
 tax=round(net*tax_bps/10000::numeric);
 return jsonb_build_object('category',category,'description',description,'quantity',quantity,'unit',unit,'subtotal_cents',net::text,'tax_bps',tax_bps,'tax_cents',tax::text,'total_cents',(net+tax)::text,'source',source);
end; $$;
-- Round a rational number without truncating a repeating quotient near a half cent.
create function private.billing_round_ratio(numerator numeric,denominator numeric) returns numeric language sql immutable set search_path='' as $$
 select sign(numerator)*(div(abs(numerator),denominator)+case when mod(abs(numerator),denominator)*2>=denominator then 1 else 0 end);
$$;
-- Deterministic calculation: approval compares this entire result with the saved revision.
-- No current timestamp, random ID or browser-provided amount participates in utility totals.
create function private.calculate_invoice(org uuid,prop uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.properties; s public.occupancy_stays; customer public.customers; site public.sites_units; policy public.billing_policies;
 first_day date=(input->>'starts_on')::date; last_day date=(input->>'ends_on')::date; rent record;
 lines jsonb='[]'; segments jsonb='[]'; reading_ids jsonb='[]'; rate_ids jsonb='[]'; claims jsonb='[]';
 utility_kind text; plan public.utility_rate_plans; a record; first_read record; last_read record; rd record; prior record; ev public.meter_register_events;
 starts date; ends date; delta numeric; quantity numeric; factor numeric; usage numeric; remaining numeric; lower_bound numeric; upper_bound numeric;
 tier jsonb; tier_details jsonb; taken numeric; charge numeric; base_fraction numeric; base_weight numeric; fee jsonb; src jsonb; subtotal numeric; taxes numeric; total numeric; coverage integer; has_prior boolean;
begin
 if auth.uid() is null or not private.property_role(org,prop,array['manager','office']) then raise insufficient_privilege; end if;
 select * into p from public.properties where id=prop and organization_id=org;
 select * into s from public.occupancy_stays where id=(input->>'stay_id')::uuid and organization_id=org and property_id=prop;
 if s.id is null or first_day is null or last_day is null or last_day<=first_day or last_day>first_day+366 or first_day<s.starts_on or (s.ends_on is not null and last_day>s.ends_on) then raise exception 'invalid_billing_period'; end if;
 if (input->>'due_on')::date is null or (input->>'due_on')::date<first_day or (input->>'due_on')::date>last_day+366 then raise exception 'invalid_due_date'; end if;
 select * into customer from public.customers where id=s.customer_id;
 select * into site from public.sites_units where id=s.site_id;
 select * into policy from public.billing_policies where organization_id=org and property_id=prop order by created_at desc,id desc limit 1;
 if policy.id is null then raise exception 'billing_policy_required'; end if;
 if input->>'rent_mode'='recorded' then
  for rent in
   with days as (select first_day+n as day from generate_series(0,last_day-first_day-1) n), terms as (
    select day,coalesce(l.billing_period,s.billing_period) as period,coalesce(l.agreed_rate_cents,s.agreed_rate_cents) as cents,l.id as lease_id,to_jsonb(l) as lease
    from days left join lateral (select * from public.lease_terms t where t.stay_id=s.id and t.status='recorded' and t.starts_on<=day and t.ends_on>day order by t.starts_on desc,t.id desc limit 1) l on true)
   select date_trunc('month',day)::date as month,period,cents,lease_id,lease,min(day) as starts,max(day)+1 as ends,count(*) as days,
    count(*)::numeric/extract(day from (date_trunc('month',min(day))+interval '1 month - 1 day')) as month_fraction,extract(day from (date_trunc('month',min(day))+interval '1 month - 1 day')) as month_days
    from terms group by date_trunc('month',day)::date,period,cents,lease_id,lease order by min(day),lease_id
  loop
   if rent.period='custom' then raise exception 'custom_rent_required'; end if;
   charge=case rent.period when 'nightly' then rent.cents*rent.days when 'weekly' then private.billing_round_ratio(rent.cents*rent.days,7) when 'monthly' then private.billing_round_ratio(rent.cents*rent.days,rent.month_days) end;
   lines=lines||jsonb_build_array(private.billing_line('rent','Rent ('||rent.period||')',rent.days::text,'days',charge,policy.rent_tax_bps,
    jsonb_build_object('starts_on',rent.starts,'ends_on',rent.ends,'agreed_rate_cents',rent.cents::text,'billing_period',rent.period,'lease',rent.lease,'proration',policy.proration,'month_fraction',rent.month_fraction::text,'tax_label',policy.tax_label,'authorization_reference',policy.authorization_reference)));
  end loop;
 elsif input->>'rent_mode' in ('manual','none') then
  if length(trim(coalesce(input->>'rent_reason','')))<3 then raise exception 'billing_reason_required'; end if;
  if input->>'rent_mode'='manual' then
   if coalesce(input->>'manual_rent_cents','') !~ '^[0-9]{1,10}$' then raise exception 'invalid_adjustment'; end if;
   lines=lines||jsonb_build_array(private.billing_line('rent','Custom rent agreement','1','agreement',(input->>'manual_rent_cents')::numeric,policy.rent_tax_bps,jsonb_build_object('reason',input->>'rent_reason','tax_label',policy.tax_label,'authorization_reference',policy.authorization_reference)));
  end if;
 else raise exception 'invalid_rent_mode'; end if;

 if coalesce((input->>'include_utilities')::boolean,false) then
  foreach utility_kind in array array['electric','water','gas'] loop
   if not coalesce((to_jsonb(site)->>utility_kind)::boolean,false) and not exists(select 1 from public.meter_assignments ma join public.meters m on m.id=ma.meter_id where ma.site_id=s.site_id and m.utility=utility_kind and ma.starts_at<(last_day::timestamp at time zone p.timezone) and coalesce(ma.ends_at,'infinity')>(first_day::timestamp at time zone p.timezone)) then continue; end if;
   select coalesce(sum(least(coalesce(ends_on,last_day),last_day)-greatest(starts_on,first_day)),0) into coverage from public.utility_rate_plans r where r.property_id=prop and r.utility=utility_kind and r.status='active' and r.starts_on<last_day and coalesce(r.ends_on,'infinity'::date)>first_day;
   if coverage<>last_day-first_day then raise exception 'rate_coverage_required'; end if;
   if exists(select 1 from public.utility_rate_plans r where r.property_id=prop and r.utility=utility_kind and r.status='active' and not r.included_in_rent and r.starts_on<last_day and coalesce(r.ends_on,'infinity'::date)>first_day) then
    if not exists(select 1 from public.meter_assignments ma join public.meters m on m.id=ma.meter_id where ma.site_id=s.site_id and m.utility=utility_kind and ma.starts_at<(last_day::timestamp at time zone p.timezone) and coalesce(ma.ends_at,'infinity')>(first_day::timestamp at time zone p.timezone)) then raise exception 'utility_meter_required'; end if;
    if exists(select 1 from public.utility_rate_plans r where r.property_id=prop and r.utility=utility_kind and r.status='active' and not r.included_in_rent and r.starts_on<last_day and coalesce(r.ends_on,'infinity'::date)>first_day and not coalesce((
     select range_agg(tstzrange(ma.starts_at,ma.ends_at,'[)')) @> tstzrange((greatest(first_day,r.starts_on)::timestamp at time zone p.timezone),(least(last_day,coalesce(r.ends_on,last_day))::timestamp at time zone p.timezone),'[)')
     from public.meter_assignments ma join public.meters m on m.id=ma.meter_id where ma.site_id=s.site_id and m.utility=utility_kind),false)) then raise exception 'utility_assignment_gap'; end if;
    for a in select ma.*,to_jsonb(m) as meter,m.register_digits,m.multiplier,m.unit,m.utility from public.meter_assignments ma join public.meters m on m.id=ma.meter_id
     where ma.site_id=s.site_id and ma.organization_id=org and ma.property_id=prop and m.utility=utility_kind and ma.starts_at<(last_day::timestamp at time zone p.timezone) and coalesce(ma.ends_at,'infinity')>(first_day::timestamp at time zone p.timezone) order by ma.starts_at,ma.id
    loop
     starts=greatest(first_day,(a.starts_at at time zone p.timezone)::date); ends=least(last_day,coalesce((a.ends_at at time zone p.timezone)::date,last_day));
     select r.id,r.captured_at,(r.captured_at at time zone p.timezone)::date as day into first_read from public.meter_readings r
      join lateral (select * from public.meter_reading_reviews v where v.reading_id=r.id order by v.created_at desc,v.id desc limit 1) v on v.decision='accepted'
      where r.assignment_id=a.id and (r.captured_at at time zone p.timezone)::date=starts and r.captured_at>=a.starts_at and r.captured_at<coalesce(a.ends_at,'infinity')
      order by case when starts=ends then r.captured_at end asc,r.captured_at desc,r.id desc limit 1;
     select r.id,r.captured_at,(r.captured_at at time zone p.timezone)::date as day into last_read from public.meter_readings r
      join lateral (select * from public.meter_reading_reviews v where v.reading_id=r.id order by v.created_at desc,v.id desc limit 1) v on v.decision='accepted'
      where r.assignment_id=a.id and (r.captured_at at time zone p.timezone)::date=ends and r.captured_at>=a.starts_at and r.captured_at<coalesce(a.ends_at,'infinity')
      order by r.captured_at desc,r.id desc limit 1;
     if first_read.id is null or last_read.id is null or first_read.captured_at>=last_read.captured_at then raise exception 'approved_boundary_readings_required'; end if;
     if exists(select 1 from public.meter_readings r left join lateral (select * from public.meter_reading_reviews v where v.reading_id=r.id order by v.created_at desc,v.id desc limit 1) v on true where r.assignment_id=a.id and r.captured_at between first_read.captured_at and last_read.captured_at and v.id is null) then raise exception 'unreviewed_reading'; end if;
     has_prior=false;
     for rd in select r.*,v.id as review_id,coalesce(v.corrected_value,r.value)::numeric as effective_value,to_jsonb(v) as review,(r.captured_at at time zone p.timezone)::date as day,
       (select to_jsonb(o) from private.meter_reading_occupancy o where o.reading_id=r.id) as occupancy
      from public.meter_readings r join lateral (select * from public.meter_reading_reviews v where v.reading_id=r.id order by v.created_at desc,v.id desc limit 1) v on v.decision='accepted'
      where r.assignment_id=a.id and r.captured_at between first_read.captured_at and last_read.captured_at order by r.captured_at,r.id
     loop
      if rd.effective_value is null then raise exception 'approved_boundary_readings_required'; end if;
      if rd.kind='estimated' and not coalesce((input->>'accept_estimates')::boolean,false) then raise exception 'estimated_reading_acknowledgement'; end if;
      if not reading_ids @> jsonb_build_array(rd.id::text) then reading_ids=reading_ids||jsonb_build_array(rd.id::text); end if;
      if has_prior then
       if prior.captured_at=rd.captured_at then raise exception 'reading_time_conflict'; end if;
       select * into plan from public.utility_rate_plans r where r.property_id=prop and r.utility=utility_kind and r.status='active' and r.starts_on<=prior.day and coalesce(r.ends_on,'infinity'::date)>prior.day;
       if plan.id is null or (plan.ends_on is not null and rd.day>plan.ends_on) then raise exception 'rate_boundary_reading_required'; end if;
       -- An interval belongs to this stay; the closing capture may fall on the next occupant's arrival date.
       if prior.day<s.starts_on or rd.day>coalesce(s.ends_on,last_day) then raise exception 'occupancy_billing_conflict'; end if;
       ev=null;
       if rd.flag in ('reset','rollover') then
        select * into ev from public.meter_register_events e where e.reading_id=rd.id and e.review_id=rd.review_id and e.status='active' and e.kind=rd.flag;
        if ev.id is null then raise exception 'register_event_required'; end if;
        if rd.flag='rollover' then delta=power(10::numeric,a.register_digits)*ev.rollover_count-prior.effective_value+rd.effective_value;
        else
         if ev.before_value::numeric<prior.effective_value or ev.after_value::numeric>rd.effective_value or ev.before_value::numeric>=power(10::numeric,a.register_digits) or ev.after_value::numeric>=power(10::numeric,a.register_digits) then raise exception 'invalid_register_event'; end if;
         delta=(ev.before_value::numeric-prior.effective_value)+(rd.effective_value-ev.after_value::numeric);
        end if;
       else delta=rd.effective_value-prior.effective_value; end if;
       if delta<0 then raise exception 'register_event_required'; end if;
       select (c->>'factor')::numeric into factor from jsonb_array_elements(plan.conversions) c where c->>'unit'=a.unit;
       if factor is null then raise exception 'unit_conversion_required'; end if;
       quantity=delta*a.multiplier::numeric*factor;
       segments=segments||jsonb_build_array(jsonb_build_object('utility',utility_kind,'rate_id',plan.id,'assignment_id',a.id,'meter',a.meter,'from_reading',to_jsonb(prior)||jsonb_build_object('effective_value',prior.effective_value::text),'to_reading',to_jsonb(rd)||jsonb_build_object('effective_value',rd.effective_value::text),'register_event',to_jsonb(ev),'delta',trim_scale(delta)::text,'multiplier',a.multiplier,'conversion_factor',factor::text,'quantity',trim_scale(quantity)::text,'unit',plan.billed_unit));
      end if;
      prior=rd; has_prior=true;
     end loop;
     claims=claims||jsonb_build_array(jsonb_build_object('assignment_id',a.id,'starts_at',first_read.captured_at,'ends_at',last_read.captured_at));
    end loop;
   end if;
   -- Tiers reset once per invoice and rate version, aggregating all assigned meters.
   for plan in select * from public.utility_rate_plans r where r.property_id=prop and r.utility=utility_kind and r.status='active' and r.starts_on<last_day and coalesce(r.ends_on,'infinity'::date)>first_day order by r.starts_on,r.id loop
    rate_ids=rate_ids||jsonb_build_array(plan.id::text);
    select coalesce(sum((x->>'quantity')::numeric),0),coalesce(jsonb_agg(x order by x->>'assignment_id',x->'from_reading'->>'captured_at'),'[]'::jsonb) into usage,src from jsonb_array_elements(segments) x where x->>'rate_id'=plan.id::text;
    -- 377580 is the LCM of all possible calendar month lengths (28,29,30,31).
    select sum(377580::numeric/extract(day from (date_trunc('month',greatest(first_day,plan.starts_on)+n)+interval '1 month - 1 day'))) into base_weight from generate_series(0,least(last_day,coalesce(plan.ends_on,last_day))-greatest(first_day,plan.starts_on)-1) n;
    base_fraction=base_weight/377580;
    charge=0; remaining=usage; lower_bound=0; tier_details='[]';
    for tier in select value from jsonb_array_elements(plan.tiers) loop
     upper_bound=(tier->>'up_to')::numeric;
     taken=least(remaining,coalesce(upper_bound-lower_bound,remaining));
     if taken>0 then
      charge=charge+taken*(tier->>'unit_price')::numeric*100;
      tier_details=tier_details||jsonb_build_array(jsonb_build_object('from',lower_bound::text,'up_to',tier->>'up_to','quantity',taken::text,'unit_price',tier->>'unit_price','unrounded_cents',(taken*(tier->>'unit_price')::numeric*100)::text));
     end if;
     remaining=remaining-taken; lower_bound=coalesce(upper_bound,lower_bound);
    end loop;
    lines=lines||jsonb_build_array(private.billing_line(utility_kind,initcap(utility_kind)||case when plan.included_in_rent then ' included in rent' else ' usage' end,trim_scale(usage)::text,plan.billed_unit,charge,plan.tax_bps,jsonb_build_object('rate',to_jsonb(plan),'tiers',tier_details,'segments',src,'tier_basis','per_invoice_rate_version')));
    if plan.monthly_base_cents>0 then lines=lines||jsonb_build_array(private.billing_line(utility_kind,initcap(utility_kind)||' base service',base_fraction::text,'month fraction',private.billing_round_ratio(plan.monthly_base_cents*base_weight,377580),plan.tax_bps,jsonb_build_object('rate',to_jsonb(plan),'starts_on',greatest(first_day,plan.starts_on),'ends_on',least(last_day,coalesce(plan.ends_on,last_day)),'proration','actual_calendar_days'))); end if;
    if utility_kind='water' and (plan.sewer_base_cents>0 or plan.sewer_unit_price::numeric>0) then lines=lines||jsonb_build_array(private.billing_line('sewer','Approved sewer service',usage::text,plan.billed_unit,private.billing_round_ratio(usage*plan.sewer_unit_price::numeric*100*377580+plan.sewer_base_cents*base_weight,377580),plan.tax_bps,jsonb_build_object('rate',to_jsonb(plan),'month_fraction',base_fraction::text,'segments',src))); end if;
   end loop;
  end loop;
 else
  if length(trim(coalesce(input->>'utilities_reason','')))<3 then raise exception 'billing_reason_required'; end if;
 end if;
 if jsonb_typeof(input->'adjustments') is distinct from 'array' or jsonb_array_length(input->'adjustments')>20 then raise exception 'invalid_adjustment'; end if;
 for fee in select value from jsonb_array_elements(input->'adjustments') loop
  if coalesce(fee->>'kind','') not in ('fee','discount') or length(trim(coalesce(fee->>'description',''))) not between 3 and 200 or length(trim(coalesce(fee->>'reason','')))<3 or coalesce(fee->>'amount_cents','') !~ '^[0-9]{1,10}$' or coalesce((fee->>'tax_bps')::int,-1) not between 0 and 10000 then raise exception 'invalid_adjustment'; end if;
  if (fee->>'tax_bps')::int>0 and (length(trim(coalesce(fee->>'tax_label','')))=0 or length(trim(coalesce(fee->>'authorization_reference','')))<3) then raise exception 'tax_authorization_required'; end if;
  lines=lines||jsonb_build_array(private.billing_line(fee->>'kind',fee->>'description','1','adjustment',(fee->>'amount_cents')::numeric*case when fee->>'kind'='discount' then -1 else 1 end,(fee->>'tax_bps')::int,fee));
 end loop;
 select coalesce(sum((l->>'subtotal_cents')::numeric),0),coalesce(sum((l->>'tax_cents')::numeric),0),coalesce(sum((l->>'total_cents')::numeric),0) into subtotal,taxes,total from jsonb_array_elements(lines) l;
 if jsonb_array_length(lines)=0 or total<0 or total>999999999999 then raise exception 'invalid_invoice_total'; end if;
 return jsonb_build_object('currency','USD','starts_on',first_day,'ends_on',last_day,'due_on',input->>'due_on','property',jsonb_build_object('id',p.id,'name',p.name,'address',p.address,'city',p.city,'state',p.state,'postal_code',p.postal_code,'timezone',p.timezone),
  'customer',jsonb_build_object('id',customer.id,'name',trim(customer.first_name||' '||customer.last_name),'mailing_address',customer.mailing_address,'email',customer.email),'site',jsonb_build_object('id',site.id,'label',site.label),'stay',to_jsonb(s),'policy',to_jsonb(policy),
  'lines',lines,'subtotal_cents',subtotal::text,'tax_cents',taxes::text,'total_cents',total::text,'reading_ids',reading_ids,'rate_ids',rate_ids,'usage_claims',claims,'rounding','Each line rounds half away from zero to cents; tax rounds on that line subtotal.','utilities_reason',input->>'utilities_reason','rent_reason',input->>'rent_reason');
end; $$;
create function private.validate_rate(input jsonb) returns void language plpgsql set search_path='' as $$
declare entry jsonb; previous numeric=0; ceiling numeric; seen text[]='{}'; n integer=0;
begin
 if jsonb_typeof(input->'conversions') is distinct from 'array' or jsonb_array_length(input->'conversions') not between 1 and 12 or
    jsonb_typeof(input->'tiers') is distinct from 'array' or jsonb_array_length(input->'tiers') not between 1 and 12 then raise exception 'invalid_rate'; end if;
 for entry in select value from jsonb_array_elements(input->'conversions') loop
  if length(trim(coalesce(entry->>'unit',''))) not between 1 and 30 or entry->>'unit'=any(seen) or
   coalesce(entry->>'factor','') !~ '^[0-9]{1,8}(\.[0-9]{1,6})?$' then raise exception 'invalid_conversion'; end if;
  if (entry->>'factor')::numeric<=0 then raise exception 'invalid_conversion'; end if;
  seen=array_append(seen,entry->>'unit');
 end loop;
 for entry in select value from jsonb_array_elements(input->'tiers') loop
  n=n+1;
  if coalesce(entry->>'unit_price','') !~ '^[0-9]{1,7}(\.[0-9]{1,6})?$' then raise exception 'invalid_rate'; end if;
  if entry->>'up_to' is null then
   if n<>jsonb_array_length(input->'tiers') then raise exception 'invalid_tiers'; end if;
  else
   if entry->>'up_to' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then raise exception 'invalid_tiers'; end if;
   ceiling=(entry->>'up_to')::numeric;
   if ceiling<=previous or n=jsonb_array_length(input->'tiers') then raise exception 'invalid_tiers'; end if;
   previous=ceiling;
  end if;
  if (input->>'included_in_rent')::boolean and (entry->>'unit_price')::numeric<>0 then raise exception 'included_rate_nonzero'; end if;
 end loop;
 if (input->>'included_in_rent')::boolean and ((input->>'monthly_base_cents')::bigint<>0 or (input->>'sewer_base_cents')::bigint<>0 or (input->>'sewer_unit_price')::numeric<>0 or (input->>'tax_bps')::int<>0) then raise exception 'included_rate_nonzero'; end if;
end; $$;

create function private.billing_command(command text,input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=(input->>'organization_id')::uuid; prop uuid=(input->>'property_id')::uuid; op uuid=(input->>'request_id')::uuid;
 result uuid; previous private.billing_requests; invoice public.invoices; revision public.invoice_revisions; plan public.utility_rate_plans;
 event public.meter_register_events; rd public.meter_readings; review public.meter_reading_reviews; credit public.billing_ledger_entries;
 calculation jsonb; request jsonb; claim jsonb; counter bigint; reason text=trim(coalesce(input->>'reason','')); balance bigint; amount bigint;
begin
 if auth.uid() is null or not private.property_role(org,prop,array['manager','office']) then raise insufficient_privilege; end if;
 if command not in ('create_draft','refresh_draft') and not private.property_role(org,prop,array['manager']) then raise insufficient_privilege; end if;
 perform 1 from public.properties where id=prop and organization_id=org and archived_at is null and operating_status='active' for update;
 if not found then raise exception 'property_unavailable'; end if;
 if op is null then raise exception 'operation_id_required'; end if;
 select * into previous from private.billing_requests where id=op;
 if found then
  if previous.actor_id<>auth.uid() or previous.command<>command or previous.payload<>input then raise exception 'operation_conflict'; end if;
  return previous.result;
 end if;
 if command='configure_policy' then
  insert into public.billing_policies(organization_id,property_id,proration,due_days,rent_tax_bps,tax_label,authorization_reference,reason)
   values(org,prop,input->>'proration',(input->>'due_days')::int,(input->>'rent_tax_bps')::int,input->>'tax_label',input->>'authorization_reference',reason) returning id into result;
 elsif command='new_rate' then
  perform private.validate_rate(input);
  if nullif(input->>'replaces_id','') is not null then
   select * into plan from public.utility_rate_plans where id=(input->>'replaces_id')::uuid and organization_id=org and property_id=prop and utility=input->>'utility' and status='active' for update;
   if plan.id is null or (input->>'starts_on')::date<=plan.starts_on or (plan.ends_on is not null and (input->>'starts_on')::date>=plan.ends_on) then raise exception 'invalid_rate_replacement'; end if;
   if exists(select 1 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.status='approved' and v.calculation->'rate_ids' @> jsonb_build_array(plan.id::text) and i.ends_on>(input->>'starts_on')::date) then raise exception 'approved_rate_in_use'; end if;
   update public.utility_rate_plans set ends_on=(input->>'starts_on')::date where id=plan.id;
  end if;
  insert into public.utility_rate_plans(organization_id,property_id,utility,starts_on,ends_on,label,billed_unit,conversions,tiers,monthly_base_cents,sewer_unit_price,sewer_base_cents,tax_bps,tax_label,authorization_reference,included_in_rent,reason)
   values(org,prop,input->>'utility',(input->>'starts_on')::date,nullif(input->>'ends_on','')::date,input->>'label',input->>'billed_unit',input->'conversions',input->'tiers',(input->>'monthly_base_cents')::bigint,input->>'sewer_unit_price',(input->>'sewer_base_cents')::bigint,(input->>'tax_bps')::int,input->>'tax_label',input->>'authorization_reference',(input->>'included_in_rent')::boolean,reason) returning id into result;
 elsif command='void_rate' then
  select * into plan from public.utility_rate_plans where id=(input->>'rate_id')::uuid and organization_id=org and property_id=prop and status='active' for update;
  if plan.id is null or length(reason)<3 then raise exception 'invalid_rate'; end if;
  if exists(select 1 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.status='approved' and v.calculation->'rate_ids' @> jsonb_build_array(plan.id::text)) then raise exception 'approved_rate_in_use'; end if;
  update public.utility_rate_plans set status='voided',void_reason=reason where id=plan.id; result=plan.id;
 elsif command='register_event' then
  select * into rd from public.meter_readings where id=(input->>'reading_id')::uuid and organization_id=org and property_id=prop;
  select * into review from public.meter_reading_reviews where reading_id=rd.id order by created_at desc,id desc limit 1;
  if rd.id is null or rd.flag not in ('reset','rollover') or review.decision is distinct from 'accepted' or review.id is distinct from (input->>'review_id')::uuid then raise exception 'invalid_register_event'; end if;
  if exists(select 1 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.status='approved' and v.calculation->'reading_ids' @> jsonb_build_array(rd.id::text)) then raise exception 'approved_reading_in_use'; end if;
  insert into public.meter_register_events(organization_id,property_id,reading_id,review_id,kind,before_value,after_value,rollover_count,reason)
   values(org,prop,rd.id,review.id,rd.flag,nullif(input->>'before_value',''),nullif(input->>'after_value',''),nullif(input->>'rollover_count','')::int,reason) returning id into result;
 elsif command='void_event' then
  select * into event from public.meter_register_events where id=(input->>'event_id')::uuid and organization_id=org and property_id=prop and status='active' for update;
  if event.id is null or length(reason)<3 then raise exception 'invalid_register_event'; end if;
  if exists(select 1 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.status='approved' and v.calculation->'reading_ids' @> jsonb_build_array(event.reading_id::text)) then raise exception 'approved_reading_in_use'; end if;
  update public.meter_register_events set status='voided',void_reason=reason where id=event.id; result=event.id;
 elsif command in ('create_draft','refresh_draft') then
  if command='create_draft' then
   request=input-'request_id'-'organization_id'-'property_id';
   calculation=private.calculate_invoice(org,prop,request);
   insert into private.invoice_counters(property_id,next_number) values(prop,1) on conflict(property_id) do update set next_number=private.invoice_counters.next_number+1 returning next_number into counter;
   insert into public.invoices(id,organization_id,property_id,customer_id,site_id,stay_id,number,starts_on,ends_on,due_on)
    values(op,org,prop,(calculation->'customer'->>'id')::uuid,(calculation->'site'->>'id')::uuid,(request->>'stay_id')::uuid,'INV-'||lpad(counter::text,greatest(6,length(counter::text)),'0'),(request->>'starts_on')::date,(request->>'ends_on')::date,(request->>'due_on')::date) returning * into invoice;
  else
   select * into invoice from public.invoices where id=(input->>'invoice_id')::uuid and organization_id=org and property_id=prop for update;
   if invoice.id is null then raise insufficient_privilege; end if;
   if invoice.status<>'draft' or invoice.current_revision_id is distinct from (input->>'revision_id')::uuid then raise exception 'invoice_conflict'; end if;
   if length(reason)<3 then raise exception 'billing_reason_required'; end if;
   select * into revision from public.invoice_revisions where id=invoice.current_revision_id;
   request=revision.request; calculation=private.calculate_invoice(org,prop,request);
   delete from private.billing_rent_claims where invoice_id=invoice.id;
   delete from private.billing_usage_claims where invoice_id=invoice.id;
  end if;
  insert into public.invoice_revisions(organization_id,property_id,invoice_id,revision,request,calculation,total_cents,reason)
   values(org,prop,invoice.id,coalesce(revision.revision,0)+1,request,calculation,(calculation->>'total_cents')::bigint,case when command='create_draft' then 'Initial calculation' else reason end) returning id into result;
  update public.invoices set current_revision_id=result where id=invoice.id;
  if request->>'rent_mode'<>'none' then insert into private.billing_rent_claims values(invoice.id,invoice.stay_id,daterange(invoice.starts_on,invoice.ends_on,'[)')); end if;
  for claim in select value from jsonb_array_elements(calculation->'usage_claims') loop
   insert into private.billing_usage_claims(invoice_id,assignment_id,period) values(invoice.id,(claim->>'assignment_id')::uuid,tstzrange((claim->>'starts_at')::timestamptz,(claim->>'ends_at')::timestamptz,'[)'));
  end loop;
  result=invoice.id;
 elsif command in ('approve_invoice','void_invoice','credit','reverse_credit') then
  select * into invoice from public.invoices where id=(input->>'invoice_id')::uuid and organization_id=org and property_id=prop for update;
  if invoice.id is null then raise insufficient_privilege; end if;
  if length(reason)<3 then raise exception 'billing_reason_required'; end if;
  if invoice.current_revision_id is distinct from (input->>'revision_id')::uuid then raise exception 'invoice_conflict'; end if;
  select * into revision from public.invoice_revisions where id=invoice.current_revision_id;
  select coalesce(sum(amount_cents),0) into balance from public.billing_ledger_entries where invoice_id=invoice.id;
  if command='approve_invoice' then
   if invoice.status<>'draft' then raise exception 'invoice_conflict'; end if;
   calculation=private.calculate_invoice(org,prop,revision.request);
   if calculation<>revision.calculation then raise exception 'invoice_sources_changed'; end if;
   update public.invoices set status='approved',approved_by=auth.uid(),approved_at=now(),approval_reason=reason where id=invoice.id;
   insert into public.billing_ledger_entries(organization_id,property_id,customer_id,invoice_id,kind,amount_cents,reason) values(org,prop,invoice.customer_id,invoice.id,'approval',revision.total_cents,reason);
  elsif command='void_invoice' then
   if invoice.status='voided' then raise exception 'invoice_conflict'; end if;
   if invoice.status='approved' then insert into public.billing_ledger_entries(organization_id,property_id,customer_id,invoice_id,kind,amount_cents,reason) values(org,prop,invoice.customer_id,invoice.id,'void',-balance,reason); end if;
   update public.invoices set status='voided',void_reason=reason where id=invoice.id;
   delete from private.billing_rent_claims where invoice_id=invoice.id;
   delete from private.billing_usage_claims where invoice_id=invoice.id;
  elsif command='credit' then
   if invoice.status<>'approved' or coalesce(input->>'amount_cents','') !~ '^[0-9]{1,12}$' then raise exception 'invalid_credit'; end if;
   amount=(input->>'amount_cents')::bigint;
   if amount<=0 or amount>balance then raise exception 'invalid_credit'; end if;
   insert into public.billing_ledger_entries(organization_id,property_id,customer_id,invoice_id,kind,amount_cents,reason,reference) values(org,prop,invoice.customer_id,invoice.id,'credit',-amount,reason,coalesce(input->>'reference','')) returning id into result;
  else
   if invoice.status<>'approved' then raise exception 'invoice_conflict'; end if;
   select * into credit from public.billing_ledger_entries where id=(input->>'credit_id')::uuid and invoice_id=invoice.id and kind='credit';
   if credit.id is null then raise exception 'invalid_credit'; end if;
   insert into public.billing_ledger_entries(organization_id,property_id,customer_id,invoice_id,kind,amount_cents,reverses_id,reason) values(org,prop,invoice.customer_id,invoice.id,'credit_reversal',-credit.amount_cents,credit.id,reason) returning id into result;
  end if;
  result=coalesce(result,invoice.id);
 else raise exception 'unknown_command'; end if;
 insert into private.billing_requests values(op,auth.uid(),command,input,result);
 return result;
end; $$;
create function public.billing_command(command text,payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.billing_command(command,payload); $$;

-- An approved calculation cannot be changed by appending a new meter review.
-- Void the invoice first; original captures, revisions and ledger events remain intact.
create function private.guard_billed_reading() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 perform 1 from public.properties where id=new.property_id for update;
 if exists(select 1 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.property_id=new.property_id and i.status='approved' and v.calculation->'reading_ids' @> jsonb_build_array(new.reading_id::text)) then raise exception 'approved_reading_in_use'; end if;
 return new;
end; $$;
create trigger b_billed_reading before insert on public.meter_reading_reviews for each row execute function private.guard_billed_reading();

create function private.billing_sources(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'property_id',r.property_id,'review_id',v.id,'value',coalesce(v.corrected_value,r.value),'flag',r.flag,'captured_at',r.captured_at,'meter_label',m.label,'site_label',a.site_label) order by r.captured_at,r.id),'[]'::jsonb)
 from public.meter_readings r join public.meters m on m.id=r.meter_id join public.meter_assignments a on a.id=r.assignment_id
 join lateral(select * from public.meter_reading_reviews v where v.reading_id=r.id order by v.created_at desc,v.id desc limit 1) v on v.decision='accepted'
 where r.organization_id=org and r.flag in ('reset','rollover') and private.property_role(r.organization_id,r.property_id,array['manager']);
$$;
create function public.billing_sources(org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.billing_sources(org); $$;

-- One statement snapshot prevents mixing an old invoice header with a concurrent
-- approval/credit or refreshed revision. All component SELECTs retain caller RLS.
create function public.billing_statement(invoice_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('invoice',to_jsonb(i),'revision',to_jsonb(v),'ledger',coalesce((
  select jsonb_agg(to_jsonb(l) order by l.created_at,l.id) from public.billing_ledger_entries l where l.invoice_id=i.id),'[]'::jsonb))
 from public.invoices i join public.invoice_revisions v on v.id=i.current_revision_id where i.id=$1;
$$;
revoke execute on function public.billing_statement(uuid) from public,anon;
grant execute on function public.billing_statement(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['billing_policies','utility_rate_plans','meter_register_events','invoices','invoice_revisions','billing_ledger_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy billing_read on public.%I for select to authenticated using(private.property_role(organization_id,property_id,array[''manager'',''office'']))',t);
  execute format('create trigger a_stamp before insert or update on public.%I for each row execute function private.stamp_record()',t);
  execute format('create trigger z_audit after insert or update on public.%I for each row execute function private.write_audit()',t);
 end loop;
 foreach t in array array['billing_requests','invoice_counters','billing_rent_claims','billing_usage_claims'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke execute on function private.billing_line(text,text,text,text,numeric,integer,jsonb),private.validate_rate(jsonb),private.billing_round_ratio(numeric,numeric),private.calculate_invoice(uuid,uuid,jsonb),private.guard_billed_reading() from public,anon,authenticated;
revoke execute on function private.billing_command(text,jsonb),public.billing_command(text,jsonb),private.billing_sources(uuid),public.billing_sources(uuid) from public,anon;
grant execute on function private.billing_command(text,jsonb),public.billing_command(text,jsonb),private.billing_sources(uuid),public.billing_sources(uuid) to authenticated;
commit;
