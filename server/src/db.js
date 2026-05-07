const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function openDb({ dbPath }) {
  const abs = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  ensureDir(path.dirname(abs));
  const db = new Database(abs);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function migrate(db) {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  migrateColumns(db);
}

function migrateColumns(db) {
  // `schema.sql` only creates tables; it doesn't evolve existing ones.
  // Keep migrations intentionally minimal and additive (ALTER TABLE ADD COLUMN).
  ensureColumn(db, 'users', 'email', 'ALTER TABLE users ADD COLUMN email TEXT');
  ensureColumn(db, 'matches', 'format', "ALTER TABLE matches ADD COLUMN format TEXT NOT NULL DEFAULT 'tcg'");
  ensureColumn(db, 'matches', 'deck_a_id', 'ALTER TABLE matches ADD COLUMN deck_a_id INTEGER');
  ensureColumn(db, 'matches', 'deck_b_id', 'ALTER TABLE matches ADD COLUMN deck_b_id INTEGER');
}

function ensureColumn(db, table, column, ddl) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!Array.isArray(cols) || cols.length === 0) return;
    const has = cols.some((c) => String(c?.name || '') === column);
    if (has) return;
    db.exec(ddl);
  } catch {
    // ignore: table might not exist yet
  }
}

module.exports = { openDb, migrate };
