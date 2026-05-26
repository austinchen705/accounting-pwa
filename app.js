// app.js — Alpine.store('app') global state and methods

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

document.addEventListener('alpine:init', () => {
  Alpine.store('app', {
    currentView: 'transactions',
    transactions: [],
    categories: [],
    editTarget: null,
    filter: { type: 'all', month: currentMonth() },
    toast: { message: '', visible: false, _timer: null },
    loading: false,
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
        await this.loadTransactions();
        this.loadSnapshots();
      } catch (e) {
        document.getElementById('fatal-error').style.display = 'flex';
      } finally {
        this.loading = false;
      }
    },

    async loadTransactions() {
      this.categories = DB.getCategories(this.form.type || 'expense');
      this.transactions = DB.getTransactions(this.filter.month, this.filter.type);
    },

    loadSnapshots() {
      this.snapshots = DB.getSnapshots();
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
      this.currentView = 'transactions';
      await this.loadTransactions();
    },

    async deleteTransaction() {
      if (!confirm('Delete this transaction?')) return;
      await DB.deleteTransaction(this.editTarget.Id);
      this.currentView = 'transactions';
      await this.loadTransactions();
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
        await this.loadTransactions();
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

    iconDisplay(icon) {
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
