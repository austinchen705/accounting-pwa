// app.js — Alpine.store('app') global state and methods

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

let _chart = null;

document.addEventListener('alpine:init', () => {
  const initialState = AppState.createInitialState();
  Alpine.store('app', {
    ...initialState,
    transactions: [],
    categories: [],
    editTarget: null,
    formReturnView: 'transactions',
    toast: { message: '', visible: false, _timer: null },
    driveStatus: 'disconnected', // 'disconnected' | 'connected' | 'syncing'
    setup: { clientId: '', clientSecret: '' },
    form: { amount: '', currency: 'TWD', categoryId: '', date: '', note: '', type: 'expense' },
    errors: {},

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
      else if (view === 'trends') this.loadSnapshots();
    },

    async goBack() {
      if (this.currentView === 'form') {
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
      this.transactions = DB.getTransactions(this.filter);
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

    loadSnapshots() {
      this.snapshots = DB.getSnapshots();
      // canvas 可能還沒 mount，延後一拍
      requestAnimationFrame(() => this.renderChart());
    },

    openSnapshotAdd() {
      this.snapshotEditTarget = null;
      this.snapshotForm = {
        date: new Date().toISOString().slice(0, 10),
        stock: '', cash: '', firstTrade: '', property: '',
      };
      this.snapshotErrors = {};
      this.currentView = 'snapshotForm';
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
      return Object.keys(this.snapshotErrors).length === 0;
    },

    parseSnapshotValue(raw) {
      if (raw === '' || raw === null || raw === undefined) return 0;
      const n = parseFloat(raw);
      return Number.isNaN(n) ? 0 : n;
    },

    async saveSnapshot() {
      if (!this.validateSnapshotForm()) return;

      const payload = {
        date: this.snapshotForm.date,
        stock: this.parseSnapshotValue(this.snapshotForm.stock),
        cash: this.parseSnapshotValue(this.snapshotForm.cash),
        firstTrade: this.parseSnapshotValue(this.snapshotForm.firstTrade),
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
        this.loadSnapshots();
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
        this.loadSnapshots();
        this.currentView = 'trends';
      } catch (e) {
        this.showToast('刪除失敗：' + (e.message || 'unknown'));
      }
    },

    renderChart() {
      const canvas = document.getElementById('asset-trend-chart');
      if (!canvas) return; // trends view 還沒在 DOM
      if (!this.snapshots.length) {
        if (_chart) { _chart.destroy(); _chart = null; }
        return;
      }
      // canvas 在 display:none 容器內時 offsetWidth = 0；此時不建 chart instance
      // 避免 Chart.js 建出 0×0 的圖、之後切到 trends 不會自動 resize
      // 若 Alpine x-show 還沒 propagate 完（iOS Safari 偶有時序差），延 100ms 再試一次
      if (!_chart && canvas.offsetWidth === 0) {
        setTimeout(() => {
          const c = document.getElementById('asset-trend-chart');
          if (c && c.offsetWidth > 0) this.renderChart();
        }, 100);
        return;
      }

      // 依日期升序排列以畫圖
      const asc = [...this.snapshots].sort((a, b) => a.Date.localeCompare(b.Date));
      const labels = this.buildCondensedLabels(asc.map(s => s.Date));
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

      if (_chart) {
        _chart.data.labels = labels;
        _chart.data.datasets = datasets;
        _chart.update();
        return;
      }

      _chart = new Chart(canvas, {
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
    },

    // 仿 MAUI BuildCondensedDateLabels：snapshots 多時降採樣 label
    buildCondensedLabels(isoDates) {
      const toShort = iso => {
        const [, m, d] = iso.split('-');
        return `${m}/${d}`;
      };
      if (isoDates.length <= 6) return isoDates.map(toShort);
      const step = isoDates.length <= 12 ? 2 : isoDates.length <= 24 ? 3 : 5;
      return isoDates.map((iso, i) =>
        (i === isoDates.length - 1 || i % step === 0) ? toShort(iso) : ''
      );
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

    openAdd() {
      this.editTarget = null;
      this.formReturnView = 'transactions';
      this.form = {
        amount: '', currency: 'TWD', categoryId: '',
        date: new Date().toISOString().slice(0, 10),
        note: '', type: 'expense',
      };
      this.errors = {};
      this.categories = DB.getCategories('expense');
      this.currentView = 'form';
    },

    openEdit(tx) {
      this.formReturnView = this.currentView === 'home' ? 'home' : 'transactions';
      this.editTarget = tx;
      this.form = {
        amount: String(tx.Amount), currency: tx.Currency,
        categoryId: String(tx.CategoryId), date: tx.Date.slice(0, 10),
        note: tx.Note || '', type: tx.Type,
      };
      this.errors = {};
      this.categories = DB.getCategories(tx.Type);
      this.currentView = 'form';
    },

    onTypeChange() {
      this.form.categoryId = '';
      this.categories = DB.getCategories(this.form.type);
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
      const data = {
        amount: parseFloat(this.form.amount),
        currency: this.form.currency,
        categoryId: parseInt(this.form.categoryId),
        date: this.form.date,
        note: this.form.note,
        type: this.form.type,
      };
      if (this.editTarget) {
        await DB.updateTransaction(this.editTarget.Id, data);
      } else {
        await DB.addTransaction(data);
      }
      await this.loadTransactions();
      await this.loadHome();
      await this.loadBudgets();
      this.currentView = this.formReturnView;
    },

    async deleteTransaction() {
      if (!confirm('Delete this transaction?')) return;
      await DB.deleteTransaction(this.editTarget.Id);
      await this.loadTransactions();
      await this.loadHome();
      await this.loadBudgets();
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
