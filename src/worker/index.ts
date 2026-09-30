import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  MAX_RICERCHE_GIORNO: string;
  SALVA_DATI_ESTESI: string;
}

const TABELLE = ['users', 'sessions', 'searches', 'search_results'];

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (${TABELLE.map(() => '?').join(',')})`,
    )
      .bind(...TABELLE)
      .first<{ n: number }>();
    const tabelle = row?.n ?? 0;
    const ok = tabelle === TABELLE.length;
    return c.json({ status: ok ? 'ok' : 'errore', db: 'ok', tabelle }, ok ? 200 : 500);
  } catch {
    return c.json({ status: 'errore', db: 'non raggiungibile' }, 500);
  }
});

app.all('/api/*', (c) => c.json({ errore: 'Risorsa non trovata' }, 404));

export default app;
