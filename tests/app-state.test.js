const test = require('node:test');
const assert = require('node:assert/strict');

const AppState = require('../app-state.js');

test('creates independent month state for home transactions and budgets', () => {
  const state = AppState.createInitialState(new Date(2026, 8, 8));
  assert.equal(state.currentView, 'home');
  assert.equal(state.home.month, '2026-09');
  assert.equal(state.filter.month, '2026-09');
  assert.equal(state.budget.month, '2026-09');
  state.budget.month = '2026-08';
  assert.equal(state.home.month, '2026-09');
  assert.equal(state.filter.month, '2026-09');
});

test('maps contextual views back to the correct destination', () => {
  assert.equal(AppState.backView('form'), 'transactions');
  assert.equal(AppState.backView('snapshotForm'), 'trends');
  assert.equal(AppState.backView('categories'), 'more');
  assert.equal(AppState.backView('budgetForm'), 'budgets');
});

test('shows the primary tab bar only on primary destinations', () => {
  for (const view of ['home', 'transactions', 'statistics', 'categoryReport', 'more']) {
    assert.equal(AppState.isPrimaryView(view), true);
  }
  assert.equal(AppState.isPrimaryView('categories'), false);
});

test('validates category and budget forms', () => {
  assert.deepEqual(AppState.validateCategoryForm({ name: '', type: 'expense' }), { name: 'Category name is required' });
  assert.deepEqual(AppState.validateCategoryForm({ name: 'Food', type: 'other' }), { type: 'Choose income or expense' });
  assert.deepEqual(AppState.validateCategoryForm({ name: 'Food', type: 'expense' }), {});
  assert.deepEqual(AppState.validateBudgetForm({ categoryId: '', amount: 0 }), {
    categoryId: 'Choose an expense category',
    amount: 'Budget amount must be positive',
  });
});

test('calculates uncapped budget progress presentation', () => {
  assert.deepEqual(AppState.budgetProgress({ Amount: 100, SpentAmount: 125 }), {
    ratio: 1.25,
    percent: 125,
    barPercent: 100,
    overBudget: true,
  });
});

test('provides titles for primary and secondary views', () => {
  assert.equal(AppState.viewTitle('home'), '總覽');
  assert.equal(AppState.viewTitle('categories'), '分類管理');
  assert.equal(AppState.viewTitle('budgetForm', { editing: true }), '編輯預算');
});
