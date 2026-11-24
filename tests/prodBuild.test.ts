import {build} from 'vite';
import {describe, expect, it} from 'vitest';

/** The dev-only helpers (?books, ?covers, window.__verso) must not exist in the code that ships. */
describe('production build', () => {
  it('has no dev-only seeding or debug hooks', async () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const out = await build({logLevel: 'silent', mode: 'production', build: {write: false, minify: false}});
      const results = Array.isArray(out) ? out : [out];
      const code = results
        .flatMap((r) => ('output' in r ? r.output : []))
        .map((o) => (o.type === 'chunk' ? o.code : ''))
        .join('\n');
      expect(code.length).toBeGreaterThan(10_000); // the real app was built, not an empty bundle
      for (const needle of ['Generated test book', 'generateBooks', 'seedBooks', '__verso', 'bookScreenPos', "has('covers')"]) {
        expect(code, needle).not.toContain(needle);
      }
    } finally {
      if (before === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = before;
    }
  }, 60_000);
});
