# ForgeOS architecture — Milestone 1

ForgeOS stores property records in a dedicated Supabase PostgreSQL database. Next.js App Router supplies the authenticated UI and JSON mutation endpoint. The app uses React, strict TypeScript, Tailwind, explicit accessible CSS components, Lucide icons, Zod validation, and the Supabase SSR package. Dependencies and the lockfile are pinned. TypeScript uses the supported 6.x API because the current Next.js lint integration does not support TypeScript 7.

## Request and data flow

1. Supabase Auth signs in the user and the SSR package maintains the cookie session.
2. The proxy refreshes the session; every protected page and mutation independently validates the user with `auth.getUser()`.
3. Server-rendered pages load only rows permitted by RLS. An organization selector and property selector narrow that authorized data.
4. `/api/records` checks the request origin, validates an allowlisted entity/action and fields, and submits the mutation under the caller's own session.
5. PostgreSQL policies, composite foreign keys, triggers, and exclusion constraints enforce authorization and integrity. No service-role key is used.
6. A successful mutation refreshes the server data. Failures preserve the form and show a safe error.

Personal data is never written to localStorage; only the light/dark theme preference is stored there. Offline meter entry is not part of this milestone. Authenticated responses are private and not cached. Database failures produce an error screen rather than misleading zero totals.

## Current entities

| Table                    | Purpose                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| organizations            | Independent business boundary                                                                |
| organization_memberships | Owner, administrator, or member; never user-editable JWT metadata                            |
| properties               | Time zone, contact, status, and location                                                     |
| property_memberships     | Manager, office, maintenance, or meter role at one property                                  |
| sites_units              | RV or building space, physical condition, integer-cent rates, amenities, and map coordinates |
| customers                | Property-scoped identity/contact record                                                      |
| occupancy_stays          | Customer/site relationship with an effective date range and preserved agreed rent            |
| audit_events             | Append-only actor, timestamp, and before/after record history                                |

All eight tables have RLS and explicit grants. Organization, property, and record identity are immutable after insertion. Composite keys prevent a stay from referring to another property's customer or site. No application role can delete customers, properties, sites, stays, or audit events.

Customers are property-scoped in this release to keep staff access explicit. A later cross-property customer identity model should add an effective-dated customer/property relationship and a reviewed migration, rather than moving or rewriting historical records. Vehicle/occupant tables, file uploads, reservations, meters, invoices, and payments are deliberately deferred.

## Permissions

| Role                               | Property metadata                 | Sites and rates                 | Customers and stays                                 | Access administration                |
| ---------------------------------- | --------------------------------- | ------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Owner                              | All organization properties; edit | Read/write                      | Read/write                                          | Grant/revoke property roles          |
| Administrator                      | All organization properties; edit | Read/write                      | Read/write                                          | View assignments; owner grants roles |
| Property manager                   | Assigned properties; edit         | Assigned properties; read/write | Assigned properties; read/write                     | No role changes                      |
| Office                             | Assigned properties; read         | Assigned properties; read only  | Assigned properties; read/write, including move-out |
| Maintenance / meter technician     | Assigned properties; read         | No rows in this release         | No rows                                             | Own role only                        |
| Resident / unauthenticated visitor | None                              | None                            | None                                                | None                                 |

Maintenance and meter workflows will expose narrowly scoped operational data when implemented. Hiding a menu does not supply authorization: the database blocks direct requests as well. Only owners/administrators can read audit events because those snapshots may include private contact information.

Private membership lookups and narrow transactional functions use `SECURITY DEFINER` with an empty search path and explicit `auth.uid()` checks. They live in a non-exposed `private` schema, and public wrappers are `SECURITY INVOKER`. Anonymous execution is revoked. The only write operations with elevated privileges are owner bootstrap, owner-only property assignment/revocation, move-out, and audit recording; no generic elevated write endpoint exists.

## Occupancy and historical integrity

Availability is derived from physical status and stay records. `occupied` is never separately written to a site. A UUID/date-range GiST exclusion constraint rejects overlapping stays, including competing database transactions. Arrival is inclusive and departure is exclusive; a same-day completed stay remains in history but occupies no future nights. Future move-ins are rejected until the reservation milestone. Property time zones determine the current business date.

Creating a stay locks the property, site, and customer before checking active/archived state. This serializes it with archive operations. Move-out atomically closes the stay and marks the site `in_preparation`. A manager must make it ready again. Completed stays cannot be rewritten or deleted. Archive controls refuse records with an open stay, and restoration retains identity and history.

Rent and deposit values use integer cents in USD; parsing decimal input never multiplies a binary floating-point dollar amount. This release records reference/agreed rates; it does not calculate or issue invoices, assess late fees, collect payments, or keep a financial ledger.

## Current limits and scale

The initial server snapshot reads authorized rows in stable pages of 1,000, rather than silently truncating dashboard totals at the API limit. Large commercial datasets will need server-side search, aggregate queries, and cursor pagination before launch. No performance or concurrent-load certification is claimed. The layout is a coordinate-backed grid with selectable site records; overlapping coordinates display stacked cards. It is not an aerial map or full graphical editor.

Automated PostgreSQL tests use PGlite with the actual migration, real RLS roles, and the `btree_gist` extension. Browser tests exercise the production components and API against a test-only Supabase-shaped HTTP fixture backed by that PostgreSQL engine. Auth is deterministic in the fixture. This verifies local boundaries and database permissions but does not verify Supabase Auth, email delivery, PostgREST implementation, hosted configuration, or live infrastructure. The fixture binds only to loopback and is outside application routes; never deploy it.

## Expansion path

Follow [the roadmap](roadmap.md). Add reservation/lease entities next, then meter assignments and offline synchronization. Future file uploads require private Storage buckets and policy tests. The current `Permissions-Policy` disables camera use; the meter milestone must explicitly enable and permission-test same-origin camera access. Billing, live notices, late fees, payment activation, infrastructure, and legal policy choices require explicit configuration/authorization before use.
