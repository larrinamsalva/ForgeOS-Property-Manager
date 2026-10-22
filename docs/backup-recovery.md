# Backup and recovery runbook

Owner: the ForgeOS account owner and the operator of its dedicated Supabase project. This is a recovery plan; a hosted full restore has not been rehearsed by this implementation.

## Recovery layers

| Layer | Contents | Required recovery source |
| --- | --- | --- |
| Application | Source, seven reviewed migrations, dependency lockfile | Private Git history and retained release commit |
| Full database | Public business records, private idempotency/counters/claims, Auth data and policies | Verified platform backup/PITR or reviewed complete logical backup |
| Storage | Private meter/work photo objects | Independently retained object bytes plus metadata and policy configuration |
| Configuration | Auth callback/provider settings, keys, host settings, DNS and backup access | Separate encrypted operational inventory; never commit secrets |
| Business archive | Owner-scoped public JSON rows and photo manifest | Owner download plus separately retained audited checksum |

The account JSON is **not a full database backup or an automatic restore format**. It omits Auth users/sessions/credentials, every private-schema retry/counter/source-claim table, Storage bytes and service configuration. It includes sensitive staff notes, contact data and access links; encrypt it and restrict retention/access. Supabase database backups do not include Storage object bytes. Custom database role passwords can need separate recovery. Follow the current [platform backup documentation](https://supabase.com/docs/guides/platform/backups) and [CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), rather than treating a public-schema-only dump as complete.

Before launch, record approved RPO/RTO, retention, backup owner, alternate recovery operator, encryption/key custody and restore test schedule. Verify the selected project/plan’s actual retention and PITR availability. Confirm an off-project recovery copy survives loss of the original account. Recovery may cause downtime; choose a maintenance window and stop writes before cutover.

## Owner archive verification

Use Portal & account → Export account JSON. Owner authorization, reason and request identity are audited. Snapshot limits are 20,000 rows/table, 100,000 rows total and 20 MiB; oversized exports fail without delivering partial data. Three starts per actor per hour. The pending export’s own mutable receipt is excluded from its snapshot; its completed status/hash/size remains in the source database.

```bash
node scripts/verify-export.mjs /secure/path/account.json
node scripts/verify-export.mjs /secure/path/account.json --expected-sha256 RETAINED_AUDIT_HASH
```

The checksum is SHA-256 over canonical sorted-key JSON of `{manifest,payload}`. It excludes the checksum field and is not the hash of pretty-printed downloaded bytes. The offline verifier checks the exact table and migration registries, organization/property scope, counts, limits and photo manifest paths/hashes/types. Embedded checksums detect accidental changes; an attacker can recompute one. Compare the optional expected hash with a separately trusted `account_exports.sha256` audit receipt for provenance. This is not a digital signature. Verification does not contact a service, import records or recover photo bytes. Retain the seven migration files alongside the archive. Preserve exact cents/milli strings.

## Full restore rehearsal — required before launch

1. Confirm source project ID, latest backup time, expected loss window, operator access and a separate isolated staging destination. Inventory database extensions/roles, Auth users, schema/policies, private tables, object bytes, bucket settings and app/environment versions. Never restore another product’s project or expose tenant data in a preview.
2. Follow the platform’s supported full recovery method. For logical migration, use the documented role/schema/data sequence and include all required managed/Auth/private data; review managed-schema and custom-role caveats against that platform version. Do not replay production writes or run a destructive restore against the source.
3. Restore photo bytes independently. Verify object count, size and SHA-256 against metadata. A restored `storage.objects` row alone is not a restored photo. Check private bucket policies and expired/voided object access.
4. Reconfigure the destination’s Auth callbacks/providers, HTTPS origin, publishable key, host variables, policies and non-repository secrets. Rotate any exposed credentials. Keep outbound email/SMS/payment integrations disabled. Auth sessions may require sign-in again; verify registered user IDs still match staff and resident grants.
5. Compare per-table counts and source audit totals. Reconcile issued balances, payments, deposits and statement cash totals, work/stock/equipment histories, active source claims and operation/counter state. Verify exact retry IDs do not duplicate transactions after recovery.
6. Exercise owner, office, technician, maintenance and resident logins; cross-organization/property denial; revoked grants; own statements/receipts; a photo round trip; an offline queue sync; and archive verification. Record evidence, elapsed recovery time, actual RPO/RTO and any discrepancies. Repeat until the approved targets are met.
7. Obtain release authorization for cutover, make a final backup, stop writes, restore the final delta through the supported process and verify again. Keep the previous environment intact for investigation. After cutover, monitor errors and reconcile balances before reopening normal operations.

An application rollback does not undo database history. Prefer a compatible previous app release or a reviewed forward migration. A full database rollback needs a new backup, maintenance plan and explicit owner approval because it can lose later transactions. No automatic rollback or JSON importer is included.
