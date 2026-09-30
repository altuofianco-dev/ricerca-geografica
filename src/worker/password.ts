// Hash password: PBKDF2-SHA256, 100.000 iterazioni (massimo supportato dai Workers), salt 16 byte.
// Nessun import: il modulo è usato anche dallo script `scripts/crea-admin.mjs`.

const ITERAZIONI = 100_000;
const LUNGHEZZA_SALT = 16;
const LUNGHEZZA_HASH = 32;

export const PASSWORD_MIN = 10;

function aBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function daBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derivaHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const chiave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERAZIONI },
    chiave,
    LUNGHEZZA_HASH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(LUNGHEZZA_SALT));
  const hash = await derivaHash(password, salt);
  return { hash: aBase64(hash), salt: aBase64(salt) };
}

function uguali(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const atteso = daBase64(hash);
    const calcolato = await derivaHash(password, daBase64(salt));
    return uguali(calcolato, atteso);
  } catch {
    return false;
  }
}
