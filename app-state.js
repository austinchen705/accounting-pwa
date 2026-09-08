(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const PRIMARY_VIEWS = Object.freeze(['home', 'transactions', 'statistics', 'categoryReport', 'more']);
  const TITLES = Object.freeze({
    home: '總覽',
    transactions: '交易紀錄',
    statistics: '統計',
    categoryReport: '支出分類',
    reportDetail: '分類交易',
    more: '更多',
    categories: '分類管理',
    budgets: '預算',
    trends: '資產趨勢',
    settings: '設定',
    form: '交易',
    categoryForm: '分類',
    budgetForm: '預算',
    snapshotForm: '資產快照',
  });

  const pad2 = value => String(value).padStart(2, '0');
  const localDate = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const localMonth = date => localDate(date).slice(0, 7);

  function createInitialState(now = new Date()) {
    const month = localMonth(now);
    return {
      currentView: 'home',
      previousView: null,
      loading: false,
      home: { month, summary: { income: 0, expense: 0, balance: 0 }, recent: [] },
      filter: { month, type: 'all', categoryId: '', currency: 'all' },
      budget: { month, items: [], editTarget: null, form: { categoryId: '', amount: '' }, errors: {} },
      category: { type: 'expense', items: [], editTarget: null, form: { name: '', icon: 'cat_other.png', type: 'expense' }, errors: {} },
      report: { range: 'month', anchorDate: localDate(now), selectedCategoryId: null },
      statisticsState: { anchorMonth: month, selectedCategoryId: '' },
    };
  }

  function backView(view) {
    return ({
      form: 'transactions',
      categories: 'more',
      categoryForm: 'categories',
      budgets: 'more',
      budgetForm: 'budgets',
      trends: 'more',
      snapshotForm: 'trends',
      settings: 'more',
      reportDetail: 'categoryReport',
      assetChart: 'trends',
      receiptViewer: 'form',
    })[view] || 'home';
  }

  function isPrimaryView(view) {
    return PRIMARY_VIEWS.includes(view);
  }

  function validateCategoryForm(form) {
    const errors = {};
    if (!String(form?.name || '').trim()) errors.name = 'Category name is required';
    if (!['income', 'expense'].includes(form?.type)) errors.type = 'Choose income or expense';
    return errors;
  }

  function validateBudgetForm(form) {
    const errors = {};
    if (!form?.categoryId) errors.categoryId = 'Choose an expense category';
    if (!(Number(form?.amount) > 0)) errors.amount = 'Budget amount must be positive';
    return errors;
  }

  function budgetProgress(item) {
    const amount = Number(item?.Amount || 0);
    const spent = Number(item?.SpentAmount || 0);
    const ratio = amount > 0 ? spent / amount : 0;
    const percent = Math.round(ratio * 100);
    return { ratio, percent, barPercent: Math.min(100, Math.max(0, percent)), overBudget: ratio > 1 };
  }

  function viewTitle(view, context = {}) {
    if (view === 'form') return context.editing ? '編輯交易' : '新增交易';
    if (view === 'categoryForm') return context.editing ? '編輯分類' : '新增分類';
    if (view === 'budgetForm') return context.editing ? '編輯預算' : '新增預算';
    if (view === 'snapshotForm') return context.editing ? '編輯資產快照' : '新增資產快照';
    return TITLES[view] || '個人記帳';
  }

  function nextTransactionField(field) {
    return ({ amount: 'category', category: 'date', date: 'note' })[field] || null;
  }

  return {
    PRIMARY_VIEWS,
    createInitialState,
    backView,
    isPrimaryView,
    validateCategoryForm,
    validateBudgetForm,
    budgetProgress,
    viewTitle,
    nextTransactionField,
  };
});
