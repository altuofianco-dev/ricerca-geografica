import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dividiSinonimi } from '../src/client/categorie';
import { puliziaSinonimi } from '../src/worker/categorie';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

interface Cat {
  type: string;
  label: string;
  gruppo: string;
  generico?: boolean;
  parole?: string[];
}

async function setup() {
  const { db, sql } = creaDb();
  await aggiungiUtente(sql, { email: 'admin@x.it', password: 'password-admin-1', role: 'admin' });
  await aggiungiUtente(sql, { email: 'op@x.it', password: 'password-oper-1', role: 'operatore' });
  const admin = (await login(db, 'admin@x.it', 'password-admin-1')).cookie;
  const op = (await login(db, 'op@x.it', 'password-oper-1')).cookie;
  return { db, sql, admin, op };
}

const leggi = async (db: D1Database, cookie: string) => (await (await chiama(db, '/api/categorie', { cookie })).json()) as Cat[];

describe('migrazione categorie', () => {
  it('contiene le 471 righe del JSON, con gli stessi campi e lo stesso ordine', async () => {
    const json = JSON.parse(readFileSync('src/data/place-types.it.json', 'utf8')) as Cat[];
    const { db, admin } = await setup();
    const api = await leggi(db, admin);
    expect(api).toHaveLength(471);
    expect(api).toEqual(json);
  });
});

describe('GET /api/categorie', () => {
  it('richiede la sessione ed è aperto a ogni utente', async () => {
    const { db, op } = await setup();
    expect((await chiama(db, '/api/categorie')).status).toBe(401);
    expect((await chiama(db, '/api/categorie', { cookie: op })).status).toBe(200);
  });
});

describe('modifica categorie (solo admin)', () => {
  it("l'operatore riceve 403 e nulla cambia", async () => {
    const { db, sql, op } = await setup();
    const prima = sql.prepare('SELECT * FROM categorie ORDER BY type').all();
    const r1 = await chiama(db, '/api/categorie/pharmacy', { body: { label: 'X', parole: [] }, cookie: op });
    const r2 = await chiama(db, '/api/categorie/pharmacy/sposta', { body: { direzione: 'giu' }, cookie: op });
    expect([r1.status, r2.status]).toEqual([403, 403]);
    expect(sql.prepare('SELECT * FROM categorie ORDER BY type').all()).toEqual(prima);
  });

  it('senza sessione 401', async () => {
    const { db } = await setup();
    expect((await chiama(db, '/api/categorie/pharmacy', { body: { label: 'X', parole: [] } })).status).toBe(401);
  });

  it('cambia etichetta e sinonimi, ripulendo spazi e doppioni; il codice non cambia', async () => {
    const { db, admin, op } = await setup();
    const r = await chiama(db, '/api/categorie/pharmacy', {
      body: { label: '  Farmacia   di turno ', parole: [' medicine ', 'Medicine', '', 'ricetta  medica', 'ricetta medica'] },
      cookie: admin,
    });
    expect(r.status).toBe(200);
    const f = (await leggi(db, op)).find((c) => c.type === 'pharmacy')!;
    expect(f.label).toBe('Farmacia di turno');
    expect(f.parole).toEqual(['medicine', 'ricetta medica']);
  });

  it('rifiuta etichetta vuota o solo spazi, sinonimi non validi e codici inesistenti', async () => {
    const { db, admin } = await setup();
    for (const label of ['', '   ', 5, undefined]) {
      expect((await chiama(db, '/api/categorie/pharmacy', { body: { label, parole: [] }, cookie: admin })).status).toBe(400);
    }
    expect((await chiama(db, '/api/categorie/pharmacy', { body: { label: 'A', parole: 'x' }, cookie: admin })).status).toBe(400);
    expect((await chiama(db, '/api/categorie/pharmacy', { body: { label: 'A', parole: [1] }, cookie: admin })).status).toBe(400);
    expect((await chiama(db, '/api/categorie/non_esiste', { body: { label: 'A', parole: [] }, cookie: admin })).status).toBe(404);
    expect((await leggi(db, admin)).find((c) => c.type === 'pharmacy')!.label).toBe('Farmacia');
  });

  it('non esistono endpoint per aggiungere o eliminare codici', async () => {
    const { db, admin, sql } = await setup();
    const r1 = await chiama(db, '/api/categorie', { body: { type: 'nuovo', label: 'Nuovo' }, cookie: admin });
    const r2 = await chiama(db, '/api/categorie/pharmacy', { metodo: 'DELETE', cookie: admin });
    expect(r1.status).toBeGreaterThanOrEqual(400);
    expect(r2.status).toBeGreaterThanOrEqual(400);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM categorie').get()).toEqual({ n: 471 });
  });

  it('sposta su/giù dentro il gruppo, senza uscirne e senza effetti ai bordi', async () => {
    const { db, admin } = await setup();
    const gruppo = (await leggi(db, admin)).filter((c) => c.gruppo === 'Auto e mezzi');
    const [a, b] = [gruppo[0].type, gruppo[1].type];
    await chiama(db, `/api/categorie/${a}/sposta`, { body: { direzione: 'giu' }, cookie: admin });
    const dopo = (await leggi(db, admin)).filter((c) => c.gruppo === 'Auto e mezzi').map((c) => c.type);
    expect(dopo.slice(0, 2)).toEqual([b, a]);
    expect(dopo).toHaveLength(gruppo.length);
    // ai bordi: "su" sul primo e "giù" sull'ultimo non cambiano nulla
    await chiama(db, `/api/categorie/${b}/sposta`, { body: { direzione: 'su' }, cookie: admin });
    await chiama(db, `/api/categorie/${dopo[dopo.length - 1]}/sposta`, { body: { direzione: 'giu' }, cookie: admin });
    expect((await leggi(db, admin)).filter((c) => c.gruppo === 'Auto e mezzi').map((c) => c.type)).toEqual(dopo);
    expect((await chiama(db, `/api/categorie/${a}/sposta`, { body: { direzione: 'oltre' }, cookie: admin })).status).toBe(400);
    expect((await chiama(db, '/api/categorie/non_esiste/sposta', { body: { direzione: 'su' }, cookie: admin })).status).toBe(404);
  });
});

describe('una ricerca valida le categorie contro la tabella', () => {
  const corpo = (categorie: string[]) => ({ indirizzo: 'Via Roma 1', lat: 41.9, lng: 12.5, raggioKm: 1, categorie });

  it('rifiuta un codice tolto dalla tabella e accetta uno presente (senza chiamare Google)', async () => {
    const { db, sql, admin } = await setup();
    sql.prepare("DELETE FROM categorie WHERE type = 'pharmacy'").run();
    const r = await chiama(db, '/api/ricerche', { body: corpo(['pharmacy']), cookie: admin, env: { GOOGLE_API_KEY: '' } });
    expect(r.status).toBe(400);
    // codice presente: supera la validazione e si ferma prima di Google (chiave assente → 500)
    const ok = await chiama(db, '/api/ricerche', { body: corpo(['bakery']), cookie: admin, env: { GOOGLE_API_KEY: '' } });
    expect(ok.status).toBe(500);
  });
});

describe('sinonimi', () => {
  it('puliziaSinonimi e dividiSinonimi tolgono spazi, vuoti e doppioni', () => {
    expect(puliziaSinonimi([' a ', 'A', 'b  c', 'b c', ''])).toEqual(['a', 'b c']);
    expect(dividiSinonimi(' idraulico , caldaia,, ')).toEqual(['idraulico', 'caldaia']);
  });
});
