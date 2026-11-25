import {defineConfig} from 'vitest/config';

// /api is served by the Worker, which `npm run dev` starts next to Vite. When it is not running the proxy
// answers 503 {error: 'worker-down'} so the app can say so instead of failing mysteriously.
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const out = res as {writeHead?: (s: number, h: Record<string, string>) => void; end: (b: string) => void};
            out.writeHead?.(503, {'Content-Type': 'application/json'});
            out.end(JSON.stringify({error: 'worker-down'}));
          });
        },
      },
    },
  },
  test: {include: ['tests/**/*.test.ts']},
});
