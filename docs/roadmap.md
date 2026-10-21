# ForgeOS build sequence

The full authorized product brief is [MASTER-BUILD-PROMPT.md](../MASTER-BUILD-PROMPT.md), using https://github.com/larrinamsalva/ForgeOS-Property-Manager with no trailing period.

| Milestone                  | Deliverables                                                                                                                                            | Gate                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 · Foundation             | Sign-in, organizations/roles, property and site directories, customers, occupancy/history, dashboard, map grid, archive/restore, validation, RLS, tests | Local checks and PR review; dedicated Supabase live acceptance remains               |
| 2 · Reservations & leases  | Calendar, availability, booking/deposits foundation, arrivals/departures, full move-in/out checklists, renewals and lease foundations                   | Real date/time/overlap tests, customer history preserved                             |
| 3 · Tablet meter reader    | Installable PWA, meter directory/assignment history, assigned routes, photos, offline queue, sync, supervisor review                                    | Device/offline/reconnect/conflict tests and secure file access                       |
| 4 · Utilities & billing    | Effective-dated electric/water/gas rates, precise usage, itemized draft invoices, approval, PDF and ledger foundation                                   | Calculation edge cases and meter-to-invoice traceability; no automatic live issuance |
| 5 · Payments & collections | Manual payments, allocations, receipts, deposits, aging, credits, configurable fees, reconciliation                                                     | Authorized rules; live processor activation separately configured                    |
| 6 · Operations             | Work orders, preventive maintenance, inventory, purchasing, equipment, staff checklists                                                                 | Atomic inventory changes, role permissions, audit trail                              |
| 7 · Commercial readiness   | Reports, resident portal, communications, exports, backup recovery, subscription architecture, audits                                                   | Security/accessibility/performance review and launch authorization                   |

Each milestone must retain working functionality and leave a reviewable, testable branch. No automatic merges, public exposure, payment collection, live customer notices, or database reuse from another product.

## Tablet reader prerequisites and implementation detail

1. Connect and verify a dedicated ForgeOS Supabase project. Run its security/performance advisors, test owner/staff access, and establish backups. Use separate staging data.
2. Finish Milestone 2 occupancy/lease assignment semantics. Meter readings must resolve the site and the occupant that was effective when the reading was collected, rather than today's occupant.
3. Add `meters`, effective-dated `meter_assignments`, `meter_readings`, reading corrections, route headers/items, photo metadata, and an idempotency/sync-operation table. Keep organization and property ownership on all entities.
4. Define measurement units, register digits, multipliers, meter installation/replacement/rollover events, capture timestamps, and technician identity. Do not treat a lower reading as ordinary consumption.
5. Build a large-input route UI with last reading, save/next/previous, flag/missing meter, progress, camera, offline state, and a manual Sync Now action.
6. Add an installable shell and an IndexedDB outbox. Bind pending operations to the signed-in organization/user/device; queue photos alongside readings; preserve them across reloads. Never put customer financial records in a broadly cached shell.
7. Send client-generated operation IDs with server uniqueness constraints so retries cannot duplicate readings. Treat stale assignments, revoked access, concurrent captures, and edited history as explicit conflicts for review. Do not silently overwrite the latest reading.
8. Use a private Storage bucket with property/route/technician policies and short-lived signed photo URLs. Revisit the camera Permissions-Policy deliberately. Validate image size/type and keep a recoverable photo-sync state.
9. Warn before logout when records remain unsynced, show storage usage/quota failures, and provide a safe recovery/export path. Do not erase the outbox on a failed upload or account change.
10. Test airplane mode, midway disconnect, reload, duplicate retry, expired session, lost permissions, low storage, photo failure, meter replacement, rollover, zero/unusual consumption, route completeness, and supervisor corrections on actual Android/iPad tablets. Background sync is platform-dependent; reliable manual/foreground sync is required.

The tablet milestone does not issue invoices. Approved readings become inputs to the separately tested utility calculation and invoice approval workflows in Milestone 4.
