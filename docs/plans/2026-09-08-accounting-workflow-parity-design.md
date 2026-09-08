# Accounting Workflow Parity Design

## Objective

Bring the static accounting PWA to accounting-workflow parity with `D:\Repository\Poc\accounting-app` while preserving bidirectional compatibility with the shared `accounting_backup.db` file.

## Approved scope

The parity target includes Home, enhanced Transactions, Statistics, expense Category Report, Budgets, Categories, and current Asset Trend behavior. The PWA retains its browser-native Settings and Google Drive flow. MAUI provisioning, app expiration, iCloud, and other platform-only functions are excluded.

Receipt attachments remain local to each platform. The shared transaction row contains the compatible `ImageRelativePath`, while the PWA stores compressed image bytes in browser-managed storage and explains when a restored path is unavailable locally.

## Architecture

Keep the existing static Alpine.js, sql.js, Chart.js, OPFS, and Google Drive stack. Add small browser/Node-compatible modules for deterministic calculations and receipt storage, retain `db.js` as the shared SQLite compatibility boundary, and use Alpine as the integration state for views. The shell exposes Home, Transactions, Statistics, Category Report, and More; More links to Budgets, Categories, Asset Trend, and Settings.

Migrations are additive and idempotent. They mirror MAUI table names, columns, indexes, and .NET tick storage, run after every initialization and Drive restore, and never rewrite existing user rows for normalization. Each successful database mutation persists immediately.

## Delivery strategy

Deliver vertical slices in this order: compatibility foundation, shell/Home, Categories/Budgets, reports/statistics, enhanced Transactions/receipts, and Asset Trend parity. Use the Node built-in test runner for pure behavior and sql.js schema checks, then perform browser-level static-server and Drive round-trip verification. Every cached runtime change increments the service-worker cache version.

## Error handling

Validation failures remain in their forms without partial writes. Database and Drive failures show actionable messages and preserve the last persisted state. Receipt replacements use staged files and delete the old file only after a successful row update. Missing local receipt bytes do not clear shared metadata. Exchange conversion never treats an unconverted USD amount as TWD when neither a live nor cached rate is available.

## Success criteria

- All approved accounting workflows are usable on mobile and desktop.
- An older PWA database and a MAUI-shaped database migrate without losing rows or IDs.
- A database edited by the PWA remains readable by the MAUI schema contract.
- Pure calculations and migration behavior pass automated tests.
- The offline service worker precaches every runtime module and activates under a new cache key.
