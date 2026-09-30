import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { inizioPeriodo } from '../src/worker/dashboard';
import { ErroreApi, formattaMedia, messaggioErrore, testoErroreRicerca } from '../src/client/api';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

function aggiungiRicerca(sql: DatabaseSync, userId: number, creata: string, risultati: number, stato = 'completata') {
  sql
    .prepare(
      `INSERT INTO searches (user_id, created_at, address_text, lat, lng, radius_km, types_json, include_contacts, status, result_count, api_calls, saturated_calls)
       VALUES (?, ?, 'Via Roma 1, Roma', 41.9, 12.5, 1.5, '["pharmacy"]', 0, ?, ?, 10, 0)`,
    )
    .run(userId, creata, stato, risultati);
}

interface Dash {
  ricerche: number;
  risultati: number;
  media: number | null;
  perOperatore: { nome: string; attivo: number; ricerche: number; risultati: number }[];
}
const json = async <T>(res: Response) => (await res.json()) as T;

async function conSessione() {
  const { db, sql } = creaDb();
  const idA = await aggiungiUtente(sql, { email: 'a@example.com', password: 'password-lunga-1', name: 'Anna' });
  const idB = await aggiungiUtente(sql, { email: 'b@example.com', password: 'password-lunga-2', name: 'Bruno', active: 0 });
  const { cookie } = await login(db, 'a@example.com', 'password-lunga-1');
  return { db, sql, cookie, idA, idB };
}

describe('GET /api/dashboard', () => {
  it('richiede la sessione e rifiuta periodi non validi', async () => {
    const { db, cookie } = await conSessione();
    expect((await chiama(db, '/api/dashboard')).status).toBe(401);
    expect((await chiama(db, '/api/dashboard?periodo=boh', { cookie })).status).toBe(400);
  });

  it('senza ricerche: zeri, media nulla, nessun operatore', async () => {
    const { db, cookie } = await conSessione();
    const d = await json<Dash>(await chiama(db, '/api/dashboard?periodo=tutto', { cookie }));
    expect(d).toMatchObject({ ricerche: 0, risultati: 0, media: null, perOperatore: [] });
  });

  it('conta anche le ricerche in errore e gli operatori disattivati', async () => {
    const { db, sql, cookie, idA, idB } = await conSessione();
    aggiungiRicerca(sql, idA, '2026-09-01T10:00:00.000Z', 10);
    aggiungiRicerca(sql, idA, '2026-09-02T10:00:00.000Z', 5);
    aggiungiRicerca(sql, idA, '2026-09-03T10:00:00.000Z', 0, 'errore');
    aggiungiRicerca(sql, idB, '2026-09-04T10:00:00.000Z', 3);
    const d = await json<Dash>(await chiama(db, '/api/dashboard?periodo=tutto', { cookie }));
    expect(d.ricerche).toBe(4);
    expect(d.risultati).toBe(18);
    expect(d.media).toBe(4.5);
    expect(d.perOperatore.map((o) => [o.nome, o.attivo, o.ricerche, o.risultati])).toEqual([
      ['Anna', 1, 3, 15],
      ['Bruno', 0, 1, 3],
    ]);
  });

  it('i totali coincidono con il totale dell’elenco ricerche nello stesso periodo', async () => {
    const { db, sql, cookie, idA, idB } = await conSessione();
    const ora = Date.now();
    for (let i = 0; i < 6; i++) aggiungiRicerca(sql, i % 2 ? idA : idB, new Date(ora - i * 10 * 86_400_000).toISOString(), i, i === 3 ? 'errore' : 'completata');
    const d = await json<Dash>(await chiama(db, '/api/dashboard?periodo=tutto', { cookie }));
    const e = await json<{ totale: number }>(await chiama(db, '/api/ricerche', { cookie }));
    expect(d.ricerche).toBe(e.totale);
  });

  it('il periodo "30 giorni" esclude le ricerche più vecchie', async () => {
    const { db, sql, cookie, idA } = await conSessione();
    aggiungiRicerca(sql, idA, new Date().toISOString(), 4);
    aggiungiRicerca(sql, idA, new Date(Date.now() - 40 * 86_400_000).toISOString(), 9);
    const d = await json<Dash>(await chiama(db, '/api/dashboard?periodo=30giorni', { cookie }));
    expect(d.ricerche).toBe(1);
    expect(d.risultati).toBe(4);
  });
});

describe('inizioPeriodo (giorni di Europe/Rome)', () => {
  it('tutto = nessun limite', () => {
    expect(inizioPeriodo('tutto')).toBeNull();
  });

  it('anno corrente: 1° gennaio a mezzanotte di Roma (ora solare)', () => {
    expect(inizioPeriodo('anno', new Date('2026-09-30T10:00:00Z'))).toBe('2025-12-31T23:00:00.000Z');
  });

  it('anno: alle 23:30 UTC del 31/12 a Roma è già il nuovo anno', () => {
    expect(inizioPeriodo('anno', new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31T23:00:00.000Z');
  });

  it('30 giorni: oggi più 29 giorni precedenti, con ora legale', () => {
    // Oggi 30/09/2026 → primo giorno 01/09/2026, 00:00 Roma (UTC+2)
    expect(inizioPeriodo('30giorni', new Date('2026-09-30T10:00:00Z'))).toBe('2026-08-31T22:00:00.000Z');
  });

  it('30 giorni: a cavallo del cambio ora (oggi 05/11, primo giorno 07/10, UTC+2)', () => {
    expect(inizioPeriodo('30giorni', new Date('2026-11-05T12:00:00Z'))).toBe('2026-10-06T22:00:00.000Z');
  });

  it('30 giorni: alle 22:30 UTC il giorno di Roma è già il successivo', () => {
    expect(inizioPeriodo('30giorni', new Date('2026-09-30T22:30:00Z'))).toBe('2026-09-01T22:00:00.000Z');
  });
});

describe('messaggi lato interfaccia', () => {
  it('testo errore ricerca: solo messaggi previsti, altrimenti generico', () => {
    const ok = '3 chiamate su 10 non riuscite: problema di connessione con Google';
    expect(testoErroreRicerca(ok)).toBe(ok);
    const http = '1 chiamata su 10 non riuscita: Google ha risposto con errore HTTP 500; problema di connessione con Google';
    expect(testoErroreRicerca(http)).toBe(http);
    expect(testoErroreRicerca('Salvataggio dei risultati non riuscito')).toBe('Salvataggio dei risultati non riuscito');
    for (const vecchio of ['Chiamata 4: Google ha risposto con errore 500', 'Chiamata 2: fetch failed', 'TypeError: x'])
      expect(testoErroreRicerca(vecchio)).toMatch(/problema durante la ricerca/);
  });

  it('media con una cifra decimale e virgola, "—" se assente', () => {
    expect(formattaMedia(4.5)).toBe('4,5');
    expect(formattaMedia(3)).toBe('3,0');
    expect(formattaMedia(2 / 3)).toBe('0,7');
    expect(formattaMedia(null)).toBe('—');
  });

  it('traduce gli errori tecnici del browser in italiano', () => {
    expect(messaggioErrore(new TypeError('Failed to fetch'))).toMatch(/Impossibile contattare il server/);
    expect(messaggioErrore(new Error('boom'))).toMatch(/errore imprevisto/);
    expect(messaggioErrore(new ErroreApi('Indirizzo non trovato', 404))).toBe('Indirizzo non trovato');
  });
});
