// Sessioni: in D1 si salva solo l'hash SHA-256 del token, mai il token.

export const COOKIE_SESSIONE = 'sid';
export const DURATA_SESSIONE_SEC = 7 * 24 * 60 * 60;

export interface Utente {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operatore';
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64url(new Uint8Array(digest));
}

export async function creaSessione(db: D1Database, userId: number): Promise<string> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const adesso = Date.now();
  await db
    .prepare('DELETE FROM sessions WHERE expires_at < ?')
    .bind(new Date(adesso).toISOString())
    .run();
  await db
    .prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .bind(userId, await hashToken(token), new Date(adesso + DURATA_SESSIONE_SEC * 1000).toISOString())
    .run();
  return token;
}

/** Restituisce l'utente della sessione se il token è valido, non scaduto e l'utente è attivo. */
export async function utenteDaToken(db: D1Database, token: string): Promise<Utente | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(await hashToken(token), new Date().toISOString())
    .first<Utente>();
  return row ?? null;
}

export async function eliminaSessione(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
}

export async function eliminaSessioniUtente(db: D1Database, userId: number): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
