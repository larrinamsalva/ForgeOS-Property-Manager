# Deployment and commercial launch checklist

This branch implements Milestone 7 for review. It does not deploy ForgeOS, apply a hosted migration, send real notices or activate payment/subscription processing.

## Prepare a private staging release

- Review the PR, retained MIT license/master prompt, all seven migrations and the access/security audit. Keep the repository and preview audience private. Confirm the exact dedicated ForgeOS Supabase project; do not reuse another product’s database.
- Use separate development, staging and production projects/origins. Install the pinned lockfile with Node 22+ and run lint, tests, production build, typecheck and browser tests. Investigate any CI failure before release.
- Configure the three documented public variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`) for the intended build. No service-role secret belongs in browser code. Rebuild after public variable changes. Configure the exact HTTPS Auth callback origin and email confirmation/provider settings. Resident sign-in uses `/login?portal=1`; allowed post-auth destinations are `/` and `/portal`.
- Back up the verified target and retain the release commit. Apply the seven reviewed migration files in lexical order through an authorized database process before releasing dependent code. Verify 66 public and 17 private tables have RLS and private schema is not exposed. Never edit previously merged migrations to repair a live database; use a reviewed forward change.
- Configure private meter/work photo buckets, object limits and policy behavior. Verify real Auth/PostgREST/Storage requests, cookie refresh/logout, current role revocation and resident UUID linking. Ensure nonce CSP works on the production host and authenticated pages/API/document responses remain private/no-store.
- Build with `npm run build` and run using the host’s supported Next.js Node deployment or `npm start`. Keep production secrets out of pull-request CI, logs and downloadable artifacts. Exclude development tooling from the runtime installation. Production build-time variable substitution must match its target database.

## Release gates requiring recorded acceptance

| Gate                 | Required evidence                                                                                                              | Current status                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Authorization        | Merged reviewed release and explicit deployment/launch authorization                                                           | Pending                                                   |
| Hosted security      | Supabase security/performance advisors; cross-role/org/property and revoked resident tests through real Auth                   | Pending                                                   |
| Recovery             | Full DB/Auth/private state plus independent Storage-byte restore rehearsal meeting approved RPO/RTO                            | Pending                                                   |
| Accounting           | Supervisor-reviewed rates/proration/taxes/fees/deposits and reconciliation against existing statements                         | Pending                                                   |
| Communications       | Identity/consent/language review and approved content; explicit due in-app publication only                                    | Local workflow implemented; real notices unauthorized     |
| Accessibility        | Actual keyboard/screen reader, touch and low-vision review on target hardware                                                  | Automated checks supplemented by pending human acceptance |
| Performance          | Representative tenant counts, realistic concurrent stock/billing operations, report query plans and production latency budgets | Pending hosted load acceptance                            |
| Operations           | Support owner, incident contacts, monitoring, retention/deletion policy and rollback/cutover plan                              | Pending                                                   |
| Dependency exception | Review documented unpatched development-only braces advisory and patch upstream when available                                 | Open; owner review required before launch                 |
| Payments/SaaS        | Separate approved provider implementation, sandbox verification and live authorization                                         | Disabled                                                  |

## Post-deployment verification and incident response

Check health, authenticated navigation, new resident registration/owner link, own issued PDF/print/receipt, contact approval, work request, consent/read history, report CSV and owner archive. Verify another organization and revoked user fail. Observe host errors/latency, database capacity and backup/object completion. Logs must avoid tenant document bodies, passwords and credentials.

If acceptance fails, stop new activity, capture diagnostics and preserve the database. Roll back to a schema-compatible application release or ship a reviewed forward fix. Do not delete migrations, rewrite retained financial/audit history or restore over later transactions without a separately approved recovery plan. Subscription billing, tenant processors, email/SMS dispatch and automatic message scheduling remain disabled after this release.
