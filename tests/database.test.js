const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const initSqlJs = require('../vendor/sql-wasm.js');
const { createDatabaseApi, ticksFromIsoDate } = require('../db.js');

let SQL;

test.before(async () => {
  SQL = await initSqlJs({ locateFile: file => path.join(__dirname, '..', 'vendor', file) });
});

test('creates the complete MAUI-compatible schema and indexes idempotently', async () => {
  const raw = new SQL.Database();
  const api = createDatabaseApi(raw);
  await api.runMigrations();
  await api.runMigrations();

  const tables = api.queryObjects("SELECT name FROM sqlite_master WHERE type='table'").map(row => row.name);
  for (const name of ['Transactions', 'Categories', 'Budgets', 'ExchangeRateCache', 'AssetSnapshot']) {
    assert.ok(tables.includes(name), `missing table ${name}`);
  }

  const transactionColumns = api.queryObjects('PRAGMA table_info(Transactions)').map(row => row.name);
  assert.deepEqual(transactionColumns, [
    'Id', 'Amount', 'Currency', 'CategoryId', 'Date', 'Note', 'Type', 'ImageRelativePath',
  ]);

  const indexes = api.queryObjects("SELECT name FROM sqlite_master WHERE type='index'").map(row => row.name);
  for (const name of [
    'IX_Transactions_Date', 'IX_Transactions_CategoryId', 'IX_Transactions_Currency',
    'IX_Transactions_Type', 'IX_Categories_Type', 'IX_Categories_Name_Type',
    'IX_Budgets_Month', 'IX_Budgets_CategoryId_Month', 'IX_AssetSnapshots_Date',
  ]) assert.ok(indexes.includes(name), `missing index ${name}`);
});

test('upgrades an older database without changing rows or identifiers', async () => {
  const raw = new SQL.Database();
  raw.run('CREATE TABLE Transactions (Id INTEGER PRIMARY KEY AUTOINCREMENT, Amount REAL NOT NULL, Currency TEXT NOT NULL, CategoryId INTEGER, Date INTEGER NOT NULL, Note TEXT, Type TEXT NOT NULL)');
  raw.run('CREATE TABLE Categories (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Icon TEXT, Type TEXT NOT NULL)');
  raw.run("INSERT INTO Categories (Id, Name, Icon, Type) VALUES (7, 'Food', 'cat_food.png', 'expense')");
  raw.run('INSERT INTO Transactions (Id, Amount, Currency, CategoryId, Date, Note, Type) VALUES (?, ?, ?, ?, ?, ?, ?)', [42, 123.5, 'TWD', 7, ticksFromIsoDate('2026-09-08'), 'kept', 'expense']);

  const api = createDatabaseApi(raw);
  await api.runMigrations();
  await api.runMigrations();
  assert.deepEqual(api.queryObjects('SELECT Id, Amount, CategoryId, Note FROM Transactions'), [
    { Id: 42, Amount: 123.5, CategoryId: 7, Note: 'kept' },
  ]);
  assert.deepEqual(api.queryObjects('SELECT Id, Name FROM Categories'), [{ Id: 7, Name: 'Food' }]);
});

test('stores transaction dates as ticks and supports combined filters', async () => {
  const raw = new SQL.Database();
  let persisted = 0;
  const api = createDatabaseApi(raw, async () => { persisted += 1; });
  await api.runMigrations();
  const food = await api.addCategory({ name: 'Food', icon: 'cat_food.png', type: 'expense' });
  const salary = await api.addCategory({ name: 'Salary', icon: 'cat_salary.png', type: 'income' });
  await api.addTransaction({ amount: 25, currency: 'TWD', categoryId: food.id, date: '2026-09-08', note: 'lunch', type: 'expense', imageRelativePath: 'receipts/2026/09/a.jpg' });
  await api.addTransaction({ amount: 100, currency: 'USD', categoryId: salary.id, date: '2026-09-09', note: '', type: 'income' });

  const rawDate = api.queryObjects('SELECT Date FROM Transactions WHERE Note = ?', ['lunch'])[0].Date;
  assert.equal(rawDate, ticksFromIsoDate('2026-09-08'));
  const filtered = api.getTransactions({ month: '2026-09', type: 'expense', categoryId: food.id, currency: 'TWD' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].ImageRelativePath, 'receipts/2026/09/a.jpg');
  assert.ok(persisted >= 4);
});

test('guards category deletion and calculates monthly budget progress', async () => {
  const raw = new SQL.Database();
  const api = createDatabaseApi(raw);
  await api.runMigrations();
  const food = await api.addCategory({ name: 'Food', icon: 'cat_food.png', type: 'expense' });
  await api.upsertBudget({ categoryId: food.id, amount: 100, month: '2026-09' });
  await api.addTransaction({ amount: 125, currency: 'TWD', categoryId: food.id, date: '2026-09-08', note: '', type: 'expense' });

  assert.deepEqual(api.getBudgetsWithSpending('2026-09'), [{
    Id: 1,
    CategoryId: food.id,
    CategoryName: 'Food',
    CategoryIcon: 'cat_food.png',
    Amount: 100,
    SpentAmount: 125,
    Ratio: 1.25,
  }]);
  await assert.rejects(api.deleteCategory(food.id), /used by transactions or budgets/i);
});

test('round-trips exchange cache and replaces snapshots explicitly', async () => {
  const raw = new SQL.Database();
  const api = createDatabaseApi(raw);
  await api.runMigrations();
  await api.setExchangeRates('TWD', { USD: 0.03 }, '2026-09-08T00:00:00Z');
  const cache = api.getExchangeRates('TWD');
  assert.deepEqual(cache.rates, { USD: 0.03 });
  assert.equal(cache.updatedAt, '2026-09-08T00:00:00.000Z');

  await api.importSnapshots([
    { date: '2026-09-01', stock: 1, cash: 2, firstTrade: 3, property: 4 },
    { date: '2026-09-02', stock: 10, cash: 20, firstTrade: 30, property: 40 },
  ], false);
  await api.importSnapshots([{ date: '2026-09-02', stock: 11, cash: 21, firstTrade: 31, property: 41 }], false);
  assert.deepEqual(api.getSnapshots().map(row => [row.Date, row.Stock]), [
    ['2026-09-02', 11],
    ['2026-09-01', 1],
  ]);
  await api.importSnapshots([{ date: '2026-09-02', stock: 5, cash: 6, firstTrade: 7, property: 8 }], true);
  assert.deepEqual(api.getSnapshots().map(row => row.Date), ['2026-09-02']);
});

test('round-trips and mutates every MAUI shared entity without changing IDs or receipt metadata', async () => {
  const source = new SQL.Database();
  const first = createDatabaseApi(source);
  await first.runMigrations();
  const category = await first.addCategory({ name: 'Round trip', icon: 'cat_other.png', type: 'expense' });
  const transaction = await first.addTransaction({
    amount: 12.5,
    currency: 'USD',
    categoryId: category.id,
    date: '2026-09-08',
    note: 'source',
    type: 'expense',
    imageRelativePath: 'receipts/2026/09/missing.jpg',
  });
  const budget = await first.upsertBudget({ categoryId: category.id, amount: 100, month: '2026-09' });
  await first.setExchangeRates('USD', { TWD: 30.5 }, '2026-09-08T12:00:00Z');
  const snapshot = await first.addOrReplaceSnapshotByDate({ date: '2026-09-08', stock: 1, cash: 2, firstTrade: 3, property: 4 });

  const restoredRaw = new SQL.Database(first.exportBytes());
  const restored = createDatabaseApi(restoredRaw);
  await restored.runMigrations();
  assert.equal(restored.queryObjects('SELECT Date FROM Transactions WHERE Id = ?', [transaction.id])[0].Date, ticksFromIsoDate('2026-09-08'));
  assert.equal(restored.getTransactions({})[0].ImageRelativePath, 'receipts/2026/09/missing.jpg');
  assert.equal(restored.getBudgetsWithSpending('2026-09')[0].Id, budget.id);
  assert.equal(restored.getSnapshots()[0].Id, snapshot.id);
  assert.equal(restored.getExchangeRates('USD').rates.TWD, 30.5);

  await restored.updateCategory(category.id, { name: 'Round trip updated', icon: 'cat_other.png', type: 'expense' });
  await restored.updateTransaction(transaction.id, {
    amount: 25,
    currency: 'TWD',
    categoryId: category.id,
    date: '2026-09-09',
    note: 'restored',
    type: 'expense',
    imageRelativePath: 'receipts/2026/09/missing.jpg',
  });
  await restored.upsertBudget({ categoryId: category.id, amount: 200, month: '2026-09' });
  await restored.setExchangeRates('USD', { TWD: 31 }, '2026-09-09T12:00:00Z');
  await restored.updateSnapshot(snapshot.id, { date: '2026-09-09', stock: 5, cash: 6, firstTrade: 7, property: 8 });

  const reopenedRaw = new SQL.Database(restored.exportBytes());
  const reopened = createDatabaseApi(reopenedRaw);
  await reopened.runMigrations();
  assert.deepEqual(reopened.getCategories('expense').find(row => row.Id === category.id), {
    Id: category.id, Name: 'Round trip updated', Icon: 'cat_other.png', Type: 'expense',
  });
  assert.deepEqual(reopened.getTransactions({}).find(row => row.Id === transaction.id), {
    Id: transaction.id,
    Amount: 25,
    Currency: 'TWD',
    CategoryId: category.id,
    Date: '2026-09-09',
    Note: 'restored',
    Type: 'expense',
    ImageRelativePath: 'receipts/2026/09/missing.jpg',
    CategoryName: 'Round trip updated',
    CategoryIcon: 'cat_other.png',
  });
  assert.equal(reopened.getBudgetsWithSpending('2026-09')[0].Amount, 200);
  assert.equal(reopened.getExchangeRates('USD').rates.TWD, 31);
  assert.deepEqual(reopened.getSnapshots()[0], {
    Id: snapshot.id, Date: '2026-09-09', Stock: 5, Cash: 6, FirstTrade: 7, Property: 8,
  });
});
