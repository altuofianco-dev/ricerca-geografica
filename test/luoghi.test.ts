import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

const SESSIONE = 'abcd1234-abcd-1234-abcd-123412341234';

async function conSessione() {
  const { db, sql } = creaDb();
  await aggiungiUtente(sql, { email: 'a@example.com', password: 'password-lunga-1' });
  const { cookie } = await login(db, 'a@example.com', 'password-lunga-1');
  return { db, cookie };
}

afterEach(() => vi.unstubAllGlobals());

describe('proxy luoghi', () => {
  it('richiede la sessione', async () => {
    const { db } = creaDb();
    expect((await chiama(db, `/api/luoghi/suggerimenti?testo=roma&sessione=${SESSIONE}`)).status).toBe(401);
    expect((await chiama(db, `/api/luoghi/coordinate?placeId=abcde&sessione=${SESSIONE}`)).status).toBe(401);
  });

  it('suggerimenti: chiave nell\'header, mai nell\'URL né nella risposta', async () => {
    const { db, cookie } = await conSessione();
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: 'ChIJ1', text: { text: 'Via Roma 1, Milano' } } }, {}] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', f);
    const res = await chiama(db, `/api/luoghi/suggerimenti?testo=via%20roma&sessione=${SESSIONE}`, { cookie });
    expect(res.status).toBe(200);
    const corpo = await res.text();
    expect(JSON.parse(corpo)).toEqual({ suggerimenti: [{ placeId: 'ChIJ1', testo: 'Via Roma 1, Milano' }] });
    expect(corpo).not.toContain('chiave-finta-test');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('chiave-finta-test');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('chiave-finta-test');
    expect(JSON.parse(init.body as string)).toMatchObject({ input: 'via roma', sessionToken: SESSIONE, languageCode: 'it' });
  });

  it('suggerimenti: valida testo e token di sessione senza chiamare Google', async () => {
    const { db, cookie } = await conSessione();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await chiama(db, `/api/luoghi/suggerimenti?testo=ab&sessione=${SESSIONE}`, { cookie })).status).toBe(400);
    expect((await chiama(db, '/api/luoghi/suggerimenti?testo=via%20roma&sessione=x', { cookie })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('coordinate: chiede solo il campo location', async () => {
    const { db, cookie } = await conSessione();
    const f = vi.fn(async () => new Response(JSON.stringify({ location: { latitude: 45.1, longitude: 9.2 } }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const res = await chiama(db, `/api/luoghi/coordinate?placeId=ChIJabc123&sessione=${SESSIONE}`, { cookie });
    expect(await res.json()).toEqual({ lat: 45.1, lng: 9.2 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('chiave-finta-test');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('location');
  });

  it('coordinate: rifiuta Place ID malformati e gestisce errori di Google', async () => {
    const { db, cookie } = await conSessione();
    const f = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', f);
    expect((await chiama(db, `/api/luoghi/coordinate?placeId=../../x&sessione=${SESSIONE}`, { cookie })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    const res = await chiama(db, `/api/luoghi/coordinate?placeId=ChIJabc123&sessione=${SESSIONE}`, { cookie });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('chiave-finta-test');
  });
});
