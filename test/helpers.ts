import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/worker/index';
import { hashPassword } from '../src/worker/password';

/** D1 finto basato su SQLite in memoria (stesso schema della migrazione reale). */
export function creaDb() {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0001_schema_iniziale.sql', '0002_coordinate_risultati.sql'])
    sql.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const db = {
    prepare(query: string) {
      const stmt = sql.prepare(query);
      const crea = (params: unknown[]) => ({
        first: async () => (stmt.get(...(params as never[])) as unknown) ?? null,
        all: async () => ({ results: stmt.all(...(params as never[])) }),
        run: async () => {
          const r = stmt.run(...(params as never[]));
          return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
        },
      });
      return { ...crea([]), bind: (...params: unknown[]) => crea(params) };
    },
    batch: async (stmts: { run: () => Promise<unknown> }[]) => {
      for (const s of stmts) await s.run();
      return [];
    },
  } as unknown as D1Database;
  return { db, sql };
}

export async function aggiungiUtente(
  sql: DatabaseSync,
  o: { email: string; password: string; role?: 'admin' | 'operatore'; active?: number; name?: string },
) {
  const { hash, salt } = await hashPassword(o.password);
  const r = sql
    .prepare('INSERT INTO users (email, name, role, pw_hash, pw_salt, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(o.email, o.name ?? o.email, o.role ?? 'operatore', hash, salt, o.active ?? 1);
  return Number(r.lastInsertRowid);
}

export function chiama(db: D1Database, path: string, opts: { metodo?: string; body?: unknown; cookie?: string; env?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  return app.request(
    path,
    { method: opts.metodo ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) },
    { DB: db, MAX_RICERCHE_GIORNO: '30', SALVA_DATI_ESTESI: 'true', GOOGLE_API_KEY: 'chiave-finta-test', ...opts.env },
  );
}

export async function login(db: D1Database, email: string, password: string) {
  const res = await chiama(db, '/api/login', { body: { email, password } });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { res, cookie };
}
