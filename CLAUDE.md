# Agent Workflow

For feature work, follow this sequence: use Superpowers `brainstorming` first, then generate OpenSpec artifacts with fast-forward flow, create an isolated branch with `using-git-worktrees`, expand tasks into `docs/plans/` with `writing-plans`, and implement with `executing-plans` or `subagent-driven-development`. Finish with `requesting-code-review`, `finishing-a-development-branch`, and archive the change in OpenSpec after merge.

---

# Project: accounting-pwa

## Overview

Static PWA companion to the MAUI accounting app. Accessible from iPhone via Safari, installable via "Add to Home Screen". No backend server — everything runs in the browser. Shares the same SQLite database as the MAUI app via Google Drive.

## Tech Stack

- **UI:** Alpine.js + Chart.js v4 (local vendor, no build step)
- **SQLite:** sql.js (WebAssembly — reads/writes the same `.db` format as MAUI app)
- **Persistence:** OPFS (Origin Private File System, iOS 16+) with localStorage fallback
- **Google Drive:** REST API v3, OAuth2 PKCE (Web application client, no client secret)
- **Hosting:** GitHub Pages (HTTPS static, no server)
- **No backend, no build tools, no framework**

## Project Structure

```
accounting-pwa/
├── index.html          # SPA shell — all 4 views toggled via x-show
├── app.js              # Alpine.store('app') — global state + all methods
├── db.js               # sql.js wrapper: init, CRUD, OPFS/localStorage persistence
├── drive.js            # Google Drive OAuth2 PKCE + backup/restore REST calls
├── sw.js               # Service worker — cache-first for full offline support
├── manifest.json       # PWA manifest (standalone, iOS Add to Home Screen)
├── css/app.css         # Mobile-first styles, 44px tap targets, safe-area insets
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── vendor/             # All JS vendored locally so service worker can cache them
│   ├── alpine.min.js
│   ├── chart.umd.min.js
│   ├── sql-wasm.js
│   └── sql-wasm.wasm
├── docs/plans/         # Implementation plans
├── openspec/           # OpenSpec change artifacts
└── CLAUDE.md
```

## Key Architecture Decisions

- **sql.js over IndexedDB:** loads the raw `.db` binary directly — no conversion, exact MAUI schema compatibility
- **OPFS over localStorage:** no quota limit for binary files; localStorage (5MB cap) is fallback only
- **OAuth redirect (not popup):** Safari on iOS blocks popups; full-page redirect always works
- **Drive scope `drive` (not `drive.file`):** the backup file was created by the MAUI app (different client), so `drive.file` can't access it
- **Drive restore IS the import mechanism:** all data flows through `Drive.restore() → DB.loadFromBytes()`; don't add CSV / manual import paths — Drive sync covers it
- **Single `index.html`:** views toggled via Alpine `x-show`, no router needed; root views (`transactions` / `trends`) reachable via bottom tab bar, modal-like views (`form` / `snapshotForm` / `settings`) hide the tab bar

## Shared DB Schema (must match MAUI app exactly)

```sql
Transactions  (Id, Amount REAL, Currency TEXT DEFAULT 'TWD', CategoryId INTEGER, Date INTEGER, Note TEXT, Type TEXT)
Categories    (Id, Name TEXT, Icon TEXT, Type TEXT)
AssetSnapshot (Id, Date INTEGER, Stock REAL, Cash REAL, FirstTrade REAL, Property REAL)
```

Date columns store **.NET ticks (INTEGER)** to match MAUI SQLite-Net default (`storeDateTimeAsTicks = true`). Use `db.js` constants `TICKS_DATE_EXPR` / `DATE_TO_TICKS_EXPR` for SQL-side conversion.

Backup file: `accounting_backup.db` in Google Drive folder `personaccount_backup`.

## Views

| View | Trigger |
|------|---------|
| `transactions` | Default — list with month nav + type filter + FAB |
| `trends` | Bottom tab — Asset Trend latest-total + Chart.js stacked bar (Stock / Cash / FirstTrade / Property) + Total line + snapshot card list |
| `form` | Add (FAB) or Edit (tap row) — shared transaction form |
| `snapshotForm` | Add (FAB on trends) or Edit (tap snapshot card) — AssetSnapshot form (upsert by date) |
| `settings` | Gear icon — Drive auth, Backup, Restore, Reset Service Worker |

## Development Guidelines

- All asset paths use `./` relative references (GitHub Pages subpath compatibility)
- After every DB mutation: call `exportAndPersist()` to write bytes to OPFS
- OAuth callback: read `?code=` on page load, exchange token, `history.replaceState` to clean URL
- Service worker cache key (`sw.js` `CACHE`): increment on every deploy that touches vendored / cached files (currently `accounting-v4`). Also add any new file to the `PRECACHE` array.
- Run `runMigrations()` after **every** db load — both `initDB()` (fresh / OPFS) **and** `loadFromBytes()` (Drive restore). Idempotent via `_migrations` version table + `CREATE TABLE IF NOT EXISTS`. Missing this caused the v2 schema not to apply after restore (regression).
- iPhone PWA debugging: provide an in-app **Reset Service Worker** button in Settings (`navigator.serviceWorker.getRegistrations() → unregister()` + `caches.delete()` + `location.reload()`). Don't tell users to clear Safari site data — that nukes OPFS too. With no Mac, this is the only way to force-refresh a stuck PWA.
- Never store secrets — PKCE uses no client secret; `CLIENT_ID` is a public identifier

## Deployment

Two git remotes — **both need pushing for hot-fixes**:

- `origin` → `hs-gitlab.higgstar.com:austin_poc/accounting-pwa` (primary repo, MRs reviewed here)
- `github` → `https://github.com/austinchen705/accounting-pwa.git` (GitHub Pages auto-deploys from `master`)

After merging an MR on GitLab, mirror to github for Pages deploy:

```bash
git push origin master   # if not auto-synced
git push github master
```

## One-Time Setup (before first deploy)

1. Google Cloud Console → OAuth 2.0 → **Web application** client → add GitHub Pages redirect URI
2. Set `CLIENT_ID` and `REDIRECT_URI` in `drive.js`
3. Push to GitHub → enable Pages from `master` branch root
