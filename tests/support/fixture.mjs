// Test-only HTTP boundary: Supabase-shaped auth/REST over real PostgreSQL (PGlite).
// This is NOT a Supabase service or production auth implementation. Never deploy it.
import { createServer } from 'node:http';
import { database, asUser, identities, foundation } from './database.mjs';
const db = await database();
const port = Number(process.env.FORGEOS_FIXTURE_PORT ?? 54331);
const tableNames = [
  'organizations',
  'organization_memberships',
  'property_memberships',
  'properties',
  'sites_units',
  'customers',
  'occupancy_stays',
  'audit_events',
];
const columns = new Map();
for (const table of tableNames)
  columns.set(
    table,
    new Set(
      (
        await db.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
          [table]
        )
      ).rows.map((r) => r.column_name)
    )
  );
function user(id) {
  return {
    id,
    email: `${Object.keys(identities).find((k) => identities[k] === id)}@forgeos.example`,
    aud: 'authenticated',
    role: 'authenticated',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00Z',
  };
}
function session(id) {
  const access_token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: id,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: `http://127.0.0.1:${port}/auth/v1`,
      })
    ).toString('base64url'),
    'Zml4dHVyZS1vbmx5',
  ].join('.');
  return {
    access_token,
    refresh_token: `fixture-${id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(id),
  };
}
function uid(request) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
    return Object.values(identities).includes(id) ? id : null;
  } catch {
    return null;
  }
}
async function seed() {
  const a = await foundation(db);
  await asUser(db, identities.owner, async (tx) => {
    const apt = (
      await tx.query(
        "insert into properties(organization_id,name,category,city,state) values($1,'Pine Creek Apartments','apartments','Chico','CA') returning id",
        [a.org]
      )
    ).rows[0].id;
    await tx.query("update properties set city='Corning',state='CA' where id=$1", [a.property]);
    for (let i = 1; i <= 10; i++)
      await tx.query(
        "insert into sites_units(organization_id,property_id,label,kind,monthly_rate_cents,section,max_rv_length_ft,amperage,map_x,map_y,electric,water,sewer) values($1,$2,$3,'rv',65000,'Creekside',45,50,$4,$5,true,true,true)",
        [a.org, a.property, `RV-${String(i).padStart(2, '0')}`, (i - 1) % 5, Math.floor((i - 1) / 5)]
      );
    for (let i = 1; i <= 3; i++)
      await tx.query(
        "insert into sites_units(organization_id,property_id,label,kind,monthly_rate_cents,bedrooms,bathrooms,square_feet,map_x) values($1,$2,$3,'apartment',125000,2,1,850,$4)",
        [a.org, apt, `A-${i}`, i - 1]
      );
    const site = (
      await tx.query('select id from sites_units where property_id=$1 order by label limit 1', [a.property])
    ).rows[0].id;
    const customer = (
      await tx.query(
        "insert into customers(organization_id,property_id,first_name,last_name,email) values($1,$2,'River','Sample','river@example.com') returning id",
        [a.org, a.property]
      )
    ).rows[0].id;
    await tx.query(
      'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,agreed_rate_cents) values($1,$2,$3,$4,current_date-7,65000)',
      [a.org, a.property, site, customer]
    );
    await tx.query("select grant_property_access($1,$2,$3,'meter_technician')", [
      a.org,
      a.property,
      identities.technician,
    ]);
  });
  return a;
}
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,prefer,range,range-unit,x-supabase-api-version'
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  response.setHeader('Access-Control-Expose-Headers', 'Content-Range');
  function send(status, data, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    response.end(
      JSON.stringify(data, (key, value) =>
        ['starts_on', 'ends_on'].includes(key) && typeof value === 'string' ? value.slice(0, 10) : value
      )
    );
  }
  if (request.method === 'OPTIONS') {
    send(200, {});
    return;
  }
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const parts = url.pathname.split('/').filter(Boolean);
  let body = {};
  try {
    if (request.method === 'POST' || request.method === 'PATCH') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      if (raw) body = JSON.parse(raw);
    }
    if (url.pathname === '/health') {
      send(200, { ok: true });
      return;
    }
    if (url.pathname === '/__test/reset') {
      await db.exec('truncate public.organizations cascade');
      send(200, { ok: true });
      return;
    }
    if (url.pathname === '/__test/seed') {
      send(200, await seed());
      return;
    }
    if (parts[0] === 'auth') {
      if (parts[2] === 'token' || parts[2] === 'signup') {
        const name = String(body.email ?? '').split('@')[0];
        const id = identities[name] ?? String(body.refresh_token ?? '').replace('fixture-', '');
        if (
          !Object.values(identities).includes(id) ||
          (url.searchParams.get('grant_type') !== 'refresh_token' &&
            body.password !== 'fixture-only-password')
        ) {
          send(400, { msg: 'Invalid credentials', code: 'invalid_credentials' });
          return;
        }
        send(200, session(id));
        return;
      }
      const id = uid(request);
      if (!id) {
        send(401, { msg: 'Not authenticated' });
        return;
      }
      send(200, parts[2] === 'user' ? user(id) : {});
      return;
    }
    const id = uid(request);
    if (!id) {
      send(401, { message: 'Not authenticated', code: '42501' });
      return;
    }
    if (parts[0] !== 'rest') {
      send(404, {});
      return;
    }
    const result = await asUser(db, id, async (tx) => {
      if (parts[2] === 'rpc') {
        const name = parts[3];
        const args = {
          create_organization: ['organization_name'],
          grant_property_access: ['organization', 'property', 'member', 'member_role'],
          revoke_property_access: ['organization', 'property', 'member'],
          complete_stay: ['stay', 'departure'],
        }[name];
        if (!args) throw new Error('Unknown RPC');
        const result = await tx.query(
          `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`,
          args.map((k) => body[k])
        );
        return { rpc: true, value: name === 'create_organization' ? result.rows[0].result : null };
      }
      const table = parts[2];
      const valid = columns.get(table);
      if (!valid) throw new Error('Unknown table');
      const quote = (key) => {
        if (!valid.has(key)) throw new Error('Unknown column');
        return `"${key}"`;
      };
      const select = url.searchParams.get('select') ?? '*';
      const projection = select === '*' ? '*' : select.split(',').map(quote).join(',');
      const params = [];
      const filters = [];
      for (const [key, value] of url.searchParams)
        if (valid.has(key)) {
          if (!value.startsWith('eq.')) throw new Error('Unsupported test filter');
          params.push(value.slice(3));
          filters.push(`${quote(key)}=$${params.length}`);
        }
      const where = filters.length ? ` where ${filters.join(' and ')}` : '';
      if (request.method === 'POST') {
        const entries = Object.entries(body);
        const values = entries.map(([, v]) => v);
        return tx.query(
          `insert into public.${table}(${entries.map(([k]) => quote(k)).join(',')}) values(${values.map((_, i) => `$${i + 1}`).join(',')}) returning ${projection}`,
          values
        );
      }
      if (request.method === 'PATCH') {
        const sets = Object.entries(body).map(([key, value]) => {
          params.push(value);
          return `${quote(key)}=$${params.length}`;
        });
        return tx.query(
          `update public.${table} set ${sets.join(',')} ${where} returning ${projection}`,
          params
        );
      }
      const [orderColumn, direction] = (url.searchParams.get('order') ?? 'id.asc').split('.');
      const order = ` order by ${quote(orderColumn)} ${direction === 'desc' ? 'desc' : 'asc'}`;
      const limit = Math.max(0, Math.min(1000, Number(url.searchParams.get('limit') ?? 1000) || 1000));
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset') ?? 0) || 0));
      return tx.query(
        `select ${projection} from public.${table}${where}${order} limit ${limit} offset ${offset}`,
        params
      );
    });
    if (result.rpc) {
      send(200, result.value);
      return;
    }
    if (request.headers.accept?.includes('vnd.pgrst.object')) {
      if (result.rows.length !== 1) {
        send(406, { message: 'Expected one row', code: 'PGRST116' });
        return;
      }
      send(200, result.rows[0]);
    } else send(200, result.rows, { 'Content-Range': `0-${Math.max(0, result.rows.length - 1)}/*` });
  } catch (error) {
    send(400, { message: error.message, code: error.code ?? 'TEST_FIXTURE_ERROR' });
  }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`ForgeOS test fixture ready on ${port}\n`));
async function close() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
