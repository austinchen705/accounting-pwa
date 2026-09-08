// db.js — MAUI-compatible sql.js repository with OPFS/localStorage persistence.
(function (root) {
  'use strict';

  const DOTNET_UNIX_EPOCH_TICKS = 621355968000000000;
  const TICKS_PER_MILLISECOND = 10000;
  const DATE_TO_TICKS_EXPR =
    `CAST(${DOTNET_UNIX_EPOCH_TICKS} + (julianday(?) - 2440587.5) * 864000000000 AS INTEGER)`;

  function ticksFromIsoDate(value) {
    const milliseconds = Date.parse(`${String(value).slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isFinite(milliseconds)) throw new TypeError(`Invalid ISO date: ${value}`);
    return DOTNET_UNIX_EPOCH_TICKS + (milliseconds * TICKS_PER_MILLISECOND);
  }

  function ticksFromIsoDateTime(value) {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) throw new TypeError(`Invalid ISO date-time: ${value}`);
    return DOTNET_UNIX_EPOCH_TICKS + (milliseconds * TICKS_PER_MILLISECOND);
  }

  function isoDateFromTicks(value) {
    const milliseconds = (Number(value) - DOTNET_UNIX_EPOCH_TICKS) / TICKS_PER_MILLISECOND;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }

  function isoDateTimeFromTicks(value) {
    const milliseconds = (Number(value) - DOTNET_UNIX_EPOCH_TICKS) / TICKS_PER_MILLISECOND;
    return new Date(milliseconds).toISOString();
  }

  function createDatabaseApi(initialDatabase, persistCallback = async () => {}) {
    if (!initialDatabase) throw new TypeError('A sql.js Database instance is required.');
    let database = initialDatabase;
    const DatabaseConstructor = initialDatabase.constructor;

    const queryObjects = (sql, params = []) => {
      const results = database.exec(sql, params);
      if (!results.length) return [];
      const { columns, values } = results[0];
      return values.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
    };

    const persist = async () => persistCallback(database.export());

    async function commitMutation(operation) {
      const before = database.export();
      try {
        const result = operation();
        await persist();
        return result;
      } catch (error) {
        database.close();
        database = new DatabaseConstructor(before);
        throw error;
      }
    }

    async function runMigrations() {
      database.run('BEGIN');
      try {
        database.run('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)');
        database.run(`
          CREATE TABLE IF NOT EXISTS Transactions (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Amount REAL NOT NULL,
            Currency TEXT NOT NULL DEFAULT 'TWD',
            CategoryId INTEGER,
            Date INTEGER NOT NULL,
            Note TEXT,
            Type TEXT NOT NULL,
            ImageRelativePath TEXT NULL
          )
        `);
        database.run(`
          CREATE TABLE IF NOT EXISTS Categories (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Icon TEXT,
            Type TEXT NOT NULL
          )
        `);
        database.run(`
          CREATE TABLE IF NOT EXISTS Budgets (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            CategoryId INTEGER NOT NULL,
            Amount REAL NOT NULL,
            Month TEXT NOT NULL
          )
        `);
        database.run(`
          CREATE TABLE IF NOT EXISTS ExchangeRateCache (
            BaseCurrency TEXT PRIMARY KEY,
            RatesJson TEXT NOT NULL,
            UpdatedAt INTEGER NOT NULL
          )
        `);
        database.run(`
          CREATE TABLE IF NOT EXISTS AssetSnapshot (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Date INTEGER NOT NULL,
            Stock REAL NOT NULL DEFAULT 0,
            Cash REAL NOT NULL DEFAULT 0,
            FirstTrade REAL NOT NULL DEFAULT 0,
            Property REAL NOT NULL DEFAULT 0
          )
        `);

        const transactionColumns = queryObjects('PRAGMA table_info(Transactions)');
        if (!transactionColumns.some(column => column.name === 'ImageRelativePath')) {
          database.run('ALTER TABLE Transactions ADD COLUMN ImageRelativePath TEXT NULL');
        }

        const indexes = [
          'CREATE INDEX IF NOT EXISTS IX_Transactions_Date ON Transactions(Date)',
          'CREATE INDEX IF NOT EXISTS IX_Transactions_CategoryId ON Transactions(CategoryId)',
          'CREATE INDEX IF NOT EXISTS IX_Transactions_Currency ON Transactions(Currency)',
          'CREATE INDEX IF NOT EXISTS IX_Transactions_Type ON Transactions(Type)',
          'CREATE INDEX IF NOT EXISTS IX_Categories_Type ON Categories(Type)',
          'CREATE INDEX IF NOT EXISTS IX_Categories_Name_Type ON Categories(Name, Type)',
          'CREATE INDEX IF NOT EXISTS IX_Budgets_Month ON Budgets(Month)',
          'CREATE INDEX IF NOT EXISTS IX_Budgets_CategoryId_Month ON Budgets(CategoryId, Month)',
          'CREATE INDEX IF NOT EXISTS IX_AssetSnapshots_Date ON AssetSnapshot(Date)',
        ];
        indexes.forEach(sql => database.run(sql));
        const categoryCount = queryObjects('SELECT COUNT(*) AS Count FROM Categories')[0].Count;
        if (categoryCount === 0) {
          const defaults = [
            ['餐飲', 'cat_food.png', 'expense'],
            ['交通', 'cat_transport.png', 'expense'],
            ['娛樂', 'cat_fun.png', 'expense'],
            ['購物', 'cat_shopping.png', 'expense'],
            ['醫療', 'cat_medical.png', 'expense'],
            ['其他支出', 'cat_other.png', 'expense'],
            ['薪資', 'cat_salary.png', 'income'],
            ['其他收入', 'cat_other.png', 'income'],
          ];
          defaults.forEach(category => database.run(
            'INSERT INTO Categories (Name, Icon, Type) VALUES (?, ?, ?)',
            category,
          ));
        }
        database.run('INSERT OR IGNORE INTO _migrations(version) VALUES (1), (2), (3)');
        database.run('COMMIT');
      } catch (error) {
        database.run('ROLLBACK');
        throw error;
      }
    }

    function getCategories(type = 'all') {
      const params = [];
      let sql = 'SELECT Id, Name, Icon, Type FROM Categories';
      if (type && type !== 'all') {
        sql += ' WHERE lower(Type) = lower(?)';
        params.push(type);
      }
      sql += ' ORDER BY Name COLLATE NOCASE, Id';
      return queryObjects(sql, params);
    }

    function ensureCategoryUnique(name, type, excludedId = null) {
      const params = [String(name).trim(), String(type).trim()];
      let sql = 'SELECT Id FROM Categories WHERE lower(trim(Name)) = lower(?) AND lower(Type) = lower(?)';
      if (excludedId !== null) {
        sql += ' AND Id <> ?';
        params.push(excludedId);
      }
      if (queryObjects(sql, params).length) throw new Error('A category with this name and type already exists.');
    }

    async function addCategory({ name, icon = 'cat_other.png', type = 'expense' }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('Category name is required.');
      ensureCategoryUnique(cleanName, type);
      return commitMutation(() => {
        database.run('INSERT INTO Categories (Name, Icon, Type) VALUES (?, ?, ?)', [cleanName, icon, type]);
        const id = queryObjects('SELECT last_insert_rowid() AS Id')[0].Id;
        return { id };
      });
    }

    async function updateCategory(id, { name, icon = 'cat_other.png', type = 'expense' }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('Category name is required.');
      ensureCategoryUnique(cleanName, type, id);
      return commitMutation(() => {
        database.run('BEGIN');
        try {
          database.run('UPDATE Categories SET Name = ?, Icon = ?, Type = ? WHERE Id = ?', [cleanName, icon, type, id]);
          database.run('UPDATE Transactions SET Type = ? WHERE CategoryId = ?', [type, id]);
          database.run('COMMIT');
        } catch (error) {
          database.run('ROLLBACK');
          throw error;
        }
      });
    }

    async function deleteCategory(id) {
      const usage = queryObjects(`
        SELECT
          (SELECT COUNT(*) FROM Transactions WHERE CategoryId = ?) AS TransactionCount,
          (SELECT COUNT(*) FROM Budgets WHERE CategoryId = ?) AS BudgetCount
      `, [id, id])[0];
      if (usage.TransactionCount || usage.BudgetCount) throw new Error('Category is used by transactions or budgets.');
      return commitMutation(() => database.run('DELETE FROM Categories WHERE Id = ?', [id]));
    }

    const transactionDateSql = alias => `CASE WHEN typeof(${alias}.Date) = 'integer' THEN date(datetime((${alias}.Date - ${DOTNET_UNIX_EPOCH_TICKS}) / 10000000, 'unixepoch')) ELSE date(${alias}.Date) END`;

    function getTransactions(filters = {}, legacyType = undefined) {
      if (typeof filters === 'string') filters = { month: filters, type: legacyType };
      const clauses = [];
      const params = [];
      const dateSql = transactionDateSql('t');
      if (filters.month) {
        clauses.push(`strftime('%Y-%m', ${dateSql}) = ?`);
        params.push(filters.month);
      }
      if (filters.type && filters.type !== 'all') {
        clauses.push('lower(t.Type) = lower(?)');
        params.push(filters.type);
      }
      if (filters.categoryId) {
        clauses.push('t.CategoryId = ?');
        params.push(Number(filters.categoryId));
      }
      if (filters.currency && filters.currency !== 'all') {
        clauses.push('upper(t.Currency) = upper(?)');
        params.push(filters.currency);
      }
      if (filters.start) {
        clauses.push(`${dateSql} >= ?`);
        params.push(filters.start);
      }
      if (filters.endExclusive) {
        clauses.push(`${dateSql} < ?`);
        params.push(filters.endExclusive);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
      return queryObjects(`
        SELECT t.Id, t.Amount, t.Currency, t.CategoryId, ${dateSql} AS Date,
               t.Note, t.Type, t.ImageRelativePath,
               c.Name AS CategoryName, c.Icon AS CategoryIcon
        FROM Transactions t
        LEFT JOIN Categories c ON c.Id = t.CategoryId
        ${where}
        ORDER BY t.Date DESC, t.Id DESC
        ${limit}
      `, params);
    }

    function getRecentTransactions(month, limit = 10) {
      return getTransactions({ month, limit });
    }

    function getMonthlySummary(month) {
      const rows = getTransactions({ month });
      return rows.reduce((summary, row) => {
        const key = String(row.Type).toLowerCase() === 'income' || row.Type === '收入' ? 'Income' : 'Expense';
        summary[key] += Number(row.Amount || 0);
        return summary;
      }, { Income: 0, Expense: 0 });
    }

    function getFrequentCategories(type, limit = 6) {
      return queryObjects(`
        SELECT c.Id, c.Name, c.Icon, c.Type, COUNT(t.Id) AS UsageCount
        FROM Categories c
        JOIN Transactions t ON t.CategoryId = c.Id AND lower(t.Type) = lower(c.Type)
        WHERE lower(c.Type) = lower(?)
        GROUP BY c.Id, c.Name, c.Icon, c.Type
        ORDER BY UsageCount DESC, c.Name COLLATE BINARY
        LIMIT ${Math.max(1, Number(limit) || 6)}
      `, [type]);
    }

    async function addTransaction({ amount, currency = 'TWD', categoryId, date, note = '', type = 'expense', imageRelativePath = null }) {
      return commitMutation(() => {
        database.run(`
          INSERT INTO Transactions (Amount, Currency, CategoryId, Date, Note, Type, ImageRelativePath)
          VALUES (?, ?, ?, ${DATE_TO_TICKS_EXPR}, ?, ?, ?)
        `, [amount, currency, categoryId, date, note, type, imageRelativePath]);
        const id = queryObjects('SELECT last_insert_rowid() AS Id')[0].Id;
        return { id };
      });
    }

    async function updateTransaction(id, { amount, currency = 'TWD', categoryId, date, note = '', type = 'expense', imageRelativePath = null }) {
      return commitMutation(() => database.run(`
          UPDATE Transactions
          SET Amount = ?, Currency = ?, CategoryId = ?, Date = ${DATE_TO_TICKS_EXPR}, Note = ?, Type = ?, ImageRelativePath = ?
          WHERE Id = ?
        `, [amount, currency, categoryId, date, note, type, imageRelativePath, id]));
    }

    async function deleteTransaction(id) {
      return commitMutation(() => database.run('DELETE FROM Transactions WHERE Id = ?', [id]));
    }

    function getBudgetsWithSpending(month) {
      const dateSql = transactionDateSql('t');
      return queryObjects(`
        SELECT b.Id, b.CategoryId, c.Name AS CategoryName, c.Icon AS CategoryIcon,
               b.Amount,
               COALESCE(SUM(CASE WHEN lower(t.Type) = 'expense' AND strftime('%Y-%m', ${dateSql}) = b.Month THEN t.Amount ELSE 0 END), 0) AS SpentAmount
        FROM Budgets b
        LEFT JOIN Categories c ON c.Id = b.CategoryId
        LEFT JOIN Transactions t ON t.CategoryId = b.CategoryId
        WHERE b.Month = ?
        GROUP BY b.Id, b.CategoryId, c.Name, c.Icon, b.Amount
        ORDER BY c.Name COLLATE NOCASE, b.Id
      `, [month]).map(row => ({ ...row, Ratio: Number(row.Amount) > 0 ? Number(row.SpentAmount) / Number(row.Amount) : 0 }));
    }

    async function upsertBudget({ categoryId, amount, month }) {
      if (!(Number(amount) > 0)) throw new Error('Budget amount must be positive.');
      const existing = queryObjects('SELECT Id FROM Budgets WHERE CategoryId = ? AND Month = ? ORDER BY Id LIMIT 1', [categoryId, month])[0];
      return commitMutation(() => {
        if (existing) {
          database.run('UPDATE Budgets SET Amount = ? WHERE Id = ?', [amount, existing.Id]);
        } else {
          database.run('INSERT INTO Budgets (CategoryId, Amount, Month) VALUES (?, ?, ?)', [categoryId, amount, month]);
        }
        const id = existing?.Id || queryObjects('SELECT last_insert_rowid() AS Id')[0].Id;
        return { id };
      });
    }

    async function deleteBudget(id) {
      return commitMutation(() => database.run('DELETE FROM Budgets WHERE Id = ?', [id]));
    }

    function getExchangeRates(baseCurrency = 'TWD') {
      const row = queryObjects('SELECT BaseCurrency, RatesJson, UpdatedAt FROM ExchangeRateCache WHERE BaseCurrency = ?', [baseCurrency])[0];
      if (!row) return null;
      return { baseCurrency: row.BaseCurrency, rates: JSON.parse(row.RatesJson || '{}'), updatedAt: isoDateTimeFromTicks(row.UpdatedAt) };
    }

    async function setExchangeRates(baseCurrency, rates, updatedAt = new Date().toISOString()) {
      return commitMutation(() => database.run(`
          INSERT INTO ExchangeRateCache (BaseCurrency, RatesJson, UpdatedAt) VALUES (?, ?, ?)
          ON CONFLICT(BaseCurrency) DO UPDATE SET RatesJson = excluded.RatesJson, UpdatedAt = excluded.UpdatedAt
        `, [baseCurrency, JSON.stringify(rates), ticksFromIsoDateTime(updatedAt)]));
    }

    function getSnapshots() {
      return queryObjects(`
        SELECT Id,
               date(datetime((Date - ${DOTNET_UNIX_EPOCH_TICKS}) / 10000000, 'unixepoch')) AS Date,
               Stock, Cash, FirstTrade, Property
        FROM AssetSnapshot
        ORDER BY Date DESC, Id DESC
      `);
    }

    function upsertSnapshotWithoutPersist({ date, stock = 0, cash = 0, firstTrade = 0, property = 0 }) {
      const existing = queryObjects(`SELECT Id FROM AssetSnapshot WHERE Date = ${DATE_TO_TICKS_EXPR} ORDER BY Id DESC LIMIT 1`, [date])[0];
      if (existing) {
        database.run('UPDATE AssetSnapshot SET Stock = ?, Cash = ?, FirstTrade = ?, Property = ? WHERE Id = ?', [stock, cash, firstTrade, property, existing.Id]);
        return { action: 'updated', id: existing.Id };
      }
      database.run(`INSERT INTO AssetSnapshot (Date, Stock, Cash, FirstTrade, Property) VALUES (${DATE_TO_TICKS_EXPR}, ?, ?, ?, ?)`, [date, stock, cash, firstTrade, property]);
      return { action: 'inserted', id: queryObjects('SELECT last_insert_rowid() AS Id')[0].Id };
    }

    async function addOrReplaceSnapshotByDate(snapshot) {
      return commitMutation(() => upsertSnapshotWithoutPersist(snapshot));
    }

    async function updateSnapshot(id, { date, stock = 0, cash = 0, firstTrade = 0, property = 0 }) {
      return commitMutation(() => database.run(`UPDATE AssetSnapshot SET Date = ${DATE_TO_TICKS_EXPR}, Stock = ?, Cash = ?, FirstTrade = ?, Property = ? WHERE Id = ?`, [date, stock, cash, firstTrade, property, id]));
    }

    async function deleteSnapshot(id) {
      return commitMutation(() => database.run('DELETE FROM AssetSnapshot WHERE Id = ?', [id]));
    }

    async function importSnapshots(snapshots, replace = false) {
      return commitMutation(() => {
        database.run('BEGIN');
        try {
          if (replace) database.run('DELETE FROM AssetSnapshot');
          for (const snapshot of snapshots) upsertSnapshotWithoutPersist(snapshot);
          database.run('COMMIT');
        } catch (error) {
          database.run('ROLLBACK');
          throw error;
        }
      });
    }

    return {
      runMigrations,
      queryObjects,
      rawExec: sql => database.exec(sql),
      exportBytes: () => database.export(),
      close: () => database.close(),
      getCategories,
      addCategory,
      updateCategory,
      deleteCategory,
      getTransactions,
      getRecentTransactions,
      getMonthlySummary,
      getFrequentCategories,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      getBudgetsWithSpending,
      upsertBudget,
      deleteBudget,
      getExchangeRates,
      setExchangeRates,
      getSnapshots,
      addOrReplaceSnapshotByDate,
      updateSnapshot,
      deleteSnapshot,
      importSnapshots,
    };
  }

  async function prepareDatabaseReplacement(SqlModule, bytes, persistCallback = async () => {}) {
    let candidate;
    try {
      candidate = new SqlModule.Database(bytes);
      const api = createDatabaseApi(candidate, persistCallback);
      await api.runMigrations();
      await persistCallback(candidate.export());
      return { database: candidate, api };
    } catch (error) {
      candidate?.close();
      throw error;
    }
  }

  let SQL;
  let browserApi;
  let useOpfs = false;

  async function opfsLoad(filename) {
    try {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle(filename);
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch {
      return null;
    }
  }

  async function opfsSave(filename, bytes) {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  function localStorageLoad(key) {
    const base64 = localStorage.getItem(key);
    if (!base64) return null;
    const binary = atob(base64);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function localStorageSave(key, bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    localStorage.setItem(key, btoa(binary));
  }

  async function persistBrowserBytes(bytes) {
    if (useOpfs) await opfsSave('accounting_backup.db', bytes);
    else localStorageSave('accounting_db', bytes);
  }

  async function initDB() {
    useOpfs = Boolean(root.navigator?.storage && 'getDirectory' in root.navigator.storage);
    SQL = await root.initSqlJs({ locateFile: file => `./vendor/${file}` });
    const bytes = useOpfs ? await opfsLoad('accounting_backup.db') : localStorageLoad('accounting_db');
    const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
    browserApi = createDatabaseApi(database, persistBrowserBytes);
    await browserApi.runMigrations();
    await persistBrowserBytes(browserApi.exportBytes());
  }

  async function loadFromBytes(bytes) {
    const previous = browserApi;
    const replacement = await prepareDatabaseReplacement(SQL, bytes, persistBrowserBytes);
    browserApi = replacement.api;
    previous?.close();
  }

  const browserFacade = { initDB, loadFromBytes };
  for (const name of [
    'getCategories', 'addCategory', 'updateCategory', 'deleteCategory',
    'getTransactions', 'getRecentTransactions', 'getMonthlySummary', 'getFrequentCategories',
    'addTransaction', 'updateTransaction', 'deleteTransaction',
    'getBudgetsWithSpending', 'upsertBudget', 'deleteBudget',
    'getExchangeRates', 'setExchangeRates', 'getSnapshots',
    'addOrReplaceSnapshotByDate', 'updateSnapshot', 'deleteSnapshot', 'importSnapshots',
  ]) browserFacade[name] = (...args) => browserApi[name](...args);

  if (typeof module === 'object' && module.exports) {
    module.exports = { createDatabaseApi, prepareDatabaseReplacement, ticksFromIsoDate, isoDateFromTicks };
  } else {
    root.DB = browserFacade;
    root._dbExportBytes = () => browserApi.exportBytes();
    root._dbQuery = sql => browserApi.rawExec(sql);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
