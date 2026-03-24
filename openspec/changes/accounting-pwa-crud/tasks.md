## 1. Project Setup

- [ ] 1.1 Create directory structure: `css/`, `icons/`, `vendor/`
- [ ] 1.2 Download and vendor Alpine.js (pinned version) to `vendor/alpine.min.js`
- [ ] 1.3 Download and vendor sql.js files (`sql-wasm.js`, `sql-wasm.wasm`) to `vendor/`
- [ ] 1.4 Create `manifest.json` with name, icons, `display: standalone`, `start_url: "./"`
- [ ] 1.5 Create placeholder icon files (`icons/icon-192.png`, `icons/icon-512.png`)
- [ ] 1.6 Update `CLAUDE.md` with final tech stack (Alpine.js + sql.js, static PWA, GitHub Pages)

## 2. PWA Shell & Service Worker

- [ ] 2.1 Create `sw.js` with precache list (index.html, app.js, db.js, drive.js, css/app.css, all vendor files, icons)
- [ ] 2.2 Implement cache-first fetch handler in `sw.js`, bypassing cache for `googleapis.com` and `accounts.google.com`
- [ ] 2.3 Register service worker in `index.html` on page load
- [ ] 2.4 Verify "Add to Home Screen" works on iPhone Safari (standalone mode, correct icon)

## 3. Database Layer (`db.js`)

- [ ] 3.1 Implement `initSqlJs()` loader pointing to `./vendor/sql-wasm.wasm`
- [ ] 3.2 Implement `opfsLoad(filename)` — load bytes from OPFS, return null if not found
- [ ] 3.3 Implement `opfsSave(filename, bytes)` — write Uint8Array to OPFS
- [ ] 3.4 Implement localStorage fallback with feature-detect (`'getDirectory' in navigator.storage`)
- [ ] 3.5 Implement `initDB()` — load from OPFS if exists, else create new DB with schema migrations
- [ ] 3.6 Create schema migration v1: `_migrations`, `Transactions`, `Categories` tables matching MAUI schema exactly
- [ ] 3.7 Implement `getCategories(type)` — SELECT from Categories filtered by type
- [ ] 3.8 Implement `getTransactions(yearMonth)` — SELECT with LEFT JOIN Categories, ordered by Date DESC
- [ ] 3.9 Implement `addTransaction(data)` — INSERT into Transactions, call `exportAndPersist()`
- [ ] 3.10 Implement `updateTransaction(id, data)` — UPDATE Transactions, call `exportAndPersist()`
- [ ] 3.11 Implement `deleteTransaction(id)` — DELETE from Transactions, call `exportAndPersist()`
- [ ] 3.12 Implement `exportAndPersist()` — `db.export()` → write to OPFS/localStorage
- [ ] 3.13 Implement `loadFromBytes(bytes)` — replace in-memory DB with new bytes (used after restore)

## 4. Google Drive Integration (`drive.js`)

- [ ] 4.1 Set constants: `CLIENT_ID`, `REDIRECT_URI`, `DRIVE_SCOPE`, token endpoints
- [ ] 4.2 Implement PKCE helpers: `generateCodeVerifier()`, `generateCodeChallenge(verifier)` using Web Crypto API
- [ ] 4.3 Implement `startOAuthFlow()` — store verifier+state in sessionStorage, redirect to Google
- [ ] 4.4 Implement `handleOAuthCallback(code, state)` — verify state, POST token exchange, call `saveTokens()`
- [ ] 4.5 Implement `saveTokens({ access_token, refresh_token, expires_in })` to localStorage
- [ ] 4.6 Implement `getAccessToken()` — auto-refresh if within 60s of expiry before returning token
- [ ] 4.7 Implement `refreshAccessToken()` — POST refresh grant, update stored tokens, throw on failure
- [ ] 4.8 Implement `findFolderId(folderName)` — search Drive for `personaccount_backup` folder
- [ ] 4.9 Implement `findFileId(folderId, filename)` — search for `accounting_backup.db` in folder
- [ ] 4.10 Implement `uploadFile(folderId, fileId, bytes)` — PATCH if fileId exists, POST multipart if not
- [ ] 4.11 Implement `downloadFile(fileId)` — GET file bytes as ArrayBuffer
- [ ] 4.12 Implement `backup()` — orchestrate: get token → find/create folder → find/create file → upload
- [ ] 4.13 Implement `restore()` — orchestrate: get token → find folder → find file → download → return bytes

## 5. Alpine.js App Store & Views (`app.js` + `index.html`)

- [ ] 5.1 Define `Alpine.store('app', {...})` with state: `currentView`, `transactions`, `categories`, `editTarget`, `filter`, `toast`, `loading`, `driveStatus`
- [ ] 5.2 Implement `store.init()` — check URL for OAuth callback params, init DB, load categories and transactions
- [ ] 5.3 Implement `store.loadTransactions()` — call `db.getTransactions(filter.month)` filtered by `filter.type`
- [ ] 5.4 Implement `store.saveTransaction(form)` — call add or update based on `editTarget`, navigate to list
- [ ] 5.5 Implement `store.deleteTransaction(id)` — confirm, call db.deleteTransaction, navigate to list
- [ ] 5.6 Implement `store.backupToDrive()` — set driveStatus='syncing', call drive.backup(), show toast
- [ ] 5.7 Implement `store.restoreFromDrive()` — call drive.restore(), call db.loadFromBytes(), reload transactions, show toast
- [ ] 5.8 Implement `store.showToast(msg, duration=3000)` — show and auto-dismiss
- [ ] 5.9 Build Transaction List view in `index.html`: month nav arrows, type filter tabs, `x-for` rows, FAB
- [ ] 5.10 Build Add/Edit Transaction form view: amount (inputmode=decimal), currency, type radio, category select, date, note, submit/cancel buttons
- [ ] 5.11 Build delete confirmation (inline in edit form): "Delete" button → confirm dialog → call deleteTransaction
- [ ] 5.12 Build Settings view: Drive auth status, Connect/Disconnect button, Backup button, Restore button, last sync time
- [ ] 5.13 Build Toast component: fixed-position overlay, auto-dismiss

## 6. Mobile CSS (`css/app.css`)

- [ ] 6.1 Set base styles: mobile-first, system font stack, box-sizing border-box
- [ ] 6.2 All interactive elements minimum 44×44px tap target
- [ ] 6.3 Apply `env(safe-area-inset-*)` padding for iPhone notch and home indicator
- [ ] 6.4 Style transaction list rows: icon, name, amount, date in readable layout
- [ ] 6.5 Style form inputs: large touch targets, clear labels, error states
- [ ] 6.6 Style FAB button (fixed bottom-right, primary color)
- [ ] 6.7 Style settings page: Drive status indicator, large action buttons
- [ ] 6.8 Style toast: fixed bottom-center, semi-transparent, rounded

## 7. Error Handling

- [ ] 7.1 sql.js/wasm load failure: show blocking overlay with "App failed to load. Reload." and reload button
- [ ] 7.2 OPFS quota exceeded: catch write error, show toast prompting Drive backup
- [ ] 7.3 OAuth state mismatch: clear tokens, show error toast, return to settings
- [ ] 7.4 Drive token refresh failure: clear tokens, show re-auth prompt
- [ ] 7.5 Drive file not found on restore: show toast "No backup found in Google Drive."
- [ ] 7.6 Corrupt DB bytes on restore: catch sql.js parse error, do NOT overwrite OPFS, show toast
- [ ] 7.7 Drive API non-2xx error: show toast "Drive sync failed. Data saved locally."

## 8. Deployment & Verification

- [ ] 8.1 Create Google Cloud Console Web application OAuth client, add GitHub Pages redirect URI
- [ ] 8.2 Set `CLIENT_ID` and `REDIRECT_URI` constants in `drive.js`
- [ ] 8.3 Push to GitHub, enable GitHub Pages from master branch root
- [ ] 8.4 Open PWA URL on iPhone Safari — verify page loads, service worker registers
- [ ] 8.5 Tap "Add to Home Screen" — verify standalone launch with correct icon and name
- [ ] 8.6 Verify offline load after first visit (airplane mode test)
- [ ] 8.7 Connect Google Drive — complete OAuth flow, verify token stored
- [ ] 8.8 Restore from Drive — verify transactions list matches MAUI app data
- [ ] 8.9 Add a transaction — verify it appears in list and persists after reload
- [ ] 8.10 Backup to Drive — open MAUI app, verify new transaction is present after restore
