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
  it('risponde ok quando le 4 tabelle esistono', async () => {
    const res = await app.request('/api/health', {}, { DB: fakeDb(4) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok', tabelle: 4 });
  });

  it('risponde 500 se il database non è raggiungibile', async () => {
    const res = await app.request('/api/health', {}, { DB: fakeDb(new Error('x')) });
    expect(res.status).toBe(500);
  });
});
