// Test-only HTTP boundary: Supabase-shaped auth/REST over real PostgreSQL (PGlite).
// This is NOT a Supabase service or production auth implementation. Never deploy it.
import { createServer } from 'node:http';
import { database, asUser, identities, foundation } from './database.mjs';
const db = await database();
const storageBytes = new Map();
let failPhotoUploads = 0;
const port = Number(process.env.FORGEOS_FIXTURE_PORT ?? 54331);
const tableNames = [
  'organizations',
  'organization_memberships',
  'property_memberships',
  'properties',
  'sites_units',
  'customers',
  'occupancy_stays',
  'reservations',
  'lease_terms',
  'audit_events',
  'meters',
  'meter_assignments',
  'meter_routes',
  'meter_route_items',
  'meter_readings',
  'meter_reading_reviews',
  'meter_photos',
  'meter_sync_conflicts',
  'meter_conflict_resolutions',
  'billing_policies',
  'utility_rate_plans',
  'meter_register_events',
  'invoices',
  'invoice_revisions',
  'billing_ledger_entries',
  'collection_policies',
  'invoice_issues',
  'manual_payments',
  'payment_events',
  'deposit_accounts',
  'deposit_events',
  'collection_receipts',
  'late_fee_assessments',
  'late_fee_waivers',
  'account_notes',
  'reconciliations',
  'reconciliation_voids',
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
    const signedToken = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('token');
    if (
      signedToken?.startsWith('fixture-signed-') &&
      request.url.startsWith('/storage/v1/object/authenticated/')
    ) {
      const signedId = signedToken.slice(15);
      return Object.values(identities).includes(signedId) ? signedId : null;
    }
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
  return {
    ...a,
    customerId: (
      await db.query('select id from customers where property_id=$1 order by id limit 1', [a.property])
    ).rows[0].id,
    stayId: (
      await db.query('select id from occupancy_stays where property_id=$1 order by id limit 1', [a.property])
    ).rows[0].id,
    siteIds: (
      await db.query('select id from sites_units where property_id=$1 order by label limit 2', [a.property])
    ).rows.map((r) => r.id),
  };
}
// Test clock simulation only. Both captures and reviews below use the production RPCs.
async function billingBaseline() {
  const property = (
    await db.query(
      "select id,organization_id from properties where name='Pine Creek RV Park' order by id limit 1"
    )
  ).rows[0];
  const site = (
    await db.query('select id from sites_units where property_id=$1 order by label limit 1', [property.id])
  ).rows[0].id;
  const scope = { organization_id: property.organization_id, property_id: property.id };
  const date = (value) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  const captured = new Date(Date.now() - 86400000).toISOString();
  const starts = date(new Date(captured));
  const ends = date(new Date());
  const until = date(new Date(Date.now() + 86400000));
  const command = (action, payload) =>
    asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query('select meter_command($1,$2::jsonb) as id', [
            action,
            JSON.stringify({ ...scope, ...payload }),
          ])
        ).rows[0].id
    );
  const meter = await command('new_meter', {
    label: 'Billing electric meter',
    utility: 'electric',
    serial_number: 'TEST-BILLING-ELECTRIC',
    unit: 'kWh',
    register_digits: 6,
    multiplier: '1',
    max_delta: null,
    installed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    notes: 'Fictional billing test',
  });
  const assignment = await command('new_assignment', {
    meter_id: meter,
    site_id: site,
    starts_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  });
  const baselineRoute = await command('new_route', {
    label: 'Prior test day',
    assigned_to: identities.owner,
    starts_on: starts,
    ends_on: until,
    cadence: 'custom',
    assignments: [assignment],
  });
  await db.transaction(async (tx) => {
    await tx.exec('set local session_replication_role=replica');
    await tx.query('update meter_routes set created_at=$1 where id=$2', [captured, baselineRoute]);
  });
  const item = (await db.query('select id from meter_route_items where route_id=$1', [baselineRoute])).rows[0]
    .id;
  const payload = {
    ...scope,
    id: crypto.randomUUID(),
    route_item_id: item,
    assignment_id: assignment,
    captured_at: captured,
    device_id: crypto.randomUUID(),
    previous_reading_id: null,
    previous_review_id: null,
    value: '10000',
    kind: 'actual',
    flag: 'none',
    notes: 'Fictional previous reading',
    photo: null,
  };
  const reading = await asUser(
    db,
    identities.owner,
    async (tx) =>
      (await tx.query('select submit_meter_reading($1::jsonb) as id', [JSON.stringify(payload)])).rows[0].id
  );
  const review = await command('review', {
    reading_id: reading,
    previous_review_id: null,
    decision: 'accepted',
    corrected_value: null,
    reason: 'Prior test day evidence verified',
  });
  const route = await command('new_route', {
    label: 'Closing billing route',
    assigned_to: identities.owner,
    starts_on: ends,
    ends_on: until,
    cadence: 'custom',
    assignments: [assignment],
  });
  const closingItem = (await db.query('select id from meter_route_items where route_id=$1', [route])).rows[0]
    .id;
  return { scope, assignment, reading, review, closingItem, starts, ends };
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
        [
          'starts_on',
          'ends_on',
          'planned_ends_on',
          'due_on',
          'issued_on',
          'received_on',
          'effective_on',
          'assessed_on',
          'follow_up_on',
          'promised_on',
        ].includes(key) && typeof value === 'string'
          ? value.slice(0, 10)
          : value
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
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      let raw = Buffer.concat(chunks).toString(
        parts[0] === 'storage' && parts[2] === 'object' && !parts.includes('sign') ? 'base64' : 'utf8'
      );
      if (parts[0] === 'storage' && parts[2] === 'object' && !parts.includes('sign'))
        body = Buffer.from(raw, 'base64');
      else if (raw) body = JSON.parse(raw);
    }
    if (url.pathname === '/health') {
      send(200, { ok: true });
      return;
    }
    if (url.pathname === '/__test/reset') {
      await db.exec('truncate public.organizations cascade');
      await db.exec('truncate storage.objects');
      storageBytes.clear();
      failPhotoUploads = 0;
      send(200, { ok: true });
      return;
    }
    if (url.pathname === '/__test/fail-photo') {
      failPhotoUploads = Number(body.count ?? 1);
      send(200, { ok: true });
      return;
    }
    if (url.pathname === '/__test/billing-baseline') {
      send(200, await billingBaseline());
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
    if (parts[0] === 'storage') {
      const isSign = parts[3] === 'sign';
      const authenticatedObject = parts[3] === 'authenticated';
      const start = isSign || authenticatedObject ? 5 : 4;
      const bucket = parts[isSign || authenticatedObject ? 4 : 3];
      const path = parts.slice(start).join('/');
      if (bucket !== 'meter-photos') {
        send(404, {});
        return;
      }
      if (isSign) {
        const rows = await asUser(db, id, (tx) =>
          tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, path])
        );
        if (!rows.rows.length) {
          send(403, { message: 'Denied' });
          return;
        }
        send(200, { signedURL: `/object/authenticated/meter-photos/${path}?token=fixture-signed-${id}` });
        return;
      }
      const readPath = parts[3] === 'authenticated' ? parts.slice(5).join('/') : path;
      if (request.method === 'GET') {
        const rows = await asUser(db, id, (tx) =>
          tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [
            'meter-photos',
            readPath,
          ])
        );
        const stored = storageBytes.get(readPath);
        if (!rows.rows.length || !stored) {
          send(404, { message: 'Not found' });
          return;
        }
        response.writeHead(200, { 'Content-Type': stored.mime });
        response.end(stored.bytes);
        return;
      }
      if (request.method === 'POST') {
        if (failPhotoUploads > 0) {
          failPhotoUploads--;
          send(503, { message: 'Simulated photo interruption' });
          return;
        }
        const mime = request.headers['content-type'];
        await asUser(db, id, (tx) =>
          tx.query(
            'insert into storage.objects(bucket_id,name,metadata,owner_id) values($1,$2,$3::jsonb,$4)',
            ['meter-photos', path, JSON.stringify({ size: body.length, mimetype: mime }), id]
          )
        );
        storageBytes.set(path, { bytes: body, mime });
        send(200, { Key: `meter-photos/${path}`, Id: 'fixture-photo' });
        return;
      }
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
          check_in_reservation: ['booking', 'arrival', 'details'],
          complete_stay_checklist: ['stay', 'departure', 'details'],
          change_stay_plan: ['stay', 'departure', 'reason'],
          transfer_stay: ['stay', 'destination', 'transfer_on', 'rate_cents', 'reason'],
          meter_command: ['command', 'payload'],
          billing_command: ['command', 'payload'],
          billing_sources: ['org'],
          billing_statement: ['invoice_id'],
          collections_command: ['command', 'payload'],
          collection_accounts: ['org'],
          collection_summary: ['org'],
          collection_receipt: ['receipt_id'],
          submit_meter_reading: ['payload'],
          complete_meter_photo: ['photo'],
          meter_occupancy: ['org'],
          report_meter_conflict: ['payload', 'reason_code'],
        }[name];
        if (!args) throw new Error('Unknown RPC');
        const result = await tx.query(
          `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`,
          args.map((k) =>
            body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]
          )
        );
        return {
          rpc: true,
          value: [
            'create_organization',
            'check_in_reservation',
            'transfer_stay',
            'meter_command',
            'billing_command',
            'billing_sources',
            'billing_statement',
            'collections_command',
            'collection_accounts',
            'collection_summary',
            'collection_receipt',
            'submit_meter_reading',
            'meter_occupancy',
            'report_meter_conflict',
          ].includes(name)
            ? result.rows[0].result
            : null,
        };
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
      const order =
        ' order by ' +
        (url.searchParams.get('order') ?? (valid.has('id') ? 'id.asc' : 'user_id.asc'))
          .split(',')
          .map((value) => {
            const [column, direction] = value.split('.');
            return `${quote(column)} ${direction === 'desc' ? 'desc' : 'asc'}`;
          })
          .join(',');
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
