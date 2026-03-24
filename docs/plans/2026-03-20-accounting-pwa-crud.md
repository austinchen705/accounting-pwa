# Accounting PWA CRUD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static PWA (no backend) that reads/writes the same SQLite database as the MAUI accounting app via Google Drive, supporting transaction CRUD and installable on iPhone Safari.

**Architecture:** All logic runs in the browser — sql.js (WebAssembly SQLite) loads the raw `.db` file in memory, OPFS persists it between sessions, and Google Drive REST API with OAuth2 PKCE handles backup/restore. Alpine.js drives the UI via a single global store across 4 views (list, add, edit, settings) in one `index.html`.

**Tech Stack:** Alpine.js (local vendor), sql.js (WebAssembly), Google Drive REST API v3, OPFS / localStorage persistence, GitHub Pages (HTTPS static hosting), no build tools.

---

## Key Files

```
accounting-pwa/
├── index.html          # SPA shell — all 4 views via x-show
├── app.js              # Alpine.store('app') — state + methods
├── db.js               # sql.js wrapper: init, CRUD, OPFS persistence
├── drive.js            # OAuth2 PKCE + Drive REST API
├── sw.js               # Service worker — cache-first offline
├── manifest.json       # PWA manifest
├── css/app.css         # Mobile-first styles
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── vendor/
    ├── alpine.min.js
    ├── sql-wasm.js
    └── sql-wasm.wasm
```

## MAUI DB Schema (must match exactly)

```sql
-- Transactions
CREATE TABLE Transactions (
  Id        INTEGER PRIMARY KEY AUTOINCREMENT,
  Amount    REAL    NOT NULL,
  Currency  TEXT    NOT NULL DEFAULT 'TWD',
  CategoryId INTEGER,
  Date      TEXT    NOT NULL DEFAULT (date('now')),
  Note      TEXT,
  Type      TEXT    NOT NULL  -- 'income' | 'expense'
);

-- Categories
CREATE TABLE Categories (
  Id    INTEGER PRIMARY KEY AUTOINCREMENT,
  Name  TEXT NOT NULL,
  Icon  TEXT,
  Type  TEXT NOT NULL  -- 'income' | 'expense'
);
```

---

## Task 1: Project Scaffold & Vendor Files

**Files:**
- Create: `vendor/` directory with Alpine.js + sql.js files
- Create: `manifest.json`
- Create: `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `CLAUDE.md`

**Step 1: Create directory structure**

```bash
mkdir -p css icons vendor docs/plans
```

**Step 2: Download Alpine.js (pinned)**

```bash
curl -o vendor/alpine.min.js https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js
```

Verify: `vendor/alpine.min.js` exists and is non-empty.

**Step 3: Download sql.js**

```bash
curl -L -o vendor/sql-wasm.js https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js
curl -L -o vendor/sql-wasm.wasm https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm
```

Verify both files exist. `sql-wasm.wasm` should be ~1.5MB.

**Step 4: Create `manifest.json`**

```json
{
  "name": "Personal Accounts",
  "short_name": "Accounts",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Step 5: Create placeholder icons**

Use any 192×192 and 512×512 PNG. A solid colored square works for now. Can be replaced later.

**Step 6: Update `CLAUDE.md` tech stack section**

Replace the Python section in `CLAUDE.md` with the finalized stack:
- Language: JavaScript (no build step)
- UI: Alpine.js (local vendor)
- SQLite: sql.js (WebAssembly)
- Google Drive: REST API v3, OAuth2 PKCE
- Persistence: OPFS (localStorage fallback)
- Hosting: GitHub Pages

**Step 7: Commit**

```bash
git add vendor/ manifest.json icons/ css/ docs/ CLAUDE.md
git commit -m "chore: scaffold project structure and vendor dependencies"
```

---

## Task 2: Service Worker (`sw.js`)

**Files:**
- Create: `sw.js`

The service worker caches all app assets on install and serves them cache-first. Google API requests bypass the cache entirely.

**Step 1: Create `sw.js`**

```javascript
const CACHE = 'accounting-v1';
const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './drive.js',
  './css/app.css',
  './manifest.json',
  './vendor/alpine.min.js',
  './vendor/sql-wasm.js',
  './vendor/sql-wasm.wasm',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('googleapis.com') || url.includes('accounts.google.com')) {
    return; // let network handle Google API calls
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

**Step 2: Commit**

```bash
git add sw.js
git commit -m "feat: add service worker with cache-first offline support"
```

---

## Task 3: Database Layer (`db.js`)

**Files:**
- Create: `db.js`

This module owns all SQLite operations. It exposes an async API that `app.js` calls. It never touches the DOM.

**Step 1: Create `db.js` — OPFS helpers**

```javascript
// db.js
let SQL;
let db;
let useOpfs = false;

async function opfsLoad(filename) {
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(filename);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function opfsSave(filename, bytes) {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function lsLoad(key) {
  const b64 = localStorage.getItem(key);
  if (!b64) return null;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function lsSave(key, bytes) {
  const bin = String.fromCharCode(...bytes);
  localStorage.setItem(key, btoa(bin));
}
```

**Step 2: Add `initDB()` and schema migrations**

```javascript
async function runMigrations() {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)`);
  const done = db.exec(`SELECT version FROM _migrations`);
  const versions = done.length ? done[0].values.map(r => r[0]) : [];

  if (!versions.includes(1)) {
    db.run(`
      CREATE TABLE IF NOT EXISTS Transactions (
        Id          INTEGER PRIMARY KEY AUTOINCREMENT,
        Amount      REAL    NOT NULL,
        Currency    TEXT    NOT NULL DEFAULT 'TWD',
        CategoryId  INTEGER,
        Date        TEXT    NOT NULL DEFAULT (date('now')),
        Note        TEXT,
        Type        TEXT    NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS Categories (
        Id    INTEGER PRIMARY KEY AUTOINCREMENT,
        Name  TEXT NOT NULL,
        Icon  TEXT,
        Type  TEXT NOT NULL
      )
    `);
    db.run(`INSERT INTO _migrations VALUES (1)`);
  }
}

async function initDB() {
  useOpfs = 'getDirectory' in (navigator.storage || {});
  SQL = await initSqlJs({ locateFile: f => `./vendor/${f}` });

  const bytes = useOpfs
    ? await opfsLoad('accounting_backup.db')
    : lsLoad('accounting_db');

  if (bytes) {
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
    await runMigrations();
  }
}
```

**Step 3: Add `exportAndPersist()`**

```javascript
async function exportAndPersist() {
  const bytes = db.export();
  if (useOpfs) {
    await opfsSave('accounting_backup.db', bytes);
  } else {
    lsSave('accounting_db', bytes);
  }
}
```

**Step 4: Add CRUD functions**

```javascript
function getCategories(type) {
  const results = db.exec(
    `SELECT Id, Name, Icon, Type FROM Categories WHERE Type = ? ORDER BY Name`,
    [type]
  );
  if (!results.length) return [];
  const [cols, ...rows] = [results[0].columns, ...results[0].values];
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

function getTransactions(yearMonth, typeFilter) {
  let query = `
    SELECT t.Id, t.Amount, t.Currency, t.Date, t.Note, t.Type,
           c.Name AS CategoryName, c.Icon AS CategoryIcon
    FROM Transactions t
    LEFT JOIN Categories c ON c.Id = t.CategoryId
    WHERE strftime('%Y-%m', t.Date) = ?
  `;
  const params = [yearMonth];
  if (typeFilter && typeFilter !== 'all') {
    query += ` AND t.Type = ?`;
    params.push(typeFilter);
  }
  query += ` ORDER BY t.Date DESC`;

  const results = db.exec(query, params);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

async function addTransaction({ amount, currency, categoryId, date, note, type }) {
  db.run(
    `INSERT INTO Transactions (Amount, Currency, CategoryId, Date, Note, Type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [amount, currency, categoryId, date, note, type]
  );
  await exportAndPersist();
}

async function updateTransaction(id, { amount, currency, categoryId, date, note, type }) {
  db.run(
    `UPDATE Transactions SET Amount=?, Currency=?, CategoryId=?, Date=?, Note=?, Type=?
     WHERE Id=?`,
    [amount, currency, categoryId, date, note, type, id]
  );
  await exportAndPersist();
}

async function deleteTransaction(id) {
  db.run(`DELETE FROM Transactions WHERE Id=?`, [id]);
  await exportAndPersist();
}

async function loadFromBytes(bytes) {
  db.close();
  db = new SQL.Database(bytes);
  await exportAndPersist();
}
```

**Step 5: Export the public API**

```javascript
// At bottom of db.js
window.DB = {
  initDB,
  getCategories,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  loadFromBytes,
};
```

**Step 6: Commit**

```bash
git add db.js
git commit -m "feat: add database layer with sql.js and OPFS persistence"
```

---

## Task 4: Google Drive Integration (`drive.js`)

**Files:**
- Create: `drive.js`

This module handles OAuth2 PKCE and all Drive REST API calls. It never touches the DOM — errors are thrown and caught by `app.js`.

**Step 1: Create `drive.js` — constants and PKCE helpers**

```javascript
// drive.js
// ⚠️  Set these before deploying
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const REDIRECT_URI = 'https://YOUR_USERNAME.github.io/YOUR_REPO/';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const BACKUP_FOLDER = 'personaccount_backup';
const BACKUP_FILE = 'accounting_backup.db';
const TOKEN_KEY = 'gd_tokens';

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
```

**Step 2: Add OAuth flow functions**

```javascript
async function startOAuthFlow() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier().slice(0, 16);

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  window.location.href = `${AUTH_URL}?${params}`;
}

async function handleOAuthCallback(code, state) {
  const savedState = sessionStorage.getItem('pkce_state');
  const verifier = sessionStorage.getItem('pkce_verifier');

  if (state !== savedState) throw new Error('OAuth state mismatch');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  if (!resp.ok) throw new Error('Token exchange failed');
  const tokens = await resp.json();
  saveTokens(tokens);
  sessionStorage.removeItem('pkce_verifier');
  sessionStorage.removeItem('pkce_state');
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  }));
}

function isAuthenticated() {
  return !!localStorage.getItem(TOKEN_KEY);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}
```

**Step 3: Add token refresh and `getAccessToken()`**

```javascript
async function refreshAccessToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  if (!stored.refresh_token) throw new Error('No refresh token');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  });

  if (!resp.ok) {
    clearTokens();
    throw new Error('Token refresh failed — please reconnect Google Drive');
  }

  const tokens = await resp.json();
  saveTokens({ ...tokens, refresh_token: stored.refresh_token });
}

async function getAccessToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  if (!stored.access_token) throw new Error('Not authenticated');

  if (Date.now() > stored.expires_at - 60_000) {
    await refreshAccessToken();
    return JSON.parse(localStorage.getItem(TOKEN_KEY)).access_token;
  }
  return stored.access_token;
}
```

**Step 4: Add Drive API helpers**

```javascript
async function driveRequest(url, options = {}) {
  const token = await getAccessToken();
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Drive API error ${resp.status}: ${err}`);
  }
  return resp;
}

async function findFolderId(name) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

async function findFileId(folderId, filename) {
  const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

async function downloadFile(fileId) {
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  return new Uint8Array(await resp.arrayBuffer());
}

async function uploadFile(folderId, fileId, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  if (fileId) {
    // Update existing file
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', body: blob }
    );
  } else {
    // Create new file — multipart with metadata
    const metadata = JSON.stringify({ name: BACKUP_FILE, parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
      { method: 'POST', body: form }
    );
  }
}
```

**Step 5: Add high-level `backup()` and `restore()`**

```javascript
async function backup(dbBytes) {
  const folderId = await findFolderId(BACKUP_FOLDER);
  if (!folderId) throw new Error(`Folder "${BACKUP_FOLDER}" not found on Google Drive`);
  const fileId = await findFileId(folderId, BACKUP_FILE);
  await uploadFile(folderId, fileId, dbBytes);
}

async function restore() {
  const folderId = await findFolderId(BACKUP_FOLDER);
  if (!folderId) throw new Error('no_file');
  const fileId = await findFileId(folderId, BACKUP_FILE);
  if (!fileId) throw new Error('no_file');
  return await downloadFile(fileId);
}

// Export
window.Drive = {
  startOAuthFlow,
  handleOAuthCallback,
  isAuthenticated,
  clearTokens,
  backup,
  restore,
};
```

**Step 6: Commit**

```bash
git add drive.js
git commit -m "feat: add Google Drive OAuth2 PKCE and backup/restore"
```

---

## Task 5: Alpine.js Store (`app.js`)

**Files:**
- Create: `app.js`

**Step 1: Create `app.js` with store definition**

```javascript
// app.js
function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

document.addEventListener('alpine:init', () => {
  Alpine.store('app', {
    currentView: 'transactions',
    transactions: [],
    categories: [],
    editTarget: null,
    filter: { type: 'all', month: currentMonth() },
    toast: { message: '', visible: false, _timer: null },
    loading: false,
    driveStatus: 'disconnected', // 'disconnected' | 'connected' | 'syncing'
    form: { amount: '', currency: 'TWD', categoryId: '', date: '', note: '', type: 'expense' },
    errors: {},

    async init() {
      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) {
        try {
          await Drive.handleOAuthCallback(params.get('code'), params.get('state'));
          this.driveStatus = 'connected';
          this.showToast('Google Drive connected!');
        } catch (e) {
          this.showToast('Authentication failed. Please try again.');
        }
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Init DB
      try {
        this.loading = true;
        await DB.initDB();
        this.driveStatus = Drive.isAuthenticated() ? 'connected' : 'disconnected';
        await this.loadTransactions();
      } catch (e) {
        document.getElementById('fatal-error').style.display = 'flex';
      } finally {
        this.loading = false;
      }
    },

    async loadTransactions() {
      this.categories = DB.getCategories(this.form.type || 'expense');
      this.transactions = DB.getTransactions(this.filter.month, this.filter.type);
    },

    prevMonth() {
      const [y, m] = this.filter.month.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      this.filter.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.loadTransactions();
    },

    nextMonth() {
      const [y, m] = this.filter.month.split('-').map(Number);
      const d = new Date(y, m, 1);
      this.filter.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.loadTransactions();
    },

    setTypeFilter(type) {
      this.filter.type = type;
      this.loadTransactions();
    },

    openAdd() {
      this.editTarget = null;
      this.form = {
        amount: '', currency: 'TWD', categoryId: '',
        date: new Date().toISOString().slice(0, 10),
        note: '', type: 'expense',
      };
      this.errors = {};
      this.categories = DB.getCategories('expense');
      this.currentView = 'form';
    },

    openEdit(tx) {
      this.editTarget = tx;
      this.form = {
        amount: String(tx.Amount), currency: tx.Currency,
        categoryId: String(tx.CategoryId), date: tx.Date.slice(0, 10),
        note: tx.Note || '', type: tx.Type,
      };
      this.errors = {};
      this.categories = DB.getCategories(tx.Type);
      this.currentView = 'form';
    },

    onTypeChange() {
      this.form.categoryId = '';
      this.categories = DB.getCategories(this.form.type);
    },

    validateForm() {
      this.errors = {};
      if (!this.form.amount || parseFloat(this.form.amount) <= 0) {
        this.errors.amount = 'Amount is required';
      }
      if (!this.form.categoryId) {
        this.errors.categoryId = 'Please select a category';
      }
      return Object.keys(this.errors).length === 0;
    },

    async saveTransaction() {
      if (!this.validateForm()) return;
      const data = {
        amount: parseFloat(this.form.amount),
        currency: this.form.currency,
        categoryId: parseInt(this.form.categoryId),
        date: this.form.date,
        note: this.form.note,
        type: this.form.type,
      };
      if (this.editTarget) {
        await DB.updateTransaction(this.editTarget.Id, data);
      } else {
        await DB.addTransaction(data);
      }
      this.currentView = 'transactions';
      await this.loadTransactions();
    },

    async deleteTransaction() {
      if (!confirm('Delete this transaction?')) return;
      await DB.deleteTransaction(this.editTarget.Id);
      this.currentView = 'transactions';
      await this.loadTransactions();
    },

    async backupToDrive() {
      if (!Drive.isAuthenticated()) {
        Drive.startOAuthFlow();
        return;
      }
      try {
        this.driveStatus = 'syncing';
        const bytes = DB.exportBytes ? DB.exportBytes() : null;
        // We export inline via db.export() through a helper
        await Drive.backup(window._dbExportBytes());
        this.showToast('Backup complete');
        this.driveStatus = 'connected';
      } catch (e) {
        this.showToast('Drive sync failed. Data saved locally.');
        this.driveStatus = 'connected';
      }
    },

    async restoreFromDrive() {
      if (!Drive.isAuthenticated()) {
        Drive.startOAuthFlow();
        return;
      }
      try {
        this.driveStatus = 'syncing';
        const bytes = await Drive.restore();
        await DB.loadFromBytes(bytes);
        await this.loadTransactions();
        this.showToast('Restore complete');
        this.driveStatus = 'connected';
      } catch (e) {
        if (e.message === 'no_file') {
          this.showToast('No backup found in Google Drive.');
        } else if (e.message?.includes('corrupt') || e.message?.includes('parse')) {
          this.showToast('Backup file appears corrupt.');
        } else {
          this.showToast('Drive sync failed. Data saved locally.');
        }
        this.driveStatus = 'connected';
      }
    },

    connectDrive() {
      Drive.startOAuthFlow();
    },

    disconnectDrive() {
      Drive.clearTokens();
      this.driveStatus = 'disconnected';
    },

    showToast(message, duration = 3000) {
      clearTimeout(this.toast._timer);
      this.toast.message = message;
      this.toast.visible = true;
      this.toast._timer = setTimeout(() => { this.toast.visible = false; }, duration);
    },
  });
});
```

**Step 2: Add db export helper to `db.js`**

At the bottom of `db.js`, add:

```javascript
window._dbExportBytes = () => db.export();
```

**Step 3: Commit**

```bash
git add app.js db.js
git commit -m "feat: add Alpine.js store with transaction CRUD and Drive sync"
```

---

## Task 6: HTML Shell & Views (`index.html`)

**Files:**
- Create: `index.html`

**Step 1: Create `index.html` skeleton**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Accounts">
  <title>Personal Accounts</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="apple-touch-icon" href="./icons/icon-192.png">
  <link rel="stylesheet" href="./css/app.css">
</head>
<body x-data x-init="$store.app.init()">

  <!-- Fatal error overlay -->
  <div id="fatal-error" style="display:none" class="fatal-overlay">
    <p>App failed to load.</p>
    <button onclick="location.reload()">Reload</button>
  </div>

  <!-- Loading spinner -->
  <div x-show="$store.app.loading" class="loading-overlay">
    <div class="spinner"></div>
  </div>

  <!-- Nav bar -->
  <header class="nav-bar">
    <button x-show="$store.app.currentView !== 'transactions'"
            @click="$store.app.currentView = 'transactions'"
            class="btn-icon">←</button>
    <span x-text="
      $store.app.currentView === 'transactions' ? 'Accounts' :
      $store.app.currentView === 'form' && !$store.app.editTarget ? 'Add Transaction' :
      $store.app.currentView === 'form' ? 'Edit Transaction' : 'Settings'
    "></span>
    <button x-show="$store.app.currentView === 'transactions'"
            @click="$store.app.currentView = 'settings'"
            class="btn-icon">⚙</button>
  </header>

  <!-- Transaction List View -->
  <main x-show="$store.app.currentView === 'transactions'">
    <!-- Month filter -->
    <div class="month-nav">
      <button @click="$store.app.prevMonth()" class="btn-icon">‹</button>
      <span x-text="$store.app.filter.month"></span>
      <button @click="$store.app.nextMonth()" class="btn-icon">›</button>
    </div>

    <!-- Type tabs -->
    <div class="type-tabs">
      <button @click="$store.app.setTypeFilter('all')"
              :class="{ active: $store.app.filter.type === 'all' }">All</button>
      <button @click="$store.app.setTypeFilter('income')"
              :class="{ active: $store.app.filter.type === 'income' }">Income</button>
      <button @click="$store.app.setTypeFilter('expense')"
              :class="{ active: $store.app.filter.type === 'expense' }">Expense</button>
    </div>

    <!-- Transaction rows -->
    <ul class="tx-list">
      <template x-if="$store.app.transactions.length === 0">
        <li class="empty-state">No transactions this month</li>
      </template>
      <template x-for="tx in $store.app.transactions" :key="tx.Id">
        <li class="tx-row" @click="$store.app.openEdit(tx)">
          <span class="tx-icon" x-text="tx.CategoryIcon || '💰'"></span>
          <div class="tx-info">
            <span class="tx-category" x-text="tx.CategoryName || 'Uncategorized'"></span>
            <span class="tx-note" x-text="tx.Note"></span>
          </div>
          <div class="tx-right">
            <span class="tx-amount"
                  :class="tx.Type === 'income' ? 'income' : 'expense'"
                  x-text="(tx.Type === 'income' ? '+' : '-') + Number(tx.Amount).toLocaleString() + ' ' + tx.Currency">
            </span>
            <span class="tx-date" x-text="tx.Date?.slice(0, 10)"></span>
          </div>
        </li>
      </template>
    </ul>

    <!-- FAB -->
    <button class="fab" @click="$store.app.openAdd()">+</button>
  </main>

  <!-- Add/Edit Form View -->
  <main x-show="$store.app.currentView === 'form'">
    <form @submit.prevent="$store.app.saveTransaction()" class="tx-form">

      <!-- Type -->
      <div class="form-group">
        <label>Type</label>
        <div class="radio-group">
          <label>
            <input type="radio" x-model="$store.app.form.type" value="expense"
                   @change="$store.app.onTypeChange()"> Expense
          </label>
          <label>
            <input type="radio" x-model="$store.app.form.type" value="income"
                   @change="$store.app.onTypeChange()"> Income
          </label>
        </div>
      </div>

      <!-- Amount -->
      <div class="form-group">
        <label for="amount">Amount</label>
        <input id="amount" type="number" inputmode="decimal" step="0.01" min="0"
               x-model="$store.app.form.amount" placeholder="0.00">
        <span class="error" x-text="$store.app.errors.amount"></span>
      </div>

      <!-- Currency -->
      <div class="form-group">
        <label for="currency">Currency</label>
        <select id="currency" x-model="$store.app.form.currency">
          <option>TWD</option>
          <option>USD</option>
          <option>JPY</option>
          <option>EUR</option>
        </select>
      </div>

      <!-- Category -->
      <div class="form-group">
        <label for="category">Category</label>
        <select id="category" x-model="$store.app.form.categoryId">
          <option value="">Select category…</option>
          <template x-for="cat in $store.app.categories" :key="cat.Id">
            <option :value="cat.Id" x-text="(cat.Icon || '') + ' ' + cat.Name"></option>
          </template>
        </select>
        <span class="error" x-text="$store.app.errors.categoryId"></span>
      </div>

      <!-- Date -->
      <div class="form-group">
        <label for="date">Date</label>
        <input id="date" type="date" x-model="$store.app.form.date">
      </div>

      <!-- Note -->
      <div class="form-group">
        <label for="note">Note</label>
        <input id="note" type="text" x-model="$store.app.form.note" placeholder="Optional">
      </div>

      <button type="submit" class="btn-primary">
        <span x-text="$store.app.editTarget ? 'Save Changes' : 'Add Transaction'"></span>
      </button>

      <!-- Delete (edit only) -->
      <button type="button" x-show="$store.app.editTarget"
              @click="$store.app.deleteTransaction()"
              class="btn-danger">Delete</button>
    </form>
  </main>

  <!-- Settings View -->
  <main x-show="$store.app.currentView === 'settings'">
    <div class="settings-panel">
      <div class="drive-status">
        <span x-text="
          $store.app.driveStatus === 'connected' ? '🟢 Google Drive connected' :
          $store.app.driveStatus === 'syncing'   ? '🔄 Syncing…' :
                                                   '⚪ Not connected'
        "></span>
      </div>

      <button x-show="$store.app.driveStatus === 'disconnected'"
              @click="$store.app.connectDrive()"
              class="btn-primary">Connect Google Drive</button>

      <button x-show="$store.app.driveStatus !== 'disconnected'"
              @click="$store.app.backupToDrive()"
              :disabled="$store.app.driveStatus === 'syncing'"
              class="btn-primary">Backup to Drive</button>

      <button x-show="$store.app.driveStatus !== 'disconnected'"
              @click="$store.app.restoreFromDrive()"
              :disabled="$store.app.driveStatus === 'syncing'"
              class="btn-secondary">Restore from Drive</button>

      <button x-show="$store.app.driveStatus !== 'disconnected'"
              @click="$store.app.disconnectDrive()"
              class="btn-ghost">Disconnect</button>
    </div>
  </main>

  <!-- Toast -->
  <div x-show="$store.app.toast.visible"
       x-transition
       class="toast"
       x-text="$store.app.toast.message">
  </div>

  <script src="./vendor/sql-wasm.js"></script>
  <script src="./vendor/alpine.min.js" defer></script>
  <script src="./db.js"></script>
  <script src="./drive.js"></script>
  <script src="./app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js');
    }
  </script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add single-page HTML shell with all 4 views"
```

---

## Task 7: Mobile CSS (`css/app.css`)

**Files:**
- Create: `css/app.css`

**Step 1: Create `css/app.css`**

```css
/* css/app.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary: #2563eb;
  --danger: #dc2626;
  --income: #16a34a;
  --expense: #dc2626;
  --bg: #f9fafb;
  --surface: #ffffff;
  --border: #e5e7eb;
  --text: #111827;
  --muted: #6b7280;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  background: var(--bg);
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
}

/* Safe area */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Nav bar */
.nav-bar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
  height: 56px;
  font-weight: 600;
  padding-top: env(safe-area-inset-top);
}

/* Main content */
main { padding: 16px; padding-bottom: 96px; }

/* Month nav */
.month-nav {
  display: flex; align-items: center; justify-content: center; gap: 24px;
  padding: 12px 0;
  font-weight: 600;
  font-size: 1.1rem;
}

/* Type tabs */
.type-tabs {
  display: flex; gap: 8px;
  padding: 8px 0 16px;
}

.type-tabs button {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.9rem;
  min-height: 44px;
  cursor: pointer;
}

.type-tabs button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Transaction list */
.tx-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }

.tx-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface);
  border-radius: 12px;
  padding: 14px;
  min-height: 64px;
  cursor: pointer;
  border: 1px solid var(--border);
}

.tx-icon { font-size: 1.5rem; width: 36px; text-align: center; }
.tx-info { flex: 1; display: flex; flex-direction: column; }
.tx-category { font-weight: 500; }
.tx-note { font-size: 0.85rem; color: var(--muted); }
.tx-right { display: flex; flex-direction: column; align-items: flex-end; }
.tx-amount { font-weight: 600; }
.tx-amount.income { color: var(--income); }
.tx-amount.expense { color: var(--expense); }
.tx-date { font-size: 0.8rem; color: var(--muted); }

.empty-state {
  text-align: center; padding: 48px; color: var(--muted);
}

/* FAB */
.fab {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom));
  right: 24px;
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-size: 1.8rem;
  border: none;
  box-shadow: 0 4px 12px rgba(37,99,235,0.4);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

/* Form */
.tx-form { display: flex; flex-direction: column; gap: 16px; }

.form-group { display: flex; flex-direction: column; gap: 6px; }

.form-group label { font-size: 0.9rem; font-weight: 500; color: var(--muted); }

.form-group input,
.form-group select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 1rem;
  background: var(--surface);
  min-height: 48px;
}

.radio-group {
  display: flex; gap: 24px;
  padding: 8px 0;
}

.radio-group label {
  display: flex; align-items: center; gap: 8px;
  font-size: 1rem;
  color: var(--text);
  min-height: 44px;
  cursor: pointer;
}

.radio-group input[type=radio] { width: 20px; height: 20px; cursor: pointer; }

.error { color: var(--danger); font-size: 0.85rem; }

/* Buttons */
.btn-primary, .btn-secondary, .btn-danger, .btn-ghost, .btn-icon {
  min-height: 48px;
  border-radius: 10px;
  border: none;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  padding: 12px 20px;
  width: 100%;
}

.btn-primary  { background: var(--primary); color: white; }
.btn-secondary { background: var(--bg); color: var(--primary); border: 1px solid var(--primary); }
.btn-danger   { background: var(--danger); color: white; margin-top: 8px; }
.btn-ghost    { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.btn-icon     { width: 44px; height: 44px; font-size: 1.2rem; background: none; border: none; padding: 0; cursor: pointer; }

button:disabled { opacity: 0.5; cursor: not-allowed; }

/* Settings */
.settings-panel {
  display: flex; flex-direction: column; gap: 16px;
  padding: 16px 0;
}

.drive-status {
  font-size: 1rem;
  padding: 16px;
  background: var(--surface);
  border-radius: 10px;
  border: 1px solid var(--border);
  text-align: center;
}

/* Toast */
.toast {
  position: fixed;
  bottom: calc(80px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  background: rgba(17,24,39,0.9);
  color: white;
  padding: 12px 24px;
  border-radius: 24px;
  font-size: 0.9rem;
  max-width: 90vw;
  text-align: center;
  z-index: 100;
  white-space: nowrap;
}

/* Loading overlay */
.loading-overlay {
  position: fixed; inset: 0;
  background: rgba(255,255,255,0.8);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
}

.spinner {
  width: 40px; height: 40px;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Fatal error */
.fatal-overlay {
  position: fixed; inset: 0;
  background: white;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; padding: 32px;
  z-index: 200;
}
```

**Step 2: Commit**

```bash
git add css/app.css
git commit -m "feat: add mobile-first CSS with safe-area and 44px tap targets"
```

---

## Task 8: Google Cloud Console Setup

**This is a manual step — no code required.**

**Step 1: Create Web OAuth client**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → select the same project as the MAUI app
2. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
3. Application type: **Web application**
4. Name: `accounting-pwa`
5. Authorized redirect URIs: `https://YOUR_USERNAME.github.io/YOUR_REPO/`
6. Click Create — note the **Client ID**

**Step 2: Update `drive.js` constants**

```javascript
const CLIENT_ID = 'PASTE_CLIENT_ID_HERE.apps.googleusercontent.com';
const REDIRECT_URI = 'https://YOUR_USERNAME.github.io/YOUR_REPO/';
```

**Step 3: Commit**

```bash
git add drive.js
git commit -m "chore: set Google OAuth client ID and redirect URI"
```

---

## Task 9: GitHub Pages Deployment & End-to-End Verification

**Step 1: Push to GitHub**

```bash
git push origin master
```

**Step 2: Enable GitHub Pages**

Repository Settings → Pages → Source: **Deploy from branch** → `master` / `/ (root)` → Save.

Wait ~1 minute. Site is live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

**Step 3: Verify service worker and PWA on iPhone**

1. Open URL in iPhone Safari
2. Check: page loads without errors
3. Tap Share → "Add to Home Screen" → confirm name and icon
4. Launch from Home Screen → verify standalone mode (no address bar)

**Step 4: Verify offline mode**

1. Enable Airplane Mode on iPhone
2. Open the installed PWA
3. Expected: app loads normally, transaction list shows (from OPFS)

**Step 5: Verify Google Drive OAuth**

1. Settings → Connect Google Drive
2. Google consent screen → Allow
3. Expected: returns to app, "🟢 Google Drive connected"

**Step 6: Verify restore**

1. Settings → Restore from Drive
2. Expected: transactions list populated with MAUI app data

**Step 7: Verify CRUD round-trip**

1. Tap + → add a transaction → Save
2. Expected: appears in list immediately
3. Kill and reopen PWA → Expected: transaction still in list (OPFS persistence)
4. Settings → Backup to Drive
5. Open MAUI app → Restore from Drive → Expected: new transaction is present

**Step 8: Verify error states**

1. Settings → Restore with no internet → Expected: toast "Drive sync failed. Data saved locally."
2. Submit empty form → Expected: inline validation errors shown

---

## Deployment Notes

- **Cache busting on update:** Increment `CACHE = 'accounting-v2'` in `sw.js` on each deploy
- **Icon update:** Replace `icons/icon-192.png` and `icons/icon-512.png` with final artwork anytime
- **OPFS data lives in browser storage:** Clearing Safari website data will delete local DB — always backup to Drive first
