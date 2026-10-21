# ForgeOS-Property-Manager

All-in-one RV park, apartment, and property management operating system.

**One System. Every Site. Total Control.**

This repository contains the Milestones 1–4 property workspace, tablet meter reader and supervised billing: a Next.js property workspace backed by a dedicated Supabase PostgreSQL database. It supports organization onboarding, scoped staff roles, property/site/unit directories, customers, reservations, availability and calendars, lease-term history and renewals, move-in/out handovers, planned departures, atomic site transfers, an operational dashboard, a coordinate-backed site map, CSV export, and safe archive/restore, dated meter assignments, assigned reading routes, encrypted offline capture and photos, idempotent sync, supervisor corrections, a conflict inbox, effective-dated utility rates, exact consumption/rent calculations, versioned draft invoices, supervisor approval, PDF/print statements, and an internal customer ledger with credits and reversals.

The full brief is [MASTER-BUILD-PROMPT.md](MASTER-BUILD-PROMPT.md). The repository remains private and the existing MIT license is unchanged. Development uses feature branches and pull requests; do not merge automatically.

## Current status

Implementation and verification are described in [docs/phase-4-report.md](docs/phase-4-report.md). Earlier milestone reports remain in `docs/`. A dedicated live Supabase project is not configured by this change, and no hosted website or live customer data is created. Without environment variables the app opens an explicit setup screen. It never substitutes browser-local sample records for a working database.

Payments, receipts, aging, maintenance, and communications remain upcoming. No live payment collection, late fees, customer notices, or invoice issuance is enabled.

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

Apply all four migrations as described below, then run:

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
- Move-in/out forms retain occupants, vehicle details, condition and handover notes. Meter notes and document references are optional references to your current process; verified meter readings and meter photographs are available in Meters & reader; legal attachments, work orders and invoice/deposit reconciliation remain separate workflows.
- **Leases & renewals** records reviewed terms linked to a stay. Renewals append adjacent terms. Saved terms cannot be rewritten; managers can void mistakes with a reason and record corrected terms. The registry does not sign a legal document, issue an invoice, or update a stay's planned departure. Update the departure plan separately when extending occupancy. Booking deposit amounts are manually noted references, not a financial ledger.
- Customer and site detail dialogs include booking, lease and occupancy histories. Completed, cancelled, no-show and voided records remain accessible to authorized staff.

### Tablet meter reader

Open **Meters & reader** to create meters, dated site assignments and assigned routes. Employees open **Open tablet reader** online, protect the device queue with a passphrase, and download their routes before going offline. Save each observation before advancing; photos stay with the encrypted queue. Use **Sync now** after reconnecting. Supervisors review original readings, append corrections, and reconcile conflicts without overwriting captures.

The installable shell caches only public assets. IndexedDB holds encrypted route data, readings, photos and automatic-lock drafts; no authentication token is stored there. Export encrypted recovery copies and keep the passphrase securely. Browser storage retention, actual Android/iPad behavior and hosted private Storage must be tested before live use. Full workflow, limits and setup: [Milestone 3 report](docs/phase-3-report.md).

### Utilities, invoices and the internal ledger

Open **Utilities & billing → Rates & policy** and authorize the property's USD billing/proration/tax policy. Add effective-dated electric, water and gas schedules, including explicit register-unit conversions, cumulative tiers, monthly base service and authorized water sewer charges. Record a zero-price schedule when a utility is included in rent. New versions close the selected earlier schedule; approved historical rates are protected.

In **Invoices**, select a customer stay and an exclusive-end billing period. Rent comes from the recorded stay and effective lease terms, or an explicitly authorized custom agreement. Metered charges require approved boundary readings for every assignment, including replacements; rate changes require a reading on their effective date. Reset/rollover readings need a documented register event. An explicit rent-only draft can omit utilities with a reason; prepare a later utilities-only invoice without rent.

Office staff may prepare drafts. Supervisors approve, credit, reverse credits or void invoices. Approval verifies the saved calculation against current sources and posts an **approved / unissued internal balance**. Refreshing a stale draft appends a revision. Every earlier revision and ledger event remains. Download an itemized PDF, open the printable statement or export the internal ledger. PDFs embed licensed Noto Sans Latin fonts; unsupported characters produce a clear printable-statement fallback instead of changed customer names.

No customer invoice issuance, email delivery, payment request, payment collection, late fee automation or notices are activated. The exact rounding conventions, supported workflows and staging acceptance steps are in [Milestone 4 report](docs/phase-4-report.md).

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

4. Run the project's Supabase security and performance advisors, inspect migration history, and repeat the live acceptance workflows in [docs/phase-4-report.md](docs/phase-4-report.md). The local PGlite tests do not replace this hosted check.

Alternatively, use a local Supabase stack with Docker. The checked-in `supabase/config.toml` and empty `supabase/seed.sql` are ready for it. Inspect `npx supabase start --help`, start the stack, and use that stack's URL/publishable credentials. Apply pending migrations using the CLI's current migration command. This environment did not have Docker, so the complete local Supabase stack was not exercised.

Apply all four checked-in migrations in order. The foundation migration remains unchanged; the additive planning migration retains existing records, adds reservations and lease terms, extends stay handover fields, and backfills existing stays into a private availability-allocation table. The tablet migration adds meter/routes/readings/reviews, conflicts, private occupant attribution and a private photo bucket. The billing migration adds property policies, rates, register events, immutable invoice revisions and ledger entries, with private retry IDs, number counters and overlapping billing claims. All 25 public application tables and seven private tables have RLS; authenticated grants are explicit. `btree_gist` supplies UUID/date-range overlap protection. The private schema must **not** be added to the exposed Data API schemas. Do not run these migrations against a shared or unrelated database.

### Auth configuration

In the dedicated Supabase project's Auth settings:

- Set the Site URL to your actual application origin.
- Allow the exact callback URL, for example `http://localhost:3000/auth/callback`, and later the exact staging/production URLs.
- Configure email confirmation and an appropriate email provider/rate limits for real users. The UI requires at least 12 characters for new passwords; align hosted Auth password settings accordingly.
- Test signup, the actual confirmation email, sign-in, session refresh, invalid credentials, and sign-out on the configured project. Email delivery and hosted Auth are not covered by the deterministic local test fixture.

The app uses PKCE and `/auth/callback` to exchange the confirmation code for a session, then redirects to the workspace. It does not accept an arbitrary redirect destination.

### Staff access

Each employee first creates their own account and copies their user ID from **Team & access**. The owner selects **Grant property access**, enters that registered user's ID, and chooses the property and role. This grants access immediately without sending an invitation message. Revoke removes the property assignment; organization owners and administrators retain organization-wide access.

The first account that creates an organization receives the owner role. Organization administrator assignment is an intentional administrative database operation in this milestone; the UI only grants property roles. Future invitations, account recovery UX, and resident access are separate work.

## Verification

```bash
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit tests cover exact money, dates/DST/leap days, calendar boundaries, status derivation, validation, and safe CSV. Database integration tests apply the actual migrations to embedded PostgreSQL with `btree_gist`, switch authenticated roles, and exercise RLS, reservation/stay/lease conflicts, archives, history, transfers, renewals, revocation, audit restrictions, meter assignment/history conflicts, idempotent captures, review corrections, private photo policies and conflict reconciliation. Browser tests run desktop, tablet, and phone viewports, both themes, accessible dialogs, and offline reload, encrypted recovery, photo retries source-backed billing/approval/credit/PDF workflows, and the complete UI → API → PostgreSQL path through a test-only HTTP fixture. They create fictional records only. Browser Auth responses are deterministic; they are not evidence of hosted Supabase Auth or production deployment.

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
- This foundation does not yet offer full database export/restore UX, general document uploads, resident accounts, billing, or payment processing. Meter photographs and protected offline reading are included. The CSV export is a site-directory export only.
- Review [docs/architecture.md](docs/architecture.md) for roles, data boundaries, and scale limits. Follow [docs/roadmap.md](docs/roadmap.md) for Milestone 4 utilities and billing work.
