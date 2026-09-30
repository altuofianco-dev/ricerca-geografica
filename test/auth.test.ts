import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/worker/index';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

afterEach(() => vi.useRealTimers());

async function setup() {
  const { db, sql } = creaDb();
  const adminId = await aggiungiUtente(sql, { email: 'admin@x.it', password: 'password-admin-1', role: 'admin' });
  const opId = await aggiungiUtente(sql, { email: 'op@x.it', password: 'password-oper-1', role: 'operatore' });
  return { db, sql, adminId, opId };
}

describe('login e sessioni', () => {
  it('login corretto: cookie HttpOnly/Secure/SameSite=Lax, 7 giorni, token non salvato in chiaro', async () => {
    const { db, sql } = await setup();
    const { res, cookie } = await login(db, 'Admin@X.it', 'password-admin-1');
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Max-Age=604800/);
    const token = cookie.split('=')[1];
    const righe = sql.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(righe).toHaveLength(1);
    expect(righe[0].token_hash).not.toBe(token);
    const me = await chiama(db, '/api/me', { cookie });
    expect(await me.json()).toMatchObject({ email: 'admin@x.it', role: 'admin' });
  });

  it('password errata o email inesistente: stesso messaggio generico', async () => {
    const { db } = await setup();
    const a = await login(db, 'admin@x.it', 'sbagliata');
    const b = await login(db, 'nessuno@x.it', 'sbagliata');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(await a.res.json()).toEqual(await b.res.json());
  });

  it('logout chiude la sessione', async () => {
    const { db } = await setup();
    const { cookie } = await login(db, 'admin@x.it', 'password-admin-1');
    expect((await chiama(db, '/api/logout', { body: {}, cookie })).status).toBe(200);
    expect((await chiama(db, '/api/me', { cookie })).status).toBe(401);
  });

  it('senza sessione gli endpoint /api/* rispondono 401, /api/health resta pubblico', async () => {
    const { db } = await setup();
    expect((await chiama(db, '/api/me')).status).toBe(401);
    expect((await chiama(db, '/api/utenti')).status).toBe(401);
    expect((await chiama(db, '/api/inesistente')).status).toBe(401);
    expect((await chiama(db, '/api/health')).status).toBe(200);
  });

  it('sessione scaduta rifiutata', async () => {
    const { db, sql } = await setup();
    const { cookie } = await login(db, 'admin@x.it', 'password-admin-1');
    sql.exec("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
    expect((await chiama(db, '/api/me', { cookie })).status).toBe(401);
  });

  it('le richieste di modifica non JSON sono rifiutate', async () => {
    const { db } = await setup();
    const res = await app.request(
      '/api/login',
      { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' },
      { DB: db },
    );
    expect(res.status).toBe(415);
  });

  it('utente disattivato non può accedere', async () => {
    const { db, sql } = await setup();
    await aggiungiUtente(sql, { email: 'off@x.it', password: 'password-off-123', active: 0 });
    const { res } = await login(db, 'off@x.it', 'password-off-123');
    expect(res.status).toBe(401);
  });
});

describe('blocco account', () => {
  it('al 5° tentativo sbagliato blocca 15 minuti, poi sblocca', async () => {
    const { db } = await setup();
    for (let i = 0; i < 4; i++) expect((await login(db, 'op@x.it', 'no')).res.status).toBe(401);
    expect((await login(db, 'op@x.it', 'no')).res.status).toBe(429);
    // anche la password giusta è rifiutata durante il blocco
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(429);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 14 * 60 * 1000);
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(429);
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(200);
  });

  it('un login riuscito azzera i tentativi falliti', async () => {
    const { db } = await setup();
    for (let i = 0; i < 4; i++) await login(db, 'op@x.it', 'no');
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(db, 'op@x.it', 'no')).res.status).toBe(401);
  });
});
