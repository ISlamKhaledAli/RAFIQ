import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Creates an in-memory D1Database mock using Node.js native SQLite
 */
export function createMockD1Database(): any {
  const db = new DatabaseSync(':memory:');

  // Load schema using import.meta.dirname
  const schemaPath = resolve(import.meta.dirname, '../schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  return {
    _rawDb: db,
    exec(query: string) {
      db.exec(query);
      return Promise.resolve();
    },
    async batch(statements: Array<{ _query: string; _bindings: any[]; run: () => Promise<any> }>) {
      const results: any[] = [];
      db.exec('BEGIN');
      try {
        for (const stmtObj of statements) {
          const stmt = db.prepare(stmtObj._query);
          const info = stmt.run(...(stmtObj._bindings || [])) as { changes?: number | bigint; lastInsertRowid?: number | bigint };
          results.push({
            success: true,
            results: [],
            meta: {
              changes: Number(info?.changes ?? 0),
              last_row_id: Number(info?.lastInsertRowid ?? 0),
            },
          });
        }
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    prepare(query: string) {
      return {
        _query: query,
        _bindings: [] as any[],
        bind(...args: any[]) {
          this._bindings = args.map(arg => {
            if (arg === undefined) return null;
            return arg;
          });
          return this;
        },
        async first<T = any>(): Promise<T | null> {
          const stmt = db.prepare(this._query);
          const result = stmt.get(...this._bindings) as T;
          return result || null;
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          const stmt = db.prepare(this._query);
          const rows = stmt.all(...this._bindings) as T[];
          return { results: rows || [], success: true };
        },
        async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
          const stmt = db.prepare(this._query);
          const info = stmt.run(...this._bindings) as { changes?: number | bigint; lastInsertRowid?: number | bigint };
          return {
            success: true,
            meta: {
              changes: Number(info?.changes ?? 0),
              last_row_id: Number(info?.lastInsertRowid ?? 0),
            },
          };
        },
      };
    },
  };
}
