# ForgeOS Milestone 2 — reservations and lease foundations

## Starting point and scope

Milestone 1 PR #1 was verified merged into `main` at `35be9878c268d593b6ae0714c7d0b24b3a1131db`. Its source tree and MIT license were retained. This change follows Milestone 2 of the canonical [master prompt](../MASTER-BUILD-PROMPT.md) in `larrinamsalva/ForgeOS-Property-Manager`. It adds a migration rather than rewriting the foundation migration. No external database, hosting, Auth settings or payment service was changed.

## Implemented behavior

| Requested area       | Result                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reservation calendar | Day, week and month views by civil date, authorized property/site rows, selectable booking records, actual occupancy and nonblocking inquiries/tentative bookings                                         |
| Availability search  | Arrival/departure date search; active properties, physical readiness, confirmed bookings, open-ended/overdue occupants and planned departures are considered                                              |
| Booking records      | Persistent confirmation code, customer/site, status, rate period, exact-cent rate, guest count, RV length/vehicle/pet notes, deposit references, search and status filters                                |
| Conflict prevention  | One private PostgreSQL exclusion constraint arbitrates confirmed reservations and actual stay plans. Adjacent departure/arrival is allowed. Direct move-ins cannot bypass reservation holds               |
| Arrivals/departures  | Lists for the calendar's selected date, with due check-in actions and planned/completed departures                                                                                                        |
| Move-in/out          | Booking check-in creates real occupancy; retry returns the same stay. Handovers retain occupants, vehicles, conditions, document/meter references, maintenance follow-up and billing/deposit review notes |
| Occupancy changes    | Audited planned-departure changes and extensions; atomic compatible-site transfer within the property closes and links the earlier stay, preserving its original rate/history                             |
| Lease foundations    | Recorded terms linked to a stay, adjacent renewals, immutable dates/rates, manager-only void reasons and corrected renewals without deleting earlier entries                                              |
| Customer history     | Customer/site dialogs combine booking, occupancy, transfer, handover and lease history; cancelled/no-show/completed/voided records remain available to authorized users                                   |
| Integration          | Reservations and leases join the existing navigation; current reserved status appears in the site directory/map, and confirmed arrivals join the operational dashboard                                    |

Reservations remain separate from occupancy until actual check-in. Arrival is inclusive and departure is exclusive. Property time zones determine whether an arrival is due. A same-day completed stay remains in history even though its nightly range is empty. An overdue occupant is never silently checked out.

Lease terms are a registry for agreements the business has reviewed. They do not themselves allocate space, sign a document or change a stay's departure plan. The booking and stay fields record rates/deposit requirements; manually noted received deposits are references to the operator's payment records, not a financial ledger.

## Database and access controls

The additive migration is `supabase/migrations/20261021050711_reservations_leases.sql`, created through the Supabase CLI. It adds `reservations` and `lease_terms`, extends existing stays with planning and handover fields, and backfills their existing date ranges into `private.site_allocations`. The foundation migration is unchanged.

All ten public tables and the private allocation table have RLS. The private table has no application-role grants and is not exposed to the Data API. Composite ownership keys, role checks, immutable identities, safe archive guards and audit recording remain in force. The native exclusion constraint prevents overlapping allocation writes across bookings and stays. The original occupancy exclusion constraint also remains.

Owners, organization administrators, property managers and office staff can operate on their authorized bookings/stays and record lease terms. Only managers/organization administrators/owners may void terms. Maintenance/meter roles cannot read booking or lease/customer/financial data. Anonymous table/RPC access and raw business-record deletes remain denied. No service-role key, user-editable JWT authorization metadata or public `SECURITY DEFINER` endpoint is introduced.

Booking edits and status actions include a last-read timestamp condition. Stale forms receive a reload message. Transactional check-in, completion, planning and transfer independently validate live database state. Transfers roll back completely on destination conflicts. Completed stays and terminal booking states are immutable. Voided terms, cancellation/no-show reasons and previous values remain in audit/history.

The current Supabase changelog and function/RLS documentation were reviewed. Its PostgreSQL 15.19/17.11 warning about `btree_gist` float/NaN indexes does not apply to these UUID/date-range indexes. Hosted security/performance advisors remain a required setup check because no dedicated project is connected here.

## Verification

| Check                                 | Result                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unit and PostgreSQL integration suite | 33 tests across five files passed                                                           |
| `npm run lint`                        | Passed                                                                                      |
| `npm run typecheck`                   | Passed, including after the production build                                                |
| `npm run test:e2e`                    | 11 scenarios passed; four duplicate full creation/lifecycle scenarios intentionally skipped |
| `npm run build`                       | Next.js production build passed                                                             |

The complete local checks finished on October 21, 2026. Browser coverage includes desktop (1440×1000), tablet (820×1180), and phone (390×844), with both themes. Axe WCAG A/AA checks passed on the planning screens and booking/lease dialogs, and screenshots were visually inspected. The browser was Chromium 153; other browsers and physical devices remain to be tested. GitHub Actions repeats the full checks for the review PR.

Database tests apply the actual migrations in PostgreSQL/PGlite and execute SQL under real `authenticated` identities. They verify adjacent/conflicting bookings, nonblocking tentative records, cancelled/no-show history, cross-entity conflicts, extension rejection, check-in idempotency, changed departure plans without rewriting original bookings, blocked early check-in/overdue occupants, site compatibility, active-booking archive protection, transfer rollback, preserved history, lease renewal/void/correction rules, role scope, anonymous denial, private-table denial and RLS catalog state. Unit checks include exact money, date boundaries, DST, leap days and month navigation.

The new desktop browser story creates and edits a booking, rejects a conflicting direct API request and a stale edit, checks in, changes departure, records/renews/voids/corrects lease terms, transfers, completes the move-out handover, reloads customer history, and records cancellation/no-show reasons. Separate scenarios verify calendar modes, availability, root-page containment, both themes, booking and lease dialogs, and Axe WCAG A/AA checks on desktop, tablet and phone. The existing Milestone 1 creation/history/access checks remain in the suite. Duplicate full creation stories are intentionally skipped on tablet/phone; their responsive/access workflows still execute.

| Data-flow boundary | Evidence                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| UI → server        | Real forms submit same-origin JSON to `/api/records`; browser checks capture responses                  |
| Server → database  | Validated Supabase client/RPC calls use the caller's session through a loopback test HTTP boundary      |
| Database rules     | Actual migrations, RLS roles, constraints, transactions and audit triggers execute in PostgreSQL/PGlite |
| Response → UI      | Success refreshes authorized server data; conflicts/stale changes preserve forms and display errors     |
| Reload/history     | Browser reloads retain bookings, terms, transfer records, contacts and completed handovers              |

## Limits and external setup

No dedicated live Supabase project is connected and no site has been deployed. The test-only loopback fixture supplies deterministic Auth and a limited Supabase-shaped REST boundary; it is not Supabase Auth/PostgREST. Actual signup emails, hosted session refresh, hosted PostgREST configuration, real devices, simultaneous hosted sessions and production load remain unverified. Native PostgreSQL exclusion semantics are used for competing allocations, but the local tests are not a concurrent-load certification.

Before live use, configure a **new dedicated ForgeOS project**, review/apply both migrations in order, configure the public URL/publishable key/application origin and exact Auth callbacks, run security/performance advisors, establish backups and staging restore tests, then repeat the documented acceptance workflows with real owner/office/restricted accounts. Follow [README.md](../README.md) for CLI dry-run/apply, local development and private deployment instructions. Do not reuse another app's database.

Formal meter readings/photos/offline sync, secure file attachments, legal document execution, invoice/deposit reconciliation, work orders, customer notices and online booking are not implemented by this milestone. Meter/document/billing handover fields are optional reference notes; no unchecked feature is represented as an executed reading, signed agreement or payment. Large portfolios still need server-windowed calendar queries/search, aggregates and pagination before launch.

## Next milestone

Milestone 3 is the tablet meter reader: effective-dated meter assignments, routes, verified readings/photos, private storage, offline queue, idempotent sync, conflicts and supervisor review. The prerequisites and real-device/offline acceptance cases remain in [docs/roadmap.md](roadmap.md). Dedicated-project security and live acceptance must be completed before real field use. No PR is merged automatically.
