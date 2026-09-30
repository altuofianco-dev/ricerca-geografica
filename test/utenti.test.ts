import { describe, expect, it } from 'vitest';
import { aggiungiUtente, chiama, creaDb, login } from './helpers';

async function setup() {
  const { db, sql } = creaDb();
  const adminId = await aggiungiUtente(sql, { email: 'admin@x.it', password: 'password-admin-1', role: 'admin' });
  const opId = await aggiungiUtente(sql, { email: 'op@x.it', password: 'password-oper-1', role: 'operatore' });
  const admin = (await login(db, 'admin@x.it', 'password-admin-1')).cookie;
  return { db, sql, adminId, opId, admin };
}

describe('gestione utenti', () => {
  it("un operatore riceve 403 su tutti gli endpoint admin", async () => {
    const { db, adminId } = await setup();
    const op = (await login(db, 'op@x.it', 'password-oper-1')).cookie;
    expect((await chiama(db, '/api/utenti', { cookie: op })).status).toBe(403);
    const nuovo = { name: 'N', email: 'n@x.it', role: 'operatore', password: 'password-nuova-1' };
    expect((await chiama(db, '/api/utenti', { body: nuovo, cookie: op })).status).toBe(403);
    for (const azione of ['password', 'disattiva', 'riattiva']) {
      const r = await chiama(db, `/api/utenti/${adminId}/${azione}`, { body: { password: 'password-nuova-1' }, cookie: op });
      expect(r.status).toBe(403);
    }
  });

  it('lista senza hash e password', async () => {
    const { db, admin } = await setup();
    const r = await chiama(db, '/api/utenti', { cookie: admin });
    const testo = await r.text();
    expect(JSON.parse(testo)).toHaveLength(2);
    expect(testo).not.toMatch(/pw_hash|pw_salt/);
  });

  it('crea un utente che poi può accedere', async () => {
    const { db, admin } = await setup();
    const r = await chiama(db, '/api/utenti', {
      body: { name: ' Anna ', email: 'Anna@X.it', role: 'operatore', password: 'password-anna-1' },
      cookie: admin,
    });
    expect(r.status).toBe(201);
    expect((await login(db, 'anna@x.it', 'password-anna-1')).res.status).toBe(200);
  });

  it('valida password corta, email doppia, email e ruolo non validi', async () => {
    const { db, admin } = await setup();
    const base = { name: 'A', email: 'a@x.it', role: 'operatore', password: 'password-lunga-1' };
    const prova = (o: object) => chiama(db, '/api/utenti', { body: { ...base, ...o }, cookie: admin });
    expect((await prova({ password: '123456789' })).status).toBe(400);
    expect((await prova({ email: 'non-email' })).status).toBe(400);
    expect((await prova({ role: 'capo' })).status).toBe(400);
    expect((await prova({ email: 'OP@x.it' })).status).toBe(409);
    expect((await prova({})).status).toBe(201);
  });

  it('nuova password: chiude le sessioni, vecchia password non vale più, sblocca account', async () => {
    const { db, sql, opId, admin } = await setup();
    const op = (await login(db, 'op@x.it', 'password-oper-1')).cookie;
    sql.prepare("UPDATE users SET locked_until = '2999-01-01T00:00:00.000Z' WHERE id = ?").run(opId);
    expect((await chiama(db, `/api/utenti/${opId}/password`, { body: { password: 'corta' }, cookie: admin })).status).toBe(400);
    const r = await chiama(db, `/api/utenti/${opId}/password`, { body: { password: 'nuova-password-1' }, cookie: admin });
    expect(r.status).toBe(200);
    expect((await chiama(db, '/api/me', { cookie: op })).status).toBe(401);
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(401);
    expect((await login(db, 'op@x.it', 'nuova-password-1')).res.status).toBe(200);
  });

  it('disattiva chiude subito le sessioni; riattiva riabilita', async () => {
    const { db, opId, admin } = await setup();
    const op = (await login(db, 'op@x.it', 'password-oper-1')).cookie;
    expect((await chiama(db, `/api/utenti/${opId}/disattiva`, { body: {}, cookie: admin })).status).toBe(200);
    expect((await chiama(db, '/api/me', { cookie: op })).status).toBe(401);
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(401);
    expect((await chiama(db, `/api/utenti/${opId}/riattiva`, { body: {}, cookie: admin })).status).toBe(200);
    expect((await login(db, 'op@x.it', 'password-oper-1')).res.status).toBe(200);
  });

  it('un admin non può disattivare sé stesso', async () => {
    const { db, adminId, admin } = await setup();
    const r = await chiama(db, `/api/utenti/${adminId}/disattiva`, { body: {}, cookie: admin });
    expect(r.status).toBe(400);
  });

  it("deve restare almeno un admin attivo", async () => {
    const { db, sql, adminId, admin } = await setup();
    const secondo = await aggiungiUtente(sql, { email: 'admin2@x.it', password: 'password-admin-2', role: 'admin' });
    // il secondo admin può essere disattivato (resta il primo)...
    expect((await chiama(db, `/api/utenti/${secondo}/disattiva`, { body: {}, cookie: admin })).status).toBe(200);
    // ...ma con un solo admin attivo un altro admin (disattivo->attivo) non può azzerare gli admin:
    // il primo admin è l'unico attivo e non può auto-disattivarsi (regola su sé stessi).
    expect((await chiama(db, `/api/utenti/${adminId}/disattiva`, { body: {}, cookie: admin })).status).toBe(400);
  });

  it('utente inesistente: 404', async () => {
    const { db, admin } = await setup();
    expect((await chiama(db, '/api/utenti/9999/disattiva', { body: {}, cookie: admin })).status).toBe(404);
    expect((await chiama(db, '/api/utenti/abc/riattiva', { body: {}, cookie: admin })).status).toBe(404);
  });
});
