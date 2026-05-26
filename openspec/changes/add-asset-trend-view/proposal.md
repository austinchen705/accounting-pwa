## Why

MAUI 端的「資產趨勢」功能（`AssetTrendPage` + `AssetSnapshot` 表）已可記錄每日 4 個資產類別（Stock、Cash、FirstTrade、Property）並繪製堆疊柱狀+折線圖。PWA 端共用同一份 SQLite db（透過 Google Drive 同步），但目前完全沒有讀寫 `AssetSnapshot` 的能力 — 使用者外出時無法用手機 PWA 查看資產走勢或補登當日快照，必須回家開 MAUI app。

## What Changes

- 新增「資產趨勢」view：列表 + 圖表 + 新增/編輯/刪除 snapshot。
- 在 `index.html` 加入**底部 tab bar**（Transactions / Trends 兩個 tab），取代目前無 tab 的結構。
- 新增 `currentView = 'trends'`（列表 + 圖表）與 `currentView = 'snapshotForm'`（編輯表單）。
- `db.js` 新增 migration v2：主動建立 `AssetSnapshot` 表 + `IX_AssetSnapshots_Date` 索引（schema 對齊 MAUI SQLite-Net 預設輸出）。
- `db.js` 新增 CRUD：`getSnapshots()` / `addOrReplaceSnapshotByDate()` / `updateSnapshot()` / `deleteSnapshot()`。
- vendor 進 Chart.js v4 UMD build，繪製 4 個 stacked bar dataset + 1 條 Total line dataset，配色與 MAUI 一致。
- Service worker cache 版本 `v1 → v2`，將 Chart.js 加入 cache 清單。
- 同日提交視為「取代當日最新一筆」（upsert by date：以同日最大 Id 為對象 UPDATE；不存在則 INSERT）。
- 不做 CSV 匯入（PWA 透過 Google Drive restore 取得 MAUI 寫入的資料，CSV 在此情境下多餘）。
- 不做全螢幕大圖（手機直式畫面已足夠，且若需要可後續迭代）。

## Capabilities

### New Capabilities

- `asset-trend`: 資產快照（AssetSnapshot）的列表、新增、編輯、刪除，以及堆疊柱狀+Total 折線圖表呈現。涵蓋 schema migration（migration v2）、upsert-by-date 語意、與 MAUI 共用 `AssetSnapshot` 表的相容性。
- `pwa-shell-navigation`: PWA 的多 view 導覽結構，包含底部 tab bar（Transactions / Trends）的顯示時機（root view 顯示、表單與 settings 隱藏）、safe-area inset 處理、FAB 與 tab bar 的版面協調。

### Modified Capabilities

（無 — 目前 `openspec/specs/` 為空，全為新建。）

## Impact

- **異動檔案**：
  - `index.html`：新增 trends view、snapshotForm view、底部 tab bar
  - `app.js`：新增 snapshots state、snapshot form state、相關 actions、圖表初始化邏輯
  - `db.js`：新增 migration v2、AssetSnapshot CRUD 函式
  - `css/app.css`：tab bar、trends 卡片、chart container 樣式
  - `sw.js`：cache 名稱 `accounting-v1` → `accounting-v2`，加入 `vendor/chart.umd.min.js`
- **新增檔案**：
  - `vendor/chart.umd.min.js`（Chart.js v4 UMD build，~73 KB min+gzip）
- **資料相容性**：
  - PWA 主動建表時，schema 與 MAUI SQLite-Net `CreateTableAsync<AssetSnapshot>()` 輸出對齊（欄位、型別、預設值），確保兩端皆可讀寫同一個 `accounting_backup.db`。
  - 不加 `UNIQUE(Date)` constraint（MAUI 端允許同日多筆，PWA 不可逆地破壞既有資料）。
- **無新外部相依**：Chart.js 為 vendor 進來的靜態檔，沿用既有「無 build step」原則。
- **使用者層面**：第一次升級的使用者，PWA 啟動會跑 migration v2 建表（若 db 已包含 `AssetSnapshot` 則 idempotent 不動）。
