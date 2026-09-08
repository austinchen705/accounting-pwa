# Agent Workflow

For feature work: brainstorm, create/update OpenSpec artifacts, use an ignored `.worktrees/` worktree, write a plan, implement test-first in batches, verify, request review, then finish the branch and archive the OpenSpec change after merge.

# Project: accounting-pwa

## Overview

Static, mobile-first Alpine.js PWA sharing the MAUI `accounting_backup.db`. No backend, bundler, or package manifest is required. Serve it over HTTP; never validate through `file://`.

## Runtime

- Alpine.js state/UI and Chart.js v4, both vendored locally
- sql.js/WASM for the raw SQLite binary
- OPFS for `accounting_backup.db` and local receipts; localStorage is the DB fallback only
- Google Drive REST/OAuth for shared database backup and restore
- Node built-in test runner
- Service Worker cache key: `accounting-v9`

## Boundaries

- `accounting.js`: pure calculations and parsers
- `app-state.js`: pure navigation/form-state helpers
- `db.js`: migrations, queries, mutations, .NET tick conversion, persistence
- `receipts.js`: compression and OPFS receipt lifecycle
- `app.js`: Alpine integration and Chart.js instances
- `drive.js`: OAuth and Drive transport
- `index.html` / `css/app.css`: views and mobile-first presentation

## Shared database contract

```sql
Transactions      (Id, Amount, Currency, CategoryId, Date, Note, Type, ImageRelativePath)
Categories        (Id, Name, Icon, Type)
Budgets           (Id, CategoryId, Amount, Month)
ExchangeRateCache (BaseCurrency, RatesJson, UpdatedAt)
AssetSnapshot     (Id, Date, Stock, Cash, FirstTrade, Property)
```

- Date and date-time columns are .NET ticks stored as SQLite `INTEGER`.
- Migrations are additive/idempotent and run after local init and every restore.
- Preserve existing IDs and values; do not normalize imported databases destructively.
- Every successful mutation must call the persistence callback.
- Drive folder/file: `personaccount_backup/accounting_backup.db`.
- Receipt bytes never sync. Preserve missing `ImageRelativePath` metadata and show the unavailable-device state.
- `AssetSnapshot.FirstTrade` stores TWD. New-form FirstTrade input is USD; edit mode displays/stores existing TWD.

## Views

Primary: `home`, `transactions`, `statistics`, `categoryReport`, `more`.

Secondary/contextual: `budgets`, `budgetForm`, `categories`, `categoryForm`, `trends`, `assetChart`, `snapshotForm`, `settings`, `form`, `receiptViewer`, `reportDetail`.

Contextual back navigation must preserve report, asset, and form state.

## Development commands

```powershell
node --test tests/*.test.js
node --check accounting.js
node --check app-state.js
node --check receipts.js
node --check db.js
node --check drive.js
node --check app.js
node --check sw.js
openspec validate accounting-workflow-parity --strict
py -m http.server 8080 --bind 127.0.0.1
```

There is no `npm test`. Use `rg`/`rg --files` for discovery and `apply_patch` for edits.

## Offline and deployment rules

- Keep asset paths relative (`./`) for GitHub Pages subpaths.
- Add every runtime module to `index.html` and `sw.js` `PRECACHE`.
- Increment the Service Worker cache key whenever cached runtime content changes.
- Use the in-app Reset Service Worker action to refresh application caches without deleting OPFS data.
- Never commit OAuth credentials. The current Settings flow stores its configuration only in browser local storage.
- Verify at 375px and desktop widths before deployment.

Remotes: `origin` is the primary GitLab repository; `github` is the GitHub Pages mirror. Do not push or merge without explicit user direction.
