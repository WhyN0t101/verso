import {defineConfig} from 'vitest/config';

// /api is served by the Worker: run `npm run worker` next to `npm run dev`.
export default defineConfig({
  server: {proxy: {'/api': 'http://localhost:8787'}},
  test: {include: ['tests/**/*.test.ts']},
});
