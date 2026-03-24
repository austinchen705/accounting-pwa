## Context

The MAUI accounting app uses a SQLite database (`accounting_backup.db`) stored in Google Drive. The PWA must read and write this same file so data stays in sync between platforms. Since there is no backend server, all logic runs in the browser: SQLite via WebAssembly (sql.js), OAuth2 via redirect flow, and persistence via the Origin Private File System (OPFS) API. The app is hosted as a static site on GitHub Pages and installed on iPhone via Safari "Add to Home Screen".

## Goals / Non-Goals

**Goals:**
- Full offline capability after first load (service worker caches all assets including wasm)
- Installable PWA on iPhone Safari (standalone display mode)
- Share the exact SQLite schema with the MAUI app — no migration needed on either side
- CRUD for transactions only (list, add, edit, delete) with month and type filtering
- Google Drive backup/restore using OAuth2 PKCE — no client secret, no backend

**Non-Goals:**
- Budget tracking, asset snapshots, statistics, export (CSV/Excel) — MAUI-only features
- Real-time sync — user manually triggers backup/restore
- Multi-user or cloud database — single-user, single-file
- Native push notifications
- Currency conversion

## Decisions

### D1: sql.js (WebAssembly SQLite) over IndexedDB

**Decision:** Use sql.js to load the raw `.db` file into an in-memory SQLite instance.

**Rationale:** The MAUI app's backup is a raw SQLite binary. sql.js reads it directly, preserving exact schema and data — no conversion. IndexedDB would require importing/exporting, adding complexity and format-conversion risk.

**Alternative considered:** IndexedDB with manual import/export. Rejected because SQLite-to-IndexedDB conversion is error-prone and would risk data corruption on restore.

### D2: OPFS for local persistence (with localStorage fallback)

**Decision:** After every mutation, export the sql.js database to OPFS (`navigator.storage.getDirectory()`).

**Rationale:** OPFS supports large binary files with no quota warning. Available in Safari 16+ (iOS 16+, which covers the target device). localStorage has a 5MB hard quota — unacceptable for a growing SQLite file.

**Fallback:** Feature-detect on startup. If OPFS unavailable, store base64-encoded bytes in localStorage (covers desktop testing on older browsers).

### D3: OAuth2 PKCE redirect flow (no popup)

**Decision:** Full-page redirect for Google OAuth, not a popup.

**Rationale:** Safari on iOS aggressively blocks popups. The redirect approach always works. On return, the app reads `?code=` from the URL, completes the token exchange, and clears the URL with `history.replaceState`.

**Token storage:** `localStorage` for `access_token`, `refresh_token`, `expires_at`. Tokens survive page reload. If user clears localStorage, they re-authenticate (one click).

### D4: Google Drive scope `drive` (not `drive.file`)

**Decision:** Request full `https://www.googleapis.com/auth/drive` scope.

**Rationale:** `drive.file` only grants access to files created by this specific web client. The `accounting_backup.db` file was created by the MAUI app (different OAuth client), so `drive.file` would not find it. `drive` scope is required for cross-client file access.

**Trade-off:** Broader permission than strictly needed. Mitigated by the fact this is the user's own personal Google account and the same scope the MAUI app already uses.

### D5: Static hosting on GitHub Pages (no server)

**Decision:** Deploy as a fully static site — no server, no serverless functions.

**Rationale:** No sensitive logic, no secrets. All auth uses PKCE (no client secret). GitHub Pages provides HTTPS (required for service workers and OAuth redirect). Free, zero maintenance.

### D6: Alpine.js with a single HTML file and shared global store

**Decision:** One `index.html` with all views toggled via `x-show`. One `Alpine.store('app', {...})` as the single source of truth.

**Rationale:** No build step, no router library, minimal complexity for a 4-view CRUD app. Alpine's reactive store pattern is sufficient. A multi-file SPA would add bundler complexity with no benefit at this scale.

## Risks / Trade-offs

- **sql.js wasm is ~1.5MB** → Mitigated: bundled locally and cached by service worker after first load. Subsequent loads are instant.
- **OPFS not available on older iOS (< 16)** → Mitigated: localStorage fallback. Warn user if DB grows near 5MB quota.
- **OAuth refresh token lost if localStorage cleared** → Acceptable: user re-authenticates with one click. No data is lost (DB is in OPFS separately).
- **No real-time sync** → By design. User explicitly taps Restore before working and Backup after. Conflict resolution is manual (last write wins on Drive).
- **Drive `drive` scope is broad** → Acceptable: personal single-user app, same scope as MAUI app, user grants consent explicitly.
- **GitHub Pages subpath** → All asset paths use `./` relative references. `start_url: "./"` in manifest handles this correctly.

## Migration Plan

1. Create a new **Web application** OAuth 2.0 client in Google Cloud Console (same project as MAUI app)
2. Add `https://<username>.github.io/<repo>/` as an authorized redirect URI
3. Set `CLIENT_ID` constant in `drive.js`
4. Push to GitHub → enable GitHub Pages → site live
5. On iPhone Safari: visit URL → "Add to Home Screen" → use as standalone app

No database migration required — the PWA reads the existing MAUI backup file unchanged.

## Open Questions

- None — all decisions finalized above.
