## Why

The PWA currently exposes only transaction CRUD, Google Drive backup, and a basic asset trend, while the companion MAUI app has become the source of truth for the broader accounting workflow. Bringing the PWA to functional parity lets users manage the same accounting data from an installable browser app without losing SQLite backup compatibility.

## What Changes

- Add a month-aware home dashboard with income, expense, balance, and recent transactions.
- Expand transaction browsing and entry with category/currency filters, frequent-category shortcuts, guided input flow, and one locally managed receipt attachment.
- Add rolling statistics, category trends, insights, and dynamically scaled charts.
- Add expense category reports for week, month, year, and all-time ranges with transaction drill-down.
- Add monthly category budgets with spending progress and editing.
- Add income and expense category management with validation and safe deletion.
- Bring asset trends up to the MAUI behavior with latest-value prefill, FirstTrade currency conversion, CSV import, newest-first history, and an expanded chart.
- Reorganize PWA navigation into five primary destinations with secondary accounting tools under More.
- Extend migrations and repository APIs while retaining exact MAUI table, column, date-tick, and `accounting_backup.db` compatibility.
- Keep receipt files local to each platform; only the compatible `ImageRelativePath` metadata remains in the shared database.

## Capabilities

### New Capabilities

- `shared-accounting-database`: MAUI-compatible schema migration, date storage, persistence, and Drive restore behavior.
- `home-dashboard`: Month navigation, account summaries, and recent monthly activity.
- `enhanced-transactions`: Filtering, guided entry, frequent categories, and local receipt attachment lifecycle.
- `accounting-statistics`: Rolling income/expense and category trend charts with insights and dynamic axes.
- `expense-category-report`: Range-based expense aggregation, ranked visualization, and transaction drill-down.
- `monthly-budgets`: Per-category monthly budgets and spending progress.
- `category-management`: Income and expense category creation, editing, filtering, and guarded deletion.
- `asset-trend-parity`: Snapshot prefill, FirstTrade conversion, CSV import, history, and expanded visualization.
- `pwa-accounting-navigation`: Mobile-first access to all parity workflows without overloading the bottom navigation.

### Modified Capabilities

None. This repository has no promoted baseline specs; the existing change-local specifications remain historical inputs.

## Impact

- Extends `db.js` migrations and query/mutation APIs without changing the shared backup filename or existing column representations.
- Splits application behavior into reusable feature and calculation modules loaded by `index.html` and precached by `sw.js`.
- Expands `index.html`, `css/app.css`, and Alpine state to support the new screens and responsive navigation.
- Adds browser-managed receipt storage through OPFS with graceful handling when shared metadata points to a file unavailable on the current device.
- Adds a lightweight local test harness for pure calculations, schema compatibility, and feature behavior; no backend or build framework is introduced.
