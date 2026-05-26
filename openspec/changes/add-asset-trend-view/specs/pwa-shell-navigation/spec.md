## ADDED Requirements

### Requirement: 底部 tab bar — Transactions / Trends

PWA SHALL 在 root view（`currentView = 'transactions'` 或 `'trends'`）顯示固定於畫面底部的 tab bar，包含兩個 tab：
- `Transactions`：點擊後 `currentView = 'transactions'`
- `Trends`：點擊後 `currentView = 'trends'`

當前 view 對應的 tab MUST 視覺上呈現 active 樣式（顏色突出或加粗）。Tab bar 不在 `form` / `snapshotForm` / `settings` view 顯示，以保持編輯流程的單頁感。

#### Scenario: 在 transactions view 點 Trends tab

- **WHEN** 使用者目前在 `currentView = 'transactions'`，點擊底部「Trends」tab
- **THEN** `currentView` 改為 `'trends'`，畫面切換至 trends view
- **AND** 底部 tab bar 仍顯示，且 Trends tab 標示為 active

#### Scenario: 在 snapshotForm view 不顯示 tab bar

- **WHEN** 使用者進入 `currentView = 'snapshotForm'`（從 trends view 點 FAB 或卡片）
- **THEN** 底部 tab bar 隱藏
- **AND** 畫面上方顯示返回按鈕（左上），按下後回到 `'trends'`

#### Scenario: 在 settings view 不顯示 tab bar

- **WHEN** 使用者進入 `currentView = 'settings'`
- **THEN** 底部 tab bar 隱藏

### Requirement: iOS safe-area-inset 處理

Tab bar 底部 padding MUST 包含 `env(safe-area-inset-bottom)`，以避免在有 home indicator 的 iPhone 上被遮擋。配合 `index.html` 既有的 `meta viewport content="...viewport-fit=cover"` 設定。

#### Scenario: iPhone 顯示 tab bar

- **WHEN** 使用者在有 home indicator 的 iPhone（如 iPhone 14）以 Safari 開啟 PWA
- **THEN** tab bar 的可點擊區域不被 home indicator 重疊
- **AND** tab bar 視覺上延伸至螢幕底邊但安全區內保留 padding

### Requirement: FAB 與 tab bar 版面協調

FAB「+」在 transactions / trends view 顯示時，其 `bottom` 位置 MUST 加上 tab bar 高度 + safe-area-inset-bottom，避免與 tab bar 重疊。

#### Scenario: FAB 顯示位置

- **WHEN** 使用者在 transactions view，畫面底部有 tab bar
- **THEN** FAB 浮現於 tab bar 之上，垂直方向有可見間距（≥ 16 px）

#### Scenario: trends view 的 FAB 行為

- **WHEN** 使用者在 trends view 點擊 FAB
- **THEN** `currentView` 切到 `'snapshotForm'`，重設表單為新增模式（snapshotEditTarget = null）
