import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFile, readdir } from 'node:fs/promises';
export const identities = {
  owner: '10000000-0000-4000-8000-000000000001',
  other: '10000000-0000-4000-8000-000000000002',
  office: '10000000-0000-4000-8000-000000000003',
  technician: '10000000-0000-4000-8000-000000000004',
  manager: '10000000-0000-4000-8000-000000000005',
  maintenance: '10000000-0000-4000-8000-000000000006',
  resident: '10000000-0000-4000-8000-000000000007',
  resident2: '10000000-0000-4000-8000-000000000008',
};
export async function database() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,owner_id text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert on storage.objects to authenticated;`);
  for (const [name, id] of Object.entries(identities))
    await db.query('insert into auth.users values($1,$2)', [id, `${name}@forgeos.example`]);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).sort())
    if (file.endsWith('.sql')) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  return db;
}
/** @template T
 * @param {import('@electric-sql/pglite').PGlite} db
 * @param {string} id
 * @param {(tx: import('@electric-sql/pglite').Transaction)=>Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function asUser(db, id, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
}
export async function foundation(db, user = identities.owner) {
  return asUser(db, user, async (tx) => {
    const org = String(
      (await tx.query("select public.create_organization('Pine Creek Operations') as id")).rows[0].id
    );
    const property = String(
      (
        await tx.query(
          "insert into public.properties(organization_id,name,category) values($1,'Pine Creek RV Park','rv_park') returning id",
          [org]
        )
      ).rows[0].id
    );
    return { org, property };
  });
}
