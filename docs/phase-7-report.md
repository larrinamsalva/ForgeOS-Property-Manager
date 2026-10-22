# Milestone 7 — reports, resident portal and commercial readiness

ForgeOS 0.7.0 extends merged Milestone 6 with an independent resident workspace and retained commercial workflows. The canonical repository and MIT license are preserved. Seven reviewed migrations now define 66 public and 17 private RLS tables. This is a source implementation for PR review; hosted activation remains separate.

## Delivered behavior

- **Reports & properties:** daily operations, occupancy, reservations, tenant history, rent roll, monthly billing, utility usage, meter exceptions, aging, payment history, maintenance, inventory, employee completion, revenue trends and property comparison. Organization/property/site/customer/employee/status/category filters are available where meaningful, with date bounds, stable pagination and bounded formula-safe CSV. The overview adds saved-source work/checklist/meter/billing/past-due/stock measures.
- **Resident portal:** `/portal` has its own registration/sign-in destination and owner-linked account access, independent of staff onboarding. Residents see their own current stay/rent, issued balances, sanitized invoice usage/PDF/print, receipts/PDF/print, recorded lease references and reservations. Maintenance requires an actual current stay; later private staff text never replaces the resident’s submitted history. Contact proposals require office approval against the original customer baseline. All history sections are paged and retained.
- **Communications:** English/Spanish templates and custom messages with four allowlisted nonrecursive placeholders, preview, fixed recipient snapshots, optional target timestamp, explicit due in-app publication, current language/consent recheck, cancellation, private staff notes and resident read acknowledgements. Email/SMS choices are consent records only. No external dispatch, cron or legal-notice delivery is asserted.
- **Advanced exports:** report CSV and owner-only audited organization JSON with an exact 66-table registry, seven migration filenames, counts and Storage object metadata. An offline verifier checks checksum/scope/limits and optionally a separately retained audit hash. Database/Auth/private state and binary Storage recovery require the full runbook; no JSON importer is included.
- **Readiness:** bounded UTF-8 request streams, strict forged-scope rejection, fresh production script nonces, narrowed statement DTOs, per-property financial report checks, accessible responsive controls, bounded queries/indexes, disabled subscription/entitlement contracts, recovery and deployment documentation.

## Interpretation and limits

Daily/occupancy/rent/aging/stock/portfolio measures are current as labeled; activity reports use start-inclusive/end-exclusive property-local dates. Monthly billing is approved/issued source history, not automatically created invoices. Revenue trends group currently adjusted issued charges by original issue month and report payment/deposit cash separately; they are not general-ledger accrual recognition. Employee completion is work/checklist activity, not payroll or a productivity rating. Utility usage is approved issued statement evidence. Meters and reports do not invent readings or financial postings.

Owners must verify each resident’s identity and registered account UUID through their normal contact process. A link exposes that customer account’s retained history to the linked person. Removing access is effective on the next authorized request. Archived/inactive accounts retain read history but cannot submit new changes. Published messages remain visible after later opt-out. Contact decision reasons are public to that resident; private analysis belongs in staff records.

## Verification

- Lint and TypeScript checks pass.
- **130 unit/database tests pass in 15 files**, applying the actual seven migrations. Added tests exercise independent resident RLS, foreign/revoked/expired/archive access, maintenance original-text insulation and exact retries/rate limits, approval/stale contact proposals, frozen message/consent/read/cancel history, all 15 report branches, mixed-role property denial, owner archive verification and own issued invoice/receipt privacy.
- Browser and production-build results will be recorded after the final candidate checks finish. Browser tests use a loopback-only Supabase-shaped HTTP fixture over real PostgreSQL; they do not certify hosted Auth or Storage.
- Production dependency audit: **0 vulnerabilities**. Full audit retains **5 high development-chain findings** from the unpatched braces advisory, with scope/mitigation and pending owner exception documented in the audit.

## Release and recovery

Read [security/accessibility/performance audit](security-accessibility-performance-audit.md), [backup/recovery runbook](backup-recovery.md), [disabled subscription architecture](subscription-architecture.md) and [deployment/launch checklist](deployment-launch-checklist.md). Complete hosted security/performance advisors, real Auth/PostgREST/Storage and concurrent-role acceptance, a full DB/Auth/Storage restore rehearsal, physical-device/screen-reader acceptance, representative load checks, dependency exception review and authorized deployment before commercial launch.

No hosted migration, deployment, processor/subscription activation, supplier order, real customer notice or automatic PR merge was performed.
