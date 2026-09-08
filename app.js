// app.js — Alpine.store('app') global state and methods

let _chart = null;
let _assetDetailChart = null;
let _reportChart = null;
let _statisticsChart = null;
let _categoryTrendChart = null;
let _receiptStore = null;
const REPORT_COLORS = ['#2563EB', '#16A34A', '#EA580C', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04', '#DB2777'];

document.addEventListener('alpine:init', () => {
  const initialState = AppState.createInitialState();
  Alpine.store('app', {
    ...initialState,
    transactions: [],
    categories: [],
    filterCategories: [],
    frequentCategories: [],
    editTarget: null,
    formReturnView: 'transactions',
    toast: { message: '', visible: false, _timer: null },
    driveStatus: 'disconnected', // 'disconnected' | 'connected' | 'syncing'
    setup: { clientId: '', clientSecret: '' },
    form: { amount: '', currency: 'TWD', categoryId: '', date: '', note: '', type: 'expense', imageRelativePath: null },
    errors: {},
    receiptSupported: false,
    attachment: {
      persistedPath: null,
      stagedPath: null,
      previewUrl: null,
      available: true,
      removeRequested: false,
      busy: false,
      error: '',
    },

    // Asset Trend state
    snapshots: [],
    snapshotEditTarget: null,
    snapshotForm: {
      date: '',
      stock: '',
      cash: '',
      firstTrade: '',
      property: '',
    },
    snapshotErrors: {},
    assetRate: { value: null, source: '', loading: false, error: '' },
    assetImport: {
      fileName: '', mode: 'append', parsed: null,
      importedCount: 0, skippedCount: 0, errors: [], error: '',
    },
    report: {
      ...initialState.report,
      window: null,
      totalExpense: 0,
      categories: [],
      sourceTransactions: [],
      detailTitle: '',
      detailCategoryId: null,
      detailGroups: [],
    },
    statisticsState: {
      ...initialState.statisticsState,
      months: [],
      monthly: [],
      insights: {
        incomeMoM: '--', expenseMoM: '--', maxExpense: '--', minNet: '--',
        averageIncome: '平均收入：--', averageExpense: '平均支出：--', dominantCategory: '主要支出分類：--',
      },
      categorySeries: [],
      expenseCategories: [],
    },

    viewTitle() {
      const editing = this.currentView === 'form' ? Boolean(this.editTarget)
        : this.currentView === 'categoryForm' ? Boolean(this.category.editTarget)
          : this.currentView === 'budgetForm' ? Boolean(this.budget.editTarget)
            : this.currentView === 'snapshotForm' ? Boolean(this.snapshotEditTarget)
              : false;
      return AppState.viewTitle(this.currentView, {
        editing,
      });
    },

    isPrimaryView() {
      return AppState.isPrimaryView(this.currentView);
    },

    async navigate(view) {
      this.currentView = view;
      if (view === 'home') await this.loadHome();
      else if (view === 'transactions') await this.loadTransactions();
      else if (view === 'categories') await this.loadManagedCategories();
      else if (view === 'budgets') await this.loadBudgets();
      else if (view === 'trends') await this.loadSnapshots(true);
      else if (view === 'statistics') await this.loadStatistics();
      else if (view === 'categoryReport') await this.loadCategoryReport();
    },

    async goBack() {
      if (this.currentView === 'form') {
        if (this.attachment.stagedPath && _receiptStore) await _receiptStore.delete(this.attachment.stagedPath);
        this.releaseReceiptPreview();
        await this.navigate(this.formReturnView);
        return;
      }
      await this.navigate(AppState.backView(this.currentView));
    },

    async init() {
      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) {
        try {
          await Drive.handleOAuthCallback(params.get('code'), params.get('state'));
          this.driveStatus = 'connected';
          this.showToast('Google Drive connected!');
        } catch (e) {
          this.showToast('Authentication failed. Please try again.');
        }
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Init DB
      try {
        this.loading = true;
        await DB.initDB();
        this.receiptSupported = Receipts.canUseOpfs();
        if (this.receiptSupported) _receiptStore = Receipts.createReceiptStore(Receipts.createOpfsAdapter());
        this.driveStatus = Drive.isAuthenticated() ? 'connected' : 'disconnected';
        await this.loadHome();
        await this.loadTransactions();
        await this.loadManagedCategories();
        await this.loadBudgets();
        this.loadSnapshots();
      } catch (e) {
        document.getElementById('fatal-error').style.display = 'flex';
      } finally {
        this.loading = false;
      }
    },

    async loadTransactions() {
      this.categories = DB.getCategories(this.form.type || 'expense');
      this.filterCategories = DB.getCategories(this.filter.type === 'all' ? 'all' : this.filter.type);
      if (this.filter.categoryId && !this.filterCategories.some(category => Number(category.Id) === Number(this.filter.categoryId))) {
        this.filter.categoryId = '';
      }
      this.transactions = DB.getTransactions(this.filter);
    },

    async setTransactionFilter(name, value) {
      this.filter[name] = value;
      await this.loadTransactions();
    },

    loadFrequentCategories() {
      this.frequentCategories = DB.getFrequentCategories(this.form.type, 6);
    },

    selectFrequentCategory(category) {
      this.form.categoryId = String(category.Id);
      this.focusTransactionField('date');
    },

    focusTransactionField(field) {
      const id = ({ amount: 'amount', category: 'category', date: 'date', note: 'note' })[field];
      if (id) setTimeout(() => document.getElementById(id)?.focus(), 0);
    },

    focusNextTransactionField(field) {
      const next = AppState.nextTransactionField(field);
      if (next) this.focusTransactionField(next);
    },

    onAmountInput(event) {
      this.form.amount = Accounting.sanitizeAmount(event.target.value);
      event.target.value = this.form.amount;
    },

    releaseReceiptPreview() {
      if (this.attachment.previewUrl) URL.revokeObjectURL(this.attachment.previewUrl);
      this.attachment.previewUrl = null;
    },

    async resetAttachment(path = null) {
      this.releaseReceiptPreview();
      this.attachment = {
        persistedPath: path,
        stagedPath: null,
        previewUrl: null,
        available: true,
        removeRequested: false,
        busy: false,
        error: '',
      };
      if (path) await this.loadReceiptPreview(path);
    },

    async loadReceiptPreview(path) {
      this.releaseReceiptPreview();
      if (!path || !_receiptStore) {
        this.attachment.available = !path;
        return;
      }
      const blob = await _receiptStore.read(path);
      this.attachment.available = Boolean(blob);
      if (blob) this.attachment.previewUrl = URL.createObjectURL(blob);
    },

    async stageReceipt(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!_receiptStore) {
        this.attachment.error = '此瀏覽器不支援本機收據儲存。';
        return;
      }
      this.attachment.busy = true;
      this.attachment.error = '';
      try {
        const blob = await Receipts.compressImage(file);
        const path = await _receiptStore.save(blob);
        if (this.attachment.stagedPath) await _receiptStore.delete(this.attachment.stagedPath);
        this.attachment.stagedPath = path;
        this.attachment.removeRequested = false;
        await this.loadReceiptPreview(path);
      } catch (error) {
        this.attachment.error = error.message;
      } finally {
        this.attachment.busy = false;
      }
    },

    async removeReceipt() {
      if (this.attachment.stagedPath && _receiptStore) await _receiptStore.delete(this.attachment.stagedPath);
      this.attachment.stagedPath = null;
      this.attachment.removeRequested = Boolean(this.attachment.persistedPath);
      this.attachment.available = true;
      this.releaseReceiptPreview();
    },

    openReceiptViewer() {
      if (this.attachment.previewUrl) this.currentView = 'receiptViewer';
    },

    async getTwdRates(transactions) {
      const currencies = [...new Set((transactions || []).map(row => String(row.Currency || 'TWD').toUpperCase()))];
      const rates = { TWD: 1 };
      for (const currency of currencies) {
        if (currency === 'TWD') continue;
        const cached = DB.getExchangeRates(currency);
        const cachedRate = Number(cached?.rates?.TWD);
        const cacheAge = cached ? Date.now() - Date.parse(cached.updatedAt) : Infinity;
        if (Number.isFinite(cachedRate) && cacheAge < 24 * 60 * 60 * 1000) {
          rates[currency] = cachedRate;
          continue;
        }
        try {
          const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(currency)}`);
          if (!response.ok) throw new Error(`rate HTTP ${response.status}`);
          const payload = await response.json();
          await DB.setExchangeRates(currency, payload.rates || {}, new Date().toISOString());
          rates[currency] = Number(payload.rates?.TWD) || cachedRate || 1;
        } catch {
          rates[currency] = cachedRate || 1;
        }
      }
      return rates;
    },

    async transactionsInTwd(transactions) {
      return Accounting.applyCurrencyRates(transactions, await this.getTwdRates(transactions));
    },

    async loadCategoryReport() {
      const window = Accounting.reportWindow(this.report.range, this.report.anchorDate);
      const source = DB.getTransactions({ start: window.start, endExclusive: window.endExclusive });
      const converted = await this.transactionsInTwd(source);
      const summary = Accounting.expenseCategoryReport(converted, window);
      this.report.window = window;
      this.report.totalExpense = summary.totalExpense;
      this.report.categories = summary.categories;
      this.report.sourceTransactions = converted;
      requestAnimationFrame(() => setTimeout(() => this.renderCategoryReportChart(), 0));
    },

    async setReportRange(range) {
      this.report.range = range;
      await this.loadCategoryReport();
    },

    async moveReportPeriod(delta) {
      if (this.report.range === 'all') return;
      this.report.anchorDate = Accounting.moveReportAnchor(this.report.range, this.report.anchorDate, delta);
      await this.loadCategoryReport();
    },

    openReportDetail(category) {
      const transactions = this.report.sourceTransactions.filter(row =>
        Accounting.normalizeType(row.Type) === 'expense' && Number(row.CategoryId) === Number(category.categoryId));
      this.report.detailTitle = category.categoryName;
      this.report.detailCategoryId = category.categoryId;
      this.report.detailGroups = Accounting.groupTransactionsByDate(transactions);
      this.currentView = 'reportDetail';
    },

    renderCategoryReportChart() {
      const canvas = document.getElementById('category-report-chart');
      if (!canvas || this.currentView !== 'categoryReport') return;
      if (_reportChart) { _reportChart.destroy(); _reportChart = null; }
      if (!this.report.categories.length) return;
      _reportChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: this.report.categories.map(row => row.categoryName),
          datasets: [{
            data: this.report.categories.map(row => row.amount),
            backgroundColor: this.report.categories.map((_, index) => REPORT_COLORS[index % REPORT_COLORS.length]),
            borderColor: '#FFFFFF', borderWidth: 2,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } },
      });
    },

    async loadStatistics() {
      const months = Accounting.twelveMonthWindow(this.statisticsState.anchorMonth);
      const endExclusive = `${Accounting.moveMonth(this.statisticsState.anchorMonth, 1)}-01`;
      const source = DB.getTransactions({ start: `${months[0]}-01`, endExclusive });
      const converted = await this.transactionsInTwd(source);
      const monthly = Accounting.monthTrendStats(converted, months);
      const categoryRows = [];
      for (const transaction of converted) {
        if (Accounting.normalizeType(transaction.Type) !== 'expense') continue;
        categoryRows.push({
          CategoryId: transaction.CategoryId,
          CategoryName: transaction.CategoryName || '未知',
          Month: String(transaction.Date).slice(0, 7),
          Amount: transaction.BaseAmount,
        });
      }
      const selected = this.statisticsState.selectedCategoryId === ''
        ? null : Number(this.statisticsState.selectedCategoryId);
      const categorySeries = Accounting.statisticsCategorySeries(categoryRows, months, selected);
      this.statisticsState.months = months;
      this.statisticsState.monthly = monthly;
      this.statisticsState.expenseCategories = DB.getCategories('expense');
      this.statisticsState.categorySeries = categorySeries.chartSeries;
      this.statisticsState.insights = Accounting.trendInsights(monthly, categorySeries.insightSeries);
      requestAnimationFrame(() => setTimeout(() => this.renderStatisticsCharts(), 0));
    },

    async moveStatisticsMonth(delta) {
      this.statisticsState.anchorMonth = Accounting.moveMonth(this.statisticsState.anchorMonth, delta);
      await this.loadStatistics();
    },

    async setStatisticsCategory(value) {
      this.statisticsState.selectedCategoryId = value;
      await this.loadStatistics();
    },

    renderStatisticsCharts() {
      if (this.currentView !== 'statistics') return;
      const monthlyCanvas = document.getElementById('statistics-monthly-chart');
      const categoryCanvas = document.getElementById('statistics-category-chart');
      if (_statisticsChart) { _statisticsChart.destroy(); _statisticsChart = null; }
      if (_categoryTrendChart) { _categoryTrendChart.destroy(); _categoryTrendChart = null; }

      const monthly = this.statisticsState.monthly;
      if (monthlyCanvas && monthly.some(row => row.income || row.expense)) {
        const datasets = Accounting.monthTrendDatasets(monthly);
        const colors = ['#16A34A', '#DC2626', '#2563EB'];
        const values = datasets.flatMap(dataset => dataset.data);
        _statisticsChart = new Chart(monthlyCanvas, {
          type: 'line',
          data: {
            labels: this.statisticsState.months.map(month => month.slice(5)),
            datasets: datasets.map((dataset, index) => ({
              ...dataset,
              borderColor: colors[index],
              backgroundColor: colors[index],
              tension: 0,
              pointRadius: 3,
            })),
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: Accounting.niceAxisStep(values) } } } },
        });
      }

      const categorySeries = this.statisticsState.categorySeries;
      if (categoryCanvas && categorySeries.length) {
        const values = categorySeries.flatMap(series => series.values);
        _categoryTrendChart = new Chart(categoryCanvas, {
          type: 'line',
          data: {
            labels: this.statisticsState.months.map(month => month.slice(5)),
            datasets: categorySeries.map((series, index) => ({
              label: series.categoryName,
              data: series.values,
              borderColor: REPORT_COLORS[index % REPORT_COLORS.length],
              backgroundColor: REPORT_COLORS[index % REPORT_COLORS.length],
              tension: 0,
              pointRadius: 3,
            })),
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: Accounting.niceAxisStep(values) } } } },
        });
      }
    },

    async loadHome() {
      const summary = DB.getMonthlySummary(this.home.month);
      this.home.summary = {
        income: Number(summary.Income || 0),
        expense: Number(summary.Expense || 0),
        balance: Number(summary.Income || 0) - Number(summary.Expense || 0),
      };
      this.home.recent = DB.getRecentTransactions(this.home.month, 10);
    },

    async moveHomeMonth(delta) {
      this.home.month = Accounting.moveMonth(this.home.month, delta);
      await this.loadHome();
    },

    async loadManagedCategories() {
      this.category.items = DB.getCategories(this.category.type);
    },

    async setCategoryType(type) {
      this.category.type = type;
      await this.loadManagedCategories();
    },

    openCategoryAdd() {
      this.category.editTarget = null;
      this.category.form = { name: '', icon: 'cat_other.png', type: this.category.type };
      this.category.errors = {};
      this.currentView = 'categoryForm';
    },

    openCategoryEdit(item) {
      this.category.editTarget = item;
      this.category.form = { name: item.Name, icon: item.Icon || 'cat_other.png', type: item.Type };
      this.category.errors = {};
      this.currentView = 'categoryForm';
    },

    async saveCategory() {
      this.category.errors = AppState.validateCategoryForm(this.category.form);
      if (Object.keys(this.category.errors).length) return;
      try {
        if (this.category.editTarget) await DB.updateCategory(this.category.editTarget.Id, this.category.form);
        else await DB.addCategory(this.category.form);
        this.category.type = this.category.form.type;
        await this.loadManagedCategories();
        await this.loadTransactions();
        this.currentView = 'categories';
      } catch (error) {
        this.category.errors.name = error.message;
      }
    },

    async deleteManagedCategory(item = this.category.editTarget) {
      if (!item || !confirm(`刪除分類「${item.Name}」？`)) return;
      try {
        await DB.deleteCategory(item.Id);
        await this.loadManagedCategories();
        this.currentView = 'categories';
      } catch (error) {
        this.showToast(error.message);
      }
    },

    async loadBudgets() {
      this.budget.items = DB.getBudgetsWithSpending(this.budget.month);
    },

    async moveBudgetMonth(delta) {
      this.budget.month = Accounting.moveMonth(this.budget.month, delta);
      await this.loadBudgets();
    },

    openBudgetAdd() {
      this.budget.editTarget = null;
      this.budget.form = { categoryId: '', amount: '' };
      this.budget.errors = {};
      this.categories = DB.getCategories('expense');
      this.currentView = 'budgetForm';
    },

    openBudgetEdit(item) {
      this.budget.editTarget = item;
      this.budget.form = { categoryId: String(item.CategoryId), amount: String(item.Amount) };
      this.budget.errors = {};
      this.categories = DB.getCategories('expense');
      this.currentView = 'budgetForm';
    },

    async saveBudget() {
      this.budget.errors = AppState.validateBudgetForm(this.budget.form);
      if (Object.keys(this.budget.errors).length) return;
      try {
        await DB.upsertBudget({
          categoryId: Number(this.budget.form.categoryId),
          amount: Number(this.budget.form.amount),
          month: this.budget.month,
        });
        await this.loadBudgets();
        this.currentView = 'budgets';
      } catch (error) {
        this.budget.errors.amount = error.message;
      }
    },

    async deleteBudget(item = this.budget.editTarget) {
      if (!item || !confirm('刪除此預算？')) return;
      await DB.deleteBudget(item.Id);
      await this.loadBudgets();
      this.currentView = 'budgets';
    },

    budgetProgress(item) {
      return AppState.budgetProgress(item);
    },

    async loadSnapshots(refreshRate = false) {
      this.snapshots = DB.getSnapshots();
      if (refreshRate) await this.loadAssetExchangeRate();
      // canvas 可能還沒 mount，延後一拍
      requestAnimationFrame(() => this.renderChart());
    },

    async loadAssetExchangeRate(force = false) {
      const cached = Accounting.exchangeRateCacheInfo(DB.getExchangeRates('USD'), 'TWD');
      if (!force && cached.fresh) {
        this.assetRate = { value: cached.rate, source: 'cache', loading: false, error: '' };
        return cached.rate;
      }
      this.assetRate = { value: cached.rate, source: cached.rate ? 'stale-cache' : '', loading: true, error: '' };
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const rate = Number(payload.rates?.TWD);
        if (!Number.isFinite(rate) || rate <= 0 || rate === 1) throw new Error('回傳資料缺少 USD/TWD 匯率');
        await DB.setExchangeRates('USD', payload.rates || {}, new Date().toISOString());
        this.assetRate = { value: rate, source: 'live', loading: false, error: '' };
        return rate;
      } catch (error) {
        this.assetRate = cached.rate
          ? { value: cached.rate, source: 'stale-cache', loading: false, error: '即時匯率無法取得，使用上次快取匯率。' }
          : { value: null, source: '', loading: false, error: `USD/TWD 匯率無法取得：${error.message}` };
        return this.assetRate.value;
      }
    },

    async openSnapshotAdd() {
      this.snapshotEditTarget = null;
      this.snapshotForm = {
        date: AppState.localIsoDate(new Date()),
        stock: '', cash: '', firstTrade: '', property: '',
      };
      this.snapshotErrors = {};
      this.currentView = 'snapshotForm';
      await this.loadAssetExchangeRate();
    },

    openSnapshotEdit(snapshot) {
      this.snapshotEditTarget = snapshot;
      this.snapshotForm = {
        date: snapshot.Date,
        stock: String(snapshot.Stock),
        cash: String(snapshot.Cash),
        firstTrade: String(snapshot.FirstTrade),
        property: String(snapshot.Property),
      };
      this.snapshotErrors = {};
      this.currentView = 'snapshotForm';
    },

    prefillLatestSnapshot() {
      try {
        this.snapshotForm = Accounting.prefillLatestSnapshot(
          this.snapshotForm,
          this.snapshots,
          this.assetRate.value,
        );
        this.snapshotErrors = {};
      } catch (error) {
        this.snapshotErrors.firstTrade = error.message;
      }
    },

    snapshotFirstTradePreview() {
      if (this.snapshotEditTarget || !(Number(this.snapshotForm.firstTrade) > 0) || !this.assetRate.value) return null;
      try {
        return Accounting.convertUsdToTwd(this.snapshotForm.firstTrade, this.assetRate.value);
      } catch {
        return null;
      }
    },

    latestAssetSummary() {
      return Accounting.assetSnapshotSummary(Accounting.latestSnapshot(this.snapshots));
    },

    validateSnapshotForm() {
      this.snapshotErrors = {};
      if (!this.snapshotForm.date) {
        this.snapshotErrors.date = '日期必填';
      }
      for (const field of ['stock', 'cash', 'firstTrade', 'property']) {
        const raw = this.snapshotForm[field];
        if (raw === '' || raw === null || raw === undefined) continue;
        const num = parseFloat(raw);
        if (Number.isNaN(num) || num < 0) {
          this.snapshotErrors[field] = '資產值必須為非負數';
        }
      }
      if (!this.snapshotEditTarget && Number(this.snapshotForm.firstTrade) > 0 && !this.assetRate.value) {
        this.snapshotErrors.firstTrade = '無法取得 USD/TWD 匯率，FirstTrade 尚不能儲存。';
      }
      return Object.keys(this.snapshotErrors).length === 0;
    },

    parseSnapshotValue(raw) {
      if (raw === '' || raw === null || raw === undefined) return 0;
      const n = parseFloat(raw);
      return Number.isNaN(n) ? 0 : n;
    },

    async saveSnapshot() {
      if (!this.validateSnapshotForm()) return;

      const firstTradeInput = this.parseSnapshotValue(this.snapshotForm.firstTrade);
      const payload = {
        date: this.snapshotForm.date,
        stock: this.parseSnapshotValue(this.snapshotForm.stock),
        cash: this.parseSnapshotValue(this.snapshotForm.cash),
        firstTrade: firstTradeInput === 0 ? 0 : Accounting.firstTradeValueForStorage(
          firstTradeInput,
          Boolean(this.snapshotEditTarget),
          this.assetRate.value,
        ),
        property: this.parseSnapshotValue(this.snapshotForm.property),
      };

      try {
        if (this.snapshotEditTarget) {
          await DB.updateSnapshot(this.snapshotEditTarget.Id, payload);
        } else {
          const result = await DB.addOrReplaceSnapshotByDate(payload);
          if (result.action === 'updated') {
            this.showToast(`已取代 ${payload.date.replace(/-/g,'/')} 當日資料`);
          }
        }
        await this.loadSnapshots();
        this.currentView = 'trends';
      } catch (e) {
        this.showToast('儲存失敗：' + (e.message || 'unknown'));
      }
    },

    async deleteSnapshot() {
      if (!this.snapshotEditTarget) return;
      if (!confirm('刪除此資產快照？')) return;
      try {
        await DB.deleteSnapshot(this.snapshotEditTarget.Id);
        await this.loadSnapshots();
        this.currentView = 'trends';
      } catch (e) {
        this.showToast('刪除失敗：' + (e.message || 'unknown'));
      }
    },

    async selectAssetCsv(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      this.assetImport = {
        ...this.assetImport,
        fileName: file.name,
        parsed: null,
        importedCount: 0,
        skippedCount: 0,
        errors: [],
        error: '',
      };
      try {
        const parsed = Accounting.parseAssetCsv(await file.text());
        this.assetImport.parsed = parsed;
        this.assetImport.importedCount = parsed.importedCount;
        this.assetImport.skippedCount = parsed.skippedCount;
        this.assetImport.errors = parsed.errors;
      } catch (error) {
        this.assetImport.error = error.message;
      }
    },

    async importAssetCsv() {
      const parsed = this.assetImport.parsed;
      if (!parsed?.importedCount) return;
      const replace = this.assetImport.mode === 'replace';
      if (replace && !confirm('這會清空目前所有資產快照，再匯入此 CSV。確定繼續？')) return;
      try {
        await DB.importSnapshots(parsed.snapshots, replace);
        await this.loadSnapshots();
        this.showToast(`匯入完成：${parsed.importedCount} 筆，略過 ${parsed.skippedCount} 筆`);
      } catch (error) {
        this.assetImport.error = `匯入失敗：${error.message}`;
      }
    },

    openAssetChart() {
      this.currentView = 'assetChart';
      requestAnimationFrame(() => setTimeout(() => this.renderAssetChart(true), 0));
    },

    renderChart() {
      this.renderAssetChart(false);
    },

    renderAssetChart(expanded = false) {
      const canvas = document.getElementById(expanded ? 'asset-trend-chart-expanded' : 'asset-trend-chart');
      if (!canvas) return; // trends view 還沒在 DOM
      if (!this.snapshots.length) {
        const existing = expanded ? _assetDetailChart : _chart;
        if (existing) existing.destroy();
        if (expanded) _assetDetailChart = null;
        else _chart = null;
        return;
      }
      // canvas 在 display:none 容器內時 offsetWidth = 0；此時不建 chart instance
      // 避免 Chart.js 建出 0×0 的圖、之後切到 trends 不會自動 resize
      // 若 Alpine x-show 還沒 propagate 完（iOS Safari 偶有時序差），延 100ms 再試一次
      const existingChart = expanded ? _assetDetailChart : _chart;
      if (!existingChart && canvas.offsetWidth === 0) {
        setTimeout(() => {
          const c = document.getElementById(expanded ? 'asset-trend-chart-expanded' : 'asset-trend-chart');
          if (c && c.offsetWidth > 0) this.renderAssetChart(expanded);
        }, 100);
        return;
      }

      // 依日期升序排列以畫圖
      const asc = [...this.snapshots].sort((a, b) => a.Date.localeCompare(b.Date));
      const labels = Accounting.assetDateLabels(asc.map(s => s.Date), expanded);
      const stock = asc.map(s => s.Stock);
      const cash = asc.map(s => s.Cash);
      const firstTrade = asc.map(s => s.FirstTrade);
      const property = asc.map(s => s.Property);
      const nonPropertyTotal = asc.map((s, i) => stock[i] + cash[i] + firstTrade[i]);
      const total = asc.map((s, i) => stock[i] + cash[i] + firstTrade[i] + property[i]);

      const datasets = [
        { type: 'bar', label: 'Stock',      data: stock,      backgroundColor: '#2563EB', stack: 'a', order: 2 },
        { type: 'bar', label: 'Cash',       data: cash,       backgroundColor: '#16A34A', stack: 'a', order: 2 },
        { type: 'bar', label: 'FirstTrade', data: firstTrade, backgroundColor: '#EA580C', stack: 'a', order: 2 },
        { type: 'bar', label: 'Property(房產)', data: property, backgroundColor: '#7C3AED', stack: 'a', order: 2 },
        {
          type: 'line', label: 'Total', data: total,
          yAxisID: 'yLine',
          order: 0,
          borderColor: '#111827', backgroundColor: '#111827',
          borderWidth: 4, pointRadius: 5, pointHoverRadius: 7,
          pointBackgroundColor: '#FFFFFF', pointBorderColor: '#111827', pointBorderWidth: 2,
          fill: false, tension: 0,
        },
        {
          type: 'line', label: '活動資產', data: nonPropertyTotal,
          yAxisID: 'yLine',
          order: 0,
          borderColor: '#DC2626', backgroundColor: '#DC2626',
          borderWidth: 4, pointRadius: 5, pointHoverRadius: 7,
          pointBackgroundColor: '#FFFFFF', pointBorderColor: '#DC2626', pointBorderWidth: 2,
          fill: false, tension: 0,
        },
      ];

      if (existingChart) {
        existingChart.data.labels = labels;
        existingChart.data.datasets = datasets;
        existingChart.update();
        return;
      }

      const chart = new Chart(canvas, {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
          },
          scales: {
            x: { stacked: true },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                stepSize: Math.max(Accounting.niceAxisStep(total), expanded ? 500000 : 2500000),
                callback: v => Number(v).toLocaleString(),
              },
            },
            yLine: {
              display: false,
              stacked: false,
              beginAtZero: true,
              grid: {
                drawOnChartArea: false,
              },
              ticks: {
                callback: v => Number(v).toLocaleString(),
              },
            },
          },
        },
      });
      if (expanded) _assetDetailChart = chart;
      else _chart = chart;
    },

    prevMonth() {
      const [y, m] = this.filter.month.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      this.filter.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.loadTransactions();
    },

    nextMonth() {
      const [y, m] = this.filter.month.split('-').map(Number);
      const d = new Date(y, m, 1);
      this.filter.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.loadTransactions();
    },

    setTypeFilter(type) {
      this.filter.type = type;
      this.loadTransactions();
    },

    async openAdd() {
      this.editTarget = null;
      this.formReturnView = 'transactions';
      this.form = {
        amount: '', currency: 'TWD', categoryId: '',
        date: AppState.localIsoDate(new Date()),
        note: '', type: 'expense', imageRelativePath: null,
      };
      this.errors = {};
      this.categories = DB.getCategories('expense');
      this.loadFrequentCategories();
      this.currentView = 'form';
      await this.resetAttachment();
      this.focusTransactionField('amount');
    },

    async openEdit(tx) {
      this.formReturnView = ['home', 'reportDetail'].includes(this.currentView) ? this.currentView : 'transactions';
      this.editTarget = tx;
      this.form = {
        amount: String(tx.Amount), currency: tx.Currency,
        categoryId: String(tx.CategoryId), date: tx.Date.slice(0, 10),
        note: tx.Note || '', type: tx.Type, imageRelativePath: tx.ImageRelativePath || null,
      };
      this.errors = {};
      this.categories = DB.getCategories(tx.Type);
      this.loadFrequentCategories();
      this.currentView = 'form';
      await this.resetAttachment(tx.ImageRelativePath || null);
    },

    onTypeChange() {
      this.form.categoryId = '';
      this.categories = DB.getCategories(this.form.type);
      this.loadFrequentCategories();
    },

    validateForm() {
      this.errors = {};
      if (!this.form.amount || parseFloat(this.form.amount) <= 0) {
        this.errors.amount = 'Amount is required';
      }
      if (!this.form.categoryId) {
        this.errors.categoryId = 'Please select a category';
      }
      return Object.keys(this.errors).length === 0;
    },

    async saveTransaction() {
      if (!this.validateForm()) return;
      const desiredReceiptPath = this.attachment.removeRequested
        ? null
        : this.attachment.stagedPath || this.attachment.persistedPath;
      const data = {
        amount: parseFloat(this.form.amount),
        currency: this.form.currency,
        categoryId: parseInt(this.form.categoryId),
        date: this.form.date,
        note: this.form.note,
        type: this.form.type,
        imageRelativePath: desiredReceiptPath,
      };
      const writeMetadata = async () => {
        if (this.editTarget) await DB.updateTransaction(this.editTarget.Id, data);
        else await DB.addTransaction(data);
      };
      try {
        if (_receiptStore && this.attachment.persistedPath !== desiredReceiptPath) {
          await Receipts.commitReplacement(
            _receiptStore,
            this.attachment.persistedPath,
            desiredReceiptPath,
            writeMetadata,
          );
        } else {
          await writeMetadata();
        }
      } catch (error) {
        this.attachment.stagedPath = null;
        this.attachment.removeRequested = false;
        await this.loadReceiptPreview(this.attachment.persistedPath);
        this.showToast(`儲存失敗：${error.message}`);
        return;
      }
      this.attachment.persistedPath = desiredReceiptPath;
      this.attachment.stagedPath = null;
      this.releaseReceiptPreview();
      await this.loadTransactions();
      await this.loadHome();
      await this.loadBudgets();
      if (this.formReturnView === 'reportDetail') {
        await this.loadCategoryReport();
        const category = this.report.categories.find(row => Number(row.categoryId) === Number(this.report.detailCategoryId));
        if (category) this.openReportDetail(category);
        else this.currentView = 'categoryReport';
        return;
      }
      this.currentView = this.formReturnView;
    },

    async deleteTransaction() {
      if (!confirm('Delete this transaction?')) return;
      const receiptPaths = [this.attachment.persistedPath, this.attachment.stagedPath].filter(Boolean);
      try {
        await DB.deleteTransaction(this.editTarget.Id);
        if (_receiptStore) await Promise.all(receiptPaths.map(path => _receiptStore.delete(path)));
      } catch (error) {
        this.showToast(`刪除失敗：${error.message}`);
        return;
      }
      this.releaseReceiptPreview();
      await this.loadTransactions();
      await this.loadHome();
      await this.loadBudgets();
      if (this.formReturnView === 'reportDetail') {
        await this.loadCategoryReport();
        const category = this.report.categories.find(row => Number(row.categoryId) === Number(this.report.detailCategoryId));
        if (category) this.openReportDetail(category);
        else this.currentView = 'categoryReport';
        return;
      }
      this.currentView = this.formReturnView;
    },

    async backupToDrive() {
      if (!Drive.isAuthenticated()) {
        Drive.startOAuthFlow();
        return;
      }
      try {
        this.driveStatus = 'syncing';
        await Drive.backup(window._dbExportBytes());
        this.showToast('Backup complete');
        this.driveStatus = 'connected';
      } catch (e) {
        this.showToast('Drive sync failed. Data saved locally.');
        this.driveStatus = 'connected';
      }
    },

    async restoreFromDrive() {
      if (!Drive.isAuthenticated()) {
        Drive.startOAuthFlow();
        return;
      }
      try {
        this.driveStatus = 'syncing';
        const bytes = await Drive.restore();
        await DB.loadFromBytes(bytes);
        await this.loadHome();
        await this.loadTransactions();
        await this.loadManagedCategories();
        await this.loadBudgets();
        this.loadSnapshots();
        this.showToast('Restore complete');
        this.driveStatus = 'connected';
      } catch (e) {
        if (e.message === 'no_file') {
          this.showToast('No backup found in Google Drive.');
        } else if (e.message?.includes('corrupt') || e.message?.includes('parse')) {
          this.showToast('Backup file appears corrupt.');
        } else {
          this.showToast('Drive sync failed. Data saved locally.');
        }
        this.driveStatus = 'connected';
      }
    },

    saveSetup() {
      if (!this.setup.clientId || !this.setup.clientSecret) {
        this.showToast('Please enter both Client ID and Client Secret.');
        return;
      }
      Drive.saveConfig(this.setup.clientId.trim(), this.setup.clientSecret.trim());
      this.showToast('Credentials saved.');
    },

    connectDrive() {
      if (!Drive.isConfigured()) {
        this.showToast('Please save your credentials first.');
        return;
      }
      Drive.startOAuthFlow();
    },

    disconnectDrive() {
      Drive.clearTokens();
      this.driveStatus = 'disconnected';
    },

    async resetServiceWorker() {
      if (!confirm('解除註冊 service worker 並清掉快取？\n(本機資料不受影響，但下次開啟會重新下載所有檔案)')) return;
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        this.showToast('SW unregistered. Reloading in 2s...');
        setTimeout(() => location.reload(), 2000);
      } catch (e) {
        this.showToast('Reset failed: ' + (e.message || 'unknown'));
      }
    },

    iconDisplay(icon) {
      const icons = {
        'cat_food.png': '🍽️',
        'cat_transport.png': '🚗',
        'cat_fun.png': '🎮',
        'cat_shopping.png': '🛍️',
        'cat_medical.png': '🏥',
        'cat_salary.png': '💼',
        'cat_other.png': '💰',
      };
      if (icons[icon]) return icons[icon];
      if (!icon || icon.includes('.')) return '💰';
      return icon;
    },

    showToast(message, duration = 3000) {
      clearTimeout(this.toast._timer);
      this.toast.message = message;
      this.toast.visible = true;
      this.toast._timer = setTimeout(() => { this.toast.visible = false; }, duration);
    },
  });
});
