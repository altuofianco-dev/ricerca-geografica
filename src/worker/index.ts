import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
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

// Intestazioni di sicurezza e nessuna cache per le risposte API (i file statici usano public/_headers).
app.use(
  '/api/*',
  secureHeaders({ xFrameOptions: 'DENY', referrerPolicy: 'same-origin' }),
  async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  },
);

app.use('/api/*', soloJson, richiediSessione);

// Errori imprevisti: messaggio generico in italiano, nel log solo il tipo di errore (mai il testo).
app.onError((e, c) => {
  console.error(`Errore imprevisto: ${e instanceof Error ? e.name : 'sconosciuto'}`);
  return c.json({ errore: 'Si è verificato un problema, riprova' }, 500);
});

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
