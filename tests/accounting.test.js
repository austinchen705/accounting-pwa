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

test('stores new FirstTrade input as TWD while edits preserve stored TWD', () => {
  assert.equal(Accounting.firstTradeValueForStorage(100, false, 30.1234), 3012.34);
  assert.equal(Accounting.firstTradeValueForStorage(3012.34, true, null), 3012.34);
  assert.throws(() => Accounting.firstTradeValueForStorage(100, false, null), /unavailable/i);
});

test('reads usable fresh and stale USD to TWD cache entries', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  assert.deepEqual(Accounting.exchangeRateCacheInfo({
    rates: { TWD: 30.5 }, updatedAt: '2026-09-08T00:00:00Z',
  }, 'TWD', now), { rate: 30.5, fresh: true });
  assert.deepEqual(Accounting.exchangeRateCacheInfo({
    rates: { TWD: 30.5 }, updatedAt: '2026-09-06T00:00:00Z',
  }, 'TWD', now), { rate: 30.5, fresh: false });
  assert.deepEqual(Accounting.exchangeRateCacheInfo({ rates: { TWD: 1 }, updatedAt: now.toISOString() }, 'TWD', now), {
    rate: null, fresh: false,
  });
});

test('prefills a new asset draft from the newest snapshot without replacing its date', () => {
  const draft = { date: '2026-09-08', stock: '', cash: '', firstTrade: '', property: '' };
  const snapshots = [
    { Date: '2026-08-01', Stock: 1, Cash: 2, FirstTrade: 3, Property: 4 },
    { Date: '2026-09-01', Stock: 100, Cash: 200, FirstTrade: 3012.34, Property: 400 },
  ];
  assert.deepEqual(Accounting.prefillLatestSnapshot(draft, snapshots, 30.1234), {
    date: '2026-09-08', stock: 100, cash: 200, firstTrade: 100, property: 400,
  });
  assert.throws(() => Accounting.prefillLatestSnapshot(draft, snapshots, 1), /unavailable/i);
});

test('summarizes latest total and liquid assets', () => {
  assert.deepEqual(Accounting.assetSnapshotSummary({
    Stock: 10, Cash: 20, FirstTrade: 30, Property: 40,
  }), { total: 100, liquid: 60 });
});

test('builds condensed and expanded asset date labels', () => {
  const dates = Array.from({ length: 8 }, (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`);
  assert.deepEqual(Accounting.assetDateLabels(dates, false), ['01/01', '', '01/03', '', '01/05', '', '01/07', '01/08']);
  assert.deepEqual(Accounting.assetDateLabels(dates, true), dates.map(date => date.replace(/-/g, '/')));
});

test('validates asset CSV headers and rejects empty numeric cells', () => {
  const parsed = Accounting.parseAssetCsv(
    '\uFEFFDate,Stock,Cash,FirstTrade,Property\n2026-09-01,10,20,30,40\n2026-09-02,10,,30,40',
  );
  assert.equal(parsed.importedCount, 1);
  assert.equal(parsed.skippedCount, 1);
  assert.match(parsed.errors[0], /row 3/i);
  assert.throws(() => Accounting.parseAssetCsv('Date,Stock,Cash,FirstTrade,Fund3\n2026-09-01,1,2,3,4'), /header/i);
});

test('moves report anchors without changing all-time anchors', () => {
  assert.equal(Accounting.moveReportAnchor('week', '2026-09-08', -1), '2026-09-01');
  assert.equal(Accounting.moveReportAnchor('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(Accounting.moveReportAnchor('year', '2026-09-08', 1), '2027-01-01');
  assert.equal(Accounting.moveReportAnchor('all', '2026-09-08', 1), '2026-09-08');
});

test('builds zero-filled twelve-month income expense and balance stats', () => {
  const stats = Accounting.monthTrendStats([
    { Date: '2026-08-01', Type: 'income', BaseAmount: 100 },
    { Date: '2026-08-02', Type: 'expense', BaseAmount: 25 },
    { Date: '2026-09-01', Type: 'expense', BaseAmount: 40 },
  ], ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(stats, [
    { month: '2026-07', income: 0, expense: 0, balance: 0 },
    { month: '2026-08', income: 100, expense: 25, balance: 75 },
    { month: '2026-09', income: 0, expense: 40, balance: -40 },
  ]);
});

test('builds MAUI-compatible trend insights', () => {
  assert.deepEqual(Accounting.trendInsights([
    { month: '2026-08', income: 100, expense: 20 },
    { month: '2026-09', income: 150, expense: 40 },
  ]), {
    incomeMoM: '+50.0 %',
    expenseMoM: '+100.0 %',
    maxExpense: '最高支出月：2026-09 (40)',
    minNet: '最低淨額月：2026-08 (80)',
  });
  assert.equal(Accounting.trendInsights([{ month: '2026-09', income: 0, expense: 0 }]).incomeMoM, '--');
});

test('groups report detail transactions by date newest first', () => {
  const groups = Accounting.groupTransactionsByDate([
    { Id: 1, Date: '2026-09-07', Amount: 10 },
    { Id: 2, Date: '2026-09-08', Amount: 20 },
    { Id: 3, Date: '2026-09-08', Amount: 30 },
  ]);
  assert.deepEqual(groups.map(group => [group.date, group.transactions.map(row => row.Id)]), [
    ['2026-09-08', [3, 2]],
    ['2026-09-07', [1]],
  ]);
});

test('applies currency rates without mutating source transactions', () => {
  const source = [{ Amount: 10, Currency: 'USD' }, { Amount: 20, Currency: 'TWD' }];
  const converted = Accounting.applyCurrencyRates(source, { USD: 30, TWD: 1 });
  assert.deepEqual(converted.map(row => row.BaseAmount), [300, 20]);
  assert.equal('BaseAmount' in source[0], false);
});

test('sanitizes transaction amounts to one decimal separator and two decimals', () => {
  assert.equal(Accounting.sanitizeAmount('NT$ 1,234.567'), '1234.56');
  assert.equal(Accounting.sanitizeAmount('12..3'), '12.3');
  assert.equal(Accounting.sanitizeAmount('.5'), '0.5');
});
