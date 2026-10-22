# ForgeOS-Property-Manager

All-in-one RV park, apartment, and property management operating system.

**One System. Every Site. Total Control.**

This repository contains the Milestones 1–7 property workspace, tablet meter reader, supervised billing and daily operations: a Next.js property workspace backed by a dedicated Supabase PostgreSQL database. It supports organization onboarding, scoped staff roles, property/site/unit directories, customers, reservations, availability and calendars, lease-term history and renewals, move-in/out handovers, planned departures, atomic site transfers, an operational dashboard, a coordinate-backed site map, CSV export, and safe archive/restore, dated meter assignments, assigned reading routes, encrypted offline capture and photos, idempotent sync, supervisor corrections, a conflict inbox, effective-dated utility rates, exact consumption/rent calculations, versioned draft invoices, supervisor approval, PDF/print statements, an internal customer ledger with credits and reversals, and manual payments, immutable receipts, separate deposit liabilities, issued invoice balances/aging, reviewed late fees/waivers, arrangements, manual follow-ups and statement reconciliation, plus assigned work orders, preventive maintenance calendars, exact inventory movements, purchasing, equipment and recurring staff checklists.

The full brief is [MASTER-BUILD-PROMPT.md](MASTER-BUILD-PROMPT.md). The repository remains private and the existing MIT license is unchanged. Development uses feature branches and pull requests; do not merge automatically.

## Current status

Implementation and verification are described in [docs/phase-7-report.md](docs/phase-7-report.md). Earlier milestone reports remain in `docs/`. A dedicated live Supabase project is not configured by this change, and no hosted website or live customer data is created. Without environment variables the app opens an explicit setup screen. It never substitutes browser-local sample records for a working database.

Owner reports, multi-property measures, independent resident accounts, retained English/Spanish in-app communications, bounded CSV and audited owner JSON archives are implemented. No hosted system or live processor is active. Manual issuance and reviewed fee/deposit deduction actions require explicit owner configuration; automated fees and outbound notices remain disabled.

### Guest unit designations (Sites, Spaces, Apartments and Mobile Homes)

In the public **Sites & map → Details & photos** guest form, the unit label has two separate controls: **Unit type**, a selection of *Site*, *Space*, *Apartment*, *Mobile Home*, or *Campground*; and **Unit number or name** (for example *12*, *A-4*, or *Lot 25*). The chosen designation and friendly unit name display together in the directory and can be searched. This is a guest-preview display classification only; the stable internal site ID, assigned customer, files, and occupancy stay linked when the label changes. In the demo, Site and Space use the existing RV category, Apartment uses apartment, and Mobile Home maps to the existing house category so no unsupported database kinds are written. In **Add Customer**, a separate **Choose unit type** selector filters all non-occupied units (Site, Space, Apartment, Mobile Home, Campground) across the full property—including units not on the current directory page. "All types" shows every unoccupied unit. Reserved/held units remain visible but cannot be assigned to someone else; occupied units stay hidden from new assignments. Once a customer is assigned, their unit becomes occupied and disappears from the available list; existing customer edits retain their current assignment. The new **Browse all available units** control on Add Customer displays every actually available, unoccupied unit from the full property inventory (not just the current Sites & map directory page), even when a unit-type filter is chosen. Search by unit number, name, type or section; choosing any result sets the Assigned / Available dropdown to that unit. The customer form now also places a **Space / unit number** input directly alongside **Choose unit type**. For example, choose *Space* and type *88* to link the matching, already-created vacant space; the form confirms **I live in Space 88**. The number box and Assigned / Available dropdown stay synchronized in both directions. Occupied, reserved, missing, or ambiguous numbers are never silently assigned; the form asks for a valid selection instead of creating a nonexistent unit. The count updates immediately after check-in or reassignment. The demo starts with just 20 **created** example units: 14 occupied, 3 available and 3 reserved. The 700-unit planning target is not itself 700 created sites—use **Property layout → Add spaces** to create additional real entries in the sample inventory.

Guest changes vanish on refresh/reset; authenticated site taxonomies are unchanged.

### Guest customer, unit, vehicle and photo files

Guest visitors can open any sample site or apartment's **Details & photos** panel and edit its label, type (RV space, apartment, cabin, tent, house or commercial), building/row, rent, dimensions, electric/water/sewer/gas connections, and notes. Each space also has its own small **Photos & vehicles** inventory: upload JPG, PNG or WebP example photos categorized as site/apartment, car/truck, RV/trailer, motorcycle, off-road/ATV/UTV, or boat/watercraft; add and remove sample vehicle descriptions and identifiers. The demo enforces 8 MB per image and 12 images per space. Photo object URLs are revoked on removal/reset/unmount. Photos and vehicle data remain in transient browser memory and are not stored in Supabase or uploaded to Vercel.

Customer records in the guest view can now be added and edited with optional phone, email, emergency contact, vehicle notes, arrival date, deposit and site assignment (or unassigned). A customer changing sites updates the **fictional** occupancy and visible resident name, without ever writing actual customer information to a backend. Demo users must use sample identities and pictures. Refreshing/resetting discards all guest changes. Staff/owner workspaces and API permissions are unchanged.

**Real rollout follow-up:** create property/organization-scoped private photo storage with owner/authorized staff controls, metadata, file validation and auditing; connect real vehicle inventories to authenticated site/customer records. Do not expose real resident photos or vehicle plates in an anonymous gallery.

### Guest capacity and local layout planner

The guest demo starts with 20 **fictional** spaces and 14 example customer records, with a sample planning target of 700. This is not a product data limit. A visitor can add 1–250 spaces per batch repeatedly, number them automatically, search large inventories and navigate paginated space/customer lists. Visitors add fictional customers on arrival, choosing an available space or an unassigned/waiting-list entry. The real authenticated customer/site tables are not modified by demo actions. The authenticated workspace already loads more than 1,000 records through paginated database reads.

The **Property layout** page accepts PNG, JPEG, WebP and PDF files up to 12 MB. Files are held in an in-memory browser object URL only, **not** uploaded to Supabase/Vercel and not persisted. Image layouts support manual clickable site-number pins, an annotated PNG download and a CSV export of all example sites and marked positions. PDF files are held locally for downloading; in-browser placement of numbered pins requires an image version of the plan. No automatic site-count recognition is claimed. Refresh/reset discards layouts, markers and temporary sample records.

A persistent layout uploader for real customers is a separate authenticated and RLS-protected follow-up; do not expose plans to anonymous users or reuse demo file handling for production storage without secure validation.

## Secure paperless customer and site filing (review before release)

The authenticated **Paperless photos & files** workspace lets authorized owners, managers and office staff select a property and a customer and/or space, then use **Take photo & auto-file** on a phone or tablet, or choose a JPG/PNG/WebP/PDF. Selecting a photo automatically POSTs its bytes under the selected records; uploads are limited to 5 MB per file. The workspace also lists up to 100 newest documents per customer or site and opens temporary 60-second private Storage URLs. A scanned form or inspection picture can be filed without a printed document. No real file or customer record is exposed to the no-login guest demo.

A **new additive SQL migration** creates `public.record_attachments`, foreign keys to matching scoped customer/site records, strict RLS policies and a **private** `record-attachments` bucket with storage RLS. Only owner/admin or assigned manager/office may upload or retrieve a file. The server uses the user's session, same-origin checks, file signature validation and bounded streaming; upload is considered saved only after private Storage confirms its metadata. No service-role key is exposed.

This requires deploying the migration to the **dedicated ForgeOS** Supabase project and then deploying the application; it must not run against another app's database. A public demo never uploads customer photos. Before marking this commercial-ready, test two different organizations, revoked roles, native camera behavior on Android/iOS, interrupted uploads, full file-size enforcement and deletion/retention policy. This first phase requires an online connection; there is **no offline background auto-sync** or e-signature workflow yet. If upload fails, keep the original photo and retry from the same record.

## No-account guest demo

Visitors without a verified staff account are sent to `/demo`, a public **fictional-data** exploration of the dashboard, sites, tenant examples, simulated meter readings, invoices, work orders, supplies and resident view. The demo never calls property record or billing APIs, never creates an Auth user, and does not read/write Supabase tables; temporary changes live in React memory and reset on reload. The sign-in screen links to the demo as well. `/login` and `/portal` remain the real authenticated entry points, and all real backend mutations retain existing session, role and RLS checks.

The demo is safe to share only after the deployment's access policy is reviewed and the authenticated APIs are confirmed to stay protected. For Vercel, enabling public access to the production hostname should not disable preview deployment protection or reveal existing tenant data. Do not describe a sample invoice as a real charge.

## Run locally

Use Node.js 22 or newer and npm.

```bash
npm ci
cp .env.example .env.local
```

Set these values for a **dedicated ForgeOS project**, never a database from another product:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Only the publishable key is used. Do not add a service-role key to this app. Never commit `.env.local`, real passwords, tokens, or tenant records.

Apply all seven migrations as described below, then run:

```bash
npm run dev
```

Open http://localhost:3000. Create an account, confirm its email when required, sign in, and create your organization. The signed-in account becomes that organization's owner. Add a property, then sites/units and customers. Use **Occupancy & history → Assign customer** to record a current or past move-in. Completed move-outs remain in history and mark the site in preparation. Edit its physical availability to Ready before assigning the next occupant.

The **Property view** selector scopes each screen. The site directory supports search, status/section filters, archives, record details, and a CSV download that neutralizes spreadsheet formulas.

### Reservations, leases and occupancy changes

- **Reservations** offers day/week/month calendars, date-range availability, booking search/status filters, and arrival/departure lists for the selected calendar date. Create the customer first. Only confirmed reservations hold space; inquiry and tentative records do not. Cancellation/no-show requires a retained reason. Check-in becomes available when arrival is due and departure is still ahead, using the property's local date.
- Arrival is inclusive and departure is exclusive. Confirmed bookings and actual stay plans share a database exclusion constraint. A direct move-in cannot consume a confirmed booking. Check-in atomically replaces that booking's hold with the stay; retrying an already completed check-in returns the same stay.
- An open-ended stay blocks future booking. **Occupancy & history → Departure plan** sets or changes expected departure, with a reason. An overdue occupant remains occupied until actual move-out. Resolve that departure before accepting another arrival. If an overstay conflicts with a later booking, relocate/cancel that booking before extending or completing the conflicting stay.
- **Transfer** closes the earlier stay and creates a new stay at a compatible site in the same property, preserving customer history, the original rate and the new agreed rate. A destination conflict rolls back the entire transfer. The earlier site goes into preparation.
- Move-in/out forms retain occupants, vehicle details, condition and handover notes. Meter notes and document references are optional references to your current process; verified meter readings and meter photographs are available in Meters & reader; legal attachments remain a separate workflow. Work orders, invoices and deposit reconciliation have their own screens.
- **Leases & renewals** records reviewed terms linked to a stay. Renewals append adjacent terms. Saved terms cannot be rewritten; managers can void mistakes with a reason and record corrected terms. The registry does not sign a legal document, issue an invoice, or update a stay's planned departure. Update the departure plan separately when extending occupancy. Booking deposit amounts are manually noted references, not a financial ledger.
- Customer and site detail dialogs include booking, lease and occupancy histories. Completed, cancelled, no-show and voided records remain accessible to authorized staff.

### Tablet meter reader

Open **Meters & reader** to create meters, dated site assignments and assigned routes. Employees open **Open tablet reader** online, protect the device queue with a passphrase, and download their routes before going offline. Save each observation before advancing; photos stay with the encrypted queue. Use **Sync now** after reconnecting. Supervisors review original readings, append corrections, and reconcile conflicts without overwriting captures.

The installable shell caches only public assets. IndexedDB holds encrypted route data, readings, photos and automatic-lock drafts; no authentication token is stored there. Export encrypted recovery copies and keep the passphrase securely. Browser storage retention, actual Android/iPad behavior and hosted private Storage must be tested before live use. Full workflow, limits and setup: [Milestone 3 report](docs/phase-3-report.md).

### Utilities, invoices and the internal ledger

Open **Utilities & billing → Rates & policy** and authorize the property's USD billing/proration/tax policy. Add effective-dated electric, water and gas schedules, including explicit register-unit conversions, cumulative tiers, monthly base service and authorized water sewer charges. Record a zero-price schedule when a utility is included in rent. New versions close the selected earlier schedule; approved historical rates are protected.

In **Invoices**, select a customer stay and an exclusive-end billing period. Rent comes from the recorded stay and effective lease terms, or an explicitly authorized custom agreement. Metered charges require approved boundary readings for every assignment, including replacements; rate changes require a reading on their effective date. Reset/rollover readings need a documented register event. An explicit rent-only draft can omit utilities with a reason; prepare a later utilities-only invoice without rent.

Office staff may prepare drafts. Supervisors approve, credit, reverse credits or void invoices. Approval verifies the saved calculation against current sources and posts an **approved / unissued internal balance**. Refreshing a stale draft appends a revision. Every earlier revision and ledger event remains. Download an itemized PDF, open the printable statement or export the internal ledger. PDFs embed licensed Noto Sans Latin fonts; unsupported characters produce a clear printable-statement fallback instead of changed customer names.

Approval alone remains unissued. Explicit manual issuance and manually recorded funds are available in Payments & collections after the owner configures policy. Email delivery, online processing, automated fees and notices are disabled. The exact rounding conventions, supported workflows and staging acceptance steps are in [Milestone 4 report](docs/phase-4-report.md).

### Payments, deposits and collections

Open **Payments & collections** for manual payment receipts/allocations, refunds and linked corrections, separate held deposit accounts, current aging, reviewed late fee drafts/waivers, arrangements, dated manual follow-ups, and selected-cash statement reconciliation. The owner must authorize issuance and any late fee or deposit deduction rules first. Record funds already received/refunded through your existing process; ForgeOS does not move money. Receipts retain frozen original details and append correction history. Reconciliation provides a preview before recording and keeps nonzero owner-acknowledged variances visible.

The complete workflow, financial rules and hosted acceptance limits are in [Milestone 5 report](docs/phase-5-report.md). There is no active tenant payment or ForgeOS subscription processor.

### Maintenance, stock and daily operations

Open **Team & daily operations → Staff & history** after granting the employee an actual property role in **Team & access**. A manager adds that registered account's employee profile. Profiles show current database roles and property assignments; changing a profile does not grant access. Marking it inactive prevents assigned operations work, while revoking its Team & access role removes that role's broader permissions.

In **Maintenance**, office staff create and assign requests, schedule due dates and record estimated or actual expenses. Assigned maintenance employees record status, notes, time, precise material usage/returns, private request/before/after photos and equipment checkout/return. A manager reviews completed work and approves/closes it. Work history and cost corrections remain available. Maintenance roles receive limited site labels without customer contacts, supplier costs or financial records.

In **Inventory & purchasing**, managers maintain stock items, suppliers and equipment. Office staff record receipts and prepare purchase orders; managers approve and record orders placed through the existing supplier process. Partial deliveries and manager-recorded returns update stock atomically. Quantities support three decimals; every receipt, adjustment, transfer and work-order issue is retained. Matching SKU/unit items can transfer between properties only when the manager is authorized at both. Standard material costs are recorded estimates, not an accounting valuation method.

Create preventive maintenance or custom checklist plans with a calendar-day interval. Use the future calendar to explicitly create an occurrence; each plan/date can generate only one retained work order or checklist run. Employees complete or skip assigned checklist items with dated reasons, then close the run. In-app notifications and due/low-stock/service alerts stay inside the authorized workspace. There is no automatic scheduler, supplier delivery, email or SMS dispatch. Full permissions, operational limits and hosted acceptance: [Milestone 6 report](docs/phase-6-report.md).

## Database setup

The CLI is pinned as a development dependency. Discover commands with `npx supabase --help` and the relevant subcommand's `--help` before using them.

For a new, dedicated hosted Supabase project:

1. Authenticate the CLI with your own account and link this checkout to the confirmed ForgeOS project. Inspect `npx supabase link --help` for current flags. Do not link another application's project.
2. Inspect the planned migration before applying it:

   ```bash
   npx supabase db push --linked --dry-run --skip-vault
   ```

3. After reviewing that it targets the correct dedicated database, apply it:

   ```bash
   npx supabase db push --linked --skip-vault
   ```

4. Run the project's Supabase security and performance advisors, inspect migration history, and repeat the live acceptance workflows in [docs/phase-7-report.md](docs/phase-7-report.md) and the earlier milestone reports. The local PGlite tests do not replace this hosted check.

Alternatively, use a local Supabase stack with Docker. The checked-in `supabase/config.toml` and empty `supabase/seed.sql` are ready for it. Inspect `npx supabase start --help`, start the stack, and use that stack's URL/publishable credentials. Apply pending migrations using the CLI's current migration command. This environment did not have Docker, so the complete local Supabase stack was not exercised.

Apply all seven checked-in migrations in order. The foundation migration remains unchanged; the additive planning migration retains existing records, adds reservations and lease terms, extends stay handover fields, and backfills existing stays into a private availability-allocation table. The tablet migration adds meter/routes/readings/reviews, conflicts, private occupant attribution and a private photo bucket. The billing migration adds property policies, rates, register events, immutable invoice revisions and ledger entries, with private retry IDs, number counters and overlapping billing claims. The collections migration adds manual issuance, payments/allocations, deposit liabilities, receipts, policy versions, fees/waivers, notes and reconciliation with exact retries and private source claims. The operations migration adds work orders/events/materials/photos/costs, staff profiles, suppliers, inventory movements, purchasing/receipts, equipment/loans/service, recurring plans/checklist runs and private notifications. Four private tables hold exact retries, counters, occurrence claims and purchase-request claims. The commercial migration adds independent resident grants, retained communications/contact/work requests, owner archive receipts and two private retry/rate-limit tables. All 66 public application tables and 17 private tables have RLS; authenticated grants are explicit. `btree_gist` supplies UUID/date-range overlap protection. The private schema must **not** be added to the exposed Data API schemas. Do not run these migrations against a shared or unrelated database.

### Auth configuration

In the dedicated Supabase project's Auth settings:

- Set the Site URL to your actual application origin.
- Allow the exact callback URL, for example `http://localhost:3000/auth/callback`, and later the exact staging/production URLs.
- Configure email confirmation and an appropriate email provider/rate limits for real users. The UI requires at least 12 characters for new passwords; align hosted Auth password settings accordingly.
- Test signup, the actual confirmation email, sign-in, session refresh, invalid credentials, and sign-out on the configured project. Email delivery and hosted Auth are not covered by the deterministic local test fixture.

The app uses PKCE and `/auth/callback` to exchange the confirmation code for a session, then redirects to the workspace. It does not accept an arbitrary redirect destination.

### Staff access

Each employee first creates their own account and copies their user ID from **Team & access**. The owner selects **Grant property access**, enters that registered user's ID, and chooses the property and role. This grants access immediately without sending an invitation message. Revoke removes the property assignment; organization owners and administrators retain organization-wide access.

The first account that creates an organization receives the owner role. Organization administrator assignment is an intentional administrative database operation in this milestone; the UI only grants property roles. Invitations and account recovery UX remain separate work. Resident access uses the owner-managed links described below.

## Verification

```bash
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit tests cover exact money, dates/DST/leap days, calendar boundaries, status derivation, validation, and safe CSV. Database integration tests apply the actual migrations to embedded PostgreSQL with `btree_gist`, switch authenticated roles, and exercise RLS, reservation/stay/lease conflicts, archives, history, transfers, renewals, revocation, audit restrictions, meter assignment/history conflicts, idempotent captures, review corrections, private photo policies and conflict reconciliation, stock timeline integrity/linked transfers/partial returns, purchase claims, equipment checkout conflicts, recurring occurrence uniqueness, staff access revocation and operations approvals. Browser tests run desktop, tablet, and phone viewports, both themes, accessible dialogs, and offline reload, encrypted recovery, photo retries, source-backed billing/approval/credit/PDF workflows, payments/deposits/aging/receipts and manual reconciliation, assigned repairs/time/materials/private photos/equipment, reviewed purchase orders/partial receipts/returns, dated employee checklists and in-app notifications, and the complete UI → API → PostgreSQL path through a test-only HTTP fixture. They create fictional records only. Browser Auth responses are deterministic; they are not evidence of hosted Supabase Auth or production deployment.

The fixture binds to loopback and is never imported by application routes. The browser test process supplies its own public test environment values. Do not deploy `tests/support/fixture.mjs`. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and JSON-array `PLAYWRIGHT_CHROMIUM_ARGS` environment values support a preinstalled local test browser.

GitHub Actions repeats lint, PostgreSQL tests, build, type checks, and Playwright tests for pull requests. It uses pinned official action commit IDs and read-only repository permissions. No production secrets are needed.

## Deployment

Deploy only after reviewing/merging the PR and completing dedicated database setup. A standard Next.js-compatible host such as Vercel can run this project with `npm run build`; the Node server uses `npm start`. Keep the repository and preview access private. Do not change the audience during deployment.

Use separate Supabase projects and environment values for development, staging, and production. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL` in the selected environment. Public values are embedded at build time, so rebuild after changes. Configure the exact callback origin in the matching Supabase Auth project. Use HTTPS outside local development.

Apply reviewed database migrations to the matching environment before releasing code that depends on them. Do not point previews at production tenant data. A deployment URL is not supplied by this PR because no deployment was performed.

## Record safety and operations

- Archive instead of delete. Active stays block archiving a property, site, or customer. Restore keeps the same identity.
- Contact edits are auditable. Completed stays, agreed rent, and row ownership cannot be silently rewritten.
- No customer data goes into browser localStorage. The theme preference is the only app data saved there.
- Before real use, configure database backups/retention and rehearse a restore in staging. Archive is not a backup. Retain migration files alongside periodic authorized data exports, and limit access to audit snapshots containing private details.
- Owner JSON business archives and an offline verifier are available; complete DB/Auth/private state/Storage restore is a separate operational workflow. General document uploads and active online payment processing are not included. Meter and work-order photographs and protected offline meter reading are included. Operations screens require a connection. CSV exports cover sites, billing charge history, aging, unmatched cash, work orders and stock movements.
- Review [docs/architecture.md](docs/architecture.md) for roles, data boundaries, and scale limits. Follow [docs/roadmap.md](docs/roadmap.md) for milestone records and remaining hosted launch gates.

## Reports, resident portal and account archives

Use **Reports & properties** for the 15 saved-source reports, per-property/current operational measures and filtered CSV (maximum 10,000 rows; narrow filters if larger). Current measures and range activity are labeled separately. Report financial access is checked for each property.

Residents register/sign in at `/login?portal=1`, then give their registered account ID to the office through a verified contact process. Only the owner can link/revoke that person in **Portal & account**. A link grants access to that customer’s entire retained account history; it does not add staff access. `/portal` shows own issued statements/receipts, current stays/rent, recorded lease references, maintenance requests, office-reviewed contact proposals and in-app message preferences.

**Resident communications** prepares English/Spanish copies with immutable audience/personalization. A staff member must explicitly publish after the scheduled target; consent and language are checked again. Email/SMS delivery and online payments remain disabled.

Owner JSON exports include sensitive public business rows and a Storage manifest, with 20 MiB/100,000 total/20,000 per-table limits. Run `node scripts/verify-export.mjs FILE` and optionally compare `--expected-sha256` with the trusted retained audit receipt. This export does not contain Auth, private state or photo bytes and is not a full backup or restore format. Follow [recovery](docs/backup-recovery.md), [audit](docs/security-accessibility-performance-audit.md), [subscriptions](docs/subscription-architecture.md) and [deployment gates](docs/deployment-launch-checklist.md) before launch.
