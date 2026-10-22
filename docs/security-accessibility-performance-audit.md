# Milestone 7 security, accessibility and performance review

Scope: application source, seven local migrations, actual embedded PostgreSQL tests and automated browser flows. This is not an independent penetration test or hosted production certification. Hosted advisors, real Auth/Storage concurrency, human accessibility review and production load acceptance remain release gates.

## Access and data handling

| Surface | Allowed caller | Enforcement |
| --- | --- | --- |
| Staff reports/CSV | Owner/admin or current manager/office for each returned property | Ordinary verified session, RLS and per-property financial gate, including mixed-role accounts |
| Portal account links | Owner changes; owner/admin inspection | Registered UUID, current database grant, immutable identity, version, inclusive local start/expiry and immediate revocation |
| Portal history/documents | Explicitly linked resident account | Separate narrow definer DTOs, own customer, issued invoices only; raw staff tables remain inaccessible |
| Contact proposals | Own resident request; office/manager decision | Allowlisted contact fields, pending/version constraints, customer updated-at baseline, retained decision shown to resident |
| Maintenance | Own linked resident with current actual stay | Server-derived organization/property/customer/site, bounded rate window, original request text retained separately from later staff edits |
| In-app messages | Current financial staff prepares/publishes; residents see own published copies | Frozen audience/personalization, versioned due publish, current consent/language, retained cancellation/read history; private notes omitted |
| JSON archive | Current organization owner only | Actor-bound export receipt, single database snapshot, explicit public-table registry, size/count/rate limits and audited checksum |

All 66 public and 17 private application tables have RLS. New raw commercial tables have SELECT grants only; authorized functions perform writes and retain audit. Private schema is unexposed; public wrappers are invokers and trusted definer functions pin an empty search path. Role decisions are rechecked in the database. An authenticated resident is not automatically an organization/staff member. New grants do not infer identity from an unverified email address.

Resident statements whitelist headers and calculation evidence and strip staff billing/rate/ledger/collection notes and private event reasons. Receipt source snapshots are narrowed. Portal work history uses the immutable submitted title/description/category/priority rather than mutable staff work text or parts. Signed lease attachments and arbitrary document upload are not supplied by this milestone. Issued documents and receipts use ordinary session checks and private/no-store responses. No service key is introduced.

HTTP mutations check same-origin and authenticate before decoding. The shared JSON reader enforces 128 KiB of actual UTF-8 bytes, handles absent/forged length, cancels oversized streams, rejects invalid encoding/JSON and checks exact JSON media type. Strict command schemas reject extra scope fields and internal export orchestration. Limits are durable successful-action windows (maintenance 5/hour, contact proposals 3/day, export starts 3/hour and generic commercial activity 60/minute per actor); exact retries return the same retained result without spending another action. They do not replace upstream network-level abuse protection.

The proxy generates a fresh script nonce per request, replaces client nonce/CSP values and forwards the policy into server rendering. Production scripts use strict-dynamic without unsafe-eval; development alone allows the compiler’s eval. Style unsafe-inline remains for existing coordinate and visualization styles; it is a deliberate limitation to review if style nonces are later required. Configured Supabase connections are limited to its origin. Cookie refresh preserves prior response cookies; callbacks allow only the two internal destinations. Private pages/APIs/documents are not placed in tablet offline caches.

## Dependency finding

Current `npm audit --omit=dev`: **0 vulnerabilities**. Full audit: **5 high findings on one development chain**, `eslint-config-next@16.4.2 → @next/eslint-plugin-next@16.4.2 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`. The reviewed [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns nested-pattern stack exhaustion and lists no patched braces version at review. It must remain an open development-tooling exception, not a claim of a clean full audit.

The affected glob patterns originate from repository lint tooling, not tenant request fields. CI uses read-only repository permissions, no production secrets and checkout credentials disabled. Deploy only production runtime dependencies. Do not run an automatic breaking downgrade of the Next lint stack as an audit workaround. Review untrusted repository changes before running tooling, monitor the upstream fix and obtain owner exception review before launch. An upstream fix should be pinned, lockfile regenerated and the complete checks rerun. No version upgrade or production package was silently substituted.

## Accessibility review

New forms use explicit labels, required semantics, native controls, visible focus, retained errors/status and native modal focus containment/Escape/return. Wide report/resident tables stay within scroll regions with keyboard focus and accessible names. English/Spanish message content carries its language. Monetary values are exact text and never conveyed only by color. Responsive report filters and portal headers wrap at phone widths; the portal wordmark uses theme-appropriate contrast.

Playwright exercises 1440 px desktop, 820 px tablet and 390 px phone with light/dark Axe WCAG A/AA checks on report, message preparation, resident preferences and portal views, plus viewport overflow assertions. Final results are recorded in the phase report. Axe does not establish full WCAG conformance. Screen-reader reading order, error announcements, physical touch/tablet use, zoom/reflow and real email confirmation require human acceptance before launch.

## Performance and practical bounds

Report queries use stable database pagination (50 visible rows) and one materialized matching snapshot for rows/count. Filtered CSV uses a single snapshot capped at 10,000 rows and refuses over-limit downloads. Dates are limited to 366 days. Current per-property operational metrics use property-local dates and indexed source filters; cash totals avoid rescanning all organization cash separately for each property. New report indexes cover invoice periods, requested work, meter captures, performed work events and completed checklists.

Resident history uses limit 51/offset pages to show at most 50 rows per section and a continuation flag; current stays/balance remain current across history pages. The owner archive limits each table, the total rows and serialized size; no partial result is delivered. Screens abort obsolete requests, load major modules dynamically and do not fetch a staff snapshot for residents. No new runtime dependency is added.

These bounds improve predictable local behavior; they are not throughput or latency guarantees. Large invoice histories still require balances over underlying transactions; offset paging, report aggregations and a bounded archive can remain expensive. Before launch use realistic staging data, inspect EXPLAIN/ANALYZE and Supabase performance advisors, establish p95 budgets and test concurrent writes/row locks. Add aggregation/keyset/streaming only with measured need and matching financial snapshot semantics. No production benchmark is claimed.
