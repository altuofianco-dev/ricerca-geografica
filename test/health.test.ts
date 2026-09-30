import { describe, it, expect } from 'vitest';
import app from '../src/worker/index';

function fakeDb(n: number | Error) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => {
          if (n instanceof Error) throw n;
          return { n };
        },
      }),
    }),
  } as unknown as D1Database;
}

describe('/api/health', () => {
  it('risponde solo ok quando le 5 tabelle esistono', async () => {
    const res = await app.request('/api/health', {}, { DB: fakeDb(5) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('risponde solo errore se mancano tabelle', async () => {
    const res = await app.request('/api/health', {}, { DB: fakeDb(2) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 'errore' });
  });

  it('risponde solo errore se il database non è raggiungibile', async () => {
    const res = await app.request('/api/health', {}, { DB: fakeDb(new Error('x')) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 'errore' });
  });
});
