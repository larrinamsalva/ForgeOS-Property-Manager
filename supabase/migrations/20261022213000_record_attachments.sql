-- Secure mobile/tablet photos & scanned documents attached to a customer and/or space.
-- All file bytes remain in a private Supabase Storage bucket; no public URLs.
begin;

create table public.record_attachments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 property_id uuid not null,
 customer_id uuid,
 site_id uuid,
 category text not null check (category in ('space','car','rv','motorcycle','offroad','boat','inspection','document','other')),
 title text not null check (length(trim(title)) between 1 and 160),
 mime text not null check (mime in ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size integer not null check (byte_size between 1 and 5242880),
 object_path text not null unique check (length(object_path) between 10 and 450),
 status text not null default 'pending' check (status in ('pending','uploaded','deleting','deleted')),
 deleted_by uuid references auth.users(id),
 deleted_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 constraint record_attachment_target_required check (customer_id is not null or site_id is not null),
 foreign key (organization_id,property_id) references public.properties(organization_id,id),
 foreign key (organization_id,property_id,customer_id) references public.customers(organization_id,property_id,id),
 foreign key (organization_id,property_id,site_id) references public.sites_units(organization_id,property_id,id)
);
create index record_attachments_customer_idx on public.record_attachments(property_id,customer_id,created_at desc) where status='uploaded';
create index record_attachments_site_idx on public.record_attachments(property_id,site_id,created_at desc) where status='uploaded';
create index record_attachments_creator_idx on public.record_attachments(created_by,created_at desc);

alter table public.record_attachments enable row level security;
revoke all on public.record_attachments from anon;
grant select,insert,update on public.record_attachments to authenticated;

create policy record_attachment_read on public.record_attachments for select to authenticated
 using (private.property_role(organization_id,property_id,array['manager','office']));
create policy record_attachment_insert on public.record_attachments for insert to authenticated
 with check (private.property_role(organization_id,property_id,array['manager','office']) and created_by=(select auth.uid()) and status='pending');
create policy record_attachment_update on public.record_attachments for update to authenticated
 using (private.property_role(organization_id,property_id,array['manager','office']) and created_by=(select auth.uid()) and status='pending')
 with check (private.property_role(organization_id,property_id,array['manager','office']) and created_by=(select auth.uid()) and status='uploaded');
-- Authorized staff can withdraw any photo attached to their property, regardless of uploader.
-- The row stays as a tombstone for audit; bytes must be removed by Storage API.
create policy record_attachment_delete_transition on public.record_attachments for update to authenticated
 using (private.property_role(organization_id,property_id,array['manager','office']) and status in ('uploaded','deleting'))
 with check (private.property_role(organization_id,property_id,array['manager','office']) and status in ('deleting','deleted'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('record-attachments','record-attachments',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);

-- A private function used only by storage RLS. It does not expose records to anon.
create function private.record_attachment_storage_access(object_name text, writing boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists (
   select 1 from public.record_attachments f
   where f.object_path=object_name
     and private.property_role(f.organization_id,f.property_id,array['manager','office'])
     and (case when writing
           then f.status='pending' and f.created_by=(select auth.uid())
           else f.status in ('uploaded','deleting') or (f.status='pending' and f.created_by=(select auth.uid()))
          end)
 );
$$;
revoke all on function private.record_attachment_storage_access(text,boolean) from public;
grant execute on function private.record_attachment_storage_access(text,boolean) to authenticated;

create policy forgeos_record_attachment_insert on storage.objects for insert to authenticated
 with check (bucket_id='record-attachments' and private.record_attachment_storage_access(name,true));
create policy forgeos_record_attachment_select on storage.objects for select to authenticated
 using (bucket_id='record-attachments' and private.record_attachment_storage_access(name,false));

-- Storage.remove() is the ONLY way to remove the physical object; never DELETE files by SQL.
-- It is permitted only after the authorized user has transitioned metadata to 'deleting'.
create function private.record_attachment_storage_delete(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists (
   select 1 from public.record_attachments f
   where f.object_path = object_name and f.status='deleting'
     and private.property_role(f.organization_id,f.property_id,array['manager','office'])
 );
$$;
revoke all on function private.record_attachment_storage_delete(text) from public;
grant execute on function private.record_attachment_storage_delete(text) to authenticated;
create policy forgeos_record_attachment_remove on storage.objects for delete to authenticated
 using (bucket_id='record-attachments' and private.record_attachment_storage_delete(name));

-- Metadata integrity: a "saved" photo must really exist in private storage.
create function private.guard_record_attachment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if TG_OP='INSERT' then
   if new.created_by is distinct from auth.uid() or new.status <> 'pending'
      or new.uploaded_at is not null or new.deleted_at is not null or new.deleted_by is not null then
      raise insufficient_privilege;
   end if;
   if not private.property_role(new.organization_id,new.property_id,array['manager','office']) then
      raise insufficient_privilege;
   end if;
   return new;
 end if;
 -- Immutable identity, tenancy, attachments and original upload metadata.
 if new.id<>old.id or new.organization_id<>old.organization_id or new.property_id<>old.property_id
   or new.customer_id is distinct from old.customer_id or new.site_id is distinct from old.site_id
   or new.object_path<>old.object_path or new.created_by<>old.created_by
   or new.created_at<>old.created_at or new.category<>old.category
   or new.title<>old.title or new.mime<>old.mime or new.byte_size<>old.byte_size
   or new.uploaded_at is distinct from old.uploaded_at
   or new.deleted_at is distinct from old.deleted_at
   or new.deleted_by is distinct from old.deleted_by then
   raise insufficient_privilege;
 end if;
 if not private.property_role(new.organization_id,new.property_id,array['manager','office']) then
   raise insufficient_privilege;
 end if;
 if old.status='pending' and new.status='uploaded' and old.created_by=auth.uid() then
   if not exists (
     select 1 from storage.objects so
     where so.bucket_id='record-attachments' and so.name=new.object_path
       and (so.metadata->>'size')::bigint=new.byte_size
       and so.metadata->>'mimetype'=new.mime
   ) then raise exception 'attachment_missing'; end if;
   new.uploaded_at=now();
 elsif old.status='uploaded' and new.status='deleting' then
   new.deleted_by=auth.uid();
 elsif old.status='deleting' and new.status='deleting' then
   -- Another authorized staff member may retry interrupted Storage API deletion.
   null;
 elsif old.status='deleting' and new.status='deleted' then
   -- Do not claim a permanent deletion until the Storage API removed the bytes.
   if exists (select 1 from storage.objects so
       where so.bucket_id='record-attachments' and so.name=new.object_path) then
     raise exception 'attachment_still_present';
   end if;
   new.deleted_at=now();
 else
   raise insufficient_privilege;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_record_attachment() from public;
create trigger record_attachment_guard before insert or update on public.record_attachments
 for each row execute function private.guard_record_attachment();

commit;
