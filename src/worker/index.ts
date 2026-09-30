import { Hono } from 'hono';
import { auth, richiediSessione, soloJson, type AppEnv } from './auth';
import { utenti } from './utenti';
import { luoghi } from './luoghi';
import { ricerche } from './ricerche';
import { storico } from './storico';
import { dashboard } from './dashboard';
import { categorie } from './categorie';

export type { Env } from './auth';

const TABELLE = ['users', 'sessions', 'searches', 'search_results', 'categorie'];

const app = new Hono<AppEnv>();

app.use('/api/*', soloJson, richiediSessione);

// Controllo tecnico pubblico: solo ok/errore, senza dettagli.
app.get('/api/health', async (c) => {
  try {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (${TABELLE.map(() => '?').join(',')})`,
    )
      .bind(...TABELLE)
      .first<{ n: number }>();
    const ok = (row?.n ?? 0) === TABELLE.length;
    return c.json({ status: ok ? 'ok' : 'errore' }, ok ? 200 : 500);
  } catch {
    return c.json({ status: 'errore' }, 500);
  }
});

app.route('/', auth);
app.route('/', utenti);
app.route('/', luoghi);
app.route('/', ricerche);
app.route('/', storico);
app.route('/', dashboard);
app.route('/', categorie);

app.all('/api/*', (c) => c.json({ errore: 'Risorsa non trovata' }, 404));

export default app;
