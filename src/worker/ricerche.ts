import { Hono } from 'hono';
import type { AppEnv } from './auth';
import tipiIt from '../data/place-types.it.json';
import {
  creaChiamaNearby,
  eseguiRicerca,
  validaParametri,
  type ChiamaNearby,
  type EsitoRicerca,
  type ParametriRicerca,
} from './ricerca';

// Nuova ricerca (SPEC §5, §6, §9): valida, applica il limite giornaliero, esegue,
// salva su D1 e restituisce i risultati completi.

const TIPI_AMMESSI = new Set((tipiIt as { type: string }[]).map((t) => t.type));
const BLOCCO_INSERT = 50;

/** Fabbrica del client Google: sostituibile nei test così non si chiama mai la rete. */
export const fabbricaGoogle = {
  crea: (apiKey: string): ChiamaNearby => creaChiamaNearby(apiKey),
};

/** Offset (ms) di Europe/Rome rispetto a UTC all'istante dato. */
function offsetRomaMs(istante: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(istante))
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(istante / 1000) * 1000;
}

/** Inizio del giorno corrente in Europe/Rome, come istante ISO UTC. */
export function inizioGiornoRoma(adesso: Date = new Date()): string {
  const t = adesso.getTime();
  const romaComeUtc = new Date(t + offsetRomaMs(t));
  const mezzanotteComeUtc = Date.UTC(romaComeUtc.getUTCFullYear(), romaComeUtc.getUTCMonth(), romaComeUtc.getUTCDate());
  let guess = mezzanotteComeUtc - offsetRomaMs(t);
  guess = mezzanotteComeUtc - offsetRomaMs(guess); // correzione se l'ora legale cambia nella giornata
  return new Date(guess).toISOString();
}

export const ricerche = new Hono<AppEnv>();

ricerche.post('/api/ricerche', async (c) => {
  const b = await c.req
    .json<{
      indirizzo?: unknown;
      placeId?: unknown;
      lat?: unknown;
      lng?: unknown;
      raggioKm?: unknown;
      categorie?: unknown;
      conContatti?: unknown;
    }>()
    .catch(() => null);
  const indirizzo = typeof b?.indirizzo === 'string' ? b.indirizzo.trim() : '';
  if (!b || !indirizzo || indirizzo.length > 300) return c.json({ errore: 'Indirizzo mancante' }, 400);
  if (!Array.isArray(b.categorie) || b.categorie.some((x) => typeof x !== 'string'))
    return c.json({ errore: 'Categorie non valide' }, 400);
  const placeId = typeof b.placeId === 'string' && b.placeId.length <= 300 ? b.placeId : null;
  const p: ParametriRicerca = {
    lat: Number(b.lat),
    lng: Number(b.lng),
    raggioKm: Number(b.raggioKm),
    categorie: [...new Set(b.categorie as string[])],
    conContatti: b.conContatti === true,
  };
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number' || typeof b.raggioKm !== 'number')
    return c.json({ errore: 'Parametri non validi' }, 400);
  const errore = validaParametri(p, TIPI_AMMESSI);
  if (errore) return c.json({ errore }, 400);
  if (!c.env.GOOGLE_API_KEY) return c.json({ errore: 'Servizio Google non configurato' }, 500);

  // Limite giornaliero per l'intera app (giorno di Europe/Rome). Contano anche le ricerche in errore: hanno un costo.
  const max = Number.parseInt(c.env.MAX_RICERCHE_GIORNO, 10);
  const limite = Number.isFinite(max) && max >= 0 ? max : 30;
  const oggi = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM searches WHERE created_at >= ?')
    .bind(inizioGiornoRoma())
    .first<{ n: number }>();
  if ((oggi?.n ?? 0) >= limite)
    return c.json({ errore: `Limite giornaliero di ${limite} ricerche raggiunto: riprova domani` }, 429);

  const utente = c.get('utente');
  const ins = await c.env.DB.prepare(
    `INSERT INTO searches (user_id, address_text, address_place_id, lat, lng, radius_km, types_json, include_contacts, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_corso')`,
  )
    .bind(utente.id, indirizzo, placeId, p.lat, p.lng, p.raggioKm, JSON.stringify(p.categorie), p.conContatti ? 1 : 0)
    .run();
  const id = ins.meta.last_row_id;

  let esito: EsitoRicerca;
  try {
    esito = await eseguiRicerca(p, fabbricaGoogle.crea(c.env.GOOGLE_API_KEY));
  } catch {
    return chiudiInErrore(c.env.DB, id, 'Ricerca interrotta da un errore imprevisto', c);
  }

  const tutteFallite = esito.errori.length >= esito.chiamate;
  const messaggioErrore = esito.errori.length ? esito.errori.join('; ').slice(0, 1000) : null;
  if (tutteFallite) return chiudiInErrore(c.env.DB, id, messaggioErrore ?? 'Tutte le chiamate a Google sono fallite', c, esito);

  try {
    await salvaRisultati(c.env.DB, id, esito, c.env.SALVA_DATI_ESTESI === 'true');
    await c.env.DB.prepare(
      `UPDATE searches SET status = 'completata', result_count = ?, api_calls = ?, saturated_calls = ?, error_message = ? WHERE id = ?`,
    )
      .bind(esito.luoghi.length, esito.chiamate, esito.chiamateSature, messaggioErrore, id)
      .run();
  } catch {
    return chiudiInErrore(c.env.DB, id, 'Salvataggio dei risultati non riuscito', c, esito);
  }

  return c.json({
    id,
    stato: 'completata',
    risultati: esito.luoghi,
    conteggi: esito.conteggi,
    chiamate: esito.chiamate,
    chiamateSature: esito.chiamateSature,
    errori: esito.errori,
  });
});

async function salvaRisultati(db: D1Database, id: number, esito: EsitoRicerca, estesi: boolean) {
  const ora = new Date().toISOString();
  const istruzioni = esito.luoghi.map((l) =>
    estesi
      ? db
          .prepare(
            `INSERT INTO search_results (search_id, place_id, name, address, types_json, phone, website, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, l.placeId, l.nome, l.indirizzo, JSON.stringify(l.tipi), l.telefono, l.sito, ora)
      : db
          .prepare('INSERT INTO search_results (search_id, place_id, fetched_at) VALUES (?, ?, ?)')
          .bind(id, l.placeId, ora),
  );
  for (let i = 0; i < istruzioni.length; i += BLOCCO_INSERT) {
    await db.batch(istruzioni.slice(i, i + BLOCCO_INSERT));
  }
}

async function chiudiInErrore(
  db: D1Database,
  id: number,
  messaggio: string,
  c: { json: (o: unknown, s: number) => Response },
  esito?: EsitoRicerca,
) {
  await db
    .prepare(`UPDATE searches SET status = 'errore', api_calls = ?, saturated_calls = ?, error_message = ? WHERE id = ?`)
    .bind(esito?.chiamate ?? 0, esito?.chiamateSature ?? 0, messaggio, id)
    .run()
    .catch(() => {});
  return c.json({ errore: `Ricerca non riuscita: ${messaggio}`, id }, 502);
}
