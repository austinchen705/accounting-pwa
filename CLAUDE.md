# Agent Workflow

For feature work, follow this sequence: use Superpowers `brainstorming` first, then generate OpenSpec artifacts with fast-forward flow, create an isolated branch with `using-git-worktrees`, expand tasks into `docs/plans/` with `writing-plans`, and implement with `executing-plans` or `subagent-driven-development`. Finish with `requesting-code-review`, `finishing-a-development-branch`, and archive the change in OpenSpec after merge.

---

# Project: accounting-pwa

## Overview

Static PWA companion to the MAUI accounting app. Accessible from iPhone via Safari, installable via "Add to Home Screen". No backend server — everything runs in the browser. Shares the same SQLite database as the MAUI app via Google Drive.

## Tech Stack

- **UI:** Alpine.js (local vendor, no build step)
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
- **Single `index.html`:** 4 views (list, add/edit form, settings) via Alpine `x-show` — no router needed

## Shared DB Schema (must match MAUI app exactly)

```sql
Transactions (Id, Amount REAL, Currency TEXT DEFAULT 'TWD', CategoryId INTEGER, Date TEXT, Note TEXT, Type TEXT)
Categories   (Id, Name TEXT, Icon TEXT, Type TEXT)
```

Backup file: `accounting_backup.db` in Google Drive folder `personaccount_backup`.

## Views

| View | Trigger |
|------|---------|
| `transactions` | Default — list with month nav + type filter + FAB |
| `form` | Add (FAB) or Edit (tap row) — shared form component |
| `settings` | Gear icon — Drive auth, Backup, Restore |

## Development Guidelines

- All asset paths use `./` relative references (GitHub Pages subpath compatibility)
- After every DB mutation: call `exportAndPersist()` to write bytes to OPFS
- OAuth callback: read `?code=` on page load, exchange token, `history.replaceState` to clean URL
- Service worker cache key: `accounting-v1` — increment on each deploy for cache busting
- Never store secrets — PKCE uses no client secret; `CLIENT_ID` is a public identifier

## One-Time Setup (before first deploy)

1. Google Cloud Console → OAuth 2.0 → **Web application** client → add GitHub Pages redirect URI
2. Set `CLIENT_ID` and `REDIRECT_URI` in `drive.js`
3. Push to GitHub → enable Pages from `master` branch root
