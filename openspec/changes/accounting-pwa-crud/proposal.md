## Why

The MAUI accounting app is occasionally unavailable (crashes, updates, device issues). Users need a lightweight web-based fallback to record income/expense transactions from their iPhone without installing anything — accessible via Safari and shareable via the same Google Drive database.

## What Changes

- Introduce a new static PWA (`accounting-pwa`) built with Alpine.js and sql.js
- No backend server — runs entirely in the browser, hosted on GitHub Pages
- Reads and writes the same SQLite database file (`accounting_backup.db`) used by the MAUI app via Google Drive
- Supports full CRUD for transactions, with category selection from existing DB data
- Backup and restore to/from Google Drive using OAuth2 PKCE (Web application client)
- Installable on iPhone via Safari "Add to Home Screen"

## Capabilities

### New Capabilities

- `transaction-crud`: List, add, edit, and delete transactions with month/type filtering and category dropdown
- `google-drive-sync`: OAuth2 PKCE login, backup (upload DB to Google Drive), and restore (download DB from Google Drive)
- `pwa-shell`: PWA manifest, service worker with cache-first offline support, and OPFS/localStorage DB persistence between sessions

### Modified Capabilities

<!-- None — this is a new standalone project, no existing specs to modify -->

## Impact

- New repository: `accounting-pwa` (static site, no backend)
- Depends on `sql.js` (WebAssembly SQLite), `Alpine.js`, Google Drive REST API v3
- Google Cloud Console: requires new **Web application** OAuth 2.0 client ID with GitHub Pages redirect URI
- Shared DB format: must match MAUI app's SQLite schema exactly (`Transactions`, `Categories` tables)
- Hosting: GitHub Pages (HTTPS required for service workers and OAuth redirect)
