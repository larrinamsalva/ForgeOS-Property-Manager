# ForgeOS build sequence

The full authorized product brief is [MASTER-BUILD-PROMPT.md](../MASTER-BUILD-PROMPT.md), using https://github.com/larrinamsalva/ForgeOS-Property-Manager with no trailing period.

| Milestone                  | Deliverables                                                                                                                                              | Gate                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 · Foundation             | Sign-in, organizations/roles, property and site directories, customers, occupancy/history, dashboard, map grid, archive/restore, validation, RLS, tests   | Local checks and PR review; dedicated Supabase live acceptance remains                                            |
| 2 · Reservations & leases  | Day/week/month calendar, availability, booking/deposit references, arrivals/departures, handover notes, planned departures, transfers, terms and renewals | Local SQL/browser checks and PR review; hosted acceptance and legal/document workflows remain                     |
| 3 · Tablet meter reader    | Installable PWA, meter directory/assignment history, assigned routes, photos, offline queue, sync, supervisor review                                      | Local offline/reconnect/conflict/recovery tests and PR review; hosted Storage and actual tablet acceptance remain |
| 4 · Utilities & billing    | Effective-dated electric/water/gas rates, precise usage, itemized draft invoices, approval, PDF and ledger foundation                                     | Local calculation, traceability, PDF and credit/reversal tests; PR review and hosted acceptance; no live issuance |
| 5 · Payments & collections | Manual payments, allocations, receipts, deposits, aging, configurable fees, reconciliation; build on M4 credits                                           | Authorized rules; live processor activation separately configured                                                 |
| 6 · Operations             | Work orders, preventive maintenance, inventory, purchasing, equipment, staff checklists                                                                   | Atomic inventory changes, role permissions, audit trail                                                           |
| 7 · Commercial readiness   | Reports, resident portal, communications, exports, backup recovery, subscription architecture, audits                                                     | Security/accessibility/performance review and launch authorization                                                |

Each milestone must retain working functionality and leave a reviewable, testable branch. No automatic merges, public exposure, payment collection, live customer notices, or database reuse from another product.

## Tablet reader hosted acceptance and implementation record

1. Connect and verify a dedicated ForgeOS Supabase project. Run its security/performance advisors, test owner/staff access, and establish backups. Use separate staging data.
2. Finish Milestone 2 occupancy/lease assignment semantics. Meter readings must resolve the site and the occupant that was effective when the reading was collected, rather than today's occupant.
3. Implemented in Milestone 3: `meters`, effective-dated `meter_assignments`, `meter_readings`, reading corrections, route headers/items, photo metadata, and an idempotency/sync-operation table. Keep organization and property ownership on all entities.
4. Define measurement units, register digits, multipliers, meter installation/replacement/rollover events, capture timestamps, and technician identity. Do not treat a lower reading as ordinary consumption.
5. Build a large-input route UI with last reading, save/next/previous, flag/missing meter, progress, camera, offline state, and a manual Sync Now action.
6. Add an installable shell and an IndexedDB outbox. Bind pending operations to the signed-in organization/user/device; queue photos alongside readings; preserve them across reloads. Never put customer financial records in a broadly cached shell.
7. Send client-generated operation IDs with server uniqueness constraints so retries cannot duplicate readings. Treat stale assignments, revoked access, concurrent captures, and edited history as explicit conflicts for review. Do not silently overwrite the latest reading.
8. Use a private Storage bucket with property/route/technician policies and short-lived signed photo URLs. Revisit the camera Permissions-Policy deliberately. Validate image size/type and keep a recoverable photo-sync state.
9. Warn before logout when records remain unsynced, show storage usage/quota failures, and provide a safe recovery/export path. Do not erase the outbox on a failed upload or account change.
10. Test airplane mode, midway disconnect, reload, duplicate retry, expired session, lost permissions, low storage, photo failure, meter replacement, rollover, zero/unusual consumption, route completeness, and supervisor corrections on actual Android/iPad tablets. Background sync is platform-dependent; reliable manual/foreground sync is required.

The tablet milestone does not issue invoices. Approved readings become inputs to the separately tested utility calculation and invoice approval workflows in Milestone 4.

Milestone 3 implementation, device recovery instructions and remaining hosted/physical-device acceptance are detailed in [phase-3-report.md](phase-3-report.md). Milestone 4 adds property-specific effective utility rates, exact usage calculations (including replacements/rollover), itemized draft invoices, supervisor approval, PDF/ledger traceability and calculation tests. No automatic live issuance.

## Milestone 4 acceptance

Implemented: explicit property policy, effective-dated electric/water/gas and sewer rates, exact rent/usage/tax calculations, boundary/replacement/reset handling, versioned draft statements, supervisor approval, PDF/print, internal account ledgers, credits, reversals, voiding and overlapping-charge prevention. Local coverage includes the real capture/review → invoice → approval → ledger path through the test fixture. Details: [phase-4-report.md](phase-4-report.md).

Before live use, configure a dedicated ForgeOS database, apply all four reviewed migrations, run hosted security/performance advisors, verify real Auth/PostgREST and source permissions, have supervisors authorize actual rates/proration/taxes, and reconcile sample bills with the existing process. Milestone 5 can proceed after this PR is reviewed and merged. Invoice issuance, customer messages and payment activation still require their explicit configuration.

## Milestone 5 acceptance

Implemented: explicit owner-configured manual issuance, manual payments and partial/multiple allocations, immutable receipts and exact reversals, refunds, separate deposit liabilities/applications/returns/deductions, current due-date aging and grace periods, separately reviewed fee drafts and waivers, account notes/arrangements/manual follow-ups, and previewed statement reconciliation with carry-forwards, source claims and retained variance/void history. Optional tenant and SaaS processor boundaries are disabled. Details: [phase-5-report.md](phase-5-report.md).

Before live use, apply all five reviewed migrations to a confirmed dedicated ForgeOS staging database, run hosted advisors and concurrency/role acceptance, authorize the actual contract/jurisdiction fee/deposit/tax rules, and reconcile sample accounts with the existing process. No hosted migration, deployment, real payment processing or outbound notices were performed. Milestone 5 has been merged; Milestone 6 adds property operations.

## Milestone 6 acceptance

Implemented: scoped work requests and assignment/schedule/status history, time, estimated/actual costs and manager completion approval; private before/after photos; exact append-only stock receipts, work usage/partial returns, adjustments and two-property transfers; suppliers, purchase requests, reviewed orders and partial receipts/returns; equipment checkout/return/service history; actual-role-linked staff profiles; recurring preventive/checklist calendars with once-only occurrence creation, dated item history and private in-app notifications. Details: [phase-6-report.md](phase-6-report.md).

Before live use, apply all six reviewed migrations to the dedicated ForgeOS staging database, run hosted advisors and real concurrent stock/checkout/occurrence tests, verify Auth/PostgREST/private Storage and role revocation, and review starting quantities, units, costs and staff assignments. No hosted migration, deployment, supplier order, payment or outbound notice was performed. Milestone 7 begins after PR review and merge.
