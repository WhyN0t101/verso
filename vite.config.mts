import {defineConfig, loadEnv, type Plugin} from 'vite';

/** Serves api/*.ts in dev with the same (req, res) shape Vercel gives functions. */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'verso-dev-api',
    configureServer(server) {
      Object.assign(process.env, env);
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = /^\/api\/([a-z]+)$/.exec(url.pathname);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const apiRes = Object.assign(res, {
            status(code: number) { res.statusCode = code; return apiRes; },
            json(body: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); },
            send(body: Buffer | string) { res.end(body); },
          });
          await mod.default({query: Object.fromEntries(url.searchParams)}, apiRes);
        } catch (err) {
          server.config.logger.error(String(err));
          res.statusCode = 500;
          res.end('api error');
        }
      });
    },
  };
}

export default defineConfig(({mode}) => ({
  plugins: [devApi(loadEnv(mode, process.cwd(), ''))],
  test: {include: ['tests/**/*.test.ts']},
}));
