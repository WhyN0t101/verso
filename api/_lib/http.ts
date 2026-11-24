/** The slice of Vercel's (req, res) this project uses, so api/ needs no @vercel/node dependency. */
export interface ApiReq {
  query: Record<string, string | string[] | undefined>;
}
export interface ApiRes {
  status(code: number): ApiRes;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): void;
  send(body: Buffer | string): void;
}

export const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export const USER_AGENT = 'Verso/0.1 (personal bookshelf app)';

export async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const r = await fetch(url, {headers: {'User-Agent': USER_AGENT, Accept: 'application/json'}, signal: AbortSignal.timeout(timeoutMs)});
  if (!r.ok) throw new Error(`upstream ${r.status} for ${new URL(url).hostname}`);
  return r.json();
}

/** Small in-memory TTL cache. It lives as long as a warm serverless instance; the CDN headers do the long-term caching. */
export class TtlCache<V> {
  private map = new Map<string, {exp: number; val: V}>();
  constructor(private max = 500) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.val;
  }
  set(key: string, val: V, ttlMs: number): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, {exp: Date.now() + ttlMs, val});
  }
}
