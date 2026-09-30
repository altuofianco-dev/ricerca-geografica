import { Hono } from 'hono';
import type { Context } from 'hono';
import { hashPassword, PASSWORD_MIN } from './password';
import { eliminaSessioniUtente } from './sessions';
import { soloAdmin, type AppEnv } from './auth';

export const utenti = new Hono<AppEnv>();
utenti.use('/api/utenti', soloAdmin);
utenti.use('/api/utenti/*', soloAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERR_PASSWORD = `La password deve avere almeno ${PASSWORD_MIN} caratteri`;

const passwordValida = (p: unknown): p is string =>
  typeof p === 'string' && [...p].length >= PASSWORD_MIN && p.length <= 200;

utenti.get('/api/utenti', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, name, role, active, created_at FROM users ORDER BY name COLLATE NOCASE',
  ).all();
  return c.json(results);
});

utenti.post('/api/utenti', async (c) => {
  const b = await c.req
    .json<{ name?: unknown; email?: unknown; role?: unknown; password?: unknown }>()
    .catch(() => null);
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!name || name.length > 100) return c.json({ errore: 'Inserisci il nome' }, 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return c.json({ errore: 'Email non valida' }, 400);
  if (b?.role !== 'admin' && b?.role !== 'operatore') return c.json({ errore: 'Ruolo non valido' }, 400);
  if (!passwordValida(b?.password)) return c.json({ errore: ERR_PASSWORD }, 400);

  const esistente = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (esistente) return c.json({ errore: 'Esiste già un utente con questa email' }, 409);

  const { hash, salt } = await hashPassword(b.password);
  const r = await c.env.DB.prepare(
    'INSERT INTO users (email, name, role, pw_hash, pw_salt) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(email, name, b.role, hash, salt)
    .run();
  return c.json({ id: r.meta.last_row_id, email, name, role: b.role, active: 1 }, 201);
});

async function trovaUtente(c: Context<AppEnv>) {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return null;
  return c.env.DB.prepare('SELECT id, role, active FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: number; role: string; active: number }>();
}

utenti.post('/api/utenti/:id/password', async (c) => {
  const u = await trovaUtente(c);
  if (!u) return c.json({ errore: 'Utente non trovato' }, 404);
  const b = await c.req.json<{ password?: unknown }>().catch(() => null);
  if (!passwordValida(b?.password)) return c.json({ errore: ERR_PASSWORD }, 400);
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.prepare(
    'UPDATE users SET pw_hash = ?, pw_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
  )
    .bind(hash, salt, u.id)
    .run();
  await eliminaSessioniUtente(c.env.DB, u.id);
  return c.json({ ok: true });
});

utenti.post('/api/utenti/:id/disattiva', async (c) => {
  const u = await trovaUtente(c);
  if (!u) return c.json({ errore: 'Utente non trovato' }, 404);
  if (u.id === c.get('utente').id) return c.json({ errore: 'Non puoi disattivare te stesso' }, 400);
  if (u.role === 'admin' && u.active) {
    const altri = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
    )
      .bind(u.id)
      .first<{ n: number }>();
    if (!altri || altri.n < 1) return c.json({ errore: 'Deve restare almeno un amministratore attivo' }, 400);
  }
  await c.env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(u.id).run();
  await eliminaSessioniUtente(c.env.DB, u.id);
  return c.json({ ok: true });
});

utenti.post('/api/utenti/:id/riattiva', async (c) => {
  const u = await trovaUtente(c);
  if (!u) return c.json({ errore: 'Utente non trovato' }, 404);
  await c.env.DB.prepare('UPDATE users SET active = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(u.id)
    .run();
  return c.json({ ok: true });
});
