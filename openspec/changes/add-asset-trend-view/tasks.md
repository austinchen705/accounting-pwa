## 1. Vendor Chart.js & service worker bump

- [x] 1.1 下載 Chart.js v4 UMD min build 到 `vendor/chart.umd.min.js`（同步 `vendor/sql-wasm.js` 的取得方式，固定版本號）
- [x] 1.2 更新 `sw.js`：`CACHE_NAME` 從 `accounting-v1` 改為 `accounting-v2`
- [x] 1.3 `sw.js` cache 清單加入 `./vendor/chart.umd.min.js`
- [x] 1.4 `index.html` 在既有 `<script src="./vendor/sql-wasm.js">` 之後加入 `<script src="./vendor/chart.umd.min.js">`

## 2. DB layer — migration v2 + AssetSnapshot CRUD

- [x] 2.1 `db.js` `runMigrations()` 內加入 version 2 區塊：建立 `AssetSnapshot` 表（schema 對齊 design D1）與 `IX_AssetSnapshots_Date` 索引，並寫入 `_migrations`
- [x] 2.2 確認 version 1 與 version 2 之間 `versions.includes(2)` 判斷正確、idempotent
- [x] 2.3 實作 `getSnapshots()`：`SELECT Id, (ticks→ISO) AS Date, Stock, Cash, FirstTrade, Property FROM AssetSnapshot ORDER BY Date DESC`，複用既有 `TICKS_DATE_EXPR` 模式
- [x] 2.4 實作 `addOrReplaceSnapshotByDate({ date, stock, cash, firstTrade, property })`：先 `SELECT Id ... WHERE Date = ticks(date) ORDER BY Id DESC LIMIT 1`，找到 → UPDATE，找不到 → INSERT；回傳 `{ action: 'updated'|'inserted', id }`
- [x] 2.5 實作 `updateSnapshot(id, { date, stock, cash, firstTrade, property })`：直接 `UPDATE WHERE Id = ?`，不走 upsert
- [x] 2.6 實作 `deleteSnapshot(id)`：`DELETE WHERE Id = ?`
- [x] 2.7 所有 mutate 函式結尾呼叫 `exportAndPersist()`
- [x] 2.8 `window.DB` 物件 export 新增四個函式

## 3. App state — Alpine store extensions

- [x] 3.1 `app.js` `Alpine.store('app')` 新增 state：`snapshots: []`、`snapshotForm: { id: null, date: '', stock: '', cash: '', firstTrade: '', property: '' }`、`snapshotErrors: {}`、`snapshotEditTarget: null`
- [x] 3.2 新增 `loadSnapshots()`：呼叫 `DB.getSnapshots()` 寫入 `snapshots`
- [x] 3.3 新增 `openSnapshotAdd()`：reset snapshotForm（date 預設 today，其餘空字串）、`snapshotEditTarget = null`、`currentView = 'snapshotForm'`
- [x] 3.4 新增 `openSnapshotEdit(snapshot)`：填入 snapshotForm 所有欄位、`snapshotEditTarget = snapshot`、`currentView = 'snapshotForm'`
- [x] 3.5 新增 `saveSnapshot()`：驗證（date 必填、四值非負；空字串→0）；新增模式呼叫 `addOrReplaceSnapshotByDate`（action=updated 時 toast「已取代 yyyy/MM/dd 當日資料」）；編輯模式呼叫 `updateSnapshot`；完成後 `loadSnapshots()` + `currentView = 'trends'`
- [x] 3.6 新增 `deleteSnapshot()`：呼叫 `DB.deleteSnapshot(snapshotEditTarget.Id)`、`loadSnapshots()`、`currentView = 'trends'`
- [x] 3.7 在 `init()` 內 `currentView = 'trends'` 切換時觸發 `loadSnapshots()`（或統一在 watch / load 時刻載入）

## 4. View — trends（圖表 + 列表）

- [x] 4.1 `index.html` 新增 `<main x-show="$store.app.currentView === 'trends'">` 容器
- [x] 4.2 trends view 內加入「最新總資產」區塊：caption「最新總資產 (yyyy/MM/dd)」+ 大字 Total 金額；空資料時隱藏
- [x] 4.3 trends view 內加入 `<canvas id="asset-trend-chart">` + 容器 `.chart-container`
- [x] 4.4 trends view 內加入「快照歷史」卡片列表（沿用 `tx-list` 樣式風格但獨立 class 例如 `snapshot-list`）；每張卡片顯示日期 + 4 個欄位（Stock / Cash / FirstTrade / Property，千分位、無小數）
- [x] 4.5 trends view 列表卡片 `@click="$store.app.openSnapshotEdit(snapshot)"`
- [x] 4.6 trends view FAB「+」`@click="$store.app.openSnapshotAdd()"`
- [x] 4.7 trends view 空資料時顯示「尚無資產快照資料」

## 5. Chart.js 整合

- [x] 5.1 `app.js` 新增 `chartInstance` reference 與 `renderChart()` 函式
- [x] 5.2 `renderChart()`：將 `snapshots`（依日期升序）轉為 datasets：4 個 `type:'bar'` stacked + 1 個 `type:'line'`（Total）；配色嚴格對齊 MAUI（`#2563EB`/`#16A34A`/`#EA580C`/`#7C3AED`/`#111827`）
- [x] 5.3 設定 `options.scales.x.stacked = true`、`options.scales.y.stacked = true`、`options.scales.y.beginAtZero = true`、`options.responsive = true`、`options.maintainAspectRatio = false`
- [x] 5.4 X 軸 label 格式 `MM/dd`；snapshots.length > 6 時做降採樣（仿 MAUI `BuildCondensedDateLabels` 邏輯：≤12 步長 2、≤24 步長 3、>24 步長 5）
- [x] 5.5 Y 軸 label 用千分位 formatter
- [x] 5.6 `legend.position = 'bottom'`
- [x] 5.7 `snapshots` 更新時呼叫 `chartInstance.destroy()` 再重建（或 `chartInstance.data = ...; chartInstance.update()`），避免記憶體洩漏
- [x] 5.8 trends view 第一次 visible 時才初始化 chart（避免 `<canvas>` `display:none` 下 size = 0 問題；可用 `$watch('currentView')` 或 `x-init` 配合）

## 6. View — snapshotForm

- [x] 6.1 `index.html` 新增 `<main x-show="$store.app.currentView === 'snapshotForm'">`
- [x] 6.2 表單欄位：`<input type="date">` for date；四個 `<input type="number" step="1" min="0">` for Stock / Cash / FirstTrade / Property
- [x] 6.3 每欄位下方錯誤訊息 `<span class="error" x-text="$store.app.snapshotErrors.<field>"></span>`
- [x] 6.4 「儲存」按鈕：`@click="$store.app.saveSnapshot()"`；label 依 `snapshotEditTarget` 顯示「新增快照」或「更新快照」
- [x] 6.5 「刪除」按鈕：`x-show="$store.app.snapshotEditTarget"` `@click="$store.app.deleteSnapshot()"`
- [x] 6.6 header 標題：`snapshotForm` 模式顯示「新增資產快照」或「編輯資產快照」（沿用既有 header 邏輯）

## 7. View — 底部 tab bar

- [x] 7.1 `index.html` 在 `<body>` 底部加入 `<nav class="tab-bar" x-show="['transactions','trends'].includes($store.app.currentView)">` 含 Transactions / Trends 兩個按鈕
- [x] 7.2 tab 點擊 `@click="$store.app.currentView = 'transactions'"` / `'trends'`；active state 用 `:class="{ active: ... }"`
- [x] 7.3 切到 trends tab 時觸發 `loadSnapshots()`（可在 store action 內處理）

## 8. CSS — tab bar / trends 卡片 / chart container

- [x] 8.1 `.tab-bar` 樣式：`position: fixed; bottom: 0; left/right: 0; height: 56px; padding-bottom: env(safe-area-inset-bottom);` 含上邊框、白底
- [x] 8.2 `.tab-bar button` 樣式：等寬 flex、44px tap target、active 色突出
- [x] 8.3 主 content 區域 `padding-bottom` 補上 tab bar 高度 + safe-area-inset，避免內容被遮
- [x] 8.4 FAB 既有 `bottom` 位置調整：`calc(56px + env(safe-area-inset-bottom) + 16px)`
- [x] 8.5 `.snapshot-card` 樣式：4 個資產欄位 2×2 grid，配色與 MAUI 卡片視覺一致
- [x] 8.6 `.chart-container` 樣式：固定高度 280px，width 100%
- [x] 8.7 `.latest-total` 樣式：caption 灰字 + 大字粗體金額

## 9. 互動與邊界情境驗證

- [ ] 9.1 啟動 PWA、進入 trends view，確認空狀態文案
- [ ] 9.2 新增第一筆 snapshot（今天日期）→ trends 出現一筆 + 圖表單柱、Total line 顯示
- [ ] 9.3 再新增今天同日 snapshot（不同金額）→ toast「已取代」、列表仍只有一筆
- [ ] 9.4 新增多筆不同日 snapshot（≥ 8 筆）→ X 軸 label 降採樣正常
- [ ] 9.5 點卡片進編輯模式 → 改值 → 儲存 → 列表更新、圖表更新
- [ ] 9.6 編輯模式刪除 → 列表少一筆、圖表更新
- [ ] 9.7 form 輸入 -1 → 紅字「資產值必須為非負數」、不送出
- [ ] 9.8 在 transactions / trends 之間切換 → tab bar active 狀態正確、FAB 行為對應該 view（新增 transaction vs 新增 snapshot）
- [ ] 9.9 在 snapshotForm 與 settings 切換 → 不顯示 tab bar
- [ ] 9.10 用 Drive backup / restore round-trip 一次 → MAUI 端能正確讀取 PWA 寫入的 snapshot（手動測試，或文字記錄驗證步驟即可）

## 10. 文件 / 提交

- [x] 10.1 確認 `CLAUDE.md` 不需更新（架構決策無大變化）；若有新增 vendor / 結構，附 1-2 行說明
- [x] 10.2 commit 變更，commit message 以 `feat(asset-trend):` 起頭

## Deferred verification

The following items require a real browser / Google Drive / MAUI app and could not be executed in the implementation session. Static walkthrough verified the code paths are correct; live verification is required before declaring the feature production-ready:

- 9.1 啟動 PWA、進入 trends view 確認空狀態文案（real browser）
- 9.2–9.6 互動驗證（add / replace toast / edit / delete / X 軸降採樣 / 圖表 stack 是否正確顯示 Total line）
- 9.7 form 輸入 -1 紅字提示（visual confirmation）
- 9.8 transactions / trends tab 切換 active 樣式
- 9.9 snapshotForm / settings 不顯示 tab bar
- 9.10 Drive backup / restore round-trip with MAUI app
- iPhone Safari 上 safe-area-inset / FAB / tab-bar 視覺驗證

To execute: serve the worktree locally (`python -m http.server 8080`), open in Chrome incognito and Safari (iPhone or DevTools device emulation), and walk through each scenario manually. Also test Drive backup/restore with the MAUI desktop app to confirm AssetSnapshot rows round-trip without schema conflicts.
