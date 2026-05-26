## ADDED Requirements

### Requirement: AssetSnapshot 表 schema 與 MAUI 對齊

PWA 端 SHALL 在啟動 migration 時主動建立 `AssetSnapshot` 表與 `IX_AssetSnapshots_Date` 索引，schema 與 MAUI（SQLite-Net `CreateTableAsync<AssetSnapshot>()` 預設輸出）對齊：
- `Id INTEGER PRIMARY KEY AUTOINCREMENT`
- `Date INTEGER NOT NULL`（以 .NET ticks 儲存，與 `Transactions.Date` 一致）
- `Stock / Cash / FirstTrade / Property` 皆為 `REAL NOT NULL DEFAULT 0`

migration 操作 MUST 為 idempotent（`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`），表已存在時不修改既有資料。

#### Scenario: 首次安裝 PWA 啟動

- **WHEN** 使用者首次安裝 PWA 並開啟，本機沒有任何 db
- **THEN** PWA 建立新的 SQLite db 並執行 migration v1（Transactions、Categories）+ migration v2（AssetSnapshot 表 + 索引）
- **AND** PWA trends view 顯示「尚無資產快照資料」空狀態

#### Scenario: PWA 升級後啟動（既有 db 已含 AssetSnapshot 表）

- **WHEN** 使用者升級 PWA 到含本 change 的版本，且本機 db 已從 MAUI 透過 Drive restore 取得（已含 `AssetSnapshot` 表與資料）
- **THEN** PWA migration v2 執行時偵測表已存在，不修改 schema 或既有資料
- **AND** PWA trends view 載入並顯示 MAUI 端寫入的全部 snapshot 紀錄

#### Scenario: PWA 升級後啟動（既有 db 無 AssetSnapshot 表）

- **WHEN** 使用者升級 PWA 到含本 change 的版本，但本機 db 是舊版 PWA 自建（只有 Transactions / Categories）
- **THEN** PWA migration v2 建立 `AssetSnapshot` 表與索引
- **AND** trends view 顯示空狀態，使用者可立即新增 snapshot

### Requirement: 列出全部 snapshot

PWA SHALL 提供 `getSnapshots()` 介面，回傳全部 `AssetSnapshot` 列，依 Date **降序**排列（最新在上）。每筆紀錄 MUST 包含 `Id / Date（以 ISO yyyy-MM-DD 字串呈現給 UI 層）/ Stock / Cash / FirstTrade / Property` 欄位。

#### Scenario: 列表載入

- **WHEN** 使用者進入 trends view
- **THEN** PWA 從 db 讀取全部 snapshot，依日期降序排列
- **AND** UI 顯示每筆 snapshot 的卡片，依序呈現日期與四個資產值（千分位格式，無小數）

#### Scenario: 無資料

- **WHEN** db 中無任何 snapshot
- **THEN** trends view 顯示「尚無資產快照資料」空狀態
- **AND** 圖表區塊隱藏或顯示同樣空狀態

### Requirement: 新增 snapshot（upsert by date）

當使用者透過 snapshot form view 在**非編輯模式**下送出表單，PWA SHALL 執行 upsert：
1. 將表單日期轉換為 .NET ticks。
2. 查詢 `AssetSnapshot` 表中是否有相同 Date 的紀錄；如有，取最大 Id 那一筆。
3. 找到 → UPDATE 該筆所有資產欄位；找不到 → INSERT 新紀錄。

執行 INSERT 或 UPDATE 後，MUST 呼叫 `exportAndPersist()` 把變更寫入 OPFS / localStorage。

#### Scenario: 新增不存在日期的 snapshot

- **WHEN** 使用者輸入日期 2026-05-26 與四個資產值並送出，db 中沒有任何 2026-05-26 的紀錄
- **THEN** PWA 執行 INSERT 新增一筆
- **AND** 表單關閉、trends view 重新載入清單顯示新紀錄

#### Scenario: 新增已存在日期的 snapshot（取代）

- **WHEN** 使用者新增 2026-05-26 的 snapshot，但 db 中已有一筆同日紀錄（Id = 7）
- **THEN** PWA 執行 UPDATE，將 Id = 7 的 snapshot 四個資產值改為新值
- **AND** UI 顯示 toast「已取代 2026/05/26 當日資料」回饋
- **AND** 不新增第二筆，列表中 2026-05-26 仍只有一筆

#### Scenario: 新增已存在日期的 snapshot（同日有多筆 MAUI 殘留資料）

- **WHEN** db 中 2026-05-26 已有兩筆（Id = 5、Id = 7，MAUI 端遺留）
- **THEN** PWA 取最大 Id（7）那一筆 UPDATE
- **AND** Id = 5 的舊紀錄保留不動（不誤刪 MAUI 端資料）

### Requirement: 編輯既有 snapshot

當使用者從 trends list 點擊某筆 snapshot 卡片，PWA SHALL 開啟 snapshot form view 並載入該筆的 Id 與所有欄位。送出時直接執行 `UPDATE WHERE Id = ?`，**不**走 upsert 邏輯（即使日期改為與其他 snapshot 相同，亦不觸發合併）。

#### Scenario: 編輯模式直接 UPDATE

- **WHEN** 使用者編輯 Id = 7 的 snapshot，將日期從 2026-05-26 改為 2026-05-27 並送出
- **THEN** PWA 執行 `UPDATE AssetSnapshot SET Date=ticks(2026-05-27), Stock=..., ... WHERE Id = 7`
- **AND** 即使 db 中已有 2026-05-27 的其他 snapshot，Id = 7 仍保留為獨立紀錄（不合併）

### Requirement: 刪除 snapshot

snapshot form view 在編輯模式 SHALL 顯示「刪除」按鈕；點擊後執行 `DELETE FROM AssetSnapshot WHERE Id = ?` 並呼叫 `exportAndPersist()`，再導回 trends view。

#### Scenario: 刪除

- **WHEN** 使用者在編輯 Id = 7 的 snapshot 時點「刪除」
- **THEN** PWA 從 db 移除 Id = 7 的紀錄
- **AND** 導回 trends view，列表不再顯示該筆

### Requirement: 圖表呈現（4 stacked bar + Total line）

trends view SHALL 顯示一張 Chart.js mixed chart：
- X 軸：snapshot 日期（依日期**升序**），格式 `MM/dd`（snapshot 數 > 6 筆時降採樣，僅每 N 個顯示 label）。
- 四個 stacked bar dataset：Stock（`#2563EB`）/ Cash（`#16A34A`）/ FirstTrade（`#EA580C`）/ Property（`#7C3AED`），同一 X 位置堆疊。
- 一個 line dataset：Total（`#111827`，3px 線寬，每點 8px geometry），值為四欄位之和。

圖表 MUST 為 responsive（隨容器寬度自適應），touch interaction 啟用（tooltip 點觸即顯示）。

#### Scenario: 圖表渲染

- **WHEN** trends view 載入且 db 中有 ≥ 1 筆 snapshot
- **THEN** 圖表區塊顯示 stacked bar + Total line，X 軸日期升序、Y 軸金額起點 0
- **AND** legend 顯示在下方

#### Scenario: 圖表配色一致性

- **WHEN** 圖表渲染
- **THEN** Stock / Cash / FirstTrade / Property 的顏色 MUST 與 MAUI `AssetTrendViewModel.BuildTrendSeries` 中設定的色碼字串完全一致

### Requirement: 最新總資產顯示

trends view SHALL 在圖表上方顯示「最新總資產 (yyyy/MM/dd)」+ 該日 Total 金額（千分位，無小數）。「最新」以 Date 升序最後一筆為準。

#### Scenario: 最新總資產

- **WHEN** db 中最新 snapshot 日期為 2026-05-26，該日 Total = 1,234,567
- **THEN** trends view 在圖表上方顯示「最新總資產 (2026/05/26)」與大字「1,234,567」

#### Scenario: 無資料時隱藏

- **WHEN** db 中無任何 snapshot
- **THEN** 最新總資產區塊隱藏

### Requirement: 表單驗證

snapshot form view 送出前 SHALL 進行驗證：
- 日期 MUST 為有效 yyyy-MM-DD（HTML `<input type="date">` 已保證格式）。
- 四個資產欄位 MUST 為非負數字；空字串 MUST 視為 0。

驗證失敗時 MUST 在對應欄位下方顯示紅字錯誤，不送出。

#### Scenario: 空欄位視為 0

- **WHEN** 使用者只輸入 Stock = 100，其他三欄位留空，送出
- **THEN** PWA 將 Cash / FirstTrade / Property 視為 0 並儲存

#### Scenario: 負數阻擋

- **WHEN** 使用者輸入 Stock = -1
- **THEN** form 顯示「資產值必須為非負數」紅字
- **AND** 不送出
