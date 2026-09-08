# Accounting Workflow Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add every approved accounting workflow from the MAUI companion app to the static PWA while retaining bidirectional `accounting_backup.db` compatibility.

**Architecture:** Keep the no-build Alpine.js/sql.js PWA, with `db.js` as the MAUI-compatible persistence boundary. Add browser-and-Node-compatible pure helpers in `accounting.js`, OPFS receipt lifecycle logic in `receipts.js`, and integrate feature states through the existing Alpine store and single-page shell.

**Tech Stack:** Vanilla JavaScript, Alpine.js, Chart.js 4, sql.js/WASM, OPFS, Google Drive REST/PKCE, Node built-in test runner.

---

### Task 1: Establish automated tests and shared accounting helpers

**Files:**
- Create: `accounting.js`
- Create: `tests/accounting.test.js`

**Step 1: Write failing tests**

Cover month movement, rolling twelve-month labels, week/month/year/all report windows, monthly summaries, frequent-category ranking, expense grouping, dynamic axis steps, asset CSV parsing, and FirstTrade conversion. Require the browser module with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Accounting = require('../accounting.js');
```

**Step 2: Run tests and verify failure**

Run: `node --test tests/accounting.test.js`
Expected: FAIL because `accounting.js` does not exist.

**Step 3: Implement pure helpers**

Expose the same frozen API in browsers and Node:

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Accounting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => ({
  moveMonth, twelveMonthWindow, reportWindow, summarizeTransactions,
  frequentCategories, expenseCategoryReport, categoryTrendSeries,
  niceAxisStep, parseAssetCsv, convertUsdToTwd,
}));
```

Keep date calculations in local calendar components rather than parsing `YYYY-MM-DD` as UTC.

**Step 4: Run tests and verify success**

Run: `node --test tests/accounting.test.js`
Expected: all helper tests PASS.

**Step 5: Commit**

```powershell
git add accounting.js tests/accounting.test.js
git commit -m "test: add accounting parity calculation contracts"
```

### Task 2: Extend and verify the MAUI-compatible database boundary

**Files:**
- Modify: `db.js`
- Create: `tests/database.test.js`

**Step 1: Write failing sql.js tests**

Load `vendor/sql-wasm.js` in Node and verify migrations produce:

```sql
Transactions(Id, Amount, Currency, CategoryId, Date, Note, ImageRelativePath, Type)
Categories(Id, Name, Icon, Type)
Budgets(Id, CategoryId, Amount, Month)
ExchangeRateCache(BaseCurrency, RatesJson, UpdatedAt)
AssetSnapshot(Id, Date, Stock, Cash, FirstTrade, Property)
```

Also assert an older database retains row IDs and values after repeated migration.

**Step 2: Run tests and verify failure**

Run: `node --test tests/database.test.js`
Expected: FAIL for missing tables, column, indexes, and testable database factory.

**Step 3: Implement additive migration and repository APIs**

Add an idempotent column check through `PRAGMA table_info`, `CREATE TABLE IF NOT EXISTS`, and every index from the MAUI `DatabaseService`. Add query and mutation methods for summaries, recent activity, filtered transactions, frequent categories, category validation/CRUD, budget upsert/delete/progress sources, report/statistics sources, exchange cache, and snapshot bulk import. Every mutation must finish with `exportAndPersist()`.

Expose a Node-only factory without changing browser globals:

```js
if (typeof module === 'object' && module.exports) {
  module.exports = { createDatabaseApi, ticksFromIsoDate, isoDateFromTicks };
}
```

**Step 4: Run schema and baseline checks**

Run: `node --test tests/database.test.js`
Expected: all schema, migration, round-trip, and CRUD tests PASS.

Run: `node --check db.js`
Expected: exit 0.

**Step 5: Commit**

```powershell
git add db.js tests/database.test.js
git commit -m "feat: add MAUI-compatible accounting repository"
```

### Task 3: Add the responsive shell, Home, Categories, and Budgets

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `css/app.css`
- Create: `tests/app-state.test.js`

**Step 1: Write failing state tests**

Extract or export small state builders from `app.js` and test independent month state, Home refresh inputs, category form reset/validation, budget progress, and back destinations.

**Step 2: Run tests and verify failure**

Run: `node --test tests/app-state.test.js`
Expected: FAIL because the parity state helpers are absent.

**Step 3: Implement shell and feature views**

Add five primary destinations: `home`, `transactions`, `statistics`, `categoryReport`, and `more`. Add secondary views for `budgets`, `categories`, `trends`, and `settings`, with forms/details treated as contextual states. Implement Home summary/recent rows, Category CRUD with guarded delete messages, and monthly Budget cards/forms with over-budget styling.

**Step 4: Verify behavior**

Run: `node --test tests/app-state.test.js`
Expected: PASS.

Run: `node --check app.js`
Expected: exit 0.

Start: `py -m http.server 8080`
Expected: Home loads without console errors; all primary and More destinations are reachable at 375px width.

**Step 5: Commit**

```powershell
git add index.html app.js css/app.css tests/app-state.test.js
git commit -m "feat: add home categories budgets and parity navigation"
```

### Task 4: Add expense reports and rolling statistics

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `css/app.css`
- Modify: `tests/accounting.test.js`

**Step 1: Extend failing calculation/integration tests**

Test excluded income, range boundaries, percentages, ranked ties, date-grouped drill-down, twelve-month zero filling, top-category series, comparison insight rules, and small/large dynamic axis steps.

**Step 2: Run tests and verify failure**

Run: `node --test tests/accounting.test.js tests/app-state.test.js`
Expected: FAIL for report/statistics behavior not yet integrated.

**Step 3: Implement reporting views and charts**

Add report range/anchor state, bounded navigation, total/donut/ranked list, category drill-down grouped newest-first, and context-preserving return. Add rolling income/expense/balance chart, category trend selector/chart, insights, and per-chart `niceAxisStep` configuration. Keep separate Chart.js instances and render only after the active view is visible.

**Step 4: Verify tests and browser rendering**

Run: `node --test tests/accounting.test.js tests/app-state.test.js`
Expected: PASS.

Run: `node --check app.js`
Expected: exit 0.

Browser: exercise empty and populated reports, drill-down return, statistics month movement, and canvas resizing.

**Step 5: Commit**

```powershell
git add index.html app.js css/app.css tests/accounting.test.js
git commit -m "feat: add expense reports and rolling statistics"
```

### Task 5: Enhance transactions and implement local receipt lifecycle

**Files:**
- Create: `receipts.js`
- Create: `tests/receipts.test.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `css/app.css`
- Modify: `tests/app-state.test.js`

**Step 1: Write failing receipt and transaction tests**

Use an in-memory storage adapter to test relative-path generation, staged commit, replacement cleanup, removal, failed-save cleanup, and missing-file lookup. Extend state tests for combined filters, frequent category changes, positive decimal sanitizing, and guided focus targets.

**Step 2: Run tests and verify failure**

Run: `node --test tests/receipts.test.js tests/app-state.test.js`
Expected: FAIL because receipt and enhanced transaction behavior is absent.

**Step 3: Implement receipt storage**

Create an adapter-based `ReceiptStore`. In browsers, require OPFS, resize selected images with canvas, encode JPEG/WebP within a bounded dimension/quality, and store them at `receipts/YYYY/MM/<uuid>.<ext>`. Return object URLs for viewing and revoke them when closed.

**Step 4: Integrate transaction behavior**

Add category/currency filters and frequent-category chips. Add `capture="environment"` image input, preview/view/replace/remove controls, and an unavailable-device message. Save transaction metadata before deleting superseded files; delete newly staged files if the database save fails.

**Step 5: Verify tests and browser behavior**

Run: `node --test tests/receipts.test.js tests/app-state.test.js`
Expected: PASS.

Run: `node --check receipts.js; node --check app.js`
Expected: exit 0.

Browser: verify camera/library selection, compression, reload persistence, replacement, removal, transaction deletion, and a restored missing path.

**Step 6: Commit**

```powershell
git add receipts.js index.html app.js css/app.css tests/receipts.test.js tests/app-state.test.js
git commit -m "feat: add enhanced transactions and local receipts"
```

### Task 6: Complete Asset Trend parity

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `css/app.css`
- Modify: `tests/accounting.test.js`
- Modify: `tests/app-state.test.js`

**Step 1: Add failing asset parity tests**

Test newest snapshot selection, prefill without date replacement, USD conversion rounding, missing-rate rejection, CSV header/value parsing, partial-error reporting, same-date upsert, and explicit replacement behavior.

**Step 2: Run tests and verify failure**

Run: `node --test tests/accounting.test.js tests/app-state.test.js`
Expected: FAIL for unimplemented asset integration.

**Step 3: Implement asset parity**

Add latest-value prefill, FirstTrade input currency and TWD preview, live rate fetch with `ExchangeRateCache` fallback, CSV file selection and import summary, append/upsert plus confirmed replacement, and a contextual expanded chart view. Preserve raw TWD storage in `AssetSnapshot.FirstTrade`.

**Step 4: Verify tests and browser flow**

Run: `node --test tests/accounting.test.js tests/app-state.test.js`
Expected: PASS.

Browser: verify prefill, rate failure, mixed-validity CSV, newest-first history, and expanded chart return.

**Step 5: Commit**

```powershell
git add index.html app.js css/app.css tests/accounting.test.js tests/app-state.test.js
git commit -m "feat: complete asset trend parity"
```

### Task 7: Offline packaging, compatibility verification, and documentation

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `openspec/changes/accounting-workflow-parity/tasks.md`

**Step 1: Wire and precache runtime modules**

Load `accounting.js` before `app.js`, load `receipts.js` before `app.js`, add both to `PRECACHE`, and bump the service worker from its current cache key to the next version.

**Step 2: Run the complete automated verification**

Run: `node --test tests/*.test.js`
Expected: all tests PASS.

Run: `node --check accounting.js; node --check receipts.js; node --check db.js; node --check drive.js; node --check app.js; node --check sw.js`
Expected: all exit 0.

Run: `openspec.cmd validate accounting-workflow-parity`
Expected: change is valid.

**Step 3: Verify database round trips**

Use the database test fixture to export a MAUI-shaped database, reopen it, mutate each shared entity, and confirm raw schema/date/ID compatibility. In the browser, back up to Drive, make a local change, restore, and verify every screen refreshes. Confirm missing receipt bytes preserve their `ImageRelativePath` and show the unavailable state.

**Step 4: Verify the PWA manually**

Serve with `py -m http.server 8080`. At 375px and desktop widths, exercise all primary destinations, More workflows, forms, validation, charts, report drill-down, receipt viewing, asset CSV import, offline reload, and service-worker reset. Record any environment-limited verification honestly.

**Step 5: Update durable documentation and task state**

Replace the placeholder README with setup, architecture, test, and compatibility instructions. Update `CLAUDE.md` schema/views/cache facts. Mark only verified OpenSpec checkboxes complete.

**Step 6: Commit**

```powershell
git add index.html sw.js README.md CLAUDE.md openspec/changes/accounting-workflow-parity/tasks.md
git commit -m "docs: finalize accounting workflow parity"
```
