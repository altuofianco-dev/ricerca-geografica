import { Hono } from 'hono';
import { soloAdmin, type AppEnv } from './auth';
import { inizioGiornoRomaDa } from './ricerche';

// Elenco ricerche, dettaglio e "Recupera dettagli" (SPEC §7, §9).

const PER_PAGINA = 25;
const URL_DETTAGLI = 'https://places.googleapis.com/v1/places/';
const CAMPI_DETTAGLI = 'displayName,formattedAddress,types,nationalPhoneNumber,websiteUri,location';

export interface DettagliLuogo {
  nome: string | null;
  indirizzo: string | null;
  tipi: string[];
  telefono: string | null;
  sito: string | null;
  lat: number | null;
  lng: number | null;
}

export type RecuperaDettagli = (placeId: string) => Promise<DettagliLuogo>;

/** Fabbrica del client Place Details: sostituibile nei test così non si chiama mai la rete. */
export const fabbricaDettagli = {
  crea(apiKey: string, fetchFn: typeof fetch = fetch): RecuperaDettagli {
    return async (placeId) => {
      // La chiave passa solo nell'header, mai nell'URL; gli errori riportano solo lo stato HTTP.
      const res = await fetchFn(`${URL_DETTAGLI}${encodeURIComponent(placeId)}?languageCode=it&regionCode=IT`, {
        headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': CAMPI_DETTAGLI },
      });
      if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
      const d = (await res.json()) as {
        displayName?: { text?: string };
        formattedAddress?: string;
        types?: string[];
        nationalPhoneNumber?: string;
        websiteUri?: string;
        location?: { latitude?: number; longitude?: number };
      };
      return {
        nome: d.displayName?.text ?? null,
        indirizzo: d.formattedAddress ?? null,
        tipi: Array.isArray(d.types) ? d.types : [],
        telefono: d.nationalPhoneNumber ?? null,
        sito: d.websiteUri ?? null,
        lat: typeof d.location?.latitude === 'number' ? d.location.latitude : null,
        lng: typeof d.location?.longitude === 'number' ? d.location.longitude : null,
      };
    };
  },
};

interface RigaRisultato {
  place_id: string;
  name: string | null;
  address: string | null;
  types_json: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  fetched_at: string;
}

function tipiDa(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const luogoDaRiga = (r: RigaRisultato, salvataIl: string) => ({
  placeId: r.place_id,
  nome: r.name,
  indirizzo: r.address,
  tipi: tipiDa(r.types_json),
  telefono: r.phone,
  sito: r.website,
  lat: r.lat,
  lng: r.lng,
  recuperatoIl: r.fetched_at,
  // Già recuperato con "Recupera dettagli" (senza cambiare lo schema): tutti i risultati salvati
  // insieme hanno lo stesso fetched_at, un recupero successivo lo sposta in avanti.
  recuperato: r.fetched_at > salvataIl,
});

/** Momento del salvataggio iniziale: il fetched_at più frequente (a parità, il più vecchio). */
function salvataggioIniziale(righe: RigaRisultato[]): string {
  const conteggi = new Map<string, number>();
  for (const r of righe) conteggi.set(r.fetched_at, (conteggi.get(r.fetched_at) ?? 0) + 1);
  let migliore = '';
  let max = 0;
  for (const [t, n] of conteggi) {
    if (n > max || (n === max && t < migliore)) {
      migliore = t;
      max = n;
    }
  }
  return migliore;
}

const idValido = (s: string) => /^\d{1,12}$/.test(s);

export const storico = new Hono<AppEnv>();

// Visibilità (SPEC §2): l'admin vede tutte le ricerche, l'operatore solo le proprie.
const soloProprie = (utente: { id: number; role: string }) => utente.role !== 'admin';

// Solo admin. Tutti gli utenti (anche disattivati: le loro ricerche restano nello storico, SPEC §4.1). Solo id e nome.
storico.get('/api/operatori', soloAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, active FROM users ORDER BY name COLLATE NOCASE').all();
  return c.json(results);
});

storico.get('/api/ricerche', async (c) => {
  const cond: string[] = [];
  const par: unknown[] = [];

  const dal = c.req.query('dal');
  if (dal) {
    const inizio = inizioGiornoRomaDa(dal);
    if (!inizio) return c.json({ errore: 'Data "dal" non valida' }, 400);
    cond.push('s.created_at >= ?');
    par.push(inizio);
  }
  const al = c.req.query('al');
  if (al) {
    const inizio = inizioGiornoRomaDa(al);
    if (!inizio) return c.json({ errore: 'Data "al" non valida' }, 400);
    // "al" è inclusivo dell'intero giorno: si arriva all'inizio del giorno dopo (escluso).
    const giornoDopo = new Date(Date.parse(`${al}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    cond.push('s.created_at < ?');
    par.push(inizioGiornoRomaDa(giornoDopo));
  }
  const utente = c.get('utente');
  const operatore = c.req.query('operatore');
  if (soloProprie(utente)) {
    // Per l'operatore il filtro è sempre il suo id: il parametro "operatore" viene ignorato.
    cond.push('s.user_id = ?');
    par.push(utente.id);
  } else if (operatore) {
    if (!idValido(operatore)) return c.json({ errore: 'Operatore non valido' }, 400);
    cond.push('s.user_id = ?');
    par.push(Number(operatore));
  }
  const paginaTesto = c.req.query('pagina') ?? '1';
  const pagina = Number(paginaTesto);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000) return c.json({ errore: 'Pagina non valida' }, 400);

  const dove = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const tot = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM searches s ${dove}`)
    .bind(...par)
    .first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.created_at, s.address_text, s.radius_km, s.result_count, s.status, s.user_id, u.name AS operatore
     FROM searches s JOIN users u ON u.id = s.user_id ${dove}
     ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...par, PER_PAGINA, (pagina - 1) * PER_PAGINA)
    .all();
  return c.json({ righe: results, totale: tot?.n ?? 0, pagina, perPagina: PER_PAGINA });
});

storico.get('/api/ricerche/:id', async (c) => {
  const id = c.req.param('id');
  if (!idValido(id)) return c.json({ errore: 'Ricerca non trovata' }, 404);
  const utente = c.get('utente');
  const s = await c.env.DB.prepare(
    `SELECT s.id, s.created_at, s.address_text, s.address_place_id, s.lat, s.lng, s.radius_km, s.types_json,
            s.include_contacts, s.status, s.result_count, s.api_calls, s.saturated_calls, s.error_message,
            u.name AS operatore
     FROM searches s JOIN users u ON u.id = s.user_id WHERE s.id = ?${soloProprie(utente) ? ' AND s.user_id = ?' : ''}`,
  )
    .bind(...(soloProprie(utente) ? [Number(id), utente.id] : [Number(id)]))
    .first<Record<string, unknown> & { types_json: string; include_contacts: number }>();
  if (!s) return c.json({ errore: 'Ricerca non trovata' }, 404);
  const { results } = await c.env.DB.prepare(
    `SELECT place_id, name, address, types_json, phone, website, lat, lng, fetched_at
     FROM search_results WHERE search_id = ? ORDER BY name COLLATE NOCASE, place_id`,
  )
    .bind(Number(id))
    .all<RigaRisultato>();
  const iniziale = salvataggioIniziale(results);
  return c.json({
    ...s,
    types_json: undefined,
    categorie: tipiDa(s.types_json),
    include_contacts: !!s.include_contacts,
    risultati: results.map((r) => luogoDaRiga(r, iniziale)),
  });
});

storico.post('/api/ricerche/:id/dettagli', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<{ placeId?: unknown }>().catch(() => null);
  const placeId = typeof b?.placeId === 'string' ? b.placeId : '';
  if (!idValido(id)) return c.json({ errore: 'Ricerca non trovata' }, 404);
  // Ricerca altrui (o inesistente): stessa risposta, e nessuna chiamata a Google.
  const utente = c.get('utente');
  if (soloProprie(utente)) {
    const mia = await c.env.DB.prepare('SELECT 1 FROM searches WHERE id = ? AND user_id = ?')
      .bind(Number(id), utente.id)
      .first();
    if (!mia) return c.json({ errore: 'Ricerca non trovata' }, 404);
  }
  if (!placeId) return c.json({ errore: 'Richiesta non valida' }, 400);
  // Il luogo deve appartenere alla ricerca: niente chiamate a pagamento su Place ID arbitrari.
  const riga = await c.env.DB.prepare('SELECT place_id FROM search_results WHERE search_id = ? AND place_id = ?')
    .bind(Number(id), placeId)
    .first();
  if (!riga) return c.json({ errore: 'Risultato non trovato' }, 404);
  if (!c.env.GOOGLE_API_KEY) return c.json({ errore: 'Servizio Google non configurato' }, 500);

  let d: DettagliLuogo;
  try {
    d = await fabbricaDettagli.crea(c.env.GOOGLE_API_KEY)(placeId);
  } catch {
    return c.json({ errore: 'Dettagli non disponibili, riprova' }, 502);
  }
  const ora = new Date().toISOString();
  // SPEC §9: con SALVA_DATI_ESTESI=false i dati si mostrano soltanto, senza salvarli.
  if (c.env.SALVA_DATI_ESTESI === 'true') {
    try {
      await c.env.DB.prepare(
        `UPDATE search_results SET name = ?, address = ?, types_json = ?, phone = ?, website = ?, lat = ?, lng = ?, fetched_at = ?
         WHERE search_id = ? AND place_id = ?`,
      )
        .bind(d.nome, d.indirizzo, JSON.stringify(d.tipi), d.telefono, d.sito, d.lat, d.lng, ora, Number(id), placeId)
        .run();
    } catch {
      return c.json({ errore: 'Salvataggio dei dettagli non riuscito' }, 500);
    }
  }
  return c.json({ placeId, ...d, recuperatoIl: ora, recuperato: true, salvato: c.env.SALVA_DATI_ESTESI === 'true' });
});
