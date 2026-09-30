import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import { hashPassword, verifyPassword } from './password';
import {
  COOKIE_SESSIONE,
  DURATA_SESSIONE_SEC,
  creaSessione,
  eliminaSessione,
  utenteDaToken,
  type Utente,
} from './sessions';

export interface Env {
  DB: D1Database;
  MAX_RICERCHE_GIORNO: string;
  SALVA_DATI_ESTESI: string;
  GOOGLE_API_KEY: string;
}

export type AppEnv = { Bindings: Env; Variables: { utente: Utente } };

const MAX_TENTATIVI = 5;
const BLOCCO_MS = 15 * 60 * 1000;

// Hash fittizio: si verifica comunque una password quando l'email non esiste,
// così i tempi di risposta non rivelano se l'utente esiste.
let hashFittizio: ReturnType<typeof hashPassword> | undefined;

/** Le richieste che modificano dati devono essere JSON (difesa CSRF in più rispetto a SameSite=Lax). */
export const soloJson: MiddlewareHandler<AppEnv> = async (c, next) => {
  const metodo = c.req.method;
  if (metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS') {
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return c.json({ errore: 'Richiesta non valida' }, 415);
    }
  }
  await next();
};

const PUBBLICI = new Set(['POST /api/login', 'GET /api/health']);

export const richiediSessione: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (PUBBLICI.has(`${c.req.method} ${c.req.path}`)) return next();
  const token = getCookie(c, COOKIE_SESSIONE);
  const utente = token ? await utenteDaToken(c.env.DB, token) : null;
  if (!utente) return c.json({ errore: 'Accesso non autorizzato: effettua il login' }, 401);
  c.set('utente', utente);
  await next();
};

export const soloAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('utente').role !== 'admin') return c.json({ errore: 'Operazione riservata agli amministratori' }, 403);
  await next();
};

interface RigaUtente extends Utente {
  pw_hash: string;
  pw_salt: string;
  failed_attempts: number;
  locked_until: string | null;
  active: number;
}

export const auth = new Hono<AppEnv>();

auth.post('/api/login', async (c) => {
  const body = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const generico = () => c.json({ errore: 'Credenziali non valide' }, 401);
  if (!email || !password) return generico();

  const db = c.env.DB;
  const u = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<RigaUtente>();
  if (!u) {
    hashFittizio ??= hashPassword('password-fittizia');
    const f = await hashFittizio;
    await verifyPassword(password, f.hash, f.salt);
    return generico();
  }

  const adesso = Date.now();
  if (u.locked_until && Date.parse(u.locked_until) > adesso) {
    const minuti = Math.ceil((Date.parse(u.locked_until) - adesso) / 60000);
    return c.json({ errore: `Account bloccato per troppi tentativi. Riprova tra ${minuti} minuti.` }, 429);
  }

  const corretta = await verifyPassword(password, u.pw_hash, u.pw_salt);
  if (!corretta) {
    if (!u.active) return generico();
    const tentativi = u.failed_attempts + 1;
    if (tentativi >= MAX_TENTATIVI) {
      await db
        .prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?')
        .bind(new Date(adesso + BLOCCO_MS).toISOString(), u.id)
        .run();
      return c.json({ errore: 'Account bloccato per troppi tentativi. Riprova tra 15 minuti.' }, 429);
    }
    await db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').bind(tentativi, u.id).run();
    return generico();
  }
  if (!u.active) return generico();

  await db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').bind(u.id).run();
  const token = await creaSessione(db, u.id);
  setCookie(c, COOKIE_SESSIONE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: DURATA_SESSIONE_SEC,
  });
  return c.json({ id: u.id, email: u.email, name: u.name, role: u.role });
});

auth.post('/api/logout', async (c) => {
  const token = getCookie(c, COOKIE_SESSIONE);
  if (token) await eliminaSessione(c.env.DB, token);
  deleteCookie(c, COOKIE_SESSIONE, { path: '/', secure: true });
  return c.json({ ok: true });
});

auth.get('/api/me', (c) => c.json(c.get('utente')));
