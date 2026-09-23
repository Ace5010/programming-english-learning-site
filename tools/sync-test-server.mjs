// Isolated SQLite adapter executes the production Function's SQL, including rollback.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/sync.ts';
export function syncServer() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../cloudflare/sync-schema.sql', import.meta.url), 'utf8'));
  const database = {
    prepare(sql) { return { sql, args: [], bind(...args) { return { sql, args }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args }) => {
          const statement = sqlite.prepare(sql);
          const bindings = Object.fromEntries(args.map((arg, index) => [String(index + 1), arg]));
          if (sql.startsWith('SELECT')) return { results: statement.all(bindings), meta: { changes: 0 } };
          return { results: [], meta: { changes: Number(statement.run(bindings).changes) } };
        });
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const fetch = async (url, init = {}) => onRequest({ request: new Request(url, { ...init, headers: { ...init.headers, 'CF-Connecting-IP': '192.0.2.1' } }), env: { CODEWORDS_SYNC_DB: database } });
  return { fetch, sqlite, database };
}
export class MemoryStore {
  values = new Map();
  failKey = null;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failKey === key) { this.failKey = null; throw new Error('disk full'); } this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
