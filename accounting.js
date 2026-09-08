(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Accounting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const pad2 = value => String(value).padStart(2, '0');

  function normalizeType(type) {
    const value = String(type || 'expense').trim();
    if (value === '收入') return 'income';
    if (value === '支出') return 'expense';
    return value.toLowerCase();
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  function parseMonth(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
    if (!match) throw new TypeError(`Invalid month: ${value}`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw new TypeError(`Invalid month: ${value}`);
    return new Date(year, month - 1, 1);
  }

  function moveMonth(month, delta) {
    const date = parseMonth(month);
    date.setMonth(date.getMonth() + Number(delta || 0));
    return monthKey(date);
  }

  function twelveMonthWindow(anchorMonth) {
    const anchor = parseMonth(anchorMonth);
    const result = [];
    for (let offset = -11; offset <= 0; offset += 1) {
      result.push(monthKey(new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)));
    }
    return result;
  }

  function reportWindow(range, anchorIso) {
    const date = parseIsoDate(anchorIso);
    if (!date) throw new TypeError(`Invalid date: ${anchorIso}`);
    if (range === 'all') return { start: null, endExclusive: null, label: '全部期間' };

    let start;
    let end;
    if (range === 'week') {
      const mondayOffset = (date.getDay() + 6) % 7;
      start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      return {
        start: isoDate(start),
        endExclusive: isoDate(end),
        label: `${start.getFullYear()}/${pad2(start.getMonth() + 1)}/${pad2(start.getDate())} - ${pad2(last.getMonth() + 1)}/${pad2(last.getDate())}`,
      };
    }
    if (range === 'month') {
      start = new Date(date.getFullYear(), date.getMonth(), 1);
      end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return { start: isoDate(start), endExclusive: isoDate(end), label: `${start.getFullYear()}/${pad2(start.getMonth() + 1)}` };
    }
    if (range === 'year') {
      start = new Date(date.getFullYear(), 0, 1);
      end = new Date(date.getFullYear() + 1, 0, 1);
      return { start: isoDate(start), endExclusive: isoDate(end), label: String(start.getFullYear()) };
    }
    throw new RangeError(`Unsupported report range: ${range}`);
  }

  function moveReportAnchor(range, anchorIso, delta) {
    const date = parseIsoDate(anchorIso);
    if (!date) throw new TypeError(`Invalid date: ${anchorIso}`);
    if (range === 'week') date.setDate(date.getDate() + (7 * delta));
    else if (range === 'month') date.setMonth(date.getMonth() + delta, 1);
    else if (range === 'year') date.setFullYear(date.getFullYear() + delta, 0, 1);
    return isoDate(date);
  }

  function summarizeTransactions(transactions) {
    let income = 0;
    let expense = 0;
    for (const transaction of transactions || []) {
      const amount = Number(transaction.BaseAmount ?? transaction.Amount ?? 0);
      if (normalizeType(transaction.Type) === 'income') income += amount;
      if (normalizeType(transaction.Type) === 'expense') expense += amount;
    }
    return { income, expense, balance: income - expense };
  }

  function frequentCategories(categories, transactions, type, limit = 6) {
    const normalized = normalizeType(type);
    const counts = new Map();
    for (const transaction of transactions || []) {
      if (normalizeType(transaction.Type) !== normalized) continue;
      counts.set(Number(transaction.CategoryId), (counts.get(Number(transaction.CategoryId)) || 0) + 1);
    }
    return (categories || [])
      .filter(category => normalizeType(category.Type) === normalized && counts.has(Number(category.Id)))
      .sort((left, right) => {
        const countDiff = counts.get(Number(right.Id)) - counts.get(Number(left.Id));
        return countDiff || String(left.Name).localeCompare(String(right.Name));
      })
      .slice(0, limit);
  }

  function inWindow(date, window) {
    return (!window.start || date >= window.start) && (!window.endExclusive || date < window.endExclusive);
  }

  function expenseCategoryReport(transactions, window = { start: null, endExclusive: null }) {
    const groups = new Map();
    for (const transaction of transactions || []) {
      if (normalizeType(transaction.Type) !== 'expense' || !inWindow(String(transaction.Date).slice(0, 10), window)) continue;
      const id = Number(transaction.CategoryId || 0);
      const current = groups.get(id) || {
        categoryId: id,
        categoryName: transaction.CategoryName || '未知',
        transactionCount: 0,
        amount: 0,
      };
      current.transactionCount += 1;
      current.amount += Number(transaction.BaseAmount ?? transaction.Amount ?? 0);
      groups.set(id, current);
    }
    const categories = [...groups.values()].sort((left, right) => right.amount - left.amount || left.categoryName.localeCompare(right.categoryName));
    const totalExpense = categories.reduce((sum, row) => sum + row.amount, 0);
    for (const row of categories) row.percentage = totalExpense ? row.amount / totalExpense : 0;
    return { totalExpense, categories };
  }

  function categoryTrendSeries(rows, months, selectedCategoryId = null, limit = 5) {
    const groups = new Map();
    for (const row of rows || []) {
      const id = Number(row.CategoryId);
      if (selectedCategoryId !== null && id !== Number(selectedCategoryId)) continue;
      if (!groups.has(id)) groups.set(id, { categoryId: id, categoryName: row.CategoryName || '未知', byMonth: new Map() });
      const group = groups.get(id);
      group.byMonth.set(row.Month, (group.byMonth.get(row.Month) || 0) + Number(row.Amount || 0));
    }
    return [...groups.values()]
      .map(group => {
        const values = months.map(month => group.byMonth.get(month) || 0);
        return { categoryId: group.categoryId, categoryName: group.categoryName, values, total: values.reduce((sum, value) => sum + value, 0) };
      })
      .sort((left, right) => right.total - left.total || left.categoryName.localeCompare(right.categoryName))
      .slice(0, selectedCategoryId === null ? limit : 1);
  }

  function niceAxisStep(values) {
    const max = Math.max(0, ...(values || []).map(value => Math.abs(Number(value) || 0)));
    if (max <= 0) return 1000;
    const raw = max / 6;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map(multiplier => multiplier * magnitude).find(candidate => raw <= candidate) || 10 * magnitude;
  }

  function parseAssetCsv(content) {
    const lines = String(content || '').split(/\r?\n/).filter(line => line.trim());
    const snapshots = [];
    const errors = [];
    for (let index = 1; index < lines.length; index += 1) {
      const columns = lines[index].split(',').map(value => value.trim());
      const date = parseIsoDate(columns[0]);
      const values = columns.slice(1, 5).map(Number);
      if (columns.length < 5 || !date || values.some(value => !Number.isFinite(value))) {
        errors.push(`Skipped row ${index + 1}: invalid date or numeric value.`);
        continue;
      }
      snapshots.push({ date: isoDate(date), stock: values[0], cash: values[1], firstTrade: values[2], property: values[3] });
    }
    return { snapshots, importedCount: snapshots.length, skippedCount: errors.length, errors };
  }

  function convertUsdToTwd(amount, exchangeRate) {
    const rate = Number(exchangeRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate === 1) throw new Error('USD/TWD exchange rate is unavailable.');
    return Math.round((Number(amount) * rate + Number.EPSILON) * 100) / 100;
  }

  return {
    normalizeType,
    moveMonth,
    twelveMonthWindow,
    reportWindow,
    moveReportAnchor,
    summarizeTransactions,
    frequentCategories,
    expenseCategoryReport,
    categoryTrendSeries,
    niceAxisStep,
    parseAssetCsv,
    convertUsdToTwd,
  };
});
