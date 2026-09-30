import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/worker/password';

describe('password', () => {
  it('produce hash (32 byte) e salt (16 byte) in base64, diversi dalla password', async () => {
    const { hash, salt } = await hashPassword('una-password-lunga');
    expect(atob(hash).length).toBe(32);
    expect(atob(salt).length).toBe(16);
    expect(hash).not.toContain('una-password-lunga');
  });

  it('la stessa password con salt diversi dà hash diversi', async () => {
    const a = await hashPassword('una-password-lunga');
    const b = await hashPassword('una-password-lunga');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verifica la password corretta', async () => {
    const { hash, salt } = await hashPassword('una-password-lunga');
    expect(await verifyPassword('una-password-lunga', hash, salt)).toBe(true);
  });

  it('rifiuta password errata, vuota o con maiuscole diverse', async () => {
    const { hash, salt } = await hashPassword('una-password-lunga');
    expect(await verifyPassword('un-altra-password', hash, salt)).toBe(false);
    expect(await verifyPassword('', hash, salt)).toBe(false);
    expect(await verifyPassword('Una-password-lunga', hash, salt)).toBe(false);
  });

  it('rifiuta hash o salt malformati senza lanciare errori', async () => {
    expect(await verifyPassword('x', '???', '???')).toBe(false);
  });
});
