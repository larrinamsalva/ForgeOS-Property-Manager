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
    await expect(asUser(db,identities.owner,(tx)=>tx.query(
      "update record_attachments set object_path='tampered' where id=$1",[attachment]))).rejects.toThrow();
    await asUser(db,identities.other,async (tx)=>{
      expect((await tx.query("select name from storage.objects where bucket_id='record-attachments' and name=$1",[path])).rows).toHaveLength(0);
    });
    const b=await foundation(db,identities.other);
    await expect(asUser(db,identities.other,(tx)=>tx.query(
      "insert into record_attachments(organization_id,property_id,customer_id,category,title,mime,byte_size,object_path) values($1,$2,$3,'document','Wrong file','image/png',8,$4)",
      [b.org,b.property,customer,'invalid/'+randomUUID()+'.png']))).rejects.toThrow();
  });
});
