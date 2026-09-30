import { defineConfig } from 'vitest/config';

// Config separata: i test non devono caricare il plugin Cloudflare di vite.config.ts
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
