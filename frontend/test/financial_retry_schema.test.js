import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(
  new URL('../../desktop/Database/MigrationRunner.Idempotency.cs', import.meta.url),
  'utf8',
);
const helper = source.slice(
  source.indexOf('private static void EnsureFinancialRetryColumns('),
  source.indexOf('// Tables that the UI may retry'),
);
const columns = [...helper.matchAll(/EnsureColumn\(conn, trans, table, "([^"]+)", "([^"]+)"\)/g)]
  .map((match) => ({ name: match[1], type: match[2] }));
const indexSql = helper.match(/"(CREATE UNIQUE INDEX IF NOT EXISTS idx_\{0\}_idempotency[^"]+)"/)?.[1];
const cancellationSql = helper.match(/CREATE TABLE IF NOT EXISTS sale_checkout_cancellations \([\s\S]*?\);/)?.[0];
const financialCancellationSql = helper.match(/CREATE TABLE IF NOT EXISTS financial_attempt_cancellations \([\s\S]*?\);/)?.[0];
const tables = ['digital_transactions', 'digital_account_fundings'];

// Execute the migration's actual column definitions and index SQL on SQLite.
// Windows NUnit separately covers the C# migration runner and provider.
function migrate(db) {
  assert.equal(columns.length, 2, 'The wallet retry migration must define both persistent columns');
  assert.ok(indexSql, 'The migration must define the unique retry index');
  assert.ok(cancellationSql, 'The migration must support durable checkout cancellation');
  assert.ok(financialCancellationSql, 'Wallet/e-pay cancellation barriers must be durable');
  db.exec('BEGIN');
  try {
    db.exec(cancellationSql);
    db.exec(financialCancellationSql);
    for (const table of tables) {
      const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
      for (const column of columns) {
        if (!existing.has(column.name)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}`);
        }
      }
      db.exec(indexSql.replaceAll('{0}', table));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE digital_transactions (id TEXT PRIMARY KEY, amount_piasters INTEGER NOT NULL);
    CREATE TABLE digital_account_fundings (id TEXT PRIMARY KEY, amount_piasters INTEGER NOT NULL);
    INSERT INTO digital_transactions VALUES ('old-transaction', 12345);
    INSERT INTO digital_account_fundings VALUES ('old-funding', 67890);
  `);
  return db;
}

describe('Persistent financial retry schema (SQLite SQL contract)', () => {
  it('adds nullable retry metadata without altering historical amounts', () => {
    const db = fixture();
    try {
      migrate(db);
      assert.deepEqual(
        { ...db.prepare('SELECT * FROM digital_transactions').get() },
        { id: 'old-transaction', amount_piasters: 12345, idempotency_key: null, idempotency_fingerprint: null },
      );
      assert.deepEqual(
        { ...db.prepare('SELECT * FROM digital_account_fundings').get() },
        { id: 'old-funding', amount_piasters: 67890, idempotency_key: null, idempotency_fingerprint: null },
      );
    } finally {
      db.close();
    }
  });

  it('rejects duplicate nonempty attempt keys independently in each wallet ledger', () => {
    const db = fixture();
    try {
      migrate(db);
      for (const table of tables) {
        const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`);
        insert.run('first', 5000, 'attempt-1', 'request-a');
        assert.throws(() => insert.run('retry', 5000, 'attempt-1', 'request-a'), /UNIQUE constraint failed/);
        assert.throws(() => insert.run('changed', 9000, 'attempt-1', 'request-b'), /UNIQUE constraint failed/);
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 2);
      }
    } finally {
      db.close();
    }
  });

  it('preserves legacy null/empty keys and does not change rows on repeated migration', () => {
    const db = fixture();
    try {
      migrate(db);
      for (const table of tables) {
        const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`);
        insert.run('null-a', 1, null, null);
        insert.run('null-b', 2, null, null);
        insert.run('empty-a', 3, '', null);
        insert.run('empty-b', 4, '', null);
      }
      const before = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      migrate(db);
      assert.deepEqual(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), before);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
    }
  });

  it('persists one cancellation barrier per attempt without touching financial rows', () => {
    const db = fixture();
    try {
      migrate(db);
      const insert = db.prepare('INSERT INTO sale_checkout_cancellations VALUES (?, ?, ?, ?, ?)');
      insert.run('cancel-1', 'attempt-1', 'a'.repeat(64), 'cashier-1', '2026-11-02T12:00:00Z');
      assert.throws(
        () => insert.run('cancel-2', 'attempt-1', 'b'.repeat(64), 'cashier-1', '2026-11-02T12:01:00Z'),
        /UNIQUE constraint failed/,
      );
      migrate(db);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sale_checkout_cancellations').get().count, 1);
      assert.equal(db.prepare('SELECT amount_piasters FROM digital_transactions').get().amount_piasters, 12345);
      assert.equal(db.prepare('SELECT amount_piasters FROM digital_account_fundings').get().amount_piasters, 67890);
    } finally {
      db.close();
    }
  });

  it('scopes wallet/e-pay barriers by operation and key', () => {
    const db = fixture();
    try {
      migrate(db);
      const insert = db.prepare('INSERT INTO financial_attempt_cancellations VALUES (?, ?, ?, ?, ?, ?)');
      insert.run('cancel-1', 'wallets:fundAccount', 'attempt-1', 'a'.repeat(64), 'cashier-1', '2026-11-02T12:00:00Z');
      insert.run('cancel-2', 'epay:fundTerminal', 'attempt-1', 'b'.repeat(64), 'cashier-1', '2026-11-02T12:00:00Z');
      assert.throws(() => insert.run('cancel-3', 'wallets:fundAccount', 'attempt-1', 'c'.repeat(64), 'cashier-2', '2026-11-02T12:00:00Z'), /UNIQUE constraint failed/);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM financial_attempt_cancellations').get().count, 2);
    } finally {
      db.close();
    }
  });
});
