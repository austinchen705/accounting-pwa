const test = require('node:test');
const assert = require('node:assert/strict');

const Accounting = require('../accounting.js');

test('moves calendar months across year boundaries', () => {
  assert.equal(Accounting.moveMonth('2026-01', -1), '2025-12');
  assert.equal(Accounting.moveMonth('2026-12', 1), '2027-01');
});

test('builds a rolling twelve-month window ending at the anchor', () => {
  const months = Accounting.twelveMonthWindow('2026-09');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2025-10');
  assert.equal(months[11], '2026-09');
});

test('uses Monday-based report windows and half-open bounds', () => {
  assert.deepEqual(Accounting.reportWindow('week', '2026-09-08'), {
    start: '2026-09-07',
    endExclusive: '2026-09-14',
    label: '2026/09/07 - 09/13',
  });
  assert.deepEqual(Accounting.reportWindow('month', '2026-09-08'), {
    start: '2026-09-01',
    endExclusive: '2026-10-01',
    label: '2026/09',
  });
  assert.deepEqual(Accounting.reportWindow('year', '2026-09-08'), {
    start: '2026-01-01',
    endExclusive: '2027-01-01',
    label: '2026',
  });
  assert.deepEqual(Accounting.reportWindow('all', '2026-09-08'), {
    start: null,
    endExclusive: null,
    label: '全部期間',
  });
});

test('summarizes income expense and balance', () => {
  const result = Accounting.summarizeTransactions([
    { Type: 'income', Amount: 1000 },
    { Type: 'expense', Amount: 250 },
    { Type: '支出', Amount: 50 },
  ]);
  assert.deepEqual(result, { income: 1000, expense: 300, balance: 700 });
});

test('ranks used categories by count then name for the selected type', () => {
  const categories = [
    { Id: 1, Name: 'Food', Type: 'expense' },
    { Id: 2, Name: 'Books', Type: 'expense' },
    { Id: 3, Name: 'Salary', Type: 'income' },
  ];
  const transactions = [
    { CategoryId: 1, Type: 'expense' },
    { CategoryId: 2, Type: 'expense' },
    { CategoryId: 1, Type: 'expense' },
    { CategoryId: 3, Type: 'income' },
  ];
  assert.deepEqual(
    Accounting.frequentCategories(categories, transactions, 'expense', 6).map(c => c.Id),
    [1, 2],
  );
});

test('groups only in-range expenses and calculates percentages', () => {
  const rows = Accounting.expenseCategoryReport([
    { CategoryId: 1, CategoryName: 'Food', Type: 'expense', Date: '2026-09-08', Amount: 60 },
    { CategoryId: 2, CategoryName: 'Books', Type: 'expense', Date: '2026-09-09', Amount: 40 },
    { CategoryId: 1, CategoryName: 'Food', Type: 'income', Date: '2026-09-08', Amount: 999 },
    { CategoryId: 1, CategoryName: 'Food', Type: 'expense', Date: '2026-08-01', Amount: 999 },
  ], { start: '2026-09-01', endExclusive: '2026-10-01' });

  assert.equal(rows.totalExpense, 100);
  assert.deepEqual(rows.categories, [
    { categoryId: 1, categoryName: 'Food', transactionCount: 1, amount: 60, percentage: 0.6 },
    { categoryId: 2, categoryName: 'Books', transactionCount: 1, amount: 40, percentage: 0.4 },
  ]);
});

test('builds zero-filled category trend series', () => {
  const series = Accounting.categoryTrendSeries([
    { CategoryId: 1, CategoryName: 'Food', Month: '2026-08', Amount: 20 },
    { CategoryId: 1, CategoryName: 'Food', Month: '2026-09', Amount: 30 },
    { CategoryId: 2, CategoryName: 'Books', Month: '2026-09', Amount: 10 },
  ], ['2026-07', '2026-08', '2026-09'], 1);
  assert.deepEqual(series, [{ categoryId: 1, categoryName: 'Food', values: [0, 20, 30], total: 50 }]);
});

test('chooses MAUI-compatible dynamic axis steps', () => {
  assert.equal(Accounting.niceAxisStep([]), 1000);
  assert.equal(Accounting.niceAxisStep([1200]), 200);
  assert.equal(Accounting.niceAxisStep([50000]), 10000);
});

test('parses valid asset CSV rows and reports invalid rows', () => {
  const result = Accounting.parseAssetCsv(
    'Date,Stock,Cash,FirstTrade,Property\n2026-09-01,1,2,3,4\nbad,1,x,3,4\n',
  );
  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.snapshots[0], {
    date: '2026-09-01', stock: 1, cash: 2, firstTrade: 3, property: 4,
  });
  assert.match(result.errors[0], /row 3/i);
});

test('converts FirstTrade USD values and rejects unavailable rates', () => {
  assert.equal(Accounting.convertUsdToTwd(100, 30.1234), 3012.34);
  assert.throws(() => Accounting.convertUsdToTwd(100, 1), /unavailable/i);
  assert.throws(() => Accounting.convertUsdToTwd(100, 0), /unavailable/i);
});
