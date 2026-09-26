import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Creates an in-memory D1Database-compatible mock using Node.js native SQLite
 */
export function createMockD1Database(): any {
  const db = new DatabaseSync(':memory:');

  // Load schema using import.meta.dirname
  const schemaPath = resolve(import.meta.dirname, '../schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  return {
    _rawDb: db,
    prepare(query: string) {
      return {
        _query: query,
        _bindings: [] as any[],
        bind(...args: any[]) {
          this._bindings = args;
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
        async run(): Promise<{ success: boolean }> {
          const stmt = db.prepare(this._query);
          stmt.run(...this._bindings);
          return { success: true };
        },
      };
    },
  };
}
