# Milestone 3 · Tablet meter reader

Milestone 3 adds a meter directory, effective-dated site assignments, assigned reading routes, an installable tablet reader, encrypted offline collection, photographs, retry-safe synchronization, supervisor review and a conflict inbox. Milestones 1 and 2 remain available. The original MIT license and corrected private repository address are preserved.

## Operating workflow

1. An owner, administrator or assigned property manager opens **Meters & reader**, selects the property and adds electric, water or gas meters. Record the serial, physical location, units, register digits, multiplier, installation instant and optional unusual-increase threshold.
2. Assign each meter to a site with an exact effective start. One meter cannot have overlapping site assignments. Close an assignment with a reason before reassigning or replacing it. Retirement records the removal instant; original meters and assignments remain in history. Existing captures prevent retroactive changes that would invalidate their assignment.
3. Create a monthly, weekly or custom route, select its stops and assign a manager, organization owner/administrator or property meter technician. Collection starts on an inclusive property date and ends on an exclusive property date, within a maximum 31-day window. Each run is created explicitly; the cadence label does not create recurring jobs.
4. The assigned employee opens **Open tablet reader**, while online and signed in. Choose a device passphrase of at least 10 characters and download the assigned routes. Install through the browser menu, or Share → Add to Home Screen on iPad. HTTPS is required outside loopback development. The manifest includes PNG installation icons; the application scope includes login, while the service worker controls only the tablet shell.
5. Select a route, enter the actual register or an explicit missing/damaged/problem report, optionally photograph the meter, then press **Save reading & next**. The reader has large controls, site search, previous/next navigation, route progress, an offline indicator and outdoor mode. Saving waits for the local database transaction before advancing. A storage failure retains the form and photo on screen.
6. Keep the reader open and press **Sync now** when connected. Reconnection also attempts foreground sync. A server receipt acknowledges each immutable capture. Photographs have a separate pending/uploaded state, so interrupted uploads can retry without duplicating the reading or file. No background-sync promise depends on platform support.
7. A supervisor reviews the captures and photographs. An accepted/rejected decision and optional corrected register append to the original observation. Each decision requires a reason. Concurrent reviews require a refresh. Declared photographs must finish uploading before acceptance. Missing values cannot be accepted without a corrected numeric value.
8. Changed assignments, stale baselines, competing captures and invalid capture times are preserved locally and reported to the supervisor conflict inbox when authorization remains valid. A supervisor can link a duplicate to an existing receipt for that meter assignment, or discard it with a retained reconciliation/recollection reason. A subsequent device sync acknowledges that resolution. Originals remain in both histories; no competing capture is silently overwritten. Photos attached to a rejected operation remain in the encrypted device/recovery file, rather than being attached to a different reading.

## Data and permission boundaries

The CLI-generated additive migration is `supabase/migrations/20261021055004_tablet_meter_reader.sql`. Apply all three migrations in order to a dedicated ForgeOS database. The earlier migrations are unchanged.

| Record                                                | Purpose                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `meters`                                              | Utility, serial, units, register configuration, multiplier, installation/removal and notes      |
| `meter_assignments`                                   | Nonoverlapping effective instants, retained site label and closure reason                       |
| `meter_routes` / `meter_route_items`                  | Assigned employee, collection window, schedule, ordered stops and cancellation history          |
| `meter_readings`                                      | Original register text, capture/device/operator identity, expected baseline and exception flags |
| `meter_reading_reviews`                               | Append-only acceptance/rejection and correction history                                         |
| `meter_photos`                                        | Private object path, expected byte count/hash/type and upload state                             |
| `meter_sync_conflicts` / `meter_conflict_resolutions` | Original rejected operation, conflict code and supervisor reconciliation                        |
| `private.meter_sync_operations`                       | Exact submitted payload and unique client operation ID for idempotency                          |
| `private.meter_reading_occupancy`                     | Site, actual stay/customer and property civil date effective at capture                         |

All 19 public application tables and all three private tables have RLS. Application roles have read grants on meter tables and use narrow authenticated transactional functions for writes. No business-record delete grant is added. Privileged functions stay in the non-exposed private schema with an empty search path and explicit identity/role checks; public wrappers remain invoker functions.

Owners, administrators and property managers configure meters/routes and review readings within their scope. Technicians receive only meters/history associated with their assigned routes; they cannot read customer, occupancy, rent, reservation, lease or audit rows, configure meters, approve readings or submit estimates. Maintenance and office roles do not receive meter access in this milestone. Every capture must belong to the signed-in assigned employee. The server rechecks authorization during sync; a local download never grants server access.

Capture IDs are client UUIDs with a database uniqueness check. Repeating the identical authorized operation returns its original receipt. Changing its content, or submitting a second operation for the same route stop, produces a conflict. Assignment locks and a property lock serialize capture, assignment changes and review. Authorized retries of an acknowledged capture still work after route cancellation; new captures for cancelled routes are refused. Role revocation takes effect on subsequent server requests.

Register values and multipliers remain decimal text with at most six fractional digits and are compared using PostgreSQL `numeric` or browser `BigInt` scaling. Lower registers need an explicit rollover/reset flag and reason; overflow is rejected. Zero increases, unusual increases, estimates and physical exceptions remain visible for review. Estimated captures require a supervisor. This milestone does not calculate consumption charges or issue invoices.

Attribution uses the actual stay covering the captured property's civil date, with inclusive arrival and exclusive departure. This retains the earlier occupant when an offline reading arrives later. Customer/stay links are kept in the private attribution table and returned only to supervisors, never in the offline route download. A vacant site is recorded explicitly with no occupant link.

## Device storage and recovery

The public service worker caches an explicit allowlist of account-independent HTML, JavaScript, CSS, manifest and icon assets. It does not cache authenticated pages, API responses, customer records, cookies or signed photo URLs.

Route snapshots, captures, photos and privacy-lock drafts use IndexedDB, encrypted with AES-256-GCM, random per-record IVs, record/scope-associated data and a PBKDF2-SHA-256 device-passphrase key (600,000 iterations and a random salt). The encryption key remains in memory while unlocked. Unencrypted metadata is limited to version, opaque account/organization/device identifiers, record IDs and pending flags. Authentication tokens and passphrases are not stored in that database. Device storage is isolated by organization and user, and the signed-in account is checked before downloads/sync. Same-origin script execution or an unlocked compromised device is outside this protection; use a private work device with a screen lock.

The reader locks after ten minutes without interaction or one minute hidden. Before automatic locking, an unfinished form/photo is encrypted as a draft for the next unlock; it is not submitted as a reading. Manual form navigation warns before discarding unsaved input. Sign-out warns about pending local records and retains them. Account changes, access loss, upload failure and session expiry do not erase the queue.

The reader displays storage estimates, supports requesting persistent browser storage, reports quota failures, exports an encrypted recovery JSON including photos and supports importing it on another browser. Import is atomic and refuses to overwrite an existing local queue. Local writes verify the vault within the same transaction; removing a completed queue races safely with another tab saving a new record. The original passphrase is required. Unsynced entries cannot be removed with the completed-queue control. After server acknowledgment or explicit supervisor reconciliation, a user may export and remove the completed local queue.

Browsers can still evict data, private modes can restrict storage, and a lost passphrase cannot be reset for unsynced encrypted records. Keep recovery exports securely and sync regularly. Route downloads expire for new offline collection after seven days. Captures must sync within fourteen days and must fall within their route window, installation and assignment instants. An old/conflicting entry is retained for reconciliation rather than backdated or reassigned silently.

Photos are decoded and resized on device to at most 1600 pixels on the longest side, re-encoded as JPEG to remove original metadata, hashed, encrypted and queued. Supported sources are JPEG, PNG and WebP; HEIC needs the camera's compatible format. Each upload is at most 5 MB. The server bounds the request stream, checks image signature/size/hash against the reserved metadata and uses the caller's ordinary Supabase session. The `meter-photos` bucket is private, with route/operator/property policies and no overwrite/delete policy. Viewing requires current authorized access and a 60-second signed URL. Original evidence is retained; no service-role key is used.

## Verification

Local checks cover the complete application UI → API → authenticated PostgreSQL role → response flow using fictional records. The PostgreSQL engine applies the actual migrations with `btree_gist`; the loopback fixture supplies deterministic Auth, REST and private Storage-shaped HTTP boundaries. It is not Supabase Auth, PostgREST or the hosted Storage service and must never be deployed.

Validation: 48 unit/database tests in seven files passed. The full Playwright suite passed 20 cases, with 10 intentional duplicate lifecycle skips across viewports; responsive/offline flows run at all three sizes. ESLint, TypeScript checks and the optimized Next.js production build passed. The tablet scenarios were rerun after the final queue concurrency/privacy safeguards. Browser scenarios include offline capture, reload, quota failure without advancing, encrypted export/import, interrupted photo upload, duplicate prevention, reconciliation, session expiry, revoked access, account switching, sign-out warnings, responsive layout and accessibility. Earlier booking/lease/occupancy flows remain regression checks.

## Hosted and actual-device acceptance still required

No dedicated ForgeOS Supabase project or deployment was connected, provisioned or migrated during this work. No live customer data, email, invoice, charge or notice was created. Before a private staging release:

1. Confirm a dedicated project, backups and a tested restore. Apply the migrations in order; inspect bucket restrictions and every existing Storage policy, then run Supabase security/performance advisors.
2. Verify actual signup/email confirmation, session refresh/expiry, sign-out, role revocation, PostgREST RPC results, private uploads/downloads, duplicate upload retries and signed URL expiry. Test that another organization, an unassigned technician and an anonymous request cannot access photographs or meter/customer history.
3. Serve a private HTTPS build and exercise installation, camera/file permissions, outdoor visibility, keyboard/touch entry, airplane mode, process termination/restart, device lock, low storage, recovery import and reconnect on actual Android tablets and iPad/Safari. Browser viewport tests do not certify those devices or their storage retention.
4. Have supervisors review real-world meter digit/unit/multiplier configurations and assignment boundaries, including meter swaps, damaged/missing meters, rollover/reset, zero and unusually large readings and move-out capture dates. Rehearse recovery of a revoked employee's encrypted queue through an authorized account/access process.

The current Supabase changelog and official private Storage/RLS documentation were reviewed during implementation. No unrelated project's database, credentials or deployment was reused.

Milestone 4 can build precise utility calculations and reviewed draft invoices from accepted reading history after this PR is reviewed and merged. Legal documents, live billing, payment collection and production rollout remain separately configured work.
