## Context

`accounting-pwa` is a static, offline-first Alpine.js application backed by sql.js and OPFS. It restores and backs up the same `accounting_backup.db` used by the .NET MAUI `accounting-app`, but currently implements only transaction CRUD, basic asset snapshots, and Google Drive operations. The parity work spans schema migration, accounting calculations, browser file storage, navigation, charts, and multiple new screens without introducing a backend or build framework.

## Goals / Non-Goals

**Goals:**

- Implement the MAUI app's accounting workflows with behavior appropriate to a mobile PWA.
- Preserve bidirectional SQLite compatibility, including exact table/column names and .NET tick date values.
- Keep the application offline-first and deployable as static files.
- Separate database access, pure calculations, receipt storage, and Alpine UI state enough to make the new behavior testable.
- Deliver in vertical slices whose intermediate states remain usable.

**Non-Goals:**

- Reproduce MAUI-only provisioning, app-expiration, iCloud, or native lifecycle behavior.
- Synchronize receipt image bytes between devices or modify the MAUI repository's backup format.
- Replace Alpine.js, sql.js, Chart.js, OPFS, or the existing Google Drive integration.
- Achieve pixel-identical MAUI layouts.

## Decisions

### Keep a static modular JavaScript architecture

Feature calculations will live in browser-compatible modules exposed through a small global namespace, while `db.js` remains the persistence boundary and Alpine coordinates views. This avoids a framework migration and keeps GitHub Pages deployment intact. A full rewrite or .NET/WASM shared core was rejected because it would add tooling and migration risk unrelated to parity.

### Preserve the MAUI database as the compatibility contract

Migrations will add `Budgets`, `ExchangeRateCache`, `Transactions.ImageRelativePath`, and the MAUI indexes idempotently. Existing rows and identifiers will never be rewritten merely to normalize them. Dates continue to cross the SQL boundary through .NET tick conversion expressions, and migrations run after both local initialization and Drive restore.

### Use pure calculation helpers above query-shaped repository results

Date windows, summaries, ranking, chart series, dynamic axis steps, budget progress, and CSV parsing will be deterministic functions. Repository queries return consistent plain objects and mutations always call `exportAndPersist()`. This division allows Node-based unit tests without adding a bundler.

### Keep receipt files local and transaction metadata portable

The PWA will compress a selected or captured image and store it under a MAUI-shaped relative path such as `receipts/YYYY/MM/<id>.jpg` in OPFS. The database stores only `ImageRelativePath`. A staged replacement is committed only after the transaction write succeeds; superseded files are then removed. If a restored database references a file absent in this browser, the UI reports that it is unavailable on this device.

### Adapt navigation rather than copying nine MAUI tabs

The mobile shell exposes Home, Transactions, Statistics, Category Report, and More. More links to Budgets, Categories, Asset Trend, and Settings. Modal/detail states retain explicit back destinations so report drill-down, forms, and expanded charts return to their originating context.

### Deliver as verified vertical slices

Implementation order is compatibility foundation, home and navigation, categories and budgets, reports and statistics, transaction enhancements and receipts, then asset parity. Each slice adds focused tests and bumps the service-worker cache whenever cached runtime files change.

## Risks / Trade-offs

- [Shared database includes an attachment path but not its file] -> Show an explicit unavailable state and never delete metadata solely because the local file is missing.
- [A new migration could damage a restored MAUI database] -> Use additive, idempotent DDL and verify schema/data round trips against a representative MAUI-format database.
- [Large Alpine state becomes difficult to maintain] -> Move pure behavior and storage concerns into modules while retaining one integration store for the existing no-build architecture.
- [Many destinations can overwhelm a small screen] -> Limit the persistent bottom bar to five items and move secondary workflows into More.
- [Chart canvases initialized while hidden can render at zero size] -> Create or resize charts only after their view is visible and destroy page-specific instances on exit.
- [localStorage fallback cannot hold many images] -> Receipt attachments require OPFS; unsupported browsers retain all other accounting features and display a capability message.

## Migration Plan

1. Add test coverage for MAUI-compatible schema and calculation behavior.
2. Apply additive schema migration on every database load and persist only after successful completion.
3. Add new modules, views, and styles behind the existing application initialization path.
4. Bump and expand the service-worker precache so a deployment activates atomically.
5. Verify a MAUI-shaped database can be opened, edited, exported, restored, and reopened without schema or data loss.
6. Roll back application files if necessary; additive tables, indexes, and nullable columns remain safe for older MAUI/PWA clients.

## Open Questions

None. Product scope, SQLite compatibility, incremental delivery, and local-only receipt storage were approved during design review.
