# Accounting PWA

Mobile-first, offline-capable accounting PWA that shares `accounting_backup.db` with the .NET MAUI `accounting-app`. It is a static Alpine.js application: there is no backend and no build step.

## Features

- Monthly home summary and recent activity
- Transaction entry, combined filters, frequent categories, and local receipt images
- Rolling 12-month statistics and expense-category reports with drill-down
- Income/expense category management and monthly budgets
- Asset snapshots, USD FirstTrade conversion, CSV import, and responsive charts
- Google Drive backup/restore using the shared MAUI SQLite file
- Service Worker precache for offline reload

Receipt image bytes are local to the current browser/device. Only `Transactions.ImageRelativePath` is included in the shared database, so another device can retain the path while showing that the image is unavailable locally.

## Run locally

Requirements: a recent Chromium, Edge, or Safari browser, Node.js for tests, and Python only for the example static server.

```powershell
cd D:\Repository\Poc\accounting-pwa
py -m http.server 8080 --bind 127.0.0.1
```

Open <http://127.0.0.1:8080/>. Do not open `index.html` directly with `file://`; sql.js, OPFS, and the Service Worker require an HTTP origin.

Browser storage is isolated by origin. For example, ports `8080` and `8081` have separate databases, which is useful for testing without touching another local copy or the deployed site.

### Load a database locally without Google OAuth

Open browser DevTools on the local page, select Console, and run:

```js
const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.db' });
picker.onchange = async () => {
  const bytes = new Uint8Array(await picker.files[0].arrayBuffer());
  await DB.loadFromBytes(bytes);
  location.reload();
};
picker.click();
```

Choose a copy of `accounting_backup.db`. The restored bytes are migrated idempotently and saved into that origin's OPFS storage.

To download the current local database from DevTools:

```js
const url = URL.createObjectURL(new Blob([_dbExportBytes()], { type: 'application/octet-stream' }));
const link = Object.assign(document.createElement('a'), { href: url, download: 'accounting_backup.db' });
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

Keep a separate backup before testing restore or replacement imports. Local receipt files are not embedded in this database export.

## Tests

Run the full Node suite:

```powershell
node --test tests/*.test.js
```

Run JavaScript syntax checks:

```powershell
node --check accounting.js
node --check app-state.js
node --check receipts.js
node --check db.js
node --check drive.js
node --check app.js
node --check sw.js
```

Validate the active OpenSpec change:

```powershell
openspec validate accounting-workflow-parity --strict
```

For UI validation, serve the repository over HTTP and exercise the app at mobile and desktop widths. Settings includes **Reset Service Worker (force refresh)**, which clears cached application files without deleting the OPFS database.

## Architecture

| File | Responsibility |
|---|---|
| `index.html` | Alpine SPA shell and all views |
| `app.js` | Application state, navigation, workflow coordination, and charts |
| `app-state.js` | Pure state/validation helpers |
| `accounting.js` | Pure accounting, report, statistics, CSV, and asset calculations |
| `db.js` | sql.js schema, MAUI-compatible repository, OPFS persistence, and restore |
| `receipts.js` | Image compression and local OPFS receipt lifecycle |
| `drive.js` | Google OAuth and Drive backup/restore |
| `sw.js` | Cache-first offline application shell |

All runtime libraries are vendored under `vendor/`, so an installed PWA can reload offline.

## Shared SQLite contract

The shared schema is additive and retains MAUI names and representations:

```text
Transactions      Id, Amount, Currency, CategoryId, Date, Note, Type, ImageRelativePath
Categories        Id, Name, Icon, Type
Budgets           Id, CategoryId, Amount, Month
ExchangeRateCache BaseCurrency, RatesJson, UpdatedAt
AssetSnapshot     Id, Date, Stock, Cash, FirstTrade, Property
```

Shared date values use .NET ticks (`INTEGER`). Every successful mutation exports and persists the complete SQLite binary. Both initialization and restore run the same idempotent migrations.

Google Drive uses folder `personaccount_backup` and filename `accounting_backup.db`. Configure the OAuth client ID and client secret in Settings; values stay in that browser's local storage and must never be committed.

## Deployment

The application is designed for HTTPS static hosting such as GitHub Pages. When a cached runtime file changes, increment `CACHE` in `sw.js` and include any new runtime file in `PRECACHE`.

Repository remotes currently use GitLab as the primary review repository and GitHub for Pages deployment. Merge through the normal review workflow, then mirror the accepted `master` branch to GitHub.
