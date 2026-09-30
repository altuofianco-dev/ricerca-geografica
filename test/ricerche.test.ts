import { afterEach, describe, expect, it, vi } from 'vitest';
import { fabbricaGoogle, inizioGiornoRoma } from '../src/worker/ricerche';
import type { LuogoGoogle } from '../src/worker/ricerca';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

const originale = fabbricaGoogle.crea;
afterEach(() => {
  fabbricaGoogle.crea = originale;
});

const luogo = (id: string, extra: Partial<LuogoGoogle> = {}): LuogoGoogle => ({
  id,
  displayName: { text: `Farmacia ${id}` },
  formattedAddress: 'Via Roma 1',
  types: ['pharmacy'],
  businessStatus: 'OPERATIONAL',
  location: { latitude: 41.9, longitude: 12.5 },
  nationalPhoneNumber: '06 123456',
  websiteUri: 'https://esempio.it',
  ...extra,
});

const corpo = (extra: Record<string, unknown> = {}) => ({
  indirizzo: 'Via Roma 1, Roma',
  placeId: 'ChIJtest1',
  lat: 41.9,
  lng: 12.5,
  raggioKm: 1,
  categorie: ['pharmacy'],
  conContatti: true,
  ...extra,
});

async function conSessione() {
  const { db, sql } = creaDb();
  await aggiungiUtente(sql, { email: 'a@example.com', password: 'password-lunga-1' });
  const { cookie } = await login(db, 'a@example.com', 'password-lunga-1');
  return { db, sql, cookie };
}

const finto = (f: () => Promise<LuogoGoogle[]>) => {
  const mock = vi.fn(f);
  fabbricaGoogle.crea = () => mock;
  return mock;
};

describe('POST /api/ricerche', () => {
  it('richiede la sessione', async () => {
    const { db } = creaDb();
    expect((await chiama(db, '/api/ricerche', { body: corpo() })).status).toBe(401);
  });

  it('rifiuta parametri non validi senza chiamare Google', async () => {
    const { db, cookie } = await conSessione();
    const m = finto(async () => []);
    for (const extra of [{ raggioKm: 0.3 }, { raggioKm: 51 }, { categorie: [] }, { categorie: ['tipo_inventato'] }, { indirizzo: '' }, { lat: 'x' }]) {
      expect((await chiama(db, '/api/ricerche', { body: corpo(extra), cookie })).status).toBe(400);
    }
    expect(m).not.toHaveBeenCalled();
  });

  it('salva ricerca e risultati estesi (SALVA_DATI_ESTESI=true)', async () => {
    const { db, sql, cookie } = await conSessione();
    const m = finto(async () => [luogo('P1'), luogo('P2'), luogo('X', { businessStatus: 'CLOSED_PERMANENTLY' })]);
    const res = await chiama(db, '/api/ricerche', { body: corpo(), cookie });
    expect(res.status).toBe(200);
    const dati = (await res.json()) as { id: number; risultati: unknown[]; chiamate: number; chiamateSature: number };
    expect(m).toHaveBeenCalledTimes(10);
    expect(dati.risultati).toHaveLength(2);
    expect(dati.chiamate).toBe(10);
    const s = sql.prepare('SELECT * FROM searches WHERE id = ?').get(dati.id) as Record<string, unknown>;
    expect(s).toMatchObject({ status: 'completata', result_count: 2, api_calls: 10, saturated_calls: 0, include_contacts: 1, address_place_id: 'ChIJtest1' });
    const r = sql.prepare('SELECT * FROM search_results WHERE search_id = ? ORDER BY place_id').all(dati.id) as Record<string, unknown>[];
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ place_id: 'P1', name: 'Farmacia P1', phone: '06 123456', website: 'https://esempio.it', lat: 41.9, lng: 12.5 });
  });

  it('con SALVA_DATI_ESTESI=false salva solo Place ID e data ma risponde con i dati completi', async () => {
    const { db, sql, cookie } = await conSessione();
    finto(async () => [luogo('P1')]);
    const res = await chiama(db, '/api/ricerche', { body: corpo(), cookie, env: { SALVA_DATI_ESTESI: 'false' } });
    const dati = (await res.json()) as { id: number; risultati: { nome: string }[] };
    expect(dati.risultati[0].nome).toBe('Farmacia P1');
    const r = sql.prepare('SELECT * FROM search_results WHERE search_id = ?').get(dati.id) as Record<string, unknown>;
    expect(r).toMatchObject({ place_id: 'P1', name: null, address: null, phone: null, website: null, lat: null, lng: null });
    expect(r.fetched_at).toBeTruthy();
  });

  it('conta le chiamate sature', async () => {
    const { db, cookie } = await conSessione();
    finto(async () => Array.from({ length: 20 }, (_, i) => luogo(`P${i}`)));
    const dati = (await (await chiama(db, '/api/ricerche', { body: corpo(), cookie })).json()) as { chiamateSature: number };
    expect(dati.chiamateSature).toBe(10);
  });

  it('errori parziali: completata con avviso', async () => {
    const { db, sql, cookie } = await conSessione();
    let n = 0;
    finto(async () => {
      if (n++ === 3) throw new Error('Google ha risposto con errore 500');
      return [luogo('P1')];
    });
    const dati = (await (await chiama(db, '/api/ricerche', { body: corpo(), cookie })).json()) as { id: number; errori: string[] };
    expect(dati.errori).toHaveLength(1);
    const s = sql.prepare('SELECT status, error_message FROM searches WHERE id = ?').get(dati.id) as Record<string, string>;
    expect(s.status).toBe('completata');
    expect(s.error_message).toBe('1 chiamata su 10 non riuscita: Google ha risposto con errore HTTP 500');
  });

  it('tutte le chiamate fallite: stato errore, mai in_corso, nessuna chiave nei messaggi', async () => {
    const { db, sql, cookie } = await conSessione();
    finto(async () => {
      throw new Error('Google ha risposto con errore 403');
    });
    const res = await chiama(db, '/api/ricerche', { body: corpo(), cookie });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('chiave-finta-test');
    const s = sql.prepare('SELECT status FROM searches').get() as { status: string };
    expect(s.status).toBe('errore');
  });

  it('problema di rete: messaggio salvato in italiano, mai il testo tecnico grezzo', async () => {
    const { db, sql, cookie } = await conSessione();
    let n = 0;
    finto(async () => {
      if (n++ < 3) throw new TypeError('fetch failed: ECONNRESET');
      return [luogo('P1')];
    });
    const dati = (await (await chiama(db, '/api/ricerche', { body: corpo(), cookie })).json()) as { id: number; errori: string[] };
    const s = sql.prepare('SELECT error_message FROM searches WHERE id = ?').get(dati.id) as Record<string, string>;
    expect(s.error_message).toBe('3 chiamate su 10 non riuscite: problema di connessione con Google');
    expect(JSON.stringify(dati.errori)).not.toMatch(/fetch|ECONN/);
  });

  it('limite giornaliero: la ricerca oltre il massimo è rifiutata', async () => {
    const { db, sql, cookie } = await conSessione();
    const m = finto(async () => [luogo('P1')]);
    const env = { MAX_RICERCHE_GIORNO: '2' };
    expect((await chiama(db, '/api/ricerche', { body: corpo(), cookie, env })).status).toBe(200);
    expect((await chiama(db, '/api/ricerche', { body: corpo(), cookie, env })).status).toBe(200);
    const res = await chiama(db, '/api/ricerche', { body: corpo(), cookie, env });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { errore: string }).errore).toContain('Limite giornaliero');
    expect(m).toHaveBeenCalledTimes(20);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM searches').get() as { n: number }).n).toBe(2);
  });

  it('il limite è unico per tutta l’app: le ricerche degli altri utenti contano', async () => {
    const { db, sql, cookie } = await conSessione();
    await aggiungiUtente(sql, { email: 'b@example.com', password: 'password-lunga-2' });
    const cookieB = (await login(db, 'b@example.com', 'password-lunga-2')).cookie;
    finto(async () => []);
    const env = { MAX_RICERCHE_GIORNO: '2' };
    expect((await chiama(db, '/api/ricerche', { body: corpo(), cookie, env })).status).toBe(200);
    expect((await chiama(db, '/api/ricerche', { body: corpo(), cookie, env })).status).toBe(200);
    expect((await chiama(db, '/api/ricerche', { body: corpo(), cookie: cookieB, env })).status).toBe(429);
  });

  it('le ricerche di ieri non contano nel limite di oggi', async () => {
    const { db, sql, cookie } = await conSessione();
    sql.prepare(
      `INSERT INTO searches (user_id, created_at, address_text, lat, lng, radius_km, types_json) VALUES (1, '2020-01-01T10:00:00Z', 'x', 0, 0, 1, '[]')`,
    ).run();
    finto(async () => []);
    const res = await chiama(db, '/api/ricerche', { body: corpo(), cookie, env: { MAX_RICERCHE_GIORNO: '1' } });
    expect(res.status).toBe(200);
  });
});

describe('inizioGiornoRoma', () => {
  it('inverno (UTC+1) ed estate (UTC+2)', () => {
    expect(inizioGiornoRoma(new Date('2026-01-15T10:30:00Z'))).toBe('2026-01-14T23:00:00.000Z');
    expect(inizioGiornoRoma(new Date('2026-07-15T10:30:00Z'))).toBe('2026-07-14T22:00:00.000Z');
  });
  it('subito dopo la mezzanotte di Roma è già il giorno nuovo', () => {
    expect(inizioGiornoRoma(new Date('2026-07-14T22:05:00Z'))).toBe('2026-07-14T22:00:00.000Z');
  });
});
