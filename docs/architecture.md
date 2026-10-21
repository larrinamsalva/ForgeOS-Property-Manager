# ForgeOS architecture — Milestones 1–2

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
| reservations             | Scoped bookings, rate/deposit references and lifecycle history                               |
| lease_terms              | Immutable reviewed agreement terms, renewals and void corrections                            |
| audit_events             | Append-only actor, timestamp, and before/after record history                                |

All 19 public application tables have RLS and explicit grants. Organization, property, and record identity are immutable after insertion. Composite keys prevent a stay from referring to another property's customer or site. No application role can delete customers, properties, sites, stays, or audit events.

Customers are property-scoped in this release to keep staff access explicit. A later cross-property customer identity model should add an effective-dated customer/property relationship and a reviewed migration, rather than moving or rewriting historical records. Separate vehicle/occupant entities, general document uploads, invoices and payments remain later work. Meter collection and private photographs are implemented in Milestone 3.

## Permissions

| Role                               | Property metadata                 | Sites and rates                 | Customers and stays                                 | Access administration                |
| ---------------------------------- | --------------------------------- | ------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Owner                              | All organization properties; edit | Read/write                      | Read/write                                          | Grant/revoke property roles          |
| Administrator                      | All organization properties; edit | Read/write                      | Read/write                                          | View assignments; owner grants roles |
| Property manager                   | Assigned properties; edit         | Assigned properties; read/write | Assigned properties; read/write                     | No role changes                      |
| Office                             | Assigned properties; read         | Assigned properties; read only  | Assigned properties; read/write, including move-out |
| Maintenance / meter technician     | Assigned properties; read         | No rows in this release         | No rows                                             | Own role only                        |
| Resident / unauthenticated visitor | None                              | None                            | None                                                | None                                 |

Meter technicians receive meter data for their assigned routes; customer and financial rows remain denied. Maintenance workflows remain later work. Hiding a menu does not supply authorization: the database blocks direct requests as well. Only owners/administrators can read audit events because those snapshots may include private contact information.

Private membership lookups and narrow transactional functions use `SECURITY DEFINER` with an empty search path and explicit `auth.uid()` checks. They live in a non-exposed `private` schema, and public wrappers are `SECURITY INVOKER`. Anonymous execution is revoked. Elevated writes are restricted to owner bootstrap, owner-only property assignment/revocation, reservation check-in, stay planning/transfer/completion, internal availability synchronization, scoped meter/route capture and review, photo completion, conflict reconciliation, and audit recording; no generic elevated write endpoint exists.

## Occupancy and historical integrity

Availability is derived from physical status and stay records. `occupied` is never separately written to a site. A UUID/date-range GiST exclusion constraint rejects overlapping stays, including competing database transactions. Arrival is inclusive and departure is exclusive; a same-day completed stay remains in history but occupies no future nights. Future occupancy starts remain rejected; future arrivals are recorded as reservations. Property time zones determine the current business date.

Creating a stay locks the property, site, and customer before checking active/archived state. This serializes it with archive operations. Move-out atomically closes the stay and marks the site `in_preparation`. A manager must make it ready again. Completed stays cannot be rewritten or deleted. Archive controls refuse records with an open stay, and restoration retains identity and history.

Rent and deposit values use integer cents in USD; parsing decimal input never multiplies a binary floating-point dollar amount. This release records reference/agreed rates; it does not calculate or issue invoices, assess late fees, collect payments, or keep a financial ledger.

## Current limits and scale

The initial server snapshot reads authorized rows in stable pages of 1,000, rather than silently truncating dashboard totals at the API limit. Large commercial datasets will need server-side search, aggregate queries, and cursor pagination before launch. No performance or concurrent-load certification is claimed. The layout is a coordinate-backed grid with selectable site records; overlapping coordinates display stacked cards. It is not an aerial map or full graphical editor.

Automated PostgreSQL tests use PGlite with the actual migration, real RLS roles, and the `btree_gist` extension. Browser tests exercise the production components and API against a test-only Supabase-shaped HTTP fixture backed by that PostgreSQL engine. Auth is deterministic in the fixture. This verifies local boundaries and database permissions but does not verify Supabase Auth, email delivery, PostgREST implementation, hosted configuration, or live infrastructure. The fixture binds only to loopback and is outside application routes; never deploy it.

## Expansion path

Follow [the roadmap](roadmap.md). Meter collection and private photo policies are described below. Continue with utility calculations and draft invoice approval. The tablet route permits same-origin camera use; microphone and geolocation remain disabled. Billing, live notices, late fees, payment activation, infrastructure, and legal policy choices require explicit configuration/authorization before use.

## Reservation availability and lease foundations

`reservations` stores booking identity, property/customer/site, civil arrival/departure dates, status, rate period, guest/vehicle details, deposit references and change metadata. `lease_terms` stores append-only agreement terms linked to a retained stay and, for renewals, an adjacent earlier term. Both tables have property-scoped RLS, audited changes and explicit grants; raw deletes are denied. Maintenance and meter roles receive no rows. Only a manager/organization administrator/owner may void lease terms; office staff may record terms and manage bookings.

The non-exposed `private.site_allocations` table arbitrates confirmed bookings and actual stay plans with one UUID/date-range GiST exclusion constraint. It has RLS and no application-role privileges. Narrow authenticated triggers maintain it; existing occupancy is backfilled by the additive migration. Dates use `[arrival, departure)` boundaries. Inquiry/tentative records do not hold space. Cancelling or recording a no-show releases the hold while preserving the booking and audit trail. Archive and physical-state guards include confirmed bookings.

Check-in locks the reservation, validates role, property, customer, readiness and dates, then atomically swaps the reservation hold for a stay with a planned departure. Repeating check-in returns its existing stay. Actual occupancy is not inferred from a booking. An open-ended stay holds space indefinitely; a dated departure plan permits later nonoverlapping bookings. An overdue occupant is never silently checked out: availability search and new confirmations remain blocked, and the next actual check-in is refused until move-out. If an overstay collides with an existing later booking, an operator must relocate/cancel the conflicting booking before recording the conflicting extension/departure.

Departure changes preserve the original booking dates and append an audit record. Transfers atomically close the earlier stay, prepare its site, and create a linked stay at another compatible site in the same property. Any failure rolls back all parts. Completed stay identity/rates/handovers remain immutable. A departure plan is an expectation; `ends_on` is the actual recorded departure. Monthly, weekly, nightly and custom period labels do not imply a billing engine.

Lease terms record reviewed business agreements; they do not allocate space, sign documents or calculate balances. A renewal starts at the earlier term's end. Recorded terms cannot be edited; voiding retains a reason, and a partial unique index allows a corrected renewal after the earlier mistaken renewal is voided. Later active renewals must be voided before an earlier term. Change the stay's planned departure separately when extending occupancy. Legal document execution, general private file attachments, work orders and invoice/deposit reconciliation remain later work. Meter readings and their photographs are implemented separately from the occupancy handover notes.

Booking edits and lifecycle actions use the last-read `updated_at` value as an optimistic-concurrency condition; a stale form receives a reload message instead of overwriting another edit. Transactional check-in, plan changes and transfers independently re-check database state. Calendar/search results are snapshots: the write-side exclusion constraint is the final conflict authority. Property/site row locks serialize updates against archive transitions. Real concurrent load and a hosted PostgreSQL/Supabase deployment still require staging acceptance; PGlite tests do not certify those environments.

## Tablet collection and evidence

The additive tablet migration introduces nine public tables: `meters`, `meter_assignments`, `meter_routes`, `meter_route_items`, `meter_readings`, `meter_reading_reviews`, `meter_photos`, `meter_sync_conflicts` and `meter_conflict_resolutions`. Private tables retain exact capture operations and effective occupant attribution. RLS, explicit grants, immutable captures, append-only reviews, unique route stops and UUID operation IDs enforce history and retry safety. Meter assignments use nonoverlapping timestamp ranges; occupancy attribution uses the property's actual civil date at capture.

`/api/meters` verifies the caller and delegates narrow commands to private authenticated transactions. New captures require the assigned employee; supervisor configuration/review is property-scoped. Decimal registers remain text and use exact `numeric`/`BigInt` comparisons. The offline reader snapshot excludes customer/stay links, rates, customer contacts, audit records and financial history. Its route download contains only that employee's open assigned routes. Stale baselines and assignment changes create retained conflicts, never last-write-wins edits. Supervisor reconciliation appends an outcome; future device sync acknowledges it.

The standalone public `/tablet/index.html` shell and its allowlisted service worker run independently of authenticated Next.js HTML. Only static shell assets enter Cache Storage. IndexedDB values, photos and automatic-lock drafts are encrypted with a passphrase-derived AES-GCM key bound to the user/organization/record scope. The key is held only while unlocked. The reader provides durable transaction acknowledgments, separate reading/photo states, foreground/manual sync, quota reporting, non-overwriting encrypted export/import, sign-out warnings and recovery after reload or session/account changes. See the [phase 3 report](phase-3-report.md) for cryptographic parameters, expiry windows and operational limits.

`meter-photos` is a private 5 MB image bucket. Reservations bind each path to its capture, operator and property. Server uploads use the ordinary caller session and verify size/type/hash; uploads never upsert. A private object can be viewed only after authorization, through a 60-second signed URL. Rejected-operation photos remain in the encrypted recovery queue for explicit reconciliation. Hosted Storage behavior, advisors and actual tablet/PWA/camera acceptance remain external setup gates.
