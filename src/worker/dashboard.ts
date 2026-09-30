import { Hono } from 'hono';
import type { AppEnv } from './auth';
import { inizioGiornoRomaDa } from './ricerche';

// Dashboard (SPEC §8): conta tutte le ricerche, anche in errore, come l'elenco.

export type Periodo = '30giorni' | 'anno' | 'tutto';

const PERIODI: Periodo[] = ['30giorni', 'anno', 'tutto'];

/** Giorno di Europe/Rome come AAAA-MM-GG. */
function giornoRoma(adesso: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);
}

/** Inizio del periodo (istante ISO UTC di una mezzanotte di Roma); null = nessun limite. */
export function inizioPeriodo(periodo: Periodo, adesso: Date = new Date()): string | null {
  if (periodo === 'tutto') return null;
  const oggi = giornoRoma(adesso);
  if (periodo === 'anno') return inizioGiornoRomaDa(`${oggi.slice(0, 4)}-01-01`);
  // Ultimi 30 giorni: oggi più i 29 giorni precedenti, sui giorni di Roma.
  const primo = new Date(Date.parse(`${oggi}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return inizioGiornoRomaDa(primo);
}

interface RigaOperatore {
  id: number;
  nome: string;
  attivo: number;
  ricerche: number;
  risultati: number;
}

export const dashboard = new Hono<AppEnv>();

dashboard.get('/api/dashboard', async (c) => {
  const periodo = (c.req.query('periodo') ?? 'tutto') as Periodo;
  if (!PERIODI.includes(periodo)) return c.json({ errore: 'Periodo non valido' }, 400);

  const inizio = inizioPeriodo(periodo);
  const { results } = await c.env.DB.prepare(
    `SELECT u.id AS id, u.name AS nome, u.active AS attivo,
            COUNT(*) AS ricerche, COALESCE(SUM(s.result_count), 0) AS risultati
     FROM searches s JOIN users u ON u.id = s.user_id
     ${inizio ? 'WHERE s.created_at >= ?' : ''}
     GROUP BY u.id ORDER BY ricerche DESC, u.name COLLATE NOCASE`,
  )
    .bind(...(inizio ? [inizio] : []))
    .all<RigaOperatore>();

  // I totali derivano dalle stesse righe per operatore: i numeri non possono divergere.
  const ricerche = results.reduce((t, r) => t + r.ricerche, 0);
  const risultati = results.reduce((t, r) => t + r.risultati, 0);
  return c.json({
    periodo,
    ricerche,
    risultati,
    media: ricerche > 0 ? risultati / ricerche : null,
    perOperatore: results,
  });
});
