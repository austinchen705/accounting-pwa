# Asset Trend View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA 端新增「資產趨勢」view，與 MAUI app 共用 `AssetSnapshot` 表，含列表 / 新增 / 編輯 / 刪除（同日 upsert）+ 堆疊柱狀+折線圖表，並引入底部 tab bar 切換 Transactions ↔ Trends。

**Architecture:** 沿用既有 Alpine.js + sql.js 架構。`db.js` 增加 migration v2 主動建立 `AssetSnapshot` 表（schema 對齊 MAUI SQLite-Net 預設輸出）並修正 migration 在 `loadFromBytes()` 後不跑的 bug。`app.js` Alpine store 擴充 snapshot state / actions 與 Chart.js mixed chart 渲染。`index.html` 新增 trends / snapshotForm 兩個 view + 固定底部 tab bar。

**Tech Stack:** Alpine.js（vendor）、sql.js（WASM）、**Chart.js v4 UMD（新增 vendor）**、OPFS / localStorage 持久化、GitHub Pages 靜態託管。

---

## Reference Documents

- Brainstorm 對話：本次 session（含每題決策與理由）
- OpenSpec change：`openspec/changes/add-asset-trend-view/`
  - `proposal.md`：why / what / capabilities / impact
  - `design.md`：D1–D7 七個技術決策 + risks + migration plan
  - `specs/asset-trend/spec.md`：8 個 requirements / 14 個 scenarios
  - `specs/pwa-shell-navigation/spec.md`：3 個 requirements / 6 個 scenarios
- MAUI 端對應功能（讀取對照用）：
  - `D:\Repository\Poc\accounting-app\AccountingApp.Core\Models\AssetSnapshot.cs`
  - `D:\Repository\Poc\accounting-app\AccountingApp\Views\AssetTrendPage.xaml`
  - `D:\Repository\Poc\accounting-app\AccountingApp\ViewModels\AssetTrendViewModel.cs`（圖表設色、X 軸降採樣邏輯）

## Critical Gotchas（先讀完再動工）

1. **`sw.js` 的 `CACHE` 目前是 `'accounting-v3'`**（不是 `v1`）。本 change bump 到 `'accounting-v4'`。
2. **既有 `initDB()` 的 bug**：只在沒 db bytes 時跑 `runMigrations()`；`loadFromBytes()`（Drive restore）完全不跑 migrations。本 change **必須順手修掉這個 bug**，讓 migrations 在 db 載入後總是跑（依賴 `IF NOT EXISTS` + `_migrations` 表確保 idempotent）。否則 v2 對所有現有使用者都不會生效。
3. **Date 欄位是 .NET ticks（INTEGER），不是 ISO 字串**。寫入要用 `DATE_TO_TICKS_EXPR`，讀取用 `TICKS_DATE_EXPR`，沿用 db.js 既有的轉換 SQL 片段。
4. **Chart.js canvas 在 `display:none` 容器內初始化會壞掉**（width/height = 0）。chart 必須在 trends view 第一次 visible 時才 init / re-init，不能在 `init()` 階段一次建。
5. **不要刪掉 MAUI 端可能存在的同日多筆**：upsert 只更新「同日最大 Id」那一筆，舊重複資料保留不動。
6. **Chart.js v4 UMD 全域變數名稱是 `Chart`**（大寫）。沒有預設 export。
7. **Service worker 改完後**：本機測試要 DevTools → Application → Service Workers → Unregister，或開 incognito，否則舊 SW cache 會擋住新檔。

## File Structure

**Create:**
- `vendor/chart.umd.min.js` — Chart.js v4 UMD bundle

**Modify:**
- `db.js` — migration v2 + AssetSnapshot CRUD + migration 改成 always run
- `app.js` — snapshot store state、CRUD actions、Chart.js 整合
- `index.html` — trends view、snapshotForm view、底部 tab bar、header 標題綁定
- `css/app.css` — tab bar、snapshot 卡片、chart container、FAB / main 邊距調整
- `sw.js` — `CACHE` bump v3 → v4，precache 加入 chart vendor

## Dev / Verify 環境

PWA 是純靜態檔，本機驗證用 Python 內建 http server：

```powershell
# 在專案根目錄開一個視窗執行
Set-Location D:\Repository\Poc\accounting-pwa
python -m http.server 8080
# 瀏覽器開 http://localhost:8080/
```

若無 Python，可改用 `npx http-server -c-1 -p 8080`。

**驗證每個 task 都要做**：DevTools → Application → Service Workers → Unregister（or 開 incognito），重整頁面，確認新版生效。

---

## Task 1: Vendor Chart.js v4 + service worker bump

**Files:**
- Create: `vendor/chart.umd.min.js`
- Modify: `index.html`（新增 script 標籤）
- Modify: `sw.js`（CACHE 名稱 + precache 清單）

- [ ] **Step 1.1: 下載 Chart.js v4 UMD build 到 vendor/**

執行：

```powershell
Set-Location D:\Repository\Poc\accounting-pwa
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js" -OutFile "vendor\chart.umd.min.js"
(Get-Item "vendor\chart.umd.min.js").Length
```

Expected：檔案大小約 200KB（min 未 gzip）；檔案存在。

如果 4.4.6 抓不到（CDN 更新），改用：

```powershell
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/chart.js@^4/dist/chart.umd.min.js" -OutFile "vendor\chart.umd.min.js"
```

- [ ] **Step 1.2: 在 index.html 加入 script 標籤**

打開 `D:\Repository\Poc\accounting-pwa\index.html`，找到既有的 `<script src="./vendor/sql-wasm.js"></script>` 那一行（約 213 行），**在它之後**加入：

```html
  <script src="./vendor/chart.umd.min.js"></script>
```

最終區塊應該是：

```html
  <script src="./vendor/sql-wasm.js"></script>
  <script src="./vendor/chart.umd.min.js"></script>
  <script src="./vendor/alpine.min.js" defer></script>
  <script src="./db.js"></script>
  <script src="./drive.js"></script>
  <script src="./app.js"></script>
```

- [ ] **Step 1.3: 更新 sw.js**

打開 `D:\Repository\Poc\accounting-pwa\sw.js`，把：

```js
const CACHE = 'accounting-v3';
```

改為：

```js
const CACHE = 'accounting-v4';
```

並把 `PRECACHE` 陣列中加入 `'./vendor/chart.umd.min.js'`：

```js
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
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

- [ ] **Step 1.4: 啟動 dev server 並驗證 Chart 載入**

開新 PowerShell：

```powershell
Set-Location D:\Repository\Poc\accounting-pwa
python -m http.server 8080
```

瀏覽器（建議 incognito）開 `http://localhost:8080/`。

DevTools → Console 執行：

```js
typeof Chart
```

Expected：`'function'`

DevTools → Network 確認 `chart.umd.min.js` 載入成功（status 200）。

- [ ] **Step 1.5: Commit**

```powershell
git add vendor/chart.umd.min.js index.html sw.js
git commit -m "feat(asset-trend): vendor Chart.js v4 and bump SW cache to v4"
```

---

## Task 2: Migration v2 — `AssetSnapshot` 表 + 改成 always run

**Files:**
- Modify: `db.js`（runMigrations 內加 v2 區塊；initDB / loadFromBytes 都呼叫 runMigrations）

- [ ] **Step 2.1: 修改 `runMigrations()`，加入 v2 區塊**

打開 `D:\Repository\Poc\accounting-pwa\db.js`，找到 `runMigrations` 函式（約 45-72 行）。在 `if (!versions.includes(1)) { ... }` 區塊**之後**加入 v2 區塊：

```js
  if (!versions.includes(2)) {
    db.run(`
      CREATE TABLE IF NOT EXISTS AssetSnapshot (
        Id          INTEGER PRIMARY KEY AUTOINCREMENT,
        Date        INTEGER NOT NULL,
        Stock       REAL NOT NULL DEFAULT 0,
        Cash        REAL NOT NULL DEFAULT 0,
        FirstTrade  REAL NOT NULL DEFAULT 0,
        Property    REAL NOT NULL DEFAULT 0
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS IX_AssetSnapshots_Date ON AssetSnapshot(Date)`);
    db.run(`INSERT INTO _migrations VALUES (2)`);
  }
```

**注意**：表名稱使用 `AssetSnapshot`（單數，無 s）— 對齊 MAUI SQLite-Net 對 class `AssetSnapshot` 的預設表名。

- [ ] **Step 2.2: 修改 `initDB()`，讓 migrations 在載入既有 db 後也跑**

找到 `initDB()` 函式（約 76-90 行），把：

```js
  if (bytes) {
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
    await runMigrations();
  }
```

改為：

```js
  if (bytes) {
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }
  await runMigrations();
```

`runMigrations()` 依賴 `IF NOT EXISTS` + `_migrations` 表（自身也用 `CREATE TABLE IF NOT EXISTS`），對既有 db idempotent 且安全。

- [ ] **Step 2.3: 修改 `loadFromBytes()`，restore 後也跑 migrations**

找到 `loadFromBytes()` 函式（約 178-182 行）：

```js
async function loadFromBytes(bytes) {
  db.close();
  db = new SQL.Database(bytes);
  await exportAndPersist();
}
```

改為：

```js
async function loadFromBytes(bytes) {
  db.close();
  db = new SQL.Database(bytes);
  await runMigrations();
  await exportAndPersist();
}
```

- [ ] **Step 2.4: 重新整理 PWA 並驗證表已建立**

DevTools → Application → Service Workers → Unregister（或 incognito 重開）。重整 `http://localhost:8080/`。

DevTools → Console 執行：

```js
_dbQuery("SELECT name, sql FROM sqlite_master WHERE type='table' AND name='AssetSnapshot'")
```

Expected：回傳 1 列，`sql` 欄位含 `CREATE TABLE ... AssetSnapshot` 與四個 REAL 欄位。

```js
_dbQuery("SELECT name FROM sqlite_master WHERE type='index' AND name='IX_AssetSnapshots_Date'")
```

Expected：回傳 1 列。

```js
_dbQuery("SELECT version FROM _migrations ORDER BY version")
```

Expected：回傳 `[[1], [2]]` 或類似 — 含版本 1 與 2。

- [ ] **Step 2.5: Commit**

```powershell
git add db.js
git commit -m "feat(asset-trend): add migration v2 for AssetSnapshot and run migrations after restore"
```

---

## Task 3: AssetSnapshot CRUD 函式

**Files:**
- Modify: `db.js`（4 個函式 + window.DB export）

- [ ] **Step 3.1: 加入 4 個 CRUD 函式**

在 `db.js` 的 `loadFromBytes()` **之前**（約 178 行前），新增以下函式。注意複用既有 `TICKS_DATE_EXPR` 與 `DATE_TO_TICKS_EXPR`：

```js
function getSnapshots() {
  const results = db.exec(`
    SELECT s.Id,
           date(datetime((s.Date - 621355968000000000) / 10000000, 'unixepoch')) AS Date,
           s.Stock, s.Cash, s.FirstTrade, s.Property
    FROM AssetSnapshot s
    ORDER BY s.Date DESC
  `);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

async function addOrReplaceSnapshotByDate({ date, stock, cash, firstTrade, property }) {
  // 查同日最大 Id 那一筆
  const existing = db.exec(
    `SELECT Id FROM AssetSnapshot WHERE Date = ${DATE_TO_TICKS_EXPR} ORDER BY Id DESC LIMIT 1`,
    [date]
  );

  if (existing.length && existing[0].values.length) {
    const id = existing[0].values[0][0];
    db.run(
      `UPDATE AssetSnapshot
       SET Stock=?, Cash=?, FirstTrade=?, Property=?
       WHERE Id=?`,
      [stock, cash, firstTrade, property, id]
    );
    await exportAndPersist();
    return { action: 'updated', id };
  }

  db.run(
    `INSERT INTO AssetSnapshot (Date, Stock, Cash, FirstTrade, Property)
     VALUES (${DATE_TO_TICKS_EXPR}, ?, ?, ?, ?)`,
    [date, stock, cash, firstTrade, property]
  );
  await exportAndPersist();
  return { action: 'inserted' };
}

async function updateSnapshot(id, { date, stock, cash, firstTrade, property }) {
  db.run(
    `UPDATE AssetSnapshot
     SET Date=${DATE_TO_TICKS_EXPR}, Stock=?, Cash=?, FirstTrade=?, Property=?
     WHERE Id=?`,
    [date, stock, cash, firstTrade, property, id]
  );
  await exportAndPersist();
}

async function deleteSnapshot(id) {
  db.run(`DELETE FROM AssetSnapshot WHERE Id=?`, [id]);
  await exportAndPersist();
}
```

- [ ] **Step 3.2: 把 4 個函式加進 `window.DB`**

找到檔案末端的 `window.DB = { ... }` 物件（約 186-194 行），加入新函式：

```js
window.DB = {
  initDB,
  getCategories,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  loadFromBytes,
  getSnapshots,
  addOrReplaceSnapshotByDate,
  updateSnapshot,
  deleteSnapshot,
};
```

- [ ] **Step 3.3: 重整頁面，在 console 手動驗證 CRUD**

DevTools → Console，依序執行：

```js
// 應為空陣列
DB.getSnapshots()
```

Expected：`[]`

```js
// 新增一筆
await DB.addOrReplaceSnapshotByDate({ date: '2026-05-26', stock: 100, cash: 200, firstTrade: 50, property: 1000 })
```

Expected：回傳 `{ action: 'inserted' }`。

```js
DB.getSnapshots()
```

Expected：陣列含一個物件 `{ Id: 1, Date: '2026-05-26', Stock: 100, Cash: 200, FirstTrade: 50, Property: 1000 }`。

```js
// 同日 upsert
await DB.addOrReplaceSnapshotByDate({ date: '2026-05-26', stock: 999, cash: 200, firstTrade: 50, property: 1000 })
```

Expected：回傳 `{ action: 'updated', id: 1 }`。

```js
DB.getSnapshots()
```

Expected：仍只有 1 筆，但 `Stock` 變為 `999`。

```js
await DB.updateSnapshot(1, { date: '2026-05-27', stock: 1, cash: 2, firstTrade: 3, property: 4 })
DB.getSnapshots()
```

Expected：1 筆，`Date: '2026-05-27'`，數值已更新。

```js
await DB.deleteSnapshot(1)
DB.getSnapshots()
```

Expected：`[]`。

- [ ] **Step 3.4: Commit**

```powershell
git add db.js
git commit -m "feat(asset-trend): add AssetSnapshot CRUD with upsert-by-date"
```

---

## Task 4: Alpine store — snapshot state + load action

**Files:**
- Modify: `app.js`（state + loadSnapshots）

- [ ] **Step 4.1: 加 snapshot 相關 state**

打開 `D:\Repository\Poc\accounting-pwa\app.js`，找到 `Alpine.store('app', { ... })`，在既有 state（約 9-19 行）之後加入：

```js
    // Asset Trend state
    snapshots: [],
    snapshotEditTarget: null,
    snapshotForm: {
      date: '',
      stock: '',
      cash: '',
      firstTrade: '',
      property: '',
    },
    snapshotErrors: {},
```

加完後 store 結構應該長這樣（節錄）：

```js
  Alpine.store('app', {
    currentView: 'transactions',
    transactions: [],
    categories: [],
    editTarget: null,
    filter: { type: 'all', month: currentMonth() },
    toast: { message: '', visible: false, _timer: null },
    loading: false,
    driveStatus: 'disconnected',
    setup: { clientId: '', clientSecret: '' },
    form: { amount: '', currency: 'TWD', categoryId: '', date: '', note: '', type: 'expense' },
    errors: {},

    // Asset Trend state
    snapshots: [],
    snapshotEditTarget: null,
    snapshotForm: { date: '', stock: '', cash: '', firstTrade: '', property: '' },
    snapshotErrors: {},

    async init() { ... },
    ...
```

- [ ] **Step 4.2: 加 loadSnapshots 方法**

在 `loadTransactions()` 方法**之後**（約 51 行後）加入：

```js
    loadSnapshots() {
      this.snapshots = DB.getSnapshots();
    },
```

- [ ] **Step 4.3: 在 `init()` 內 load 一次（即使預設不在 trends view）**

修改 `init()` 內的 `await this.loadTransactions();` 那行（約 40 行），把它與 loadSnapshots 並排：

```js
        await this.loadTransactions();
        this.loadSnapshots();
```

這樣首次啟動 chart 渲染才有資料。

- [ ] **Step 4.4: 重整頁面、驗證**

DevTools Console：

```js
$store = document.body._x_dataStack[0].$store
$store.app.snapshots
```

Expected：`[]`（若 Task 3 沒留資料）或既有資料。

```js
await DB.addOrReplaceSnapshotByDate({ date: '2026-05-26', stock: 100, cash: 200, firstTrade: 50, property: 1000 })
$store.app.loadSnapshots()
$store.app.snapshots
```

Expected：陣列含 1 筆。

- [ ] **Step 4.5: Commit**

```powershell
git add app.js
git commit -m "feat(asset-trend): add Alpine snapshot state and loadSnapshots action"
```

---

## Task 5: Trends view scaffold（list + 空圖表占位）

**Files:**
- Modify: `index.html`（新增 trends view block + header 標題綁定）
- Modify: `app.js`（loadCounter helper for chart init timing — 先 placeholder）

- [ ] **Step 5.1: 在 index.html 加 trends view**

打開 `D:\Repository\Poc\accounting-pwa\index.html`，在既有 settings view 的 `</main>`（約 204 行）**之後、`<!-- Toast -->` 之前**，加入：

```html
  <!-- Asset Trend View -->
  <main x-show="$store.app.currentView === 'trends'">

    <!-- Latest total -->
    <template x-if="$store.app.snapshots.length > 0">
      <div class="latest-total">
        <div class="latest-total-caption"
             x-text="'最新總資產 (' + $store.app.snapshots[0].Date.replace(/-/g,'/') + ')'"></div>
        <div class="latest-total-amount"
             x-text="(($store.app.snapshots[0].Stock + $store.app.snapshots[0].Cash + $store.app.snapshots[0].FirstTrade + $store.app.snapshots[0].Property)|0).toLocaleString()"></div>
      </div>
    </template>

    <!-- Chart -->
    <div class="chart-container" x-show="$store.app.snapshots.length > 0">
      <canvas id="asset-trend-chart"></canvas>
    </div>

    <!-- Snapshot history -->
    <h3 class="section-title" x-show="$store.app.snapshots.length > 0">快照歷史</h3>

    <ul class="snapshot-list">
      <template x-if="$store.app.snapshots.length === 0">
        <li class="empty-state">尚無資產快照資料</li>
      </template>
      <template x-for="s in $store.app.snapshots" :key="s.Id">
        <li class="snapshot-card" @click="$store.app.openSnapshotEdit(s)">
          <div class="snapshot-date" x-text="s.Date.replace(/-/g,'/')"></div>
          <div class="snapshot-grid">
            <div class="snapshot-cell">
              <span class="snapshot-label">Stock</span>
              <span class="snapshot-value" x-text="(s.Stock|0).toLocaleString()"></span>
            </div>
            <div class="snapshot-cell">
              <span class="snapshot-label">Cash</span>
              <span class="snapshot-value" x-text="(s.Cash|0).toLocaleString()"></span>
            </div>
            <div class="snapshot-cell">
              <span class="snapshot-label">FirstTrade</span>
              <span class="snapshot-value" x-text="(s.FirstTrade|0).toLocaleString()"></span>
            </div>
            <div class="snapshot-cell">
              <span class="snapshot-label">Property(房產)</span>
              <span class="snapshot-value" x-text="(s.Property|0).toLocaleString()"></span>
            </div>
          </div>
        </li>
      </template>
    </ul>

    <!-- FAB -->
    <button class="fab" @click="$store.app.openSnapshotAdd()">+</button>
  </main>
```

- [ ] **Step 5.2: 更新 header 標題綁定（讓 trends / snapshotForm 顯示對的標題）**

找到 `<header class="nav-bar">` 內的 `<span x-text="...">` 區塊（約 32-36 行）。把它換成：

```html
    <span x-text="
      $store.app.currentView === 'transactions' ? 'Accounts' :
      $store.app.currentView === 'trends' ? '資產趨勢' :
      $store.app.currentView === 'snapshotForm' && !$store.app.snapshotEditTarget ? '新增資產快照' :
      $store.app.currentView === 'snapshotForm' ? '編輯資產快照' :
      $store.app.currentView === 'form' && !$store.app.editTarget ? 'Add Transaction' :
      $store.app.currentView === 'form' ? 'Edit Transaction' : 'Settings'
    "></span>
```

- [ ] **Step 5.3: 更新右上齒輪顯示條件（trends 也要能進 settings）**

找到既有的設定齒輪 button（約 37-39 行）：

```html
    <button x-show="$store.app.currentView === 'transactions'"
            @click="$store.app.currentView = 'settings'"
            class="btn-icon">⚙</button>
```

改為：

```html
    <button x-show="['transactions','trends'].includes($store.app.currentView)"
            @click="$store.app.currentView = 'settings'"
            class="btn-icon">⚙</button>
```

- [ ] **Step 5.4: 暫加 `openSnapshotAdd` / `openSnapshotEdit` placeholder（避免 console error，下一個 task 補實作）**

打開 `app.js`，在 `loadSnapshots()` 之後加：

```js
    openSnapshotAdd() {
      this.snapshotEditTarget = null;
      this.snapshotForm = {
        date: new Date().toISOString().slice(0, 10),
        stock: '', cash: '', firstTrade: '', property: '',
      };
      this.snapshotErrors = {};
      this.currentView = 'snapshotForm';
    },

    openSnapshotEdit(snapshot) {
      this.snapshotEditTarget = snapshot;
      this.snapshotForm = {
        date: snapshot.Date,
        stock: String(snapshot.Stock),
        cash: String(snapshot.Cash),
        firstTrade: String(snapshot.FirstTrade),
        property: String(snapshot.Property),
      };
      this.snapshotErrors = {};
      this.currentView = 'snapshotForm';
    },
```

- [ ] **Step 5.5: 驗證**

重整頁面。Console：

```js
$store = document.body._x_dataStack[0].$store
$store.app.currentView = 'trends'
```

Expected：畫面切到 trends view。若 snapshot 表中無資料，看到「尚無資產快照資料」+ 右下 FAB；若有資料看到 latest-total + 卡片清單。Chart 容器目前空白（下個 task 處理）。

點卡片應切到 `snapshotForm` view（畫面變空白，下個 task 補表單 UI）。

回到列表用 Console：`$store.app.currentView = 'trends'`。

- [ ] **Step 5.6: Commit**

```powershell
git add index.html app.js
git commit -m "feat(asset-trend): scaffold trends view with list and latest-total"
```

---

## Task 6: 底部 tab bar HTML + CSS

**Files:**
- Modify: `index.html`（在 body 末加 tab bar）
- Modify: `css/app.css`（tab bar 樣式 + main padding 調整 + FAB 位置）

- [ ] **Step 6.1: 在 index.html 加 tab bar nav**

在 `<!-- Toast -->` 區塊**之前**（約 206 行前）加入：

```html
  <!-- Bottom tab bar -->
  <nav class="tab-bar" x-show="['transactions','trends'].includes($store.app.currentView)">
    <button :class="{ active: $store.app.currentView === 'transactions' }"
            @click="$store.app.currentView = 'transactions'">
      <span class="tab-icon">📒</span>
      <span class="tab-label">Transactions</span>
    </button>
    <button :class="{ active: $store.app.currentView === 'trends' }"
            @click="$store.app.currentView = 'trends'; $store.app.loadSnapshots()">
      <span class="tab-icon">📈</span>
      <span class="tab-label">Trends</span>
    </button>
  </nav>
```

- [ ] **Step 6.2: 在 css/app.css 加 tab bar 樣式**

打開 `D:\Repository\Poc\accounting-pwa\css\app.css`，在 `/* Toast */` 那一段（約 192 行）**之前**加入：

```css
/* Bottom tab bar */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-bar button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0;
  min-height: 56px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.tab-bar button.active {
  color: var(--primary);
}

.tab-icon { font-size: 1.4rem; line-height: 1; }
.tab-label { font-size: 0.75rem; font-weight: 500; }
```

- [ ] **Step 6.3: 調整 `main` 與 FAB 的底邊距以避開 tab bar**

把既有的：

```css
main { padding: 16px; padding-bottom: 96px; }
```

改為：

```css
main {
  padding: 16px;
  padding-bottom: calc(56px + env(safe-area-inset-bottom) + 96px);
}
```

把既有的：

```css
.fab {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom));
  right: 24px;
  ...
}
```

改為：

```css
.fab {
  position: fixed;
  bottom: calc(56px + env(safe-area-inset-bottom) + 24px);
  right: 24px;
  ...
}
```

把既有的：

```css
.toast {
  position: fixed;
  bottom: calc(80px + env(safe-area-inset-bottom));
  ...
}
```

改為：

```css
.toast {
  position: fixed;
  bottom: calc(56px + env(safe-area-inset-bottom) + 80px);
  ...
}
```

- [ ] **Step 6.4: 驗證**

重整頁面。

- 預設在 transactions view → 底部 tab bar 顯示，Transactions 為 active。
- 點 Trends tab → 切到 trends view，Trends 為 active。
- 點齒輪 → settings view → tab bar 隱藏。
- 從 settings 用左上 back → 回到 transactions，tab bar 再次顯示。
- 點 FAB（在 transactions 或 trends）→ 進 form 或 snapshotForm → tab bar 隱藏。
- FAB 沒被 tab bar 遮住、不重疊。
- iPhone Safari 上（若可用 remote debug）home indicator 區域不擋按鈕。

- [ ] **Step 6.5: Commit**

```powershell
git add index.html css/app.css
git commit -m "feat(asset-trend): add bottom tab bar (Transactions / Trends)"
```

---

## Task 7: SnapshotForm view + save/delete actions

**Files:**
- Modify: `index.html`（snapshotForm view）
- Modify: `app.js`（saveSnapshot / deleteSnapshot 實作）

- [ ] **Step 7.1: 在 index.html 加 snapshotForm view**

在剛剛 Task 5 加的 trends `</main>` **之後、tab-bar 之前**，加入：

```html
  <!-- Snapshot Form View -->
  <main x-show="$store.app.currentView === 'snapshotForm'">
    <form @submit.prevent="$store.app.saveSnapshot()" class="tx-form">

      <div class="form-group">
        <label for="snap-date">日期</label>
        <input id="snap-date" type="date" x-model="$store.app.snapshotForm.date">
        <span class="error" x-text="$store.app.snapshotErrors.date"></span>
      </div>

      <div class="form-group">
        <label for="snap-stock">Stock</label>
        <input id="snap-stock" type="number" inputmode="numeric" step="1" min="0"
               x-model="$store.app.snapshotForm.stock" placeholder="0">
        <span class="error" x-text="$store.app.snapshotErrors.stock"></span>
      </div>

      <div class="form-group">
        <label for="snap-cash">Cash</label>
        <input id="snap-cash" type="number" inputmode="numeric" step="1" min="0"
               x-model="$store.app.snapshotForm.cash" placeholder="0">
        <span class="error" x-text="$store.app.snapshotErrors.cash"></span>
      </div>

      <div class="form-group">
        <label for="snap-first-trade">FirstTrade</label>
        <input id="snap-first-trade" type="number" inputmode="numeric" step="1" min="0"
               x-model="$store.app.snapshotForm.firstTrade" placeholder="0">
        <span class="error" x-text="$store.app.snapshotErrors.firstTrade"></span>
      </div>

      <div class="form-group">
        <label for="snap-property">Property(房產)</label>
        <input id="snap-property" type="number" inputmode="numeric" step="1" min="0"
               x-model="$store.app.snapshotForm.property" placeholder="0">
        <span class="error" x-text="$store.app.snapshotErrors.property"></span>
      </div>

      <button type="submit" class="btn-primary">
        <span x-text="$store.app.snapshotEditTarget ? '更新快照' : '新增快照'"></span>
      </button>

      <button type="button"
              x-show="$store.app.snapshotEditTarget"
              @click="$store.app.deleteSnapshot()"
              class="btn-danger">刪除</button>
    </form>
  </main>
```

- [ ] **Step 7.2: 在 app.js 加 validateSnapshot / saveSnapshot / deleteSnapshot**

在 Task 5 加的 `openSnapshotEdit` 方法**之後**加：

```js
    validateSnapshotForm() {
      this.snapshotErrors = {};
      if (!this.snapshotForm.date) {
        this.snapshotErrors.date = '日期必填';
      }
      for (const field of ['stock', 'cash', 'firstTrade', 'property']) {
        const raw = this.snapshotForm[field];
        if (raw === '' || raw === null || raw === undefined) continue;
        const num = parseFloat(raw);
        if (Number.isNaN(num) || num < 0) {
          this.snapshotErrors[field] = '資產值必須為非負數';
        }
      }
      return Object.keys(this.snapshotErrors).length === 0;
    },

    parseSnapshotValue(raw) {
      if (raw === '' || raw === null || raw === undefined) return 0;
      const n = parseFloat(raw);
      return Number.isNaN(n) ? 0 : n;
    },

    async saveSnapshot() {
      if (!this.validateSnapshotForm()) return;

      const payload = {
        date: this.snapshotForm.date,
        stock: this.parseSnapshotValue(this.snapshotForm.stock),
        cash: this.parseSnapshotValue(this.snapshotForm.cash),
        firstTrade: this.parseSnapshotValue(this.snapshotForm.firstTrade),
        property: this.parseSnapshotValue(this.snapshotForm.property),
      };

      try {
        if (this.snapshotEditTarget) {
          await DB.updateSnapshot(this.snapshotEditTarget.Id, payload);
        } else {
          const result = await DB.addOrReplaceSnapshotByDate(payload);
          if (result.action === 'updated') {
            this.showToast(`已取代 ${payload.date.replace(/-/g,'/')} 當日資料`);
          }
        }
        this.loadSnapshots();
        this.currentView = 'trends';
      } catch (e) {
        this.showToast('儲存失敗：' + (e.message || 'unknown'));
      }
    },

    async deleteSnapshot() {
      if (!this.snapshotEditTarget) return;
      if (!confirm('刪除此資產快照？')) return;
      try {
        await DB.deleteSnapshot(this.snapshotEditTarget.Id);
        this.loadSnapshots();
        this.currentView = 'trends';
      } catch (e) {
        this.showToast('刪除失敗：' + (e.message || 'unknown'));
      }
    },
```

- [ ] **Step 7.3: 驗證**

重整頁面，切到 trends view：

1. 點 FAB「+」→ snapshotForm view 開啟，日期預設今天，四欄位空白。
2. 留空全部送出 → 因 date 已預設、其他空字串視為 0，會 INSERT 一筆 `{ date: today, stock: 0, cash: 0, firstTrade: 0, property: 0 }`。回到 trends 看到該筆。
3. 重新進 form 輸入「Stock = -1」送出 → form 顯示「資產值必須為非負數」紅字，不送出。
4. 改 Stock = 100、其餘留空 → 送出 → toast「已取代 yyyy/MM/dd 當日資料」（因為同日已存在）。trends 列表的該筆 Stock 變 100。
5. 點該筆卡片 → 進 snapshotForm 編輯模式，欄位帶值，「更新快照」按鈕；按鈕下方多一個紅色「刪除」按鈕。
6. 改 Stock = 200 → 更新 → 回 trends，該筆 Stock = 200。
7. 再進編輯 → 點刪除 → confirm → 列表少一筆。

- [ ] **Step 7.4: Commit**

```powershell
git add index.html app.js
git commit -m "feat(asset-trend): add snapshot form view with upsert toast and delete"
```

---

## Task 8: Chart.js 整合 — mixed chart 渲染

**Files:**
- Modify: `app.js`（chart instance + renderChart + reactivity）

- [ ] **Step 8.1: 加 chart instance reference 與 renderChart 方法**

打開 `app.js`，在 `Alpine.store('app', { ... })` 區塊**之前**（約 7 行前）加入模組層級變數：

```js
let _chart = null;
```

在 `deleteSnapshot()` 方法**之後**加入 `renderChart` 方法：

```js
    renderChart() {
      const canvas = document.getElementById('asset-trend-chart');
      if (!canvas) return; // trends view 還沒在 DOM
      if (!this.snapshots.length) {
        if (_chart) { _chart.destroy(); _chart = null; }
        return;
      }
      // canvas 在 display:none 容器內時 offsetWidth = 0；此時不建 chart instance
      // 避免 Chart.js 建出 0×0 的圖、之後切到 trends 不會自動 resize
      if (!_chart && canvas.offsetWidth === 0) return;

      // 依日期升序排列以畫圖
      const asc = [...this.snapshots].sort((a, b) => a.Date.localeCompare(b.Date));
      const labels = this.buildCondensedLabels(asc.map(s => s.Date));
      const stock = asc.map(s => s.Stock);
      const cash = asc.map(s => s.Cash);
      const firstTrade = asc.map(s => s.FirstTrade);
      const property = asc.map(s => s.Property);
      const total = asc.map((s, i) => stock[i] + cash[i] + firstTrade[i] + property[i]);

      const datasets = [
        { type: 'bar', label: 'Stock',      data: stock,      backgroundColor: '#2563EB', stack: 'a' },
        { type: 'bar', label: 'Cash',       data: cash,       backgroundColor: '#16A34A', stack: 'a' },
        { type: 'bar', label: 'FirstTrade', data: firstTrade, backgroundColor: '#EA580C', stack: 'a' },
        { type: 'bar', label: 'Property(房產)', data: property, backgroundColor: '#7C3AED', stack: 'a' },
        {
          type: 'line', label: 'Total', data: total,
          borderColor: '#111827', backgroundColor: '#111827',
          borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, fill: false, tension: 0,
        },
      ];

      if (_chart) {
        _chart.data.labels = labels;
        _chart.data.datasets = datasets;
        _chart.update();
        return;
      }

      _chart = new Chart(canvas, {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
          },
          scales: {
            x: { stacked: true },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                callback: v => Number(v).toLocaleString(),
              },
            },
          },
        },
      });
    },

    // 仿 MAUI BuildCondensedDateLabels：snapshots 多時降採樣 label
    buildCondensedLabels(isoDates) {
      const toShort = iso => {
        const [, m, d] = iso.split('-');
        return `${m}/${d}`;
      };
      if (isoDates.length <= 6) return isoDates.map(toShort);
      const step = isoDates.length <= 12 ? 2 : isoDates.length <= 24 ? 3 : 5;
      return isoDates.map((iso, i) =>
        (i === isoDates.length - 1 || i % step === 0) ? toShort(iso) : ''
      );
    },
```

- [ ] **Step 8.2: 在 view 切到 trends 與 snapshots 變動時觸發 renderChart**

需要在三個時機呼叫 `renderChart`：(a) 切到 trends view 後 canvas 才存在 (b) snapshot 變動後重畫 (c) 初次 init 後若已在 trends。

最簡單做法：在 `init()` 最末加一個 effect — 但 Alpine store 沒有原生 effect。改用：在 `loadSnapshots()` 結尾呼叫 `requestAnimationFrame` 嘗試 render；並在 tab bar 切到 trends 與 view 切到 trends 的位置呼叫 `loadSnapshots()`。

修改 `loadSnapshots`：

```js
    loadSnapshots() {
      this.snapshots = DB.getSnapshots();
      // canvas 可能還沒 mount，延後一拍
      requestAnimationFrame(() => this.renderChart());
    },
```

修改 Task 6 加的 tab-bar Trends button — 之前已寫成 `@click="$store.app.currentView = 'trends'; $store.app.loadSnapshots()"`，無需再改。

修改 saveSnapshot / deleteSnapshot 內 `this.loadSnapshots()` 已經會觸發 renderChart（因為改了 loadSnapshots）。

修改 `init()` — 既有 `this.loadSnapshots();` 已會觸發；但 init 時還不在 trends view，canvas 不存在，`renderChart` 早 return。後續切到 trends 時 tab 按鈕會再 trigger 一次 loadSnapshots，這時 canvas 存在 → 渲染成功。

- [ ] **Step 8.3: 驗證**

重整頁面（incognito 或 unregister SW）：

1. 預設 transactions view → 無 chart 互動，但 console 不應有錯誤。
2. 點 Trends tab → trends view 顯示。若有資料，chart 渲染：4 個 stacked bar + Total 黑線；legend 在下方；無資料時 chart 容器隱藏（`x-show="snapshots.length > 0"`）。
3. 點 FAB → 新增 3-4 筆不同日期的 snapshot（如 2026-05-23 / 05-24 / 05-25 / 05-26 不同值）。
4. 回 trends → chart 上看到 4 個堆疊柱 + 折線串起 4 個點。X 軸 label `MM/dd`。Y 軸數字千分位。
5. 新增 ≥ 8 筆 → X 軸 label 開始降採樣（不是每根柱都標）。
6. 編輯某筆改值 → chart 重畫，該柱高度改變。
7. 刪除某筆 → chart 重畫，少一柱。
8. 從 trends 切到 transactions 再切回 trends → chart 仍正常顯示，不是空白（這驗證 `_chart` 重新 update 而非每次都 destroy）。

如果 chart 第一次切到 trends 卻沒顯示（canvas 0×0）：把 `requestAnimationFrame` 換成 `setTimeout(..., 0)` 或 `Promise.resolve().then(...)`，必要時加二次 retry。

- [ ] **Step 8.4: Commit**

```powershell
git add app.js
git commit -m "feat(asset-trend): render mixed chart (stacked bar + total line)"
```

---

## Task 9: 視覺微調 — snapshot 卡片、latest-total、chart container

**Files:**
- Modify: `css/app.css`（snapshot 相關樣式）

- [ ] **Step 9.1: 加樣式**

在 `css/app.css` 的 `/* Bottom tab bar */` 段落**之前**（或 `/* FAB */` 段落之後）加入：

```css
/* Section title */
.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--muted);
  margin: 16px 0 8px;
}

/* Latest total card */
.latest-total {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.latest-total-caption {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 4px;
}
.latest-total-amount {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
}

/* Chart container */
.chart-container {
  position: relative;
  height: 280px;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}
.chart-container canvas {
  max-width: 100%;
}

/* Snapshot card list */
.snapshot-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.snapshot-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
}
.snapshot-date {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 10px;
}
.snapshot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.snapshot-cell {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-radius: 8px;
  padding: 8px 10px;
}
.snapshot-label {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 2px;
}
.snapshot-value {
  font-size: 1rem;
  font-weight: 600;
}
```

- [ ] **Step 9.2: 驗證**

重整頁面，切到 trends view（建議資料 ≥ 3 筆）。檢查：

- Latest total 卡片有邊框、左對齊、金額大字粗體。
- Chart container 邊框圓角，高度 280px，圖在中間。
- 「快照歷史」標題灰字小。
- Snapshot 卡片：日期一行；下方 2×2 grid 顯示 4 個資產，淺灰背景的格子。
- 點卡片有 cursor pointer。

iPhone Safari 上實機看（如可遠端 inspect）—— tab bar 上方有適當空白、卡片不被擋。

- [ ] **Step 9.3: Commit**

```powershell
git add css/app.css
git commit -m "feat(asset-trend): style snapshot cards, latest-total, chart container"
```

---

## Task 10: End-to-end manual verification（對照 spec scenarios）

依 `openspec/changes/add-asset-trend-view/specs/asset-trend/spec.md` 的 14 個 scenarios 逐一手動驗證，並順手修任何小 bug。所有修正應併入這個 task 的最終 commit。

- [ ] **Step 10.1: 清空狀態 → 首次安裝場景**

DevTools → Application → Storage → Clear site data → 重整。

驗證 spec 的 `Scenario: 首次安裝 PWA 啟動`：
- 載入過程無錯誤。
- Trends tab → 「尚無資產快照資料」空狀態。
- Console: `_dbQuery("SELECT version FROM _migrations ORDER BY version")` → `[[1],[2]]`。
- Console: `_dbQuery("SELECT name FROM sqlite_master WHERE type='index' AND name='IX_AssetSnapshots_Date'")` → 1 列。

- [ ] **Step 10.2: 新增/編輯/刪除/upsert 流程**

依序：
- 新增 2026-05-23 Stock=100 → 列表多一筆 ✓
- 同日新增 2026-05-23 Stock=200 → toast「已取代 2026/05/23 當日資料」，列表仍只有 1 筆，Stock=200 ✓
- 新增 2026-05-24 / 05-25 / 05-26（不同金額）→ 列表 4 筆，按日期 desc 排序 ✓
- Chart：4 個 stacked bar + Total 黑線 ✓
- Latest total 顯示「最新總資產 (2026/05/26)」+ 總和 ✓
- 點 05-25 那筆 → 編輯模式 → 把日期改成 05-26 → 更新 ✓（不觸發 upsert，仍兩筆同日）
- 編輯模式刪除其中一筆 → 列表少一筆 ✓

- [ ] **Step 10.3: 表單驗證**

- 進新增表單，Stock 輸入 `-1` → 紅字「資產值必須為非負數」，不送出 ✓
- 其他欄位留空、只填 Stock=100 → 送出 → 其他三欄存為 0 ✓

- [ ] **Step 10.4: Navigation / tab bar**

- transactions / trends 之間切換 → tab bar active 樣式對 ✓
- snapshotForm / form / settings → tab bar 隱藏 ✓
- 右上齒輪在 transactions、trends 都能用 ✓
- snapshotForm 左上 back → 回到 trends ✓
- trends 的 FAB → snapshotForm 新增模式 ✓
- transactions 的 FAB → transaction form ✓

- [ ] **Step 10.5: X 軸降採樣**

- 新增 ≥ 8 筆不同日期 → chart X 軸 label 開始間隔顯示 ✓
- ≥ 13 筆 → 步長 3
- ≥ 25 筆 → 步長 5
- 最後一個 label 永遠顯示

- [ ] **Step 10.6: 同日多筆 MAUI 殘留資料情境**

Console 模擬：

```js
const $store = document.body._x_dataStack[0].$store

// 第一筆同日（走 upsert：實際 INSERT）
await DB.addOrReplaceSnapshotByDate({ date: '2026-05-20', stock: 1, cash: 0, firstTrade: 0, property: 0 })

// 第二筆同日：繞過 upsert，用裸 SQL 直接 INSERT 模擬 MAUI 殘留
window._dbQuery(
  `INSERT INTO AssetSnapshot (Date, Stock, Cash, FirstTrade, Property)
   VALUES (CAST(621355968000000000 + (julianday('2026-05-20') - 2440587.5) * 864000000000 AS INTEGER), 2, 0, 0, 0)`
)

$store.app.loadSnapshots()
$store.app.snapshots.filter(s => s.Date === '2026-05-20')
```

Expected：兩筆同日，Stock 分別 1 和 2。

- 進 form 新增 2026-05-20 Stock=999 → 送出。
- 列表中 2026-05-20 的兩筆，其中**較高 Id 的那筆**變成 Stock=999；較低 Id 的（Stock=1）保留不動 ✓（驗證 D5 決策）

- [ ] **Step 10.7: 修小 bug**

把驗證過程發現的所有小問題集中修。若沒有 bug 此步跳過。

- [ ] **Step 10.8: Commit（如有修正）**

```powershell
git add -A
git status
# 確認只 commit 必要檔
git commit -m "fix(asset-trend): address findings from manual verification"
```

若沒修正則略過此 commit。

---

## Task 11: Drive round-trip 驗證（與 MAUI 互操作）

這個 task 不一定每次都要做（需要實體 iPhone 或 MAUI app 環境）。若無條件做完整測試，至少做 PWA 內部的 backup/restore round-trip。

- [ ] **Step 11.1: PWA 內 backup → restore round-trip**

在 PWA 內：
1. settings → Backup to Drive。
2. 等 toast「Backup complete」。
3. 改一筆 snapshot Stock 變很大的值（記下原值）。
4. settings → Restore from Drive。
5. 切到 trends → 該筆 Stock 應該回到 backup 當下的值 ✓。

- [ ] **Step 11.2: 與 MAUI app round-trip（若有環境）**

1. MAUI app 開「資產趨勢」→ 新增一筆 snapshot（例如 2026-05-22 / Stock=12345）→ MAUI 內 backup。
2. PWA：settings → Restore from Drive。
3. PWA 切到 trends → 應看到 MAUI 寫入的 2026-05-22 / Stock=12345。
4. PWA 改該筆 Stock=54321 → backup。
5. MAUI 重整 / restore → 應看到 PWA 寫入的 54321。

若有問題（例如 PWA 寫的 schema 與 MAUI `CreateTableAsync` 期望不同導致 MAUI 啟動異常），檢查：

```sql
PRAGMA table_info(AssetSnapshot);
```

比對 MAUI（`db.GetTableInfoAsync("AssetSnapshot")`）與 PWA 端輸出，調整 Task 2 migration v2 的欄位定義對齊。

- [ ] **Step 11.3: 紀錄問題或記下未測**

若無法做 MAUI round-trip，在 commit message 或 PR 描述註記「Drive round-trip with MAUI not verified in this MR — to verify post-merge」。

---

## Task 12: OpenSpec archive 與 finishing

- [ ] **Step 12.1: 標記 openspec tasks 完成**

打開 `openspec/changes/add-asset-trend-view/tasks.md`，把 1.x ~ 9.x 對應到本 plan 已完成的 task，逐一勾選為 `- [x]`。10.x（文件）可在 MR 階段勾。

- [ ] **Step 12.2: Final commit + 切 finishing-a-development-branch skill**

```powershell
git add openspec/changes/add-asset-trend-view/tasks.md docs/plans/2026-05-26-add-asset-trend-view.md
git commit -m "docs(asset-trend): mark openspec tasks done and add implementation plan"
```

接著呼叫 `superpowers:requesting-code-review` 與 `superpowers:finishing-a-development-branch` 完成 PR / merge / archive 流程。

---

## Self-Review Notes

下列項目對照 `openspec/changes/add-asset-trend-view/` 的 spec 確認皆有對應 task：

| Spec requirement | Plan task |
|---|---|
| `asset-trend` AssetSnapshot schema migration | Task 2 |
| `asset-trend` 列表（DESC） | Task 3 (getSnapshots) + Task 5 (UI) |
| `asset-trend` 新增 upsert by date | Task 3 + Task 7 |
| `asset-trend` 編輯直接 UPDATE | Task 3 + Task 7 |
| `asset-trend` 刪除 | Task 3 + Task 7 |
| `asset-trend` 圖表 stacked bar + Total line | Task 8 |
| `asset-trend` 最新總資產顯示 | Task 5 |
| `asset-trend` 表單驗證 | Task 7 |
| `pwa-shell-navigation` tab bar 顯示時機 | Task 6 |
| `pwa-shell-navigation` safe-area-inset | Task 6 |
| `pwa-shell-navigation` FAB / tab bar 不重疊 | Task 6 |

Verification scenarios 對照 → Task 10 逐項手動跑。
