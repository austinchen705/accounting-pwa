## 1. Compatibility Foundation

- [x] 1.1 Add a Node test harness for pure browser modules and sql.js schema checks
- [x] 1.2 Add additive MAUI-compatible migrations for budgets, exchange-rate cache, attachment metadata, and indexes
- [x] 1.3 Add repository queries and mutations required by every parity workflow
- [x] 1.4 Verify an older and a MAUI-shaped database migrate without record or identifier loss

## 2. Shell and Home

- [x] 2.1 Add modular date-window, money-summary, ranking, and chart-axis helpers with unit tests
- [x] 2.2 Replace the two-tab shell with five primary destinations and a More hub
- [x] 2.3 Implement the month-scoped Home summary and recent activity view

## 3. Categories and Budgets

- [x] 3.1 Implement category filtering, creation, editing, duplicate validation, and guarded deletion
- [x] 3.2 Implement independent budget month navigation and per-category budget upsert/delete
- [x] 3.3 Display budget spending progress and over-budget states from matching expense transactions

## 4. Reports and Statistics

- [x] 4.1 Implement week, month, year, and all-time expense report windows and aggregations
- [x] 4.2 Add the expense donut, ranked category list, and context-preserving transaction drill-down
- [x] 4.3 Implement rolling twelve-month summary and category trend calculations
- [x] 4.4 Add statistics charts, category selection, insights, and dynamic axis scaling

## 5. Enhanced Transactions and Receipts

- [x] 5.1 Add combined transaction category/currency filters and frequent-category ranking
- [x] 5.2 Implement guided amount, category, date, and note input focus behavior
- [x] 5.3 Add OPFS receipt import, compression, lookup, deletion, and capability tests
- [x] 5.4 Implement staged receipt view, replacement, removal, and unavailable-device states

## 6. Asset Trend Parity

- [x] 6.1 Implement latest-snapshot prefill and newest-first history behavior
- [x] 6.2 Add cached FirstTrade USD-to-TWD conversion with explicit unavailable-rate handling
- [x] 6.3 Add tested CSV parsing plus append/upsert and confirmed replacement flows
- [x] 6.4 Add an expanded responsive asset chart and preserve state when returning

## 7. Offline Delivery and Verification

- [x] 7.1 Add all runtime modules to the document and service-worker precache and bump the cache version
- [x] 7.2 Run the complete Node test suite and JavaScript syntax checks
- [x] 7.3 Exercise the primary workflows against a local static server at mobile and desktop widths
- [x] 7.4 Verify PWA backup/restore and MAUI-compatible SQLite round trips, including missing local receipts
- [x] 7.5 Update project documentation and mark the OpenSpec checklist complete
