import { Hono } from 'hono';
import { soloAdmin, type AppEnv } from './auth';

// Categorie (SPEC §5, §10): fonte di verità = tabella `categorie`. Dall'app si modificano
// solo etichetta, sinonimi e ordine; i codici Google non si aggiungono né si eliminano.

export interface CategoriaRiga {
  type: string;
  label: string;
  gruppo: string;
  generico?: true;
  parole?: string[];
}

interface RigaDb {
  type: string;
  label: string;
  gruppo: string;
  generico: number;
  parole: string;
}

const MAX_ETICHETTA = 100;
const MAX_SINONIMO = 60;
const MAX_SINONIMI = 30;

/** Elenco ordinato per gruppo e per posizione nel gruppo (stesso formato del vecchio JSON). */
export async function leggiCategorie(db: D1Database): Promise<CategoriaRiga[]> {
  const { results } = await db
    .prepare('SELECT type, label, gruppo, generico, parole FROM categorie ORDER BY gruppo_ordine, ordine')
    .all<RigaDb>();
  return results.map((r) => {
    let parole: string[] = [];
    try {
      const p: unknown = JSON.parse(r.parole);
      if (Array.isArray(p)) parole = p.filter((x): x is string => typeof x === 'string');
    } catch {
      /* sinonimi non leggibili: si ignorano */
    }
    return {
      type: r.type,
      label: r.label,
      gruppo: r.gruppo,
      ...(r.generico ? { generico: true as const } : {}),
      ...(parole.length ? { parole } : {}),
    };
  });
}

/** Codici Google ammessi per una ricerca. */
export async function tipiAmmessi(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare('SELECT type FROM categorie').all<{ type: string }>();
  return new Set(results.map((r) => r.type));
}

/** Sinonimi ripuliti: spazi normalizzati, vuoti e doppioni (senza distinguere maiuscole) tolti. */
export function puliziaSinonimi(parole: string[]): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const p of parole) {
    const v = p.replace(/\s+/g, ' ').trim();
    const k = v.toLowerCase();
    if (!v || visti.has(k)) continue;
    visti.add(k);
    out.push(v);
  }
  return out;
}

export const categorie = new Hono<AppEnv>();

categorie.get('/api/categorie', async (c) => c.json(await leggiCategorie(c.env.DB)));

categorie.post('/api/categorie/:type', soloAdmin, async (c) => {
  const b = await c.req.json<{ label?: unknown; parole?: unknown }>().catch(() => null);
  const label = typeof b?.label === 'string' ? b.label.replace(/\s+/g, ' ').trim() : '';
  if (!label) return c.json({ errore: 'L’etichetta non può essere vuota' }, 400);
  if (label.length > MAX_ETICHETTA) return c.json({ errore: `Etichetta troppo lunga (massimo ${MAX_ETICHETTA} caratteri)` }, 400);
  if (!Array.isArray(b?.parole) || b.parole.some((x) => typeof x !== 'string'))
    return c.json({ errore: 'Sinonimi non validi' }, 400);
  const parole = puliziaSinonimi(b.parole as string[]);
  if (parole.length > MAX_SINONIMI || parole.some((p) => p.length > MAX_SINONIMO))
    return c.json({ errore: 'Troppi sinonimi o sinonimo troppo lungo' }, 400);

  const r = await c.env.DB.prepare('UPDATE categorie SET label = ?, parole = ? WHERE type = ?')
    .bind(label, JSON.stringify(parole), c.req.param('type'))
    .run();
  if (r.meta.changes === 0) return c.json({ errore: 'Categoria non trovata' }, 404);
  return c.json({ type: c.req.param('type'), label, parole });
});

categorie.post('/api/categorie/:type/sposta', soloAdmin, async (c) => {
  const b = await c.req.json<{ direzione?: unknown }>().catch(() => null);
  if (b?.direzione !== 'su' && b?.direzione !== 'giu') return c.json({ errore: 'Direzione non valida' }, 400);
  const db = c.env.DB;
  const corrente = await db
    .prepare('SELECT gruppo, ordine FROM categorie WHERE type = ?')
    .bind(c.req.param('type'))
    .first<{ gruppo: string; ordine: number }>();
  if (!corrente) return c.json({ errore: 'Categoria non trovata' }, 404);

  const su = b.direzione === 'su';
  const vicina = await db
    .prepare(
      `SELECT type, ordine FROM categorie WHERE gruppo = ? AND ordine ${su ? '<' : '>'} ? ORDER BY ordine ${su ? 'DESC' : 'ASC'} LIMIT 1`,
    )
    .bind(corrente.gruppo, corrente.ordine)
    .first<{ type: string; ordine: number }>();
  if (vicina) {
    await db.batch([
      db.prepare('UPDATE categorie SET ordine = ? WHERE type = ?').bind(vicina.ordine, c.req.param('type')),
      db.prepare('UPDATE categorie SET ordine = ? WHERE type = ?').bind(corrente.ordine, vicina.type),
    ]);
  }
  return c.json({ ok: true });
});
