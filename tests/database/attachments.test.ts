import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { database, foundation, asUser, identities } from '../support/database.mjs';

let db: PGlite;
beforeAll(async () => { db=await database(); });
afterAll(async () => { await db?.close(); });

describe('paperless customer and property photo RLS', () => {
  it('keeps linked photos private, validates same-property targets and requires a real storage object', async () => {
    const a=await foundation(db);
    const {customer,site}=await asUser(db,identities.owner, async (tx)=>{
      await tx.query("select grant_property_access($1,$2,$3,'office')",[a.org,a.property,identities.office]);
      await tx.query("select grant_property_access($1,$2,$3,'maintenance')",[a.org,a.property,identities.technician]);
      const c=(await tx.query<{id:string}>(
        "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Sample','Resident') returning id",
        [a.org,a.property])).rows[0].id;
      const s=(await tx.query<{id:string}>(
        "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'RV-12','rv') returning id",
        [a.org,a.property])).rows[0].id;
      return {customer:c,site:s};
    });
    const path=[a.org,a.property,'customer',customer,randomUUID()+'.png'].join('/');
    const attachment=(await asUser(db,identities.owner,async (tx)=>(
      await tx.query<{id:string}>(
        `insert into record_attachments(organization_id,property_id,customer_id,site_id,category,title,mime,byte_size,object_path)
          values($1,$2,$3,$4,'rv','Sample vehicle image','image/png',8,$5) returning id`,
        [a.org,a.property,customer,site,path]
      )).rows[0].id
    ));
    console.info('attachment-test: metadata created');
    await asUser(db,identities.office,async (tx)=>{
      expect((await tx.query('select id from record_attachments where id=$1',[attachment])).rows).toHaveLength(1);
    });
    await asUser(db,identities.technician,async (tx)=>{
      expect((await tx.query('select id from record_attachments where id=$1',[attachment])).rows).toHaveLength(0);
    });
    await asUser(db,identities.other,async (tx)=>{
      expect((await tx.query('select id from record_attachments where id=$1',[attachment])).rows).toHaveLength(0);
    });
    await expect(asUser(db,identities.owner,(tx)=>tx.query(
      "update record_attachments set status='uploaded' where id=$1",[attachment]))).rejects.toThrow('attachment_missing');
    await expect(asUser(db,identities.other,(tx)=>tx.query(
      "insert into storage.objects(bucket_id,name,metadata) values('record-attachments',$1,'{}'::jsonb)",[path]))).rejects.toThrow();
    await asUser(db,identities.owner,async (tx)=>{
      await tx.query(
        "insert into storage.objects(bucket_id,name,metadata) values('record-attachments',$1,$2::jsonb)",
        [path,JSON.stringify({size:8,mimetype:'image/png'})]
      );
      await tx.query("update record_attachments set status='uploaded' where id=$1",[attachment]);
      const result=await tx.query<{status:string}>("select status from record_attachments where id=$1",[attachment]);
      expect(result.rows[0].status).toBe('uploaded');
    });
    console.info('attachment-test: uploaded object finalized');
    // Uploaded metadata is immutable: UPDATE is denied by RLS, which correctly affects zero rows.
    const attempted = await asUser(db,identities.owner,(tx)=>tx.query(
      "update record_attachments set object_path='tampered' where id=$1 returning id",[attachment]));
    expect(attempted.rows).toHaveLength(0);
    const originalPath = (await db.query<{object_path:string}>(
      'select object_path from record_attachments where id=$1',[attachment]
    )).rows[0].object_path;
    expect(originalPath).toBe(path);
    await asUser(db,identities.other,async (tx)=>{
      expect((await tx.query("select name from storage.objects where bucket_id='record-attachments' and name=$1",[path])).rows).toHaveLength(0);
    });
    console.info('attachment-test: privacy checks passed');
    // Simulates Storage.remove() at SQL level in isolated PGlite only; production always uses Storage API.
    await expect(asUser(db,identities.owner,(tx)=>tx.query(
      "delete from record_attachments where id=$1",[attachment]
    ))).rejects.toThrow();
    const unauthorized=await asUser(db,identities.technician,(tx)=>tx.query(
      "update record_attachments set status='deleting' where id=$1 returning id",[attachment]));
    expect(unauthorized.rows).toHaveLength(0);
    console.info('attachment-test: begin delete transition');
    await asUser(db,identities.office,async (tx)=>{
      const started=await tx.query<{status:string,deleted_by:string,deleted_at:string|null}>(
        "update record_attachments set status='deleting' where id=$1 returning status,deleted_by,deleted_at",[attachment]);
      expect(started.rows[0].status).toBe('deleting');
      expect(started.rows[0].deleted_by).toBe(identities.office);
      expect(started.rows[0].deleted_at).toBeNull();
    });
    console.info('attachment-test: marked deleting');
    await expect(asUser(db,identities.office,(tx)=>tx.query(
      "update record_attachments set status='deleted' where id=$1",[attachment]))).rejects.toThrow('attachment_still_present');
    const unauthorizedStorage=await asUser(db,identities.technician,(tx)=>tx.query(
      "delete from storage.objects where bucket_id='record-attachments' and name=$1 returning name",[path]));
    expect(unauthorizedStorage.rows).toHaveLength(0);
    console.info('attachment-test: storage delete authorization checked');
    // PGlite has no file bytes; deleting this fixture metadata row simulates the Storage API.
    await asUser(db,identities.office,async (tx)=>{
      const removed=await tx.query(
        "delete from storage.objects where bucket_id='record-attachments' and name=$1 returning name",[path]);
      expect(removed.rows).toHaveLength(1);
      const done=await tx.query<{status:string,deleted_at:string|null}>(
        "update record_attachments set status='deleted' where id=$1 returning status,deleted_at",[attachment]);
      expect(done.rows[0].status).toBe('deleted');
      expect(done.rows[0].deleted_at).toBeTruthy();
    });
    console.info('attachment-test: object removed and tombstoned');
    const tombstone=await db.query<{status:string,deleted_by:string}>(
      'select status,deleted_by from record_attachments where id=$1',[attachment]);
    expect(tombstone.rows).toEqual([{status:'deleted',deleted_by:identities.office}]);
    const noRepeat=await asUser(db,identities.owner,(tx)=>tx.query(
      "update record_attachments set status='deleting' where id=$1 returning id",[attachment]));
    expect(noRepeat.rows).toHaveLength(0);
    const b=await foundation(db,identities.other);
    await expect(asUser(db,identities.other,(tx)=>tx.query(
      "insert into record_attachments(organization_id,property_id,customer_id,category,title,mime,byte_size,object_path) values($1,$2,$3,'document','Wrong file','image/png',8,$4)",
      [b.org,b.property,customer,'invalid/'+randomUUID()+'.png']))).rejects.toThrow();
  });
});
