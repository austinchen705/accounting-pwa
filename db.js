// db.js — sql.js wrapper with OPFS/localStorage persistence
let SQL;
let db;
let useOpfs = false;

// ── OPFS helpers ──────────────────────────────────────────────────────────────

async function opfsLoad(filename) {
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(filename);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function opfsSave(filename, bytes) {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
}

// ── localStorage fallback ─────────────────────────────────────────────────────

function lsLoad(key) {
  const b64 = localStorage.getItem(key);
  if (!b64) return null;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function lsSave(key, bytes) {
  const bin = String.fromCharCode(...bytes);
  localStorage.setItem(key, btoa(bin));
}

// ── Schema migrations ─────────────────────────────────────────────────────────

async function runMigrations() {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)`);
  const done = db.exec(`SELECT version FROM _migrations`);
  const versions = done.length ? done[0].values.map(r => r[0]) : [];

  if (!versions.includes(1)) {
    db.run(`
      CREATE TABLE IF NOT EXISTS Transactions (
        Id          INTEGER PRIMARY KEY AUTOINCREMENT,
        Amount      REAL    NOT NULL,
        Currency    TEXT    NOT NULL DEFAULT 'TWD',
        CategoryId  INTEGER,
        Date        TEXT    NOT NULL DEFAULT (date('now')),
        Note        TEXT,
        Type        TEXT    NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS Categories (
        Id    INTEGER PRIMARY KEY AUTOINCREMENT,
        Name  TEXT NOT NULL,
        Icon  TEXT,
        Type  TEXT NOT NULL
      )
    `);
    db.run(`INSERT INTO _migrations VALUES (1)`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDB() {
  useOpfs = 'getDirectory' in (navigator.storage || {});
  SQL = await initSqlJs({ locateFile: f => `./vendor/${f}` });

  const bytes = useOpfs
    ? await opfsLoad('accounting_backup.db')
    : lsLoad('accounting_db');

  if (bytes) {
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
    await runMigrations();
  }
}

// ── Persist ───────────────────────────────────────────────────────────────────

async function exportAndPersist() {
  const bytes = db.export();
  if (useOpfs) {
    await opfsSave('accounting_backup.db', bytes);
  } else {
    lsSave('accounting_db', bytes);
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function getCategories(type) {
  const results = db.exec(
    `SELECT Id, Name, Icon, Type FROM Categories WHERE Type = ? ORDER BY Name`,
    [type]
  );
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

// .NET ticks (100ns since 0001-01-01) → ISO date string in SQLite
const TICKS_DATE_EXPR = `
  CASE
    WHEN typeof(t.Date) = 'integer'
    THEN date(datetime((t.Date - 621355968000000000) / 10000000, 'unixepoch'))
    ELSE t.Date
  END
`;

function getTransactions(yearMonth, typeFilter) {
  let query = `
    SELECT t.Id, t.Amount, t.Currency,
           (${TICKS_DATE_EXPR}) AS Date,
           t.Note, t.Type,
           c.Name AS CategoryName, c.Icon AS CategoryIcon
    FROM Transactions t
    LEFT JOIN Categories c ON c.Id = t.CategoryId
    WHERE strftime('%Y-%m', ${TICKS_DATE_EXPR}) = ?
  `;
  const params = [yearMonth];
  if (typeFilter && typeFilter !== 'all') {
    query += ` AND t.Type = ?`;
    params.push(typeFilter);
  }
  query += ` ORDER BY t.Date DESC`;

  const results = db.exec(query, params);
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

async function addTransaction({ amount, currency, categoryId, date, note, type }) {
  db.run(
    `INSERT INTO Transactions (Amount, Currency, CategoryId, Date, Note, Type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [amount, currency, categoryId, date, note, type]
  );
  await exportAndPersist();
}

async function updateTransaction(id, { amount, currency, categoryId, date, note, type }) {
  db.run(
    `UPDATE Transactions SET Amount=?, Currency=?, CategoryId=?, Date=?, Note=?, Type=?
     WHERE Id=?`,
    [amount, currency, categoryId, date, note, type, id]
  );
  await exportAndPersist();
}

async function deleteTransaction(id) {
  db.run(`DELETE FROM Transactions WHERE Id=?`, [id]);
  await exportAndPersist();
}

async function loadFromBytes(bytes) {
  db.close();
  db = new SQL.Database(bytes);
  await exportAndPersist();
}

// ── Public API ────────────────────────────────────────────────────────────────

window.DB = {
  initDB,
  getCategories,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  loadFromBytes,
};

window._dbExportBytes = () => db.export();
window._dbQuery = (sql) => db.exec(sql);
