import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { fabbricaDettagli, type DettagliLuogo } from '../src/worker/storico';
import { inizioGiornoRomaDa } from '../src/worker/ricerche';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

const originale = fabbricaDettagli.crea;
afterEach(() => {
  fabbricaDettagli.crea = originale;
  vi.unstubAllGlobals();
});

function aggiungiRicerca(sql: DatabaseSync, userId: number, creata: string, extra: { indirizzo?: string; risultati?: number } = {}) {
  const r = sql
    .prepare(
      `INSERT INTO searches (user_id, created_at, address_text, lat, lng, radius_km, types_json, include_contacts, status, result_count, api_calls, saturated_calls)
       VALUES (?, ?, ?, 41.9, 12.5, 1.5, '["pharmacy"]', 0, 'completata', ?, 10, 0)`,
    )
    .run(userId, creata, extra.indirizzo ?? 'Via Roma 1, Roma', extra.risultati ?? 0);
  return Number(r.lastInsertRowid);
}

function aggiungiRisultato(sql: DatabaseSync, searchId: number, placeId: string, nome: string | null = null) {
  sql
    .prepare('INSERT INTO search_results (search_id, place_id, name, fetched_at) VALUES (?, ?, ?, ?)')
    .run(searchId, placeId, nome, '2026-09-01T10:00:00.000Z');
}

async function conSessione() {
  const { db, sql } = creaDb();
  // Anna è admin: vede tutte le ricerche (i test sulla visibilità dell'operatore sono in fondo).
  const idA = await aggiungiUtente(sql, { email: 'a@example.com', password: 'password-lunga-1', name: 'Anna', role: 'admin' });
  const { cookie } = await login(db, 'a@example.com', 'password-lunga-1');
  return { db, sql, cookie, idA };
}

const json = async <T>(res: Response) => (await res.json()) as T;
interface Elenco {
  righe: { id: number; operatore: string }[];
  totale: number;
  pagina: number;
}

describe('GET /api/ricerche (elenco)', () => {
  it('richiede la sessione', async () => {
    const { db } = creaDb();
    expect((await chiama(db, '/api/ricerche')).status).toBe(401);
    expect((await chiama(db, '/api/operatori')).status).toBe(401);
    expect((await chiama(db, '/api/ricerche/1')).status).toBe(401);
  });

  it('ordina dalle più recenti e pagina a 25 righe', async () => {
    const { db, sql, cookie, idA } = await conSessione();
    for (let i = 1; i <= 26; i++) aggiungiRicerca(sql, idA, `2026-09-01T10:${String(i).padStart(2, '0')}:00.000Z`);
    const p1 = await json<Elenco>(await chiama(db, '/api/ricerche', { cookie }));
    expect(p1.totale).toBe(26);
    expect(p1.righe).toHaveLength(25);
    expect(p1.righe[0].id).toBe(26); // la più recente per prima
    const p2 = await json<Elenco>(await chiama(db, '/api/ricerche?pagina=2', { cookie }));
    expect(p2.righe).toHaveLength(1);
    expect(p2.righe[0].id).toBe(1);
    expect((await chiama(db, '/api/ricerche?pagina=0', { cookie })).status).toBe(400);
  });

  it('filtra per data secondo il giorno di Europe/Rome (estremi inclusi)', async () => {
    const { db, sql, cookie, idA } = await conSessione();
    // 22:30 UTC del 15/09 = 00:30 del 16/09 a Roma (ora legale)
    const dopoMezzanotte = aggiungiRicerca(sql, idA, '2026-09-15T22:30:00.000Z');
    // 21:30 UTC del 15/09 = 23:30 del 15/09 a Roma
    const primaMezzanotte = aggiungiRicerca(sql, idA, '2026-09-15T21:30:00.000Z');
    const ids = async (q: string) => (await json<Elenco>(await chiama(db, `/api/ricerche?${q}`, { cookie }))).righe.map((r) => r.id);
    expect(await ids('dal=2026-09-16')).toEqual([dopoMezzanotte]);
    expect(await ids('al=2026-09-15')).toEqual([primaMezzanotte]);
    expect((await ids('dal=2026-09-15&al=2026-09-16')).sort()).toEqual([primaMezzanotte, dopoMezzanotte].sort());
    expect(await ids('dal=2026-09-17')).toEqual([]);
    expect((await chiama(db, '/api/ricerche?dal=2026-13-40', { cookie })).status).toBe(400);
    expect((await chiama(db, '/api/ricerche?al=ieri', { cookie })).status).toBe(400);
  });

  it('il filtro operatore include anche gli utenti disattivati', async () => {
    const { db, sql, cookie, idA } = await conSessione();
    const idB = await aggiungiUtente(sql, { email: 'b@example.com', password: 'password-lunga-2', name: 'Bruno', active: 0 });
    const rA = aggiungiRicerca(sql, idA, '2026-09-01T10:00:00.000Z');
    const rB = aggiungiRicerca(sql, idB, '2026-09-02T10:00:00.000Z');

    const tutte = await json<Elenco>(await chiama(db, '/api/ricerche', { cookie }));
    expect(tutte.righe.map((r) => r.id)).toEqual([rB, rA]);
    expect(tutte.righe[0].operatore).toBe('Bruno');

    const soloB = await json<Elenco>(await chiama(db, `/api/ricerche?operatore=${idB}`, { cookie }));
    expect(soloB.righe.map((r) => r.id)).toEqual([rB]);

    const operatori = await json<{ id: number; name: string; active: number }[]>(await chiama(db, '/api/operatori', { cookie }));
    expect(operatori.map((o) => o.name)).toEqual(['Anna', 'Bruno']);
    expect(operatori.find((o) => o.name === 'Bruno')?.active).toBe(0);
    expect(Object.keys(operatori[0]).sort()).toEqual(['active', 'id', 'name']); // niente email né hash
    expect((await chiama(db, '/api/ricerche?operatore=abc', { cookie })).status).toBe(400);
  });
});

describe('GET /api/ricerche/:id (dettaglio)', () => {
  it('restituisce parametri e risultati salvati; 404 se manca', async () => {
    const { db, sql, cookie, idA } = await conSessione();
    const id = aggiungiRicerca(sql, idA, '2026-09-01T10:00:00.000Z', { risultati: 2 });
    aggiungiRisultato(sql, id, 'P1', 'Farmacia Uno');
    aggiungiRisultato(sql, id, 'P2');
    const d = await json<{
      operatore: string;
      categorie: string[];
      include_contacts: boolean;
      risultati: { placeId: string; nome: string | null }[];
    }>(await chiama(db, `/api/ricerche/${id}`, { cookie }));
    expect(d.operatore).toBe('Anna');
    expect(d.categorie).toEqual(['pharmacy']);
    expect(d.include_contacts).toBe(false);
    expect(d.risultati).toHaveLength(2);
    expect(d.risultati.find((r) => r.placeId === 'P2')?.nome).toBeNull();
    expect((await chiama(db, '/api/ricerche/999', { cookie })).status).toBe(404);
    expect((await chiama(db, '/api/ricerche/abc', { cookie })).status).toBe(404);
  });
});

describe('POST /api/ricerche/:id/dettagli', () => {
  const dettagli: DettagliLuogo = {
    nome: 'Farmacia Uno',
    indirizzo: 'Via Roma 1, Roma',
    tipi: ['pharmacy'],
    telefono: '06 123456',
    sito: 'https://esempio.it',
  };

  async function scenario() {
    const s = await conSessione();
    const id = aggiungiRicerca(s.sql, s.idA, '2026-09-01T10:00:00.000Z', { risultati: 1 });
    aggiungiRisultato(s.sql, id, 'P1');
    const mock = vi.fn(async () => dettagli);
    fabbricaDettagli.crea = () => mock;
    const rete = vi.fn();
    vi.stubGlobal('fetch', rete); // qualunque chiamata di rete reale farebbe fallire il test
    return { ...s, id, mock, rete };
  }

  it('richiede la sessione', async () => {
    const { db } = creaDb();
    expect((await chiama(db, '/api/ricerche/1/dettagli', { body: { placeId: 'P1' } })).status).toBe(401);
  });

  it('salva i dati con SALVA_DATI_ESTESI=true', async () => {
    const { db, sql, cookie, id, mock, rete } = await scenario();
    const res = await chiama(db, `/api/ricerche/${id}/dettagli`, { body: { placeId: 'P1' }, cookie });
    expect(res.status).toBe(200);
    const r = await json<{ telefono: string; sito: string; salvato: boolean }>(res);
    expect(r.telefono).toBe('06 123456');
    expect(r.salvato).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(rete).not.toHaveBeenCalled();
    const riga = sql.prepare('SELECT name, phone, website, types_json FROM search_results WHERE place_id = ?').get('P1') as Record<string, string>;
    expect(riga).toMatchObject({ name: 'Farmacia Uno', phone: '06 123456', website: 'https://esempio.it', types_json: '["pharmacy"]' });
  });

  it('segna "recuperato" solo le righe aggiornate dopo il salvataggio iniziale', async () => {
    const { db, sql, cookie, id } = await scenario();
    aggiungiRisultato(sql, id, 'P2');
    aggiungiRisultato(sql, id, 'P3');
    const leggi = async () =>
      (await json<{ risultati: { placeId: string; recuperato: boolean }[] }>(await chiama(db, `/api/ricerche/${id}`, { cookie }))).risultati;
    expect((await leggi()).map((r) => r.recuperato)).toEqual([false, false, false]);
    const res = await chiama(db, `/api/ricerche/${id}/dettagli`, { body: { placeId: 'P1' }, cookie });
    expect((await json<{ recuperato: boolean }>(res)).recuperato).toBe(true);
    expect(Object.fromEntries((await leggi()).map((r) => [r.placeId, r.recuperato]))).toEqual({ P1: true, P2: false, P3: false });
  });

  it('non salva nulla con SALVA_DATI_ESTESI=false', async () => {
    const { db, sql, cookie, id } = await scenario();
    const res = await chiama(db, `/api/ricerche/${id}/dettagli`, { body: { placeId: 'P1' }, cookie, env: { SALVA_DATI_ESTESI: 'false' } });
    expect(res.status).toBe(200);
    expect((await json<{ telefono: string; salvato: boolean }>(res)).salvato).toBe(false);
    const riga = sql.prepare('SELECT name, phone FROM search_results WHERE place_id = ?').get('P1') as Record<string, unknown>;
    expect(riga.name).toBeNull();
    expect(riga.phone).toBeNull();
  });

  it('rifiuta un place che non appartiene alla ricerca, senza chiamare Google', async () => {
    const { db, cookie, id, mock } = await scenario();
    expect((await chiama(db, `/api/ricerche/${id}/dettagli`, { body: { placeId: 'ALTRO' }, cookie })).status).toBe(404);
    expect((await chiama(db, `/api/ricerche/999/dettagli`, { body: { placeId: 'P1' }, cookie })).status).toBe(404);
    expect((await chiama(db, `/api/ricerche/${id}/dettagli`, { body: {}, cookie })).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });

  it('errore di Google → 502 con messaggio generico e nessun salvataggio', async () => {
    const { db, sql, cookie, id } = await scenario();
    fabbricaDettagli.crea = () => async () => {
      throw new Error('Google HTTP 403');
    };
    const res = await chiama(db, `/api/ricerche/${id}/dettagli`, { body: { placeId: 'P1' }, cookie });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('403');
    expect((sql.prepare('SELECT phone FROM search_results').get() as { phone: string | null }).phone).toBeNull();
  });
});

describe('visibilità per ruolo (S6c)', () => {
  async function scenarioRuoli() {
    const s = await conSessione(); // idA = Anna, admin
    const idB = await aggiungiUtente(s.sql, { email: 'b@example.com', password: 'password-lunga-2', name: 'Bruno' });
    const idC = await aggiungiUtente(s.sql, { email: 'c@example.com', password: 'password-lunga-3', name: 'Carla' });
    const rAdmin = aggiungiRicerca(s.sql, s.idA, '2026-09-01T10:00:00.000Z');
    const rB = aggiungiRicerca(s.sql, idB, '2026-09-02T10:00:00.000Z');
    const rC = aggiungiRicerca(s.sql, idC, '2026-09-03T10:00:00.000Z');
    aggiungiRisultato(s.sql, rC, 'PC');
    const cookieB = (await login(s.db, 'b@example.com', 'password-lunga-2')).cookie;
    const mock = vi.fn(async () => ({ nome: 'X', indirizzo: null, tipi: [], telefono: null, sito: null }));
    fabbricaDettagli.crea = () => mock;
    const rete = vi.fn();
    vi.stubGlobal('fetch', rete);
    return { ...s, idB, idC, rAdmin, rB, rC, cookieB, mock, rete };
  }

  it('l’operatore vede solo le proprie ricerche e ignora il parametro "operatore"', async () => {
    const { db, cookieB, idA, idC, rB } = await scenarioRuoli();
    const ids = async (q = '') => (await json<Elenco>(await chiama(db, `/api/ricerche${q}`, { cookie: cookieB }))).righe.map((r) => r.id);
    expect(await ids()).toEqual([rB]);
    expect(await ids(`?operatore=${idC}`)).toEqual([rB]);
    expect(await ids(`?operatore=${idA}`)).toEqual([rB]);
    expect(await ids('?operatore=abc')).toEqual([rB]);
    const e = await json<Elenco>(await chiama(db, '/api/ricerche', { cookie: cookieB }));
    expect(e.totale).toBe(1);
  });

  it('l’admin vede tutte le ricerche e può filtrare per operatore', async () => {
    const { db, cookie, idB, rAdmin, rB, rC } = await scenarioRuoli();
    const ids = async (q = '') => (await json<Elenco>(await chiama(db, `/api/ricerche${q}`, { cookie }))).righe.map((r) => r.id);
    expect(await ids()).toEqual([rC, rB, rAdmin]);
    expect(await ids(`?operatore=${idB}`)).toEqual([rB]);
  });

  it('/api/operatori è solo per l’admin', async () => {
    const { db, cookie, cookieB } = await scenarioRuoli();
    expect((await chiama(db, '/api/operatori', { cookie: cookieB })).status).toBe(403);
    expect((await chiama(db, '/api/operatori', { cookie })).status).toBe(200);
  });

  it('l’operatore non apre una ricerca altrui: 404 identico a quella inesistente', async () => {
    const { db, cookieB, rB, rC } = await scenarioRuoli();
    const altrui = await chiama(db, `/api/ricerche/${rC}`, { cookie: cookieB });
    const inesistente = await chiama(db, '/api/ricerche/9999', { cookie: cookieB });
    expect(altrui.status).toBe(404);
    expect(inesistente.status).toBe(404);
    expect(await altrui.json()).toEqual({ errore: 'Ricerca non trovata' });
    expect(await inesistente.json()).toEqual({ errore: 'Ricerca non trovata' });
    expect((await chiama(db, `/api/ricerche/${rB}`, { cookie: cookieB })).status).toBe(200);
  });

  it('l’admin apre qualsiasi ricerca', async () => {
    const { db, cookie, rB, rC } = await scenarioRuoli();
    for (const id of [rB, rC]) expect((await chiama(db, `/api/ricerche/${id}`, { cookie })).status).toBe(200);
  });

  it('"Recupera dettagli" su ricerca altrui: 404 e nessuna chiamata a Google', async () => {
    const { db, cookieB, rC, mock, rete } = await scenarioRuoli();
    const res = await chiama(db, `/api/ricerche/${rC}/dettagli`, { body: { placeId: 'PC' }, cookie: cookieB });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ errore: 'Ricerca non trovata' });
    const vuota = await chiama(db, `/api/ricerche/${rC}/dettagli`, { body: {}, cookie: cookieB });
    expect(vuota.status).toBe(404); // nemmeno il 400 rivela che la ricerca esiste
    expect(mock).not.toHaveBeenCalled();
    expect(rete).not.toHaveBeenCalled();
  });

  it('"Recupera dettagli": l’admin può usarlo su ricerche altrui', async () => {
    const { db, cookie, rC, mock } = await scenarioRuoli();
    expect((await chiama(db, `/api/ricerche/${rC}/dettagli`, { body: { placeId: 'PC' }, cookie })).status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe('fabbricaDettagli (client Google)', () => {
  it('chiave solo nell’header, campi richiesti corretti, errori senza dettagli sensibili', async () => {
    const fetchFinto = vi.fn(async () =>
      new Response(
        JSON.stringify({
          displayName: { text: 'Farmacia Uno' },
          formattedAddress: 'Via Roma 1',
          types: ['pharmacy'],
          nationalPhoneNumber: '06 1',
          websiteUri: 'https://x.it',
        }),
      ),
    );
    const d = await fabbricaDettagli.crea('CHIAVE-SEGRETA', fetchFinto as unknown as typeof fetch)('P1');
    expect(d.nome).toBe('Farmacia Uno');
    const [url, opz] = fetchFinto.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('CHIAVE-SEGRETA');
    expect(opz.headers['X-Goog-Api-Key']).toBe('CHIAVE-SEGRETA');
    expect(opz.headers['X-Goog-FieldMask']).toBe('displayName,formattedAddress,types,nationalPhoneNumber,websiteUri');

    const ko = vi.fn(async () => new Response('{}', { status: 403 }));
    await expect(fabbricaDettagli.crea('CHIAVE-SEGRETA', ko as unknown as typeof fetch)('P1')).rejects.toThrow('Google HTTP 403');
  });
});

describe('inizioGiornoRomaDa', () => {
  it('converte il giorno di Roma in istante UTC (ora legale e solare) e rifiuta date non valide', () => {
    expect(inizioGiornoRomaDa('2026-09-16')).toBe('2026-09-15T22:00:00.000Z');
    expect(inizioGiornoRomaDa('2026-01-10')).toBe('2026-01-09T23:00:00.000Z');
    expect(inizioGiornoRomaDa('2026-02-30')).toBeNull();
    expect(inizioGiornoRomaDa('16/09/2026')).toBeNull();
  });
});
