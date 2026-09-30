import { describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

const PUBBLICHE = new Set(['POST /api/login', 'GET /api/health']);
// Endpoint riservati all'admin (SPEC §2).
const SOLO_ADMIN: [string, string, unknown?][] = [
  ['GET', '/api/utenti'],
  ['POST', '/api/utenti', { name: 'X', email: 'x@example.com', role: 'operatore', password: 'passwordlunga1' }],
  ['POST', '/api/utenti/1/password', { password: 'passwordlunga1' }],
  ['POST', '/api/utenti/1/disattiva', {}],
  ['POST', '/api/utenti/1/riattiva', {}],
  ['GET', '/api/operatori'],
  ['POST', '/api/categorie/pharmacy', { label: 'X', parole: [] }],
  ['POST', '/api/categorie/pharmacy/sposta', { direzione: 'su' }],
];

function rotteApi() {
  const viste = new Set<string>();
  for (const r of app.routes) {
    if (r.method === 'ALL' || !r.path.startsWith('/api/') || r.path.endsWith('*')) continue;
    viste.add(`${r.method} ${r.path}`);
  }
  return [...viste];
}

const concreta = (p: string) => p.replace(/:\w+/g, '1');

describe('sicurezza', () => {
  it('ogni rotta /api/* senza sessione risponde 401, tranne login e health', async () => {
    const { db } = creaDb();
    const rotte = rotteApi();
    expect(rotte.length).toBeGreaterThan(15);
    for (const rotta of rotte) {
      if (PUBBLICHE.has(rotta)) continue;
      const [metodo, path] = rotta.split(' ');
      const res = await chiama(db, concreta(path), { metodo, body: metodo === 'POST' ? {} : undefined });
      expect(res.status, rotta).toBe(401);
    }
  });

  it('gli endpoint admin rispondono 403 a un operatore', async () => {
    const { db, sql } = creaDb();
    await aggiungiUtente(sql, { email: 'op@example.com', password: 'passwordlunga1' });
    const { cookie } = await login(db, 'op@example.com', 'passwordlunga1');
    for (const [metodo, path, body] of SOLO_ADMIN) {
      const res = await chiama(db, path, { metodo, body, cookie });
      expect(res.status, `${metodo} ${path}`).toBe(403);
    }
    // Ogni rotta admin elencata esiste davvero (evita che il test resti indietro rispetto al codice).
    const rotte = new Set(rotteApi());
    for (const [metodo, path] of SOLO_ADMIN) {
      const modello = [...rotte].find((r) => {
        const [m, p] = r.split(' ');
        return m === metodo && new RegExp(`^${p.replace(/:\w+/g, '[^/]+')}$`).test(path);
      });
      expect(modello, `${metodo} ${path}`).toBeDefined();
    }
  });

  it('il cookie di sessione è HttpOnly, Secure, SameSite=Lax e dura 7 giorni', async () => {
    const { db, sql } = creaDb();
    await aggiungiUtente(sql, { email: 'a@example.com', password: 'passwordlunga1' });
    const { res } = await login(db, 'a@example.com', 'passwordlunga1');
    const c = res.headers.get('set-cookie') ?? '';
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Secure/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Max-Age=604800/i);
  });

  it('le risposte API hanno intestazioni di sicurezza e nessuna cache', async () => {
    const { db } = creaDb();
    const res = await chiama(db, '/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const non = await chiama(db, '/api/me');
    expect(non.headers.get('cache-control')).toBe('no-store');
  });

  it('un errore imprevisto non rivela dettagli tecnici', async () => {
    const { db } = creaDb();
    const rotto = {
      prepare: () => {
        throw new Error('SEGRETO-dettaglio-tecnico');
      },
    } as unknown as D1Database;
    const res = await chiama(rotto, '/api/login', { body: { email: 'a@example.com', password: 'x' } });
    expect(res.status).toBe(500);
    const testo = await res.text();
    expect(testo).not.toContain('SEGRETO');
    expect(JSON.parse(testo).errore).toBe('Si è verificato un problema, riprova');
    void db;
  });
});
