## Context

PWA 與 MAUI app 共用同一份 SQLite db（`accounting_backup.db`），透過 Google Drive `personaccount_backup/` 資料夾雙向同步：MAUI 寫入後，PWA 透過 `Drive.restore()` + `db.loadFromBytes()` 整顆替換 in-memory db；反之亦然。

MAUI 端的 `AssetSnapshot` 表（`Id / Date / Stock / Cash / FirstTrade / Property`）由 SQLite-Net 的 `CreateTableAsync<AssetSnapshot>()` 在 app 啟動時建立，並另建 `CREATE INDEX IF NOT EXISTS IX_AssetSnapshots_Date ON AssetSnapshot(Date)`。Date 欄位以 SQLite-Net 預設行為儲存為 .NET ticks（INTEGER），與既有 `Transactions.Date` 一致。

PWA 端 `db.js` 目前的 migration v1 只建立 `Transactions` 與 `Categories`，沒有 `AssetSnapshot`。view 使用 Alpine `x-show` 切換，header 結構是 `[左：返回] | 標題 | [右：齒輪]`，無底部 tab bar。

## Goals / Non-Goals

**Goals:**

- PWA 端可獨立讀寫 `AssetSnapshot`，無需先做 Drive restore（首次安裝即可使用）。
- 列表 + 新增 + 編輯 + 刪除（CRUD），UI 與 MAUI 視覺一致（配色、欄位順序、字級）。
- 圖表：4 個資產類別 stacked bar + Total line，touch-friendly，行動裝置可讀。
- 與 MAUI 共用同一個 .db 檔不需要任何手動 migration；兩端皆可讀寫對方寫入的資料。
- 底部 tab bar 把 Trends 升為 top-level 功能，與 Transactions 同等級。

**Non-Goals:**

- 不做 CSV 匯入（Drive restore 即為匯入機制）。
- 不做全螢幕大圖頁（手機直式畫面已足夠）。
- 不做 snapshot 的多幣別支援（MAUI 也只存單一數值，無 Currency 欄位）。
- 不主動刪除 / 合併 MAUI 端可能存在的同日多筆資料（避免破壞既有資料）。
- 不對 `AssetSnapshot.Date` 加 `UNIQUE` constraint（與 MAUI schema 不一致會引發 round-trip 風險）。

## Decisions

### D1：Schema 建立 — migration v2，schema 對齊 MAUI SQLite-Net 預設輸出

採用 PWA 主動建表的策略（與既有 Transactions / Categories 一致）：

```sql
CREATE TABLE IF NOT EXISTS AssetSnapshot (
  Id          INTEGER PRIMARY KEY AUTOINCREMENT,
  Date        INTEGER NOT NULL,
  Stock       REAL NOT NULL DEFAULT 0,
  Cash        REAL NOT NULL DEFAULT 0,
  FirstTrade  REAL NOT NULL DEFAULT 0,
  Property    REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS IX_AssetSnapshots_Date ON AssetSnapshot(Date);
```

**Date 為 INTEGER（.NET ticks）**：SQLite-Net 在沒明確設定 `storeDateTimeAsTicks = false` 時預設為 true（MAUI 端 `new SQLiteAsyncConnection(DatabasePath)` 即此情況），故 ticks 是兩端一致的儲存格式。複用既有 `TICKS_DATE_EXPR` / `DATE_TO_TICKS_EXPR` 的轉換 SQL。

**REAL（非 NUMERIC）**：SQLite-Net 對 `decimal` 在底層仍使用 REAL（IEEE 754 double）儲存。資產金額無需高精度的尾數運算，REAL 足夠且與 MAUI 同步無誤差。

**NOT NULL DEFAULT 0**：SQLite-Net 對 value-type `decimal` 的預設行為對應 NOT NULL + 預設 0。

**Alternative considered：lazy / empty-state** — 不主動建表，table missing 時顯示提示。否決：與既有 Transactions / Categories 處理方式不一致；首次安裝體驗差（必須先 restore 才能用）。

### D2：圖表函式庫 — Chart.js v4 UMD vendor

選擇 Chart.js v4，UMD build 放 `vendor/chart.umd.min.js`，沿用 PWA「無 build step、所有 JS vendor 在地」原則，service worker 可正常 cache。

- 4 個 `type: 'bar'` dataset（`stacked: true`，X 軸共享）+ 1 個 `type: 'line'` dataset（Total）= 標準 mixed chart 用法。
- 配色與 MAUI 一致：Stock `#2563EB` / Cash `#16A34A` / FirstTrade `#EA580C` / Property `#7C3AED` / Total line `#111827`。
- 大小 ~73 KB min+gzip，相對於 sql-wasm 等級可忽略。

**Alternatives considered：**
- ECharts：~250 KB，過頭。
- uPlot：~50 KB，但 stacked column 需手動拼，dev cost 高。
- 純 SVG 手刻：0 dep，但軸刻度 + tooltip 工程量明顯，後續維護負擔大。

### D3：Navigation — 底部 tab bar (Transactions / Trends)

新增底部 tab bar，固定 2 個 tab。Tab bar 僅在 root view（`currentView ∈ {'transactions', 'trends'}`）顯示；form / snapshotForm / settings 隱藏，以保持「focused 編輯」的單頁感。FAB `bottom` 偏移加上 tab bar 高度避免重疊。

iOS Safari 的 home indicator 區域以 `env(safe-area-inset-bottom)` 處理（與既有 `viewport-fit=cover` 相容）。

**Alternative considered：在 nav-bar 加圖表 icon** — 改動最小但 trends 與 transactions 視為同等 top-level 功能更符合直覺；tab bar 也為將來新增其他 top-level view（例如 budget）預留擴充空間。

### D4：Snapshot 編輯流程 — 獨立 view（`currentView = 'snapshotForm'`）

不與既有 transaction form view 共用 currentView，避免「`form` view 內又要分支 transaction / snapshot 兩種模式」的 if-else 雜訊。獨立 view 程式碼較清晰、各自的 state（`editTarget` vs `snapshotEditTarget`、`form` vs `snapshotForm`）互不污染。

點 trends 列表卡片 → 切到 snapshotForm 並載入該筆；FAB → 切到 snapshotForm 並 reset 為新增。`snapshotForm` view 不顯示 tab bar，左上角 back button 沿用既有邏輯（`currentView = 'trends'`）。

### D5：Upsert by date 語意

**新增送出**（`saveSnapshot()` 且非編輯模式）：
1. 將表單日期轉成 ticks。
2. `SELECT Id FROM AssetSnapshot WHERE Date = ? ORDER BY Id DESC LIMIT 1`。
3. 找到 → `UPDATE`；找不到 → `INSERT`。

**編輯送出**：直接 `UPDATE WHERE Id = ?`，無 upsert 邏輯。

**不加 `UNIQUE(Date)` constraint**：MAUI 端歷史資料可能含同日多筆（早期測試 / 使用者手動），加 UNIQUE 會在 restore MAUI 的 db 時 schema 衝突。PWA 採「最高 Id 視為當日最新值」的軟性語意，舊重複資料保留但不再透過 PWA UI 增加。

**Alternative considered：刪除同日所有舊筆再 INSERT** — 否決，破壞性過強，誤刪 MAUI 端使用者刻意留的多筆資料。

### D6：欄位顯示沿用 MAUI 標籤（中英混搭）

`Stock` / `Cash` / `FirstTrade` / `Property(房產)` / `Total` 直接複用 MAUI 的 zh-Hant 文案，不重新翻譯，避免使用者在兩端認知不一致。`FirstTrade` 是使用者自定義語意（推測為第一證券或類似帳戶），不擅自重命名。

### D7：Service worker cache bump v1 → v2

`sw.js` 的 `CACHE_NAME` 更新為 `accounting-v2`，cache 清單加入 `./vendor/chart.umd.min.js`。activate 階段清掉舊 cache 沿用既有機制即可。

## Risks / Trade-offs

- **[SQLite-Net schema 微差]** → Mitigation：在 PWA 測試環境用 MAUI app 寫一筆 snapshot 後，把 .db 拉到 PWA 讀，並對比 `PRAGMA table_info(AssetSnapshot)` 兩端輸出。若 MAUI 端某欄位用 NUMERIC 而非 REAL，調整 PWA migration v2 對齊。
- **[Chart.js 73 KB 多載]** → Mitigation：lazy load 可選但目前 trends view 一定要用，先 vendor 同步載入；若 lighthouse 影響顯著再切 dynamic import。
- **[Upsert 語意混淆]** → Mitigation：snapshot form 的「儲存」按鈕在新增模式且有同日資料時，可在 toast 顯示「已取代 yyyy/MM/dd 當日資料」回饋；明確語意而非靜默替換。
- **[Tab bar 與 FAB 重疊]** → Mitigation：FAB `bottom` 計算用 `calc(tab-bar-height + safe-area-inset-bottom + offset)`，先在 iPhone Safari 確認。
- **[首次啟動 migration 失敗]** → Mitigation：migration 包 try-catch，失敗時不阻擋 app 啟動（trends view 顯示「無資料」），錯誤 toast 提示；不會破壞既有 Transactions 功能。

## Migration Plan

1. **PWA 首次升級**：使用者重新整理頁面 → service worker 偵測新版 → 重啟後跑 migration v2 → `CREATE TABLE IF NOT EXISTS` idempotent，已存在則不動。
2. **Rollback**：若 v2 出問題，使用者僅需 unregister service worker（settings 可加入「重置」按鈕，但本 change 不做）；資料層面 v2 只新增表不破壞既有資料，回到 v1 程式碼直接可用。
3. **與 MAUI 互操作測試**：
   - PWA 寫 snapshot → backup → MAUI restore → 確認 MAUI `AssetTrendPage` 可讀。
   - MAUI 寫 snapshot → MAUI backup → PWA restore → 確認 PWA trends view 可讀。
