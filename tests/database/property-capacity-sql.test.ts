import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';

// Disposable PostgreSQL-compatible engine, generated records and isolated test schema.
// This is a relational query baseline, not a production Supabase/RLS load benchmark.
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table test_sites(id integer primary key, label text not null);
    create table test_residents(id integer primary key, site_id integer not null references test_sites(id), name text not null);
    create index residents_by_site on test_residents(site_id);
    create table test_invoices(id integer primary key, resident_id integer not null references test_residents(id),
      outstanding_cents bigint not null);
    create index invoices_by_resident on test_invoices(resident_id);
    create table test_work_orders(id integer primary key, site_id integer not null references test_sites(id),
      status text not null);
    create index work_by_site on test_work_orders(site_id);
    create table test_readings(id integer primary key, site_id integer not null references test_sites(id),
      utility text not null, measured integer not null);
    create index readings_by_site on test_readings(site_id, id desc);
    insert into test_sites select n, 'RV-' || n from generate_series(1,700) n;
    insert into test_residents select n,n,'Synthetic resident ' || n from generate_series(1,700) n;
    insert into test_invoices select n,n,case when n%5=0 then 75000 else 0 end
      from generate_series(1,700) n;
    insert into test_work_orders select n,((n-1)%700)+1,
      case when n%3=0 then 'completed' else 'open' end from generate_series(1,1400) n;
    insert into test_readings select n,((n-1)%700)+1,
      (array['electric','water','gas'])[((n-1)%3)+1],1000+n
      from generate_series(1,6300) n;
    analyze;
  `);
}, 30000);
afterAll(async () => { await db?.close(); });

describe('700-space disposable SQL query baseline', () => {
  it('loads 700 residents and 140 overdue invoice rows through indexed relations', async () => {
    const started = performance.now();
    const response = await db.query<{ residents: number; overdue: number }>(`
      select count(distinct r.id)::int as residents,
        count(distinct i.id) filter (where i.outstanding_cents>0)::int as overdue
      from test_sites s join test_residents r on r.site_id=s.id
      join test_invoices i on i.resident_id=r.id
    `);
    console.info('Synthetic SQL resident and overdue lookup:',(performance.now()-started).toFixed(1),'ms');
    expect(response.rows[0]).toEqual({residents:700,overdue:140});
  });
  it('retrieves an individual resident ledger and site maintenance records', async () => {
    const started = performance.now();
    const ledger=await db.query<{ id:number; name:string; outstanding_cents:string }>(`
      select s.id,r.name,i.outstanding_cents::text from test_sites s
      join test_residents r on r.site_id=s.id
      join test_invoices i on i.resident_id=r.id where s.id=$1
    `,[88]);
    const repairs=await db.query<{status:string}>(`
      select status from test_work_orders where site_id=$1 order by id
    `,[88]);
    console.info('Synthetic SQL site 88 lookup:',(performance.now()-started).toFixed(1),'ms');
    expect(ledger.rows[0]).toEqual({id:88,name:'Synthetic resident 88',outstanding_cents:'0'});
    expect(repairs.rows).toHaveLength(2);
  });
  it('stores and queries 6,300 synthetic meter readings without crossing sites',async()=>{
    const count=await db.query<{ count:number }>('select count(*)::int as count from test_readings');
    const started=performance.now();
    const records=await db.query<{site_id:number;utility:string}>(`
      select site_id,utility from test_readings where site_id=$1 order by id desc limit 50
    `,[88]);
    console.info('Synthetic SQL 6,300-reading site query:',(performance.now()-started).toFixed(1),'ms');
    expect(count.rows[0].count).toBe(6300);
    expect(records.rows).toHaveLength(9);
    expect(records.rows.every(row=>row.site_id===88)).toBe(true);
    expect(new Set(records.rows.map(row=>row.utility))).toEqual(new Set(['electric','water','gas']));
  });
});
